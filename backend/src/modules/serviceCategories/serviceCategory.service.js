import ServiceCategory from './serviceCategory.model.js';
import Service from '../services/service.model.js';

import ApiError from '../../utils/ApiError.js';
import { buildCanonicalSlug } from '../../utils/buildSlug.js';
import runTransaction from '../../utils/runTransaction.js';
import {
  buildTranslationSet,
  synchronizePrimaryFields,
} from '../../i18n/localization.js';

const LOCALIZED_FIELDS = Object.freeze([
  'name',
  'description',
]);
const UPDATE_FIELDS = new Set([
  ...LOCALIZED_FIELDS,
  'translations',
  'sortOrder',
]);

const assertUpdateFields = (data) => {
  const unsupported = Object.keys(data)
    .find((field) => !UPDATE_FIELDS.has(field));

  if (unsupported) {
    throw new ApiError(400, `${unsupported} cannot be changed by category update`);
  }
};

const createCategory = async (data) => {
  const normalized = synchronizePrimaryFields(
    data,
    LOCALIZED_FIELDS,
    'Category'
  );
  const primary = normalized.translations?.hy;
  const slug = buildCanonicalSlug({
    explicit: normalized.slug,
    english: normalized.translations?.en?.name,
    armenian: primary?.name,
    fallback: normalized.name,
  });

  const duplicate = await ServiceCategory.exists({ slug });
  if (duplicate) {
    throw new ApiError(409, 'Category with this slug already exists');
  }

  return ServiceCategory.create({
    ...normalized,
    name:
      primary?.name ||
      normalized.name,
    description: primary?.description ?? normalized.description ?? '',
    slug,
  });
};

const getPublicCategories = async () => ServiceCategory.find({
  isActive: true,
})
  .sort({ sortOrder: 1, name: 1 })
  .lean();

const getAdminCategories = async () => ServiceCategory.find()
  .sort({ sortOrder: 1, name: 1 })
  .lean();

const getCategoryBySlug = async (slug) => {
  const category = await ServiceCategory.findOne({
    slug,
    isActive: true,
  }).lean();

  if (!category) {
    throw new ApiError(404, 'Service category not found');
  }

  return category;
};

const updateCategory = async (id, data) => {
  assertUpdateFields(data);
  const category = await ServiceCategory.findById(id)
    .select('+serviceMutationVersion');
  if (!category) {
    throw new ApiError(404, 'Service category not found');
  }

  const normalized = synchronizePrimaryFields(
    data,
    LOCALIZED_FIELDS,
    'Category'
  );
  const set = buildTranslationSet(normalized.translations);
  const primary = normalized.translations?.hy;

  for (const field of LOCALIZED_FIELDS) {
    if (primary?.[field] !== undefined) {
      set[field] = primary[field];
    }
  }
  if (normalized.sortOrder !== undefined) {
    set.sortOrder = normalized.sortOrder;
  }

  return ServiceCategory.findByIdAndUpdate(
    id,
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  );
};

const deleteCategory = async (id) => runTransaction(async (session) => {
  const category = await ServiceCategory.findOneAndUpdate(
    { _id: id },
    { $inc: { serviceMutationVersion: 1 } },
    { returnDocument: 'after', session }
  ).select('+serviceMutationVersion');

  if (!category) {
    throw new ApiError(404, 'Service category not found');
  }

  const activeServices = await Service.countDocuments({
    category: id,
    isActive: true,
  }).session(session);

  if (activeServices > 0) {
    throw new ApiError(409, 'Disable services in this category first');
  }

  category.isActive = false;
  await category.save({ session });
  return category;
});

const restoreCategory = async (id) => {
  const category = await ServiceCategory.findById(id)
    .select('+serviceMutationVersion');
  if (!category) {
    throw new ApiError(404, 'Service category not found');
  }

  category.isActive = true;
  category.serviceMutationVersion =
    (category.serviceMutationVersion || 0) + 1;
  await category.save();
  return ServiceCategory.findById(id);
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
