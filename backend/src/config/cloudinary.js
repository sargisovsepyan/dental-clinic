import {
  v2 as cloudinary,
} from 'cloudinary';

import env from './env.js';

import ApiError from '../utils/ApiError.js';


cloudinary.config({
  cloud_name:
    env.CLOUDINARY_CLOUD_NAME,

  api_key:
    env.CLOUDINARY_API_KEY,

  api_secret:
    env.CLOUDINARY_API_SECRET,

  secure: true,
});


const assertCloudinaryConfigured =
  () => {
    if (
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new ApiError(
        503,
        'Media storage is not configured'
      );
    }
  };


export {
  cloudinary,
  assertCloudinaryConfigured,
};
