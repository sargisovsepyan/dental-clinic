import Dentist from '../dentists/dentist.model.js';

import Service from '../services/service.model.js';

import MediaAsset from './media.model.js';

import ApiError from '../../utils/ApiError.js';

import {
  uploadImageBuffer,
  deleteCloudinaryImage,
} from '../../utils/cloudinaryImage.js';
import {
  mergeTranslations,
} from '../../i18n/localization.js';
import logger from '../../observability/logger.js';
import {
  enqueueMediaCleanup,
  activateMediaCleanup,
  cancelMediaCleanup,
  processMediaCleanupJob,
  cleanupMediaAsset,
} from './mediaCleanup.service.js';


const finishHeldCleanup = async (job) => {
  if (!job || job.status === 'completed') {
    return job;
  }
  const activated = await activateMediaCleanup(job.publicId);
  const pending = activated || job;
  if (pending.status !== 'pending') {
    return pending;
  }
  return processMediaCleanupJob(pending._id, { force: true });
};


const rollbackUploadedImage = async (uploaded, sourceType, sourceId = '') => {
  if (!uploaded?.publicId) {
    return;
  }
  try {
    await cleanupMediaAsset({
      publicId: uploaded.publicId,
      reason: 'rollback',
      sourceType,
      sourceId,
    });
  }
  catch (cleanupError) {
    logger.error('media_rollback_queue_failed', {
      sourceType,
      sourceId: String(sourceId || ''),
      error: cleanupError,
    });
    await deleteCloudinaryImage(uploaded.publicId).catch((error) => {
      logger.error('media_rollback_delete_failed', {
        sourceType,
        sourceId: String(sourceId || ''),
        error,
      });
    });
  }
};


const replaceDentistPhoto =
  async (
    dentistId,
    file
  ) => {
    const dentist =
      await Dentist.findById(
        dentistId
      );


    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }


    const previous =
      dentist.photo;


    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/dentists',

          tags: [
            'dentist',
          ],
        }
      );


    let previousCleanup = null;

    try {
      if (previous?.publicId) {
        previousCleanup = await enqueueMediaCleanup({
          publicId: previous.publicId,
          reason: 'replacement',
          sourceType: 'dentist',
          sourceId: dentist._id,
          held: true,
        });
      }
      dentist.photo =
        uploaded;

      await dentist.save();
    }
    catch (error) {
      await cancelMediaCleanup(previous?.publicId);
      await rollbackUploadedImage(uploaded, 'dentist', dentist._id);

      throw error;
    }


    if (
      previous?.publicId
    ) {
      await finishHeldCleanup(previousCleanup);
    }


    return dentist;
  };


const removeDentistPhoto =
  async (
    dentistId
  ) => {
    const dentist =
      await Dentist.findById(
        dentistId
      );


    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }


    const previous =
      dentist.photo;


    const previousCleanup = previous?.publicId
      ? await enqueueMediaCleanup({
        publicId: previous.publicId,
        reason: 'removal',
        sourceType: 'dentist',
        sourceId: dentist._id,
        held: true,
      })
      : null;

    dentist.photo =
      null;


    try {
      await dentist.save();
    }
    catch (error) {
      await cancelMediaCleanup(previous?.publicId);
      throw error;
    }


    if (
      previous?.publicId
    ) {
      await finishHeldCleanup(previousCleanup);
    }


    return dentist;
  };


const replaceServiceImage =
  async (
    serviceId,
    file
  ) => {
    const service =
      await Service.findById(
        serviceId
      );


    if (!service) {
      throw new ApiError(
        404,
        'Service not found'
      );
    }


    const previous =
      service.image;


    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/services',

          tags: [
            'service',
          ],
        }
      );


    let previousCleanup = null;

    try {
      if (previous?.publicId) {
        previousCleanup = await enqueueMediaCleanup({
          publicId: previous.publicId,
          reason: 'replacement',
          sourceType: 'service',
          sourceId: service._id,
          held: true,
        });
      }
      service.image =
        uploaded;

      await service.save();
    }
    catch (error) {
      await cancelMediaCleanup(previous?.publicId);
      await rollbackUploadedImage(uploaded, 'service', service._id);

      throw error;
    }


    if (
      previous?.publicId
    ) {
      await finishHeldCleanup(previousCleanup);
    }


    return service;
  };


const removeServiceImage =
  async (
    serviceId
  ) => {
    const service =
      await Service.findById(
        serviceId
      );


    if (!service) {
      throw new ApiError(
        404,
        'Service not found'
      );
    }


    const previous =
      service.image;


    const previousCleanup = previous?.publicId
      ? await enqueueMediaCleanup({
        publicId: previous.publicId,
        reason: 'removal',
        sourceType: 'service',
        sourceId: service._id,
        held: true,
      })
      : null;

    service.image =
      null;


    try {
      await service.save();
    }
    catch (error) {
      await cancelMediaCleanup(previous?.publicId);
      throw error;
    }


    if (
      previous?.publicId
    ) {
      await finishHeldCleanup(previousCleanup);
    }


    return service;
  };


const createGalleryImage =
  async ({
    file,
    userId,
    altText = '',
    caption = '',
    sortOrder = 0,
    translations = {},
    isActive = true,
  }) => {
  const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/clinic-gallery',

          tags: [
            'clinic-gallery',
          ],
        }
      );


    let rollbackJob = null;
    let created = null;

    try {
      rollbackJob = await enqueueMediaCleanup({
        publicId: uploaded.publicId,
        reason: 'rollback',
        sourceType: 'gallery',
        held: true,
      });
      const primary =
        translations.hy;

      created = await MediaAsset.create({
        type:
          'clinic_gallery',

        image:
          uploaded,

        altText:
          altText ||
          primary?.altText ||
          '',

        caption:
          caption ||
          primary?.caption ||
          '',

        translations,

        sortOrder,

        isActive,

        createdBy:
          userId,
      });
    }
    catch (error) {
      if (rollbackJob) {
        await finishHeldCleanup(rollbackJob);
      }
      else {
        await rollbackUploadedImage(uploaded, 'gallery');
      }

      throw error;
    }

    await cancelMediaCleanup(uploaded.publicId).catch((error) => {
      logger.warn('gallery_rollback_hold_cancel_failed', { error });
    });

    return created;
  };


const getPublicGallery =
  async () => {
    return MediaAsset.find({
      type:
        'clinic_gallery',

      isActive:
        true,
    })
      .sort({
        sortOrder: 1,
        createdAt: -1,
      })
      .select(
        '-createdBy'
      )
      .lean();
  };


const getAdminGallery =
  async () => {
    return MediaAsset.find({
      type:
        'clinic_gallery',
    })
      .populate(
        'createdBy',
        'name email'
      )
      .sort({
        sortOrder: 1,
        createdAt: -1,
      })
      .lean();
  };


const updateGalleryImage =
  async (
    id,
    data
  ) => {
    const asset =
      await MediaAsset.findById(id);


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }

    if (data.translations) {
      asset.translations =
        mergeTranslations(
          asset.translations,
          data.translations
        );

      delete data.translations;
    }

    Object.assign(asset, data);
    await asset.save();


    return asset;
  };


const deleteGalleryImage =
  async (
    id
  ) => {
    const asset =
      await MediaAsset
        .findById(id);


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }


    asset.isActive =
      false;

    await asset.save();


    return asset;
  };


const restoreGalleryImage =
  async (
    id
  ) => {
    const asset =
      await MediaAsset
        .findById(id);


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }


    asset.isActive =
      true;

    await asset.save();


    return asset;
  };


export {
  replaceDentistPhoto,
  removeDentistPhoto,
  replaceServiceImage,
  removeServiceImage,
  createGalleryImage,
  getPublicGallery,
  getAdminGallery,
  updateGalleryImage,
  deleteGalleryImage,
  restoreGalleryImage,
};

