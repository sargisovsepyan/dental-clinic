import mongoose from 'mongoose';

const serviceCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
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

const ServiceCategory = mongoose.model(
  'ServiceCategory',
  serviceCategorySchema
);

export default ServiceCategory;
