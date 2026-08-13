import Dentist from '../dentists/dentist.model.js';

import Service from '../services/service.model.js';

import MediaAsset from './media.model.js';

import ApiError from '../../utils/ApiError.js';

import {
  uploadImageBuffer,
  deleteCloudinaryImage,
} from '../../utils/cloudinaryImage.js';


const replaceDentistPhoto =
  async (
    dentistId,
    file
  ) => {
    const dentist =
      await Dentist.findById(
        dentistId
      );


    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }


    const previous =
      dentist.photo;


    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/dentists',

          tags: [
            'dentist',
          ],
        }
      );


    try {
      dentist.photo =
        uploaded;

      await dentist.save();
    }
    catch (error) {
      await deleteCloudinaryImage(
        uploaded.publicId
      ).catch(() => {});

      throw error;
    }


    if (
      previous?.publicId
    ) {
      await deleteCloudinaryImage(
        previous.publicId
      ).catch(
        (error) => {
          console.error(
            'OLD_DENTIST_IMAGE_DELETE_FAILED',
            error.message
          );
        }
      );
    }


    return dentist;
  };


const removeDentistPhoto =
  async (
    dentistId
  ) => {
    const dentist =
      await Dentist.findById(
        dentistId
      );


    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }


    const previous =
      dentist.photo;


    dentist.photo =
      null;


    await dentist.save();


    if (
      previous?.publicId
    ) {
      await deleteCloudinaryImage(
        previous.publicId
      ).catch(
        (error) => {
          console.error(
            'OLD_DENTIST_IMAGE_DELETE_FAILED',
            error.message
          );
        }
      );
    }


    return dentist;
  };


const replaceServiceImage =
  async (
    serviceId,
    file
  ) => {
    const service =
      await Service.findById(
        serviceId
      );


    if (!service) {
      throw new ApiError(
        404,
        'Service not found'
      );
    }


    const previous =
      service.image;


    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/services',

          tags: [
            'service',
          ],
        }
      );


    try {
      service.image =
        uploaded;

      await service.save();
    }
    catch (error) {
      await deleteCloudinaryImage(
        uploaded.publicId
      ).catch(() => {});

      throw error;
    }


    if (
      previous?.publicId
    ) {
      await deleteCloudinaryImage(
        previous.publicId
      ).catch(
        (error) => {
          console.error(
            'OLD_SERVICE_IMAGE_DELETE_FAILED',
            error.message
          );
        }
      );
    }


    return service;
  };


const removeServiceImage =
  async (
    serviceId
  ) => {
    const service =
      await Service.findById(
        serviceId
      );


    if (!service) {
      throw new ApiError(
        404,
        'Service not found'
      );
    }


    const previous =
      service.image;


    service.image =
      null;


    await service.save();


    if (
      previous?.publicId
    ) {
      await deleteCloudinaryImage(
        previous.publicId
      ).catch(
        (error) => {
          console.error(
            'OLD_SERVICE_IMAGE_DELETE_FAILED',
            error.message
          );
        }
      );
    }


    return service;
  };


const createGalleryImage =
  async ({
    file,
    userId,
    altText = '',
    caption = '',
    sortOrder = 0,
  }) => {
    const uploaded =
      await uploadImageBuffer(
        file.buffer,
        {
          folder:
            'dental-clinic/clinic-gallery',

          tags: [
            'clinic-gallery',
          ],
        }
      );


    try {
      return await MediaAsset.create({
        type:
          'clinic_gallery',

        image:
          uploaded,

        altText,

        caption,

        sortOrder,

        createdBy:
          userId,
      });
    }
    catch (error) {
      await deleteCloudinaryImage(
        uploaded.publicId
      ).catch(() => {});

      throw error;
    }
  };


const getPublicGallery =
  async () => {
    return MediaAsset.find({
      type:
        'clinic_gallery',

      isActive:
        true,
    })
      .sort({
        sortOrder: 1,
        createdAt: -1,
      })
      .select(
        '-createdBy'
      )
      .lean();
  };


const getAdminGallery =
  async () => {
    return MediaAsset.find({
      type:
        'clinic_gallery',
    })
      .populate(
        'createdBy',
        'name email'
      )
      .sort({
        sortOrder: 1,
        createdAt: -1,
      })
      .lean();
  };


const updateGalleryImage =
  async (
    id,
    data
  ) => {
    const asset =
      await MediaAsset
        .findByIdAndUpdate(
          id,
          data,
          {
            returnDocument:
              'after',
            runValidators: true,
          }
        );


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }


    return asset;
  };


const deleteGalleryImage =
  async (
    id
  ) => {
    const asset =
      await MediaAsset
        .findById(id);


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }


    asset.isActive =
      false;

    await asset.save();


    return asset;
  };


const restoreGalleryImage =
  async (
    id
  ) => {
    const asset =
      await MediaAsset
        .findById(id);


    if (!asset) {
      throw new ApiError(
        404,
        'Gallery image not found'
      );
    }


    asset.isActive =
      true;

    await asset.save();


    return asset;
  };


export {
  replaceDentistPhoto,
  removeDentistPhoto,
  replaceServiceImage,
  removeServiceImage,
  createGalleryImage,
  getPublicGallery,
  getAdminGallery,
  updateGalleryImage,
  deleteGalleryImage,
  restoreGalleryImage,
};

