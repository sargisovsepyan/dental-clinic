import mongoose from 'mongoose';

import imageAssetSchema from '../media/imageAsset.schema.js';

import {
  createTranslationsSchema,
  requirePrimaryContent,
} from '../../i18n/localization.js';

const dentistTranslationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    specializations: {
      type: [{
        type: String,
        trim: true,
        maxlength: 100,
      }],
      default: [],
    },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },

    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  {
    _id: false,
  }
);


const weeklyDaySchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },

    isWorking: {
      type: Boolean,
      default: true,
    },

    shifts: {
      type: [shiftSchema],
      default: [],
    },
  },
  {
    _id: false,
  }
);


const dentistSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },

    specializations: {
      type: [{
        type: String,
        trim: true,
        maxlength: 100,
      }],
      default: [],
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },

    translations: {
      type: createTranslationsSchema(
        dentistTranslationSchema
      ),
      default: () => ({}),
    },

    experienceYears: {
      type: Number,
      min: 0,
      max: 70,
      default: 0,
    },

    photoUrl: {
      type: String,
      trim: true,
      default: '',
    },

    photo: {
      type: imageAssetSchema,
      default: null,
    },

    languages: {
      type: [{
        type: String,
        enum: [
          'hy',
          'ru',
          'en',
          'fr',
          'de',
          'other',
        ],
      }],
      default: [],
    },

    services: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      }],
      default: [],
    },

    weeklySchedule: {
      type: [weeklyDaySchema],
      default: [],
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    bookingEnabled: {
      type: Boolean,
      default: true,
      index: true,
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


dentistSchema.index({
  isActive: 1,
  sortOrder: 1,
});

dentistSchema.index({
  services: 1,
  isActive: 1,
  bookingEnabled: 1,
});

dentistSchema.pre('validate', function () {
  requirePrimaryContent(
    this,
    ['title'],
    'Published dentist'
  );
});


const Dentist = mongoose.model(
  'Dentist',
  dentistSchema
);

export default Dentist;

