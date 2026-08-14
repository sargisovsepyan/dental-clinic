import BeforeAfterCase from './beforeAfter.model.js';

import Service from '../services/service.model.js';

import Dentist from '../dentists/dentist.model.js';

import ApiError from '../../utils/ApiError.js';

import {
  deleteCloudinaryImage,
} from '../../utils/cloudinaryImage.js';
import {
  mergeTranslations,
} from '../../i18n/localization.js';
import logger from '../../observability/logger.js';
import env from '../../config/env.js';
import {
  enqueueMediaCleanup,
  cancelMediaCleanup,
  cleanupMediaAsset,
} from '../media/mediaCleanup.service.js';
import {
  finishHeldCleanup,
  uploadWithRollbackIntent,
} from '../media/mediaUpload.service.js';

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
      ({
        uploaded: beforeImage,
        rollbackJob: beforeRollback,
      } = await uploadWithRollbackIntent({
        buffer: beforeFile.buffer,
        folder: 'dental-clinic/before-after/before',
        tags: ['before-after', 'before'],
        sourceType: 'before_after',
      }));


      ({
        uploaded: afterImage,
        rollbackJob: afterRollback,
      } = await uploadWithRollbackIntent({
        buffer: afterFile.buffer,
        folder: 'dental-clinic/before-after/after',
        tags: ['before-after', 'after'],
        sourceType: 'before_after',
      }));
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

          consentPolicyVersion:
            env.BEFORE_AFTER_CONSENT_VERSION,

          consentMethod:
            data.consentMethod,

          consentRecordedBy:
            userId,

          externalConsentReference:
            data.externalConsentReference || '',

          publicationStatus:
            data.isActive === false ? 'draft' : 'published',

          consentStatus:
            'active',

          consentHistory: [{
            action: 'confirmed',
            policyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
            method: data.consentMethod,
            actor: userId,
            occurredAt: new Date(),
          }],

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
      publicationStatus: 'published',
      consentStatus: 'active',
      purgedAt: null,
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
          [
            '-createdBy',
            '-consentRecordedBy',
            '-withdrawnBy',
            '-purgedBy',
            '-withdrawalReason',
            '-consentHistory',
            '-consentMethod',
            '-externalConsentReference',
          ].join(' ')
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
          publicationStatus: 'published',
          consentStatus: 'active',
          purgedAt: null,
        })
      )
        .select(
          [
            '-createdBy',
            '-consentRecordedBy',
            '-withdrawnBy',
            '-purgedBy',
            '-withdrawalReason',
            '-consentHistory',
            '-consentMethod',
            '-externalConsentReference',
          ].join(' ')
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
          .select('+externalConsentReference')
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

    if (item.consentStatus !== 'active' || item.purgedAt) {
      throw new ApiError(409, 'Images cannot be changed after consent withdrawal');
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


    const {
      uploaded,
      rollbackJob: uploadedRollback,
    } = await uploadWithRollbackIntent({
        buffer: file.buffer,
        folder,
        tags: ['before-after', imageType],
        sourceType: 'before_after',
        sourceId: item._id,
      });

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
      const updated = await BeforeAfterCase.findOneAndUpdate(
        {
          _id: item._id,
          consentStatus: 'active',
          purgedAt: null,
          ...expectedImageFilter(field, previous),
        },
        { $set: { [field]: uploaded } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!updated) {
        throw new ApiError(
          409,
          'Case image or consent state changed; reload and try again'
        );
      }
      await cancelMediaCleanup(uploaded.publicId).catch((error) => {
        logger.warn('before_after_rollback_hold_cancel_failed', {
          imageType,
          error,
        });
      });

      if (previous?.publicId) {
        await finishHeldCleanup(previousCleanup);
      }
    }
    catch (error) {
      await Promise.allSettled([
        finishHeldCleanup(uploadedRollback),
      ]);

      throw error;
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


    const disabled = await BeforeAfterCase.findOneAndUpdate(
      {
        _id: id,
        consentStatus: 'active',
        purgedAt: null,
      },
      {
        $set: {
          isActive: false,
          publicationStatus: 'draft',
        },
      },
      { returnDocument: 'after', runValidators: true }
    );

    if (!disabled) {
      throw new ApiError(409, 'Withdrawn or purged cases cannot be disabled');
    }
    return disabled;
  };


const restoreCase =
  async (
    id
  ) => {
    const item = await BeforeAfterCase.findOneAndUpdate(
      {
        _id: id,
        consentStatus: 'active',
        withdrawnAt: null,
        purgedAt: null,
      },
      {
        $set: {
          isActive: true,
          publicationStatus: 'published',
        },
      },
      { returnDocument: 'after', runValidators: true }
    );

    if (item) {
      return item;
    }
    const existing = await BeforeAfterCase.findById(id).lean();
    if (!existing) {
      throw new ApiError(404, 'Before/after case not found');
    }
    if (existing.purgedAt || existing.consentStatus === 'purged') {
      throw new ApiError(409, 'Purged cases cannot be restored');
    }
    throw new ApiError(
      409,
      'Withdrawn consent prevents publication; record new consent separately'
    );
  };


const withdrawConsent = async (id, { reason, userId }) => {
  const item = await BeforeAfterCase.findOneAndUpdate(
    {
      _id: id,
      consentStatus: 'active',
      purgedAt: null,
    },
    {
      $set: {
        consentStatus: 'withdrawn',
        publicationStatus: 'withdrawn',
        isActive: false,
        isFeatured: false,
        withdrawnAt: new Date(),
        withdrawnBy: userId,
        withdrawalReason: reason,
      },
      $push: {
        consentHistory: {
          action: 'withdrawn',
          policyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
          method: 'governance_action',
          actor: userId,
          occurredAt: new Date(),
          reason,
        },
      },
    },
    { returnDocument: 'after', runValidators: true }
  ).select('+externalConsentReference');

  if (item) {
    return item;
  }

  const existing = await BeforeAfterCase.findById(id).lean();
  if (!existing) {
    throw new ApiError(404, 'Before/after case not found');
  }
  throw new ApiError(409, 'Consent is already withdrawn or media is purged');
};


const purgeCaseMedia = async (id, { reason, userId }) => {
  const item = await BeforeAfterCase.findById(id)
    .select('+externalConsentReference');
  if (!item) {
    throw new ApiError(404, 'Before/after case not found');
  }
  if (item.purgedAt || item.consentStatus === 'purged') {
    throw new ApiError(409, 'Before/after media is already purged');
  }
  if (item.consentStatus !== 'withdrawn' || !item.withdrawnAt) {
    throw new ApiError(409, 'Consent must be withdrawn before permanent purge');
  }

  const images = [item.beforeImage, item.afterImage].filter(
    (image) => image?.publicId
  );
  const heldJobs = [];
  try {
    for (const image of images) {
      heldJobs.push(await enqueueMediaCleanup({
        publicId: image.publicId,
        reason: 'consent_purge',
        sourceType: 'before_after',
        sourceId: item._id,
        held: true,
      }));
    }
  }
  catch (error) {
    await Promise.allSettled(
      heldJobs.map((job) => cancelMediaCleanup(job?.publicId))
    );
    throw error;
  }

  const now = new Date();
  let purged;
  try {
    purged = await BeforeAfterCase.findOneAndUpdate(
      {
        _id: item._id,
        consentStatus: 'withdrawn',
        withdrawnAt: { $ne: null },
        purgedAt: null,
      },
      {
        $set: {
          beforeImage: null,
          afterImage: null,
          publicationStatus: 'purged',
          consentStatus: 'purged',
          isActive: false,
          isFeatured: false,
          purgedAt: now,
          purgedBy: userId,
          externalConsentReference: '',
        },
        $push: {
          consentHistory: {
            action: 'purged',
            policyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
            method: 'governance_action',
            actor: userId,
            occurredAt: now,
            reason,
          },
        },
      },
      { returnDocument: 'after', runValidators: true }
    ).select('+externalConsentReference');
  }
  catch (error) {
    // A held record is safer than deleting media after an uncertain database write.
    throw error;
  }

  if (!purged) {
    const latest = await BeforeAfterCase.findById(id).lean();
    if (!latest) {
      await Promise.allSettled(
        heldJobs.map((job) => cancelMediaCleanup(job?.publicId))
      );
      throw new ApiError(404, 'Before/after case not found');
    }
    if (latest.purgedAt || latest.consentStatus === 'purged') {
      throw new ApiError(409, 'Before/after media is already purged');
    }
    await Promise.allSettled(
      heldJobs.map((job) => cancelMediaCleanup(job?.publicId))
    );
    throw new ApiError(409, 'Consent state changed; reload and try again');
  }

  await Promise.allSettled(heldJobs.map((job) => finishHeldCleanup(job)));
  return purged;
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
  withdrawConsent,
  purgeCaseMedia,
};
