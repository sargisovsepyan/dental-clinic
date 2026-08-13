import mongoose from 'mongoose';

import imageAssetSchema from '../media/imageAsset.schema.js';


const beforeAfterCaseSchema =
  new mongoose.Schema(
    {
      title: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 200,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: '',
      },

      service: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Service',

        default: null,

        index: true,
      },

      dentist: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Dentist',

        default: null,

        index: true,
      },

      beforeImage: {
        type:
          imageAssetSchema,

        required: true,
      },

      afterImage: {
        type:
          imageAssetSchema,

        required: true,
      },

      consentConfirmedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      isFeatured: {
        type: Boolean,
        default: false,
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

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'User',

        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );


beforeAfterCaseSchema.index({
  isActive: 1,
  isFeatured: -1,
  sortOrder: 1,
  createdAt: -1,
});


const BeforeAfterCase =
  mongoose.model(
    'BeforeAfterCase',
    beforeAfterCaseSchema
  );


export default BeforeAfterCase;
