import mongoose from 'mongoose';

import {
  createTranslationsSchema,
  requirePrimaryContent,
} from '../../i18n/localization.js';
import { SLUG_PATTERN } from '../../utils/buildSlug.js';

const categoryTranslationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { _id: false }
);

const serviceCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required() {
        return this.isActive !== false;
      },
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: SLUG_PATTERN,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },

    translations: {
      type: createTranslationsSchema(
        categoryTranslationSchema
      ),
      default: () => ({}),
    },

    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },

    sortOrder: {
      type: Number,
      min: 0,
      max: 10000,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    serviceMutationVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

serviceCategorySchema.index({
  isActive: 1,
  sortOrder: 1,
});

serviceCategorySchema.pre('validate', function () {
  requirePrimaryContent(
    this,
    ['name'],
    'Published service category'
  );
});

const ServiceCategory = mongoose.model(
  'ServiceCategory',
  serviceCategorySchema
);

export default ServiceCategory;
