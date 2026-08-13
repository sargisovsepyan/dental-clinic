import Service from './service.model.js';
import ServiceCategory from '../serviceCategories/serviceCategory.model.js';

import ApiError from '../../utils/ApiError.js';
import buildSlug from '../../utils/buildSlug.js';
import {
  mergeTranslations,
} from '../../i18n/localization.js';

const validatePrice = (service) => {
  const {
    priceType,
    priceFrom,
    priceTo,
  } = service;

  if (
    priceType === 'fixed' ||
    priceType === 'from'
  ) {
    if (
      priceFrom === null ||
      priceFrom === undefined
    ) {
      throw new ApiError(
        400,
        'priceFrom is required for this price type'
      );
    }

    service.priceTo = null;
  }

  if (priceType === 'range') {
    if (
      priceFrom === null ||
      priceFrom === undefined ||
      priceTo === null ||
      priceTo === undefined
    ) {
      throw new ApiError(
        400,
        'priceFrom and priceTo are required for range pricing'
      );
    }

    if (priceTo < priceFrom) {
      throw new ApiError(
        400,
        'priceTo cannot be lower than priceFrom'
      );
    }
  }

  if (priceType === 'on_request') {
    service.priceFrom = null;
    service.priceTo = null;
  }
};

const ensureCategoryExists = async (
  categoryId
) => {
  const category =
    await ServiceCategory.findOne({
      _id: categoryId,
      isActive: true,
    });

  if (!category) {
    throw new ApiError(
      400,
      'Selected service category is not available'
    );
  }

  return category;
};

const createService = async (data) => {
  await ensureCategoryExists(
    data.category
  );

  const primary =
    data.translations?.hy;

  const payload = {
    ...data,
    name:
      data.name || primary?.name,
    shortDescription:
      data.shortDescription ??
      primary?.shortDescription ??
      '',
    description:
      data.description ??
      primary?.description ??
      '',
    slug:
      data.slug ||
      buildSlug(
        data.name || primary?.name
      ),
  };

  validatePrice(payload);

  const duplicate =
    await Service.findOne({
      slug: payload.slug,
    });

  if (duplicate) {
    throw new ApiError(
      409,
      'Service with this slug already exists'
    );
  }

  return Service.create(payload);
};

const getPublicServices = async (
  query
) => {
  const filter = {
    isActive: true,
  };

  if (query.featured !== undefined) {
    filter.isFeatured =
      query.featured;
  }

  if (
    query.bookingEnabled !==
    undefined
  ) {
    filter.bookingEnabled =
      query.bookingEnabled;
  }

  if (query.category) {
    const category =
      await ServiceCategory.findOne({
        slug: query.category,
        isActive: true,
      }).select('_id');

    if (!category) {
      return [];
    }

    filter.category =
      category._id;
  }

  return Service.find(filter)
    .populate(
      'category',
      'name slug translations'
    )
    .sort({
      sortOrder: 1,
      name: 1,
    })
    .lean();
};

const getAdminServices = async () => {
  return Service.find()
    .populate(
      'category',
      'name slug translations isActive'
    )
    .sort({
      sortOrder: 1,
      name: 1,
    })
    .lean();
};

const getServiceBySlug = async (
  slug
) => {
  const service =
    await Service.findOne({
      slug,
      isActive: true,
    })
      .populate(
        'category',
        'name slug translations'
      )
      .lean();

  if (!service) {
    throw new ApiError(
      404,
      'Service not found'
    );
  }

  return service;
};

const updateService = async (
  id,
  data
) => {
  const shouldRegenerateSlug =
    data.name !== undefined &&
    data.slug === undefined;

  const current =
    await Service.findById(id);

  if (!current) {
    throw new ApiError(
      404,
      'Service not found'
    );
  }

  if (data.category) {
    await ensureCategoryExists(
      data.category
    );
  }

  const merged = {
    ...current.toObject(),
    ...data,
  };

  if (data.translations) {
    data.translations =
      mergeTranslations(
        current.translations,
        data.translations
      );

  }

  if (shouldRegenerateSlug) {
    merged.slug =
      buildSlug(data.name);

    data.slug =
      merged.slug;
  }

  validatePrice(merged);

  data.priceFrom =
    merged.priceFrom;

  data.priceTo =
    merged.priceTo;

  Object.assign(current, data);
  await current.save();

  return current.populate(
    'category',
    'name slug translations'
  );
};

const deleteService = async (id) => {
  const service =
    await Service.findByIdAndUpdate(
      id,
      {
        isActive: false,
      },
      {
        returnDocument: 'after',
      }
    );

  if (!service) {
    throw new ApiError(
      404,
      'Service not found'
    );
  }

  return service;
};

const restoreService = async (id) => {
  const service =
    await Service.findById(id);

  if (!service) {
    throw new ApiError(
      404,
      'Service not found'
    );
  }

  await ensureCategoryExists(
    service.category
  );

  service.isActive = true;

  await service.save();

  return service;
};

export {
  createService,
  getPublicServices,
  getAdminServices,
  getServiceBySlug,
  updateService,
  deleteService,
  restoreService,
};
