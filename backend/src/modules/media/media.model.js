import mongoose from 'mongoose';

import imageAssetSchema from './imageAsset.schema.js';

import {
  createTranslationsSchema,
  requirePrimaryContent,
} from '../../i18n/localization.js';

const galleryTranslationSchema = new mongoose.Schema(
  {
    altText: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { _id: false }
);


const mediaAssetSchema =
  new mongoose.Schema(
    {
      type: {
        type: String,

        enum: [
          'clinic_gallery',
        ],

        default:
          'clinic_gallery',

        index: true,
      },

      image: {
        type: imageAssetSchema,
        required: true,
      },

      altText: {
        type: String,
        trim: true,
        maxlength: 200,
        default: '',
      },

      caption: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },

      translations: {
        type: createTranslationsSchema(
          galleryTranslationSchema
        ),
        default: () => ({}),
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

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );


mediaAssetSchema.index({
  type: 1,
  isActive: 1,
  sortOrder: 1,
});

mediaAssetSchema.pre('validate', function () {
  requirePrimaryContent(
    this,
    ['altText'],
    'Published gallery image'
  );
});


const MediaAsset =
  mongoose.model(
    'MediaAsset',
    mediaAssetSchema
  );


export default MediaAsset;
