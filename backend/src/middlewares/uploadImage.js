import multer from 'multer';

import {
  fileTypeFromBuffer,
} from 'file-type';

import ApiError from '../utils/ApiError.js';


const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;


const ALLOWED_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);


const storage =
  multer.memoryStorage();


const multerUpload =
  multer({
    storage,

    limits: {
      fileSize:
        MAX_IMAGE_SIZE,

      files: 1,

      fields: 10,

      parts: 12,
    },
  });


const uploadSingleImage =
  multerUpload.single(
    'image'
  );


const handleImageUpload = (
  req,
  res,
  next
) => {
  uploadSingleImage(
    req,
    res,
    (error) => {
      if (error) {
        if (
          error instanceof
            multer.MulterError
        ) {
          if (
            error.code ===
            'LIMIT_FILE_SIZE'
          ) {
            return next(
              new ApiError(
                413,
                'Image must be 5 MB or smaller'
              )
            );
          }

          return next(
            new ApiError(
              400,
              `Upload error: ${error.code}`
            )
          );
        }

        return next(error);
      }

      next();
    }
  );
};


const verifyImageSignature =
  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file) {
        throw new ApiError(
          400,
          'Image file is required'
        );
      }


      const detected =
        await fileTypeFromBuffer(
          req.file.buffer
        );


      if (
        !detected ||
        !ALLOWED_TYPES.has(
          detected.mime
        )
      ) {
        throw new ApiError(
          415,
          'Unsupported image format'
        );
      }


      req.detectedFileType =
        detected;


      next();
    }
    catch (error) {
      next(error);
    }
  };


export {
  handleImageUpload,
  verifyImageSignature,
};
