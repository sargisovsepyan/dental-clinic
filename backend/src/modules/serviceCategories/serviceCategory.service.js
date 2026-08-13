import ServiceCategory from './serviceCategory.model.js';
import Service from '../services/service.model.js';

import ApiError from '../../utils/ApiError.js';
import buildSlug from '../../utils/buildSlug.js';

const createCategory = async (data) => {
  const slug =
    data.slug || buildSlug(data.name);

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
  if (data.name && !data.slug) {
    data.slug = buildSlug(data.name);
  }

  const category =
    await ServiceCategory.findByIdAndUpdate(
      id,
      data,
      {
        returnDocument: 'after',
        runValidators: true,
      }
    );

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

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
    await ServiceCategory.findByIdAndUpdate(
      id,
      {
        isActive: true,
      },
      {
        returnDocument: 'after',
      }
    );

  if (!category) {
    throw new ApiError(
      404,
      'Service category not found'
    );
  }

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
