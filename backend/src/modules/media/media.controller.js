import * as mediaService from './media.service.js';

import {
  listMediaCleanupJobs,
  retryMediaCleanupJob,
} from './mediaCleanup.service.js';
import ApiError from '../../utils/ApiError.js';


const uploadDentistPhoto =
  async (
    req,
    res
  ) => {
    const dentist =
      await mediaService
        .replaceDentistPhoto(
          req.params.id,
          req.file
        );


    res.status(200).json({
      success: true,

      message:
        'Dentist photo updated',

      data: {
        dentist,
      },
    });
  };


const deleteDentistPhoto =
  async (
    req,
    res
  ) => {
    const dentist =
      await mediaService
        .removeDentistPhoto(
          req.params.id
        );


    res.status(200).json({
      success: true,

      message:
        'Dentist photo removed',

      data: {
        dentist,
      },
    });
  };


const uploadServiceImage =
  async (
    req,
    res
  ) => {
    const service =
      await mediaService
        .replaceServiceImage(
          req.params.id,
          req.file
        );


    res.status(200).json({
      success: true,

      message:
        'Service image updated',

      data: {
        service,
      },
    });
  };


const deleteServiceImage =
  async (
    req,
    res
  ) => {
    const service =
      await mediaService
        .removeServiceImage(
          req.params.id
        );


    res.status(200).json({
      success: true,

      message:
        'Service image removed',

      data: {
        service,
      },
    });
  };


const createGalleryImage =
  async (
    req,
    res
  ) => {
    const image =
      await mediaService
        .createGalleryImage({
          file:
            req.file,

          userId:
            req.user.id,

          altText:
            req.body.altText,

          caption:
            req.body.caption,

          sortOrder:
            req.body.sortOrder,

          translations:
            req.body.translations,

          isActive:
            req.body.isActive,
        });


    res.status(201).json({
      success: true,

      data: {
        image,
      },
    });
  };


const getGallery =
  async (
    req,
    res
  ) => {
    const images =
      await mediaService
        .getPublicGallery();


    res.status(200).json({
      success: true,

      data: {
        images,
      },
    });
  };


const getAdminGallery =
  async (
    req,
    res
  ) => {
    const images =
      await mediaService
        .getAdminGallery();


    res.status(200).json({
      success: true,

      data: {
        images,
      },
    });
  };


const updateGalleryImage =
  async (
    req,
    res
  ) => {
    const image =
      await mediaService
        .updateGalleryImage(
          req.params.id,
          req.body
        );


    res.status(200).json({
      success: true,

      data: {
        image,
      },
    });
  };


const deleteGalleryImage =
  async (
    req,
    res
  ) => {
    await mediaService
      .deleteGalleryImage(
        req.params.id
      );


    res.status(200).json({
      success: true,

      message:
        'Gallery image removed',
    });
  };



const restoreGalleryImage =
  async (
    req,
    res
  ) => {
    const image =
      await mediaService
        .restoreGalleryImage(
          req.params.id
        );


    res.status(200).json({
      success: true,

      message:
        'Gallery image restored',

      data: {
        image,
      },
    });
  };


const getCleanupJobs = async (req, res) => {
  const result = await listMediaCleanupJobs(
    req.validatedQuery || req.query
  );
  res.status(200).json({
    success: true,
    data: result,
  });
};


const retryCleanupJob = async (req, res) => {
  const job = await retryMediaCleanupJob(req.params.id);
  if (!job) {
    throw new ApiError(404, 'Retryable media cleanup job not found');
  }
  res.status(202).json({
    success: true,
    message: 'Media cleanup retry scheduled',
    data: { job },
  });
};


export {
  uploadDentistPhoto,
  deleteDentistPhoto,
  uploadServiceImage,
  deleteServiceImage,
  createGalleryImage,
  getGallery,
  getAdminGallery,
  updateGalleryImage,
  deleteGalleryImage,
  restoreGalleryImage,
  getCleanupJobs,
  retryCleanupJob,
};

