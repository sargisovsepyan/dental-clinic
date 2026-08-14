import Dentist from '../dentists/dentist.model.js';

import Service from '../services/service.model.js';

import MediaAsset from './media.model.js';

import ApiError from '../../utils/ApiError.js';

import {
  mergeTranslations,
} from '../../i18n/localization.js';
import logger from '../../observability/logger.js';
import {
  enqueueMediaCleanup,
  cancelMediaCleanup,
} from './mediaCleanup.service.js';
import {
  finishHeldCleanup,
  uploadWithRollbackIntent,
} from './mediaUpload.service.js';

const expectedImageFilter = (field, image) => (
  image?.publicId
    ? { [`${field}.publicId`]: image.publicId }
    : {
        $or: [
          { [field]: null },
          { [`${field}.publicId`]: { $exists: false } },
        ],
      }
);


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


    const {
      uploaded,
      rollbackJob: uploadedRollback,
    } = await uploadWithRollbackIntent({
        buffer: file.buffer,
        folder: 'dental-clinic/dentists',
        tags: ['dentist'],
        sourceType: 'dentist',
        sourceId: dentist._id,
      });

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
      const updated = await Dentist.findOneAndUpdate(
        {
          _id: dentist._id,
          ...expectedImageFilter('photo', previous),
        },
        { $set: { photo: uploaded } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updated) {
        throw new ApiError(
          409,
          'Dentist photo changed; reload and try again'
        );
      }
      await cancelMediaCleanup(uploaded.publicId).catch((error) => {
        logger.warn('dentist_rollback_hold_cancel_failed', { error });
      });

      if (previous?.publicId) {
        await finishHeldCleanup(previousCleanup);
      }

      return updated;
    }
    catch (error) {
      // The old-image hold may belong to a concurrent winner. Recovery will
      // cancel it if the old image is still referenced.
      await Promise.allSettled([
        finishHeldCleanup(uploadedRollback),
      ]);

      throw error;
    }
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

    try {
      const updated = await Dentist.findOneAndUpdate(
        {
          _id: dentist._id,
          ...expectedImageFilter('photo', previous),
        },
        { $set: { photo: null } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updated) {
        throw new ApiError(
          409,
          'Dentist photo changed; reload and try again'
        );
      }

      if (previous?.publicId) {
        await finishHeldCleanup(previousCleanup);
      }

      return updated;
    }
    catch (error) {
      // Keep the hold: another concurrent mutation may have removed the same
      // old image, while reconciliation safely cancels referenced holds.
      throw error;
    }
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


    const {
      uploaded,
      rollbackJob: uploadedRollback,
    } = await uploadWithRollbackIntent({
        buffer: file.buffer,
        folder: 'dental-clinic/services',
        tags: ['service'],
        sourceType: 'service',
        sourceId: service._id,
      });

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
      const updated = await Service.findOneAndUpdate(
        {
          _id: service._id,
          ...expectedImageFilter('image', previous),
        },
        { $set: { image: uploaded } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updated) {
        throw new ApiError(
          409,
          'Service image changed; reload and try again'
        );
      }
      await cancelMediaCleanup(uploaded.publicId).catch((error) => {
        logger.warn('service_rollback_hold_cancel_failed', { error });
      });

      if (previous?.publicId) {
        await finishHeldCleanup(previousCleanup);
      }

      return updated;
    }
    catch (error) {
      await Promise.allSettled([
        finishHeldCleanup(uploadedRollback),
      ]);

      throw error;
    }
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

    try {
      const updated = await Service.findOneAndUpdate(
        {
          _id: service._id,
          ...expectedImageFilter('image', previous),
        },
        { $set: { image: null } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updated) {
        throw new ApiError(
          409,
          'Service image changed; reload and try again'
        );
      }

      if (previous?.publicId) {
        await finishHeldCleanup(previousCleanup);
      }

      return updated;
    }
    catch (error) {
      // Reconciliation decides whether this hold belongs to a winner.
      throw error;
    }
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
  const {
    uploaded,
    rollbackJob,
  } = await uploadWithRollbackIntent({
    buffer: file.buffer,
    folder: 'dental-clinic/clinic-gallery',
    tags: ['clinic-gallery'],
    sourceType: 'gallery',
  });

    let created = null;

    try {
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
      await finishHeldCleanup(rollbackJob);

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

