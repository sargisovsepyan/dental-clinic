import BeforeAfterCase from './beforeAfter.model.js';

import Service from '../services/service.model.js';

import Dentist from '../dentists/dentist.model.js';

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
} from '../media/mediaCleanup.service.js';


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


const rollbackUploadedImage = async (uploaded, sourceId = '') => {
  if (!uploaded?.publicId) {
    return;
  }
  try {
    await cleanupMediaAsset({
      publicId: uploaded.publicId,
      reason: 'rollback',
      sourceType: 'before_after',
      sourceId,
    });
  }
  catch (cleanupError) {
    logger.error('before_after_rollback_queue_failed', {
      sourceId: String(sourceId || ''),
      error: cleanupError,
    });
    await deleteCloudinaryImage(uploaded.publicId).catch((error) => {
      logger.error('before_after_rollback_delete_failed', {
        sourceId: String(sourceId || ''),
        error,
      });
    });
  }
};


const validateRelations =
  async ({
    serviceId,
    dentistId,
  }) => {
    if (serviceId) {
      const service =
        await Service.findById(
          serviceId
        )
          .select(
            '_id isActive'
          )
          .lean();


      if (!service) {
        throw new ApiError(
          404,
          'Service not found'
        );
      }


      if (!service.isActive) {
        throw new ApiError(
          409,
          'Service is inactive'
        );
      }
    }


    if (dentistId) {
      const dentist =
        await Dentist.findById(
          dentistId
        )
          .select(
            '_id isActive'
          )
          .lean();


      if (!dentist) {
        throw new ApiError(
          404,
          'Dentist not found'
        );
      }


      if (!dentist.isActive) {
        throw new ApiError(
          409,
          'Dentist is inactive'
        );
      }
    }
  };


const populateCase =
  (query) => {
    return query
      .populate(
        'service',
        'name slug translations'
      )
      .populate(
        'dentist',
        'firstName lastName slug title translations photo'
      );
  };


const createCase =
  async ({
    data,
    beforeFile,
    afterFile,
    userId,
  }) => {
    await validateRelations({
      serviceId:
        data.serviceId ||
        null,

      dentistId:
        data.dentistId ||
        null,
    });


    let beforeImage = null;
    let afterImage = null;
    let beforeRollback = null;
    let afterRollback = null;


    try {
      beforeImage =
        await uploadImageBuffer(
          beforeFile.buffer,
          {
            folder:
              'dental-clinic/before-after/before',

            tags: [
              'before-after',
              'before',
            ],
          }
        );

      beforeRollback = await enqueueMediaCleanup({
        publicId: beforeImage.publicId,
        reason: 'rollback',
        sourceType: 'before_after',
        held: true,
      });


      afterImage =
        await uploadImageBuffer(
          afterFile.buffer,
          {
            folder:
              'dental-clinic/before-after/after',

            tags: [
              'before-after',
              'after',
            ],
          }
        );

      afterRollback = await enqueueMediaCleanup({
        publicId: afterImage.publicId,
        reason: 'rollback',
        sourceType: 'before_after',
        held: true,
      });
    }
    catch (error) {
      if (beforeRollback) {
        await finishHeldCleanup(beforeRollback);
      }
      else {
        await rollbackUploadedImage(beforeImage);
      }
      if (afterRollback) {
        await finishHeldCleanup(afterRollback);
      }
      else {
        await rollbackUploadedImage(afterImage);
      }


      throw error;
    }


    let createdCase;


    try {
      const primary =
        data.translations?.hy;

      createdCase =
        await BeforeAfterCase.create({
          title:
            data.title ||
            primary?.title,

          description:
            data.description ??
            primary?.description ??
            '',

          translations:
            data.translations || {},

          service:
            data.serviceId ||
            null,

          dentist:
            data.dentistId ||
            null,

          beforeImage,

          afterImage,

          consentConfirmedAt:
            new Date(),

          isFeatured:
            data.isFeatured ??
            false,

          sortOrder:
            data.sortOrder ??
            0,

          isActive:
            data.isActive ??
            true,

          createdBy:
            userId,
        });
    }
    catch (error) {
      await Promise.allSettled([
        finishHeldCleanup(beforeRollback),
        finishHeldCleanup(afterRollback),
      ]);


      throw error;
    }

    await Promise.allSettled([
      cancelMediaCleanup(beforeImage.publicId),
      cancelMediaCleanup(afterImage.publicId),
    ]);


    return populateCase(
      BeforeAfterCase.findById(
        createdCase._id
      )
    );
  };


const getPublicCases =
  async (
    query
  ) => {
    const filter = {
      isActive: true,
    };


    if (query.serviceId) {
      filter.service =
        query.serviceId;
    }


    if (query.dentistId) {
      filter.dentist =
        query.dentistId;
    }


    if (
      query.featured !==
      undefined
    ) {
      filter.isFeatured =
        query.featured;
    }


    const page =
      query.page || 1;

    const limit =
      query.limit || 24;

    const skip =
      (page - 1) *
      limit;


    const [
      cases,
      total,
    ] = await Promise.all([
      populateCase(
        BeforeAfterCase
          .find(filter)
      )
        .select(
          '-createdBy'
        )
        .sort({
          isFeatured: -1,
          sortOrder: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      BeforeAfterCase
        .countDocuments(
          filter
        ),
    ]);


    return {
      cases,

      pagination: {
        page,
        limit,
        total,

        pages:
          Math.ceil(
            total / limit
          ),
      },
    };
  };


const getPublicCaseById =
  async (
    id
  ) => {
    const item =
      await populateCase(
        BeforeAfterCase.findOne({
          _id: id,
          isActive: true,
        })
      )
        .select(
          '-createdBy'
        )
        .lean();


    if (!item) {
      throw new ApiError(
        404,
        'Before/after case not found'
      );
    }


    return item;
  };


const getAdminCases =
  async (
    query
  ) => {
    const filter = {};


    if (query.serviceId) {
      filter.service =
        query.serviceId;
    }


    if (query.dentistId) {
      filter.dentist =
        query.dentistId;
    }


    if (
      query.featured !==
      undefined
    ) {
      filter.isFeatured =
        query.featured;
    }


    const page =
      query.page || 1;

    const limit =
      query.limit || 24;

    const skip =
      (page - 1) *
      limit;


    const [
      cases,
      total,
    ] = await Promise.all([
      populateCase(
        BeforeAfterCase
          .find(filter)
      )
        .populate(
          'createdBy',
          'name email role'
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      BeforeAfterCase
        .countDocuments(
          filter
        ),
    ]);


    return {
      cases,

      pagination: {
        page,
        limit,
        total,

        pages:
          Math.ceil(
            total / limit
          ),
      },
    };
  };


const updateCase =
  async (
    id,
    data
  ) => {
    const item =
      await BeforeAfterCase
        .findById(id);


    if (!item) {
      throw new ApiError(
        404,
        'Before/after case not found'
      );
    }


    await validateRelations({
      serviceId:
        data.serviceId ||
        null,

      dentistId:
        data.dentistId ||
        null,
    });


    if (
      data.title !==
      undefined
    ) {
      item.title =
        data.title;
    }


    if (data.translations) {
      item.translations =
        mergeTranslations(
          item.translations,
          data.translations
        );

    }


    if (
      data.description !==
      undefined
    ) {
      item.description =
        data.description;
    }


    if (
      data.serviceId !==
      undefined
    ) {
      item.service =
        data.serviceId ||
        null;
    }


    if (
      data.dentistId !==
      undefined
    ) {
      item.dentist =
        data.dentistId ||
        null;
    }


    if (
      data.isFeatured !==
      undefined
    ) {
      item.isFeatured =
        data.isFeatured;
    }


    if (
      data.sortOrder !==
      undefined
    ) {
      item.sortOrder =
        data.sortOrder;
    }


    await item.save();


    return populateCase(
      BeforeAfterCase.findById(
        item._id
      )
    );
  };


const replaceCaseImage =
  async (
    id,
    imageType,
    file
  ) => {
    const item =
      await BeforeAfterCase
        .findById(id);


    if (!item) {
      throw new ApiError(
        404,
        'Before/after case not found'
      );
    }


    const field =
      imageType === 'before'
        ? 'beforeImage'
        : 'afterImage';


    const folder =
      imageType === 'before'
        ? 'dental-clinic/before-after/before'
        : 'dental-clinic/before-after/after';


    const previous =
      item[field];


    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder,

          tags: [
            'before-after',
            imageType,
          ],
        }
      );


    let previousCleanup = null;

    try {
      if (previous?.publicId) {
        previousCleanup = await enqueueMediaCleanup({
          publicId: previous.publicId,
          reason: 'replacement',
          sourceType: 'before_after',
          sourceId: item._id,
          held: true,
        });
      }
      item[field] =
        uploaded;

      await item.save();
    }
    catch (error) {
      await cancelMediaCleanup(previous?.publicId);
      await rollbackUploadedImage(uploaded, item._id);

      throw error;
    }


    if (
      previous?.publicId
    ) {
      await finishHeldCleanup(previousCleanup);
    }


    return populateCase(
      BeforeAfterCase.findById(
        item._id
      )
    );
  };


const disableCase =
  async (
    id
  ) => {
    const item =
      await BeforeAfterCase
        .findById(id);


    if (!item) {
      throw new ApiError(
        404,
        'Before/after case not found'
      );
    }


    item.isActive =
      false;

    await item.save();


    return item;
  };


const restoreCase =
  async (
    id
  ) => {
    const item =
      await BeforeAfterCase
        .findById(id);


    if (!item) {
      throw new ApiError(
        404,
        'Before/after case not found'
      );
    }


    item.isActive =
      true;

    await item.save();


    return item;
  };


export {
  createCase,
  getPublicCases,
  getPublicCaseById,
  getAdminCases,
  updateCase,
  replaceCaseImage,
  disableCase,
  restoreCase,
};
