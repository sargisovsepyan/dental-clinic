import mongoose from 'mongoose';

import imageAssetSchema from './imageAsset.schema.js';


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


const MediaAsset =
  mongoose.model(
    'MediaAsset',
    mediaAssetSchema
  );


export default MediaAsset;
