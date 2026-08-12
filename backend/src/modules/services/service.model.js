import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      required: true,
      index: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },

    priceType: {
      type: String,
      enum: [
        'fixed',
        'from',
        'range',
        'on_request',
      ],
      default: 'on_request',
    },

    priceFrom: {
      type: Number,
      min: 0,
      default: null,
    },

    priceTo: {
      type: Number,
      min: 0,
      default: null,
    },

    currency: {
      type: String,
      enum: ['AMD'],
      default: 'AMD',
    },

    durationMinutes: {
      type: Number,
      min: 15,
      max: 480,
      default: 60,
    },

    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    bookingEnabled: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      min: 0,
      max: 10000,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

serviceSchema.index({
  category: 1,
  isActive: 1,
  sortOrder: 1,
});

serviceSchema.index({
  isFeatured: 1,
  isActive: 1,
});

const Service = mongoose.model(
  'Service',
  serviceSchema
);

export default Service;
