import ServiceCategory from './serviceCategory.model.js';
import Service from '../services/service.model.js';

import ApiError from '../../utils/ApiError.js';
import buildSlug from '../../utils/buildSlug.js';
import {
  mergeTranslations,
} from '../../i18n/localization.js';

const createCategory = async (data) => {
  const primary =
    data.translations?.hy;

  const name =
    data.name || primary?.name;

  const slug =
    data.slug || buildSlug(name);

  const duplicate =
    await ServiceCategory.findOne({
      slug,
    });

  if (duplicate) {
    throw new ApiError(
      409,
      'Category with this slug already exists'
    );
  }

  return ServiceCategory.create({
    ...data,
    name,
    description:
      data.description ??
      primary?.description ??
      '',
    slug,
  });
};

const getPublicCategories = async () => {
  return ServiceCategory.find({
    isActive: true,
  })
    .sort({
      sortOrder: 1,
      name: 1,
    })
    .lean();
};

const getAdminCategories = async () => {
  return ServiceCategory.find()
    .sort({
      sortOrder: 1,
      name: 1,
    })
    .lean();
};

const getCategoryBySlug = async (
  slug
) => {
  const category =
    await ServiceCategory.findOne({
      slug,
      isActive: true,
    }).lean();

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

  return category;
};

const updateCategory = async (
  id,
  data
) => {
  const shouldRegenerateSlug =
    data.name !== undefined &&
    data.slug === undefined;

  const category =
    await ServiceCategory.findById(id);

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

  if (data.translations) {
    category.translations =
      mergeTranslations(
        category.translations,
        data.translations
      );

    delete data.translations;
  }

  if (shouldRegenerateSlug) {
    data.slug = buildSlug(data.name);
  }

  Object.assign(category, data);
  await category.save();

  return category;
};

const deleteCategory = async (id) => {
  const category =
    await ServiceCategory.findById(id);

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

  const activeServices =
    await Service.countDocuments({
      category: id,
      isActive: true,
    });

  if (activeServices > 0) {
    throw new ApiError(
      409,
      'Disable services in this category first'
    );
  }

  category.isActive = false;

  await category.save();

  return category;
};

const restoreCategory = async (id) => {
  const category =
    await ServiceCategory.findById(id);

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

  category.isActive = true;
  await category.save();

  return category;
};

export {
  createCategory,
  getPublicCategories,
  getAdminCategories,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
  restoreCategory,
};
