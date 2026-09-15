import {
  allocateCloudinaryPublicId,
  uploadImageBuffer,
  NORMALIZED_IMAGE_FORMAT,
} from '../../utils/cloudinaryImage.js';
import env from '../../config/env.js';
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


const isPositiveSafeInteger = (value, maximum) =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;


const validateUploadedAsset = (uploaded, expectedPublicId) => {
  if (
    !uploaded ||
    uploaded.publicId !== expectedPublicId ||
    String(uploaded.format || '').toLowerCase() !== NORMALIZED_IMAGE_FORMAT ||
    !isPositiveSafeInteger(uploaded.width, 20_000) ||
    !isPositiveSafeInteger(uploaded.height, 20_000) ||
    !isPositiveSafeInteger(uploaded.bytes, 100_000_000)
  ) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(uploaded.secureUrl);
  }
  catch {
    return null;
  }

  const expectedPrefix = `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
  const expectedSuffix = `/${expectedPublicId}.${NORMALIZED_IMAGE_FORMAT}`;
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.toLowerCase() !== 'res.cloudinary.com' ||
    !parsed.pathname.startsWith(expectedPrefix) ||
    !parsed.pathname.endsWith(expectedSuffix)
  ) {
    return null;
  }

  return {
    publicId: expectedPublicId,
    secureUrl: parsed.toString(),
    width: uploaded.width,
    height: uploaded.height,
    format: NORMALIZED_IMAGE_FORMAT,
    bytes: uploaded.bytes,
  };
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
  let unexpectedRollbackJob = null;

  try {
    const uploaded = await uploadImageBuffer(buffer, {
      folder,
      publicId,
      tags,
      format: NORMALIZED_IMAGE_FORMAT,
    });
    if (uploaded?.publicId !== publicId) {
      if (uploaded?.publicId) {
        unexpectedRollbackJob = await enqueueMediaCleanup({
          publicId: uploaded.publicId,
          reason: 'rollback',
          sourceType,
          sourceId,
          held: true,
        });
      }
      throw new Error('Media adapter returned an unexpected public ID');
    }
    const validated = validateUploadedAsset(uploaded, publicId);
    if (!validated) {
      throw new Error('Media adapter returned an unsafe image asset');
    }
    return { uploaded: validated, rollbackJob };
  }
  catch (error) {
    await Promise.allSettled([
      finishHeldCleanup(rollbackJob),
      finishHeldCleanup(unexpectedRollbackJob),
    ]);
    throw error;
  }
};


export {
  finishHeldCleanup,
  uploadWithRollbackIntent,
};
