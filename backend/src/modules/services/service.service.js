import Service from './service.model.js';
import ServiceCategory from '../serviceCategories/serviceCategory.model.js';

import ApiError from '../../utils/ApiError.js';
import { buildCanonicalSlug } from '../../utils/buildSlug.js';
import runTransaction from '../../utils/runTransaction.js';
import {
  buildTranslationSet,
  synchronizePrimaryFields,
} from '../../i18n/localization.js';

const LOCALIZED_FIELDS = Object.freeze([
  'name',
  'shortDescription',
  'description',
]);
const UPDATE_FIELDS = new Set([
  ...LOCALIZED_FIELDS,
  'translations',
  'category',
  'priceType',
  'priceFrom',
  'priceTo',
  'currency',
  'durationMinutes',
  'isFeatured',
  'bookingEnabled',
  'sortOrder',
]);

const assertUpdateFields = (data) => {
  const unsupported = Object.keys(data)
    .find((field) => !UPDATE_FIELDS.has(field));
  if (unsupported) {
    throw new ApiError(400, `${unsupported} cannot be changed by service update`);
  }
};

const validatePrice = (service) => {
  const { priceType, priceFrom, priceTo } = service;

  if (priceType === 'fixed' || priceType === 'from') {
    if (priceFrom === null || priceFrom === undefined) {
      throw new ApiError(400, 'priceFrom is required for this price type');
    }
    service.priceTo = null;
  }

  if (priceType === 'range') {
    if (
      priceFrom === null || priceFrom === undefined ||
      priceTo === null || priceTo === undefined
    ) {
      throw new ApiError(400, 'priceFrom and priceTo are required for range pricing');
    }
    if (priceTo < priceFrom) {
      throw new ApiError(400, 'priceTo cannot be lower than priceFrom');
    }
  }

  if (priceType === 'on_request') {
    service.priceFrom = null;
    service.priceTo = null;
  }
};

const ensureCategoryExists = async (
  categoryId,
  { session = null, writeGuard = false } = {}
) => {
  const query = writeGuard
    ? ServiceCategory.findOneAndUpdate(
        { _id: categoryId, isActive: true },
        { $inc: { serviceMutationVersion: 1 } },
        { returnDocument: 'after', session }
      )
    : ServiceCategory.findOne({
        _id: categoryId,
        isActive: true,
      }).session(session);

  const category = await query;
  if (!category) {
    throw new ApiError(400, 'Selected service category is not available');
  }
  return category;
};

const createService = async (data) => {
  const normalized = synchronizePrimaryFields(
    data,
    LOCALIZED_FIELDS,
    'Service'
  );
  const primary = normalized.translations?.hy;
  const payload = {
    ...normalized,
    name:
      primary?.name ||
      normalized.name,
    shortDescription:
      primary?.shortDescription ?? normalized.shortDescription ?? '',
    description: primary?.description ?? normalized.description ?? '',
    slug: buildCanonicalSlug({
      explicit: normalized.slug,
      english: normalized.translations?.en?.name,
      armenian: primary?.name,
      fallback: normalized.name,
    }),
  };

  if (payload.isActive === false) {
    payload.bookingEnabled = false;
    payload.isFeatured = false;
  }
  validatePrice(payload);

  return runTransaction(async (session) => {
    await ensureCategoryExists(payload.category, {
      session,
      writeGuard: true,
    });

    if (await Service.exists({ slug: payload.slug }).session(session)) {
      throw new ApiError(409, 'Service with this slug already exists');
    }

    const [created] = await Service.create([payload], { session });
    return created;
  });
};

const getPublicServices = async (query) => {
  const filter = { isActive: true };
  if (query.featured !== undefined) {
    filter.isFeatured = query.featured;
  }
  if (query.bookingEnabled !== undefined) {
    filter.bookingEnabled = query.bookingEnabled;
  }
  if (query.category) {
    const category = await ServiceCategory.findOne({
      slug: query.category,
      isActive: true,
    }).select('_id');
    if (!category) {
      return [];
    }
    filter.category = category._id;
  }

  const services = await Service.find(filter)
    .populate({
      path: 'category',
      match: { isActive: true },
      select: 'name slug translations',
    })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return services.filter(({ category }) => Boolean(category));
};

const getAdminServices = async () => Service.find()
  .populate('category', 'name slug translations isActive')
  .sort({ sortOrder: 1, name: 1 })
  .lean();

const getServiceBySlug = async (slug) => {
  const service = await Service.findOne({ slug, isActive: true })
    .populate({
      path: 'category',
      match: { isActive: true },
      select: 'name slug translations',
    })
    .lean();

  if (!service?.category) {
    throw new ApiError(404, 'Service not found');
  }
  return service;
};

const updateService = async (id, data) => {
  assertUpdateFields(data);

  const performUpdate = async (session = null) => {
    const current = await Service.findById(id)
      .select('+bookingGuardVersion')
      .session(session);
    if (!current) {
      throw new ApiError(404, 'Service not found');
    }

    if (
      !current.isActive &&
      (data.bookingEnabled === true || data.isFeatured === true)
    ) {
      throw new ApiError(409, 'Restore the service before enabling booking or featuring it');
    }

    if (data.category) {
      await ensureCategoryExists(data.category, {
        session,
        writeGuard: true,
      });
    }

    const normalized = synchronizePrimaryFields(
      data,
      LOCALIZED_FIELDS,
      'Service'
    );
    const merged = {
      ...current.toObject(),
      ...normalized,
    };
    validatePrice(merged);

    const set = buildTranslationSet(normalized.translations);
    const primary = normalized.translations?.hy;
    for (const field of LOCALIZED_FIELDS) {
      if (primary?.[field] !== undefined) {
        set[field] = primary[field];
      }
    }

    for (const field of UPDATE_FIELDS) {
      if (
        !LOCALIZED_FIELDS.includes(field) &&
        field !== 'translations' &&
        normalized[field] !== undefined
      ) {
        set[field] = normalized[field];
      }
    }
    set.priceFrom = merged.priceFrom;
    set.priceTo = merged.priceTo;

    const updated = await Service.findOneAndUpdate(
      {
        _id: id,
        ...(
          data.bookingEnabled === true || data.isFeatured === true
            ? { isActive: true }
            : {}
        ),
      },
      { $set: set, $inc: { bookingGuardVersion: 1 } },
      { returnDocument: 'after', runValidators: true, session }
    ).populate('category', 'name slug translations');

    if (!updated) {
      if (!await Service.exists({ _id: id }).session(session)) {
        throw new ApiError(404, 'Service not found');
      }
      throw new ApiError(
        409,
        'Service lifecycle changed while the update was in progress'
      );
    }
    return updated;
  };

  return data.category
    ? runTransaction(performUpdate)
    : performUpdate();
};

const deleteService = async (id) => {
  const service = await Service.findByIdAndUpdate(
    id,
    {
      $set: {
        isActive: false,
        bookingEnabled: false,
        isFeatured: false,
      },
      $inc: { bookingGuardVersion: 1 },
    },
    { returnDocument: 'after', runValidators: true }
  );
  if (!service) {
    throw new ApiError(404, 'Service not found');
  }
  return service;
};

const restoreService = async (id) => runTransaction(async (session) => {
  const service = await Service.findById(id)
    .select('+bookingGuardVersion')
    .session(session);
  if (!service) {
    throw new ApiError(404, 'Service not found');
  }

  await ensureCategoryExists(service.category, {
    session,
    writeGuard: true,
  });
  service.isActive = true;
  service.bookingEnabled = false;
  service.isFeatured = false;
  service.bookingGuardVersion = (service.bookingGuardVersion || 0) + 1;
  await service.save({ session });
  return service;
});

export {
  createService,
  getPublicServices,
  getAdminServices,
  getServiceBySlug,
  updateService,
  deleteService,
  restoreService,
};
