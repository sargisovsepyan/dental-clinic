import crypto from 'crypto';

import MediaCleanupJob from './mediaCleanup.model.js';
import MediaAsset from './media.model.js';
import Dentist from '../dentists/dentist.model.js';
import Service from '../services/service.model.js';
import BeforeAfterCase from '../beforeAfter/beforeAfter.model.js';
import env from '../../config/env.js';
import { deleteCloudinaryImage } from '../../utils/cloudinaryImage.js';
import logger from '../../observability/logger.js';


const cleanErrorCode = (error) => String(
  error?.code || error?.name || 'storage_delete_failed'
)
  .replace(/[^a-z0-9_.-]/gi, '_')
  .slice(0, 120);


const isMediaReferenced = async (publicId) => {
  const filters = await Promise.all([
    Dentist.exists({ 'photo.publicId': publicId }),
    Service.exists({ 'image.publicId': publicId }),
    MediaAsset.exists({ 'image.publicId': publicId }),
    BeforeAfterCase.exists({
      $or: [
        { 'beforeImage.publicId': publicId },
        { 'afterImage.publicId': publicId },
      ],
    }),
  ]);
  return filters.some(Boolean);
};


const enqueueMediaCleanup = async ({
  publicId,
  reason,
  sourceType = '',
  sourceId = '',
  delayMs = 0,
  held = false,
}) => {
  if (!publicId) {
    return null;
  }

  const existing = await MediaCleanupJob.findOne({ publicId });
  if (existing) {
    if (['cancelled', 'failed'].includes(existing.status)) {
      existing.status = held ? 'held' : 'pending';
      existing.attempts = 0;
      existing.nextAttemptAt = new Date(Date.now() + delayMs);
      existing.lockedAt = null;
      existing.lockedBy = '';
      existing.lastErrorCode = '';
      existing.completedAt = null;
      existing.reason = reason;
      existing.sourceType = sourceType;
      existing.sourceId = String(sourceId || '');
      await existing.save();
    }
    return existing;
  }

  try {
    return await MediaCleanupJob.create({
      publicId,
      reason,
      sourceType,
      sourceId: String(sourceId || ''),
      status: held ? 'held' : 'pending',
      attempts: 0,
      maxAttempts: env.MEDIA_CLEANUP_MAX_ATTEMPTS,
      nextAttemptAt: new Date(Date.now() + delayMs),
    });
  }
  catch (error) {
    if (error.code === 11000) {
      return MediaCleanupJob.findOne({ publicId });
    }
    throw error;
  }
};


const cancelMediaCleanup = async (publicId) => {
  if (!publicId) {
    return;
  }
  await MediaCleanupJob.updateOne(
    {
      publicId,
      status: { $in: ['held', 'pending', 'failed'] },
    },
    {
      $set: {
        status: 'cancelled',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: '',
        lastErrorCode: '',
      },
    }
  );
};


const activateMediaCleanup = async (publicId) => {
  const activated = await MediaCleanupJob.findOneAndUpdate(
    {
      publicId,
      status: 'held',
    },
    {
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: '',
        lastErrorCode: '',
        completedAt: null,
      },
    },
    { returnDocument: 'after' }
  );

  return activated || MediaCleanupJob.findOne({ publicId });
};


const processMediaCleanupJob = async (
  jobId,
  {
    force = false,
    workerId = `worker-${crypto.randomUUID()}`,
  } = {}
) => {
  const now = new Date();
  const job = await MediaCleanupJob.findOneAndUpdate(
    {
      _id: jobId,
      status: 'pending',
      $expr: { $lt: ['$attempts', '$maxAttempts'] },
      ...(force ? {} : { nextAttemptAt: { $lte: now } }),
    },
    {
      $set: {
        status: 'processing',
        lockedAt: now,
        lockedBy: workerId,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' }
  );

  if (!job) {
    return null;
  }

  if (await isMediaReferenced(job.publicId)) {
    return MediaCleanupJob.findByIdAndUpdate(
      job._id,
      {
        $set: {
          status: 'pending',
          nextAttemptAt: new Date(
            Date.now() + env.MEDIA_CLEANUP_REFERENCE_RETRY_SECONDS * 1000
          ),
          lockedAt: null,
          lockedBy: '',
          lastErrorCode: 'still_referenced',
        },
        $inc: { attempts: -1 },
      },
      { returnDocument: 'after' }
    );
  }

  try {
    await deleteCloudinaryImage(job.publicId);
    return MediaCleanupJob.findByIdAndUpdate(
      job._id,
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: '',
          lastErrorCode: '',
        },
      },
      { returnDocument: 'after' }
    );
  }
  catch (error) {
    const exhausted = job.attempts >= job.maxAttempts;
    const backoffSeconds = Math.min(
      env.MEDIA_CLEANUP_BACKOFF_BASE_SECONDS * (2 ** (job.attempts - 1)),
      env.MEDIA_CLEANUP_BACKOFF_MAX_SECONDS
    );
    logger.warn('media_cleanup_attempt_failed', {
      cleanupJobId: String(job._id),
      attempts: job.attempts,
      exhausted,
      error,
    });
    return MediaCleanupJob.findByIdAndUpdate(
      job._id,
      {
        $set: {
          status: exhausted ? 'failed' : 'pending',
          nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
          lockedAt: null,
          lockedBy: '',
          lastErrorCode: cleanErrorCode(error),
        },
      },
      { returnDocument: 'after' }
    );
  }
};


const cleanupMediaAsset = async (details) => {
  const job = await enqueueMediaCleanup(details);
  if (!job || job.status === 'completed') {
    return job;
  }
  return processMediaCleanupJob(job._id, { force: true });
};


const recoverStaleCleanupJobs = async () => {
  const staleBefore = new Date(
    Date.now() - env.MEDIA_CLEANUP_STALE_LOCK_SECONDS * 1000
  );
  const result = await MediaCleanupJob.updateMany(
    {
      status: 'processing',
      lockedAt: { $lte: staleBefore },
    },
    {
      $set: {
        status: 'pending',
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: '',
        lastErrorCode: 'stale_lock_recovered',
      },
    }
  );
  return result.modifiedCount;
};


const recoverHeldCleanupJobs = async () => {
  const abandonedBefore = new Date(
    Date.now() - env.MEDIA_CLEANUP_STALE_LOCK_SECONDS * 1000
  );
  const heldJobs = await MediaCleanupJob.find({
    status: 'held',
    updatedAt: { $lte: abandonedBefore },
  })
    .sort({ updatedAt: 1 })
    .limit(500)
    .select('_id publicId')
    .lean();

  let recovered = 0;
  for (const job of heldJobs) {
    if (await isMediaReferenced(job.publicId)) {
      await cancelMediaCleanup(job.publicId);
    }
    else {
      await activateMediaCleanup(job.publicId);
    }
    recovered += 1;
  }
  return recovered;
};


const runDueMediaCleanup = async ({ limit = 50, workerId } = {}) => {
  await recoverStaleCleanupJobs();
  await recoverHeldCleanupJobs();
  const dueJobs = await MediaCleanupJob.find({
    status: 'pending',
    nextAttemptAt: { $lte: new Date() },
    $expr: { $lt: ['$attempts', '$maxAttempts'] },
  })
    .sort({ nextAttemptAt: 1, createdAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();

  const results = [];
  for (const job of dueJobs) {
    results.push(await processMediaCleanupJob(job._id, { workerId }));
  }
  return results.filter(Boolean);
};


const listMediaCleanupJobs = async ({ status, page = 1, limit = 50 }) => {
  const filter = status ? { status } : {};
  const [jobs, total] = await Promise.all([
    MediaCleanupJob.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MediaCleanupJob.countDocuments(filter),
  ]);
  return {
    jobs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};


const retryMediaCleanupJob = async (id) => MediaCleanupJob.findOneAndUpdate(
  {
    _id: id,
    status: { $in: ['failed', 'pending'] },
  },
  {
    $set: {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: '',
      lastErrorCode: '',
    },
  },
  { returnDocument: 'after' }
);


export {
  enqueueMediaCleanup,
  activateMediaCleanup,
  cancelMediaCleanup,
  processMediaCleanupJob,
  cleanupMediaAsset,
  recoverStaleCleanupJobs,
  recoverHeldCleanupJobs,
  runDueMediaCleanup,
  listMediaCleanupJobs,
  retryMediaCleanupJob,
  isMediaReferenced,
};
