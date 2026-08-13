import multer from 'multer';

import {
  fileTypeFromBuffer,
} from 'file-type';

import path from 'node:path';

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


const ALLOWED_EXTENSIONS =
  new Map([
    ['image/jpeg', new Set(['.jpg', '.jpeg'])],
    ['image/png', new Set(['.png'])],
    ['image/webp', new Set(['.webp'])],
    ['image/heic', new Set(['.heic'])],
    ['image/heif', new Set(['.heif'])],
  ]);


const storage =
  multer.memoryStorage();


const multerUpload =
  multer({
    storage,

    limits: {
      fileSize:
        MAX_IMAGE_SIZE,

      files: 2,

      fields: 20,

      parts: 25,
    },
  });


const handleMulterError = (
  error,
  next
) => {
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


    if (
      error.code ===
      'LIMIT_FILE_COUNT'
    ) {
      return next(
        new ApiError(
          400,
          'Too many image files'
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


  next(error);
};


const uploadSingleImage =
  multerUpload.single(
    'image'
  );


const uploadBeforeAfter =
  multerUpload.fields([
    {
      name:
        'beforeImage',

      maxCount: 1,
    },

    {
      name:
        'afterImage',

      maxCount: 1,
    },
  ]);


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
        return handleMulterError(
          error,
          next
        );
      }

      next();
    }
  );
};


const handleBeforeAfterUpload = (
  req,
  res,
  next
) => {
  uploadBeforeAfter(
    req,
    res,
    (error) => {
      if (error) {
        return handleMulterError(
          error,
          next
        );
      }

      next();
    }
  );
};


const validateFileSignature =
  async (
    file
  ) => {
    if (!file) {
      throw new ApiError(
        400,
        'Image file is required'
      );
    }


    const detected =
      await fileTypeFromBuffer(
        file.buffer
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


    const submittedMime =
      String(file.mimetype || '')
        .toLowerCase();

    const extension =
      path.extname(
        file.originalname || ''
      ).toLowerCase();

    const validExtensions =
      ALLOWED_EXTENSIONS.get(
        detected.mime
      );


    if (
      submittedMime !==
        detected.mime ||
      !validExtensions?.has(
        extension
      )
    ) {
      throw new ApiError(
        415,
        'Image file type does not match its content'
      );
    }


    return detected;
  };


const verifyImageSignature =
  async (
    req,
    res,
    next
  ) => {
    try {
      req.detectedFileType =
        await validateFileSignature(
          req.file
        );

      next();
    }
    catch (error) {
      next(error);
    }
  };


const verifyBeforeAfterSignatures =
  async (
    req,
    res,
    next
  ) => {
    try {
      const before =
        req.files
          ?.beforeImage
          ?.[0];

      const after =
        req.files
          ?.afterImage
          ?.[0];


      if (
        !before ||
        !after
      ) {
        throw new ApiError(
          400,
          'Both beforeImage and afterImage are required'
        );
      }


      await Promise.all([
        validateFileSignature(
          before
        ),

        validateFileSignature(
          after
        ),
      ]);


      next();
    }
    catch (error) {
      next(error);
    }
  };


export {
  handleImageUpload,
  verifyImageSignature,
  handleBeforeAfterUpload,
  verifyBeforeAfterSignatures,
};
