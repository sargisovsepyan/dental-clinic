import mongoose from 'mongoose';


const imageAssetSchema =
  new mongoose.Schema(
    {
      publicId: {
        type: String,
        required: true,
        trim: true,
      },

      secureUrl: {
        type: String,
        required: true,
        trim: true,
      },

      width: {
        type: Number,
        min: 1,
        required: true,
      },

      height: {
        type: Number,
        min: 1,
        required: true,
      },

      format: {
        type: String,
        required: true,
        trim: true,
      },

      bytes: {
        type: Number,
        min: 1,
        required: true,
      },
    },
    {
      _id: false,
    }
  );


export default imageAssetSchema;
