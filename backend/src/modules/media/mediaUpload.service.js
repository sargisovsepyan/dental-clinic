import {
  allocateCloudinaryPublicId,
  uploadImageBuffer,
} from '../../utils/cloudinaryImage.js';
import {
  enqueueMediaCleanup,
  activateMediaCleanup,
  processMediaCleanupJob,
} from './mediaCleanup.service.js';


const finishHeldCleanup = async (job) => {
  if (!job || job.status === 'completed') {
    return job;
  }
  const activated = await activateMediaCleanup(job.publicId);
  const pending = activated || job;
  return pending.status === 'pending'
    ? processMediaCleanupJob(pending._id, { force: true })
    : pending;
};


const uploadWithRollbackIntent = async ({
  buffer,
  folder,
  tags = [],
  sourceType,
  sourceId = '',
}) => {
  const publicId = allocateCloudinaryPublicId(folder);
  const rollbackJob = await enqueueMediaCleanup({
    publicId,
    reason: 'rollback',
    sourceType,
    sourceId,
    held: true,
  });

  try {
    const uploaded = await uploadImageBuffer(buffer, {
      folder,
      publicId,
      tags,
    });
    if (uploaded?.publicId !== publicId) {
      throw new Error('Media adapter returned an unexpected public ID');
    }
    return { uploaded, rollbackJob };
  }
  catch (error) {
    await Promise.allSettled([
      finishHeldCleanup(rollbackJob),
    ]);
    throw error;
  }
};


export {
  finishHeldCleanup,
  uploadWithRollbackIntent,
};
