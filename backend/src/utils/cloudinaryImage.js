import {
  cloudinary,
  assertCloudinaryConfigured,
} from '../config/cloudinary.js';


const uploadImageBuffer = (
  buffer,
  {
    folder,
    tags = [],
  }
) => {
  assertCloudinaryConfigured();


  return new Promise(
    (
      resolve,
      reject
    ) => {
      const stream =
        cloudinary.uploader
          .upload_stream(
            {
              resource_type:
                'image',

              folder,

              tags,

              use_filename:
                false,

              unique_filename:
                true,

              overwrite:
                false,
            },

            (
              error,
              result
            ) => {
              if (error) {
                return reject(
                  error
                );
              }

              resolve({
                publicId:
                  result.public_id,

                secureUrl:
                  result.secure_url,

                width:
                  result.width,

                height:
                  result.height,

                format:
                  result.format,

                bytes:
                  result.bytes,
              });
            }
          );


      stream.end(
        buffer
      );
    }
  );
};


const deleteCloudinaryImage =
  async (
    publicId
  ) => {
    if (!publicId) {
      return;
    }


    assertCloudinaryConfigured();


    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type:
          'image',

        invalidate:
          true,
      }
    );
  };


export {
  uploadImageBuffer,
  deleteCloudinaryImage,
};
