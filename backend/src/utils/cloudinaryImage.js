import {
  cloudinary,
  assertCloudinaryConfigured,
} from '../config/cloudinary.js';
import env from '../config/env.js';
import crypto from 'node:crypto';


let testAdapter = null;


const setCloudinaryAdapterForTests = (adapter) => {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Cloudinary adapter injection is only allowed in tests');
  }
  if (
    typeof adapter?.upload !== 'function' ||
    typeof adapter?.delete !== 'function' ||
    typeof adapter?.allocatePublicId !== 'function'
  ) {
    throw new TypeError(
      'Cloudinary test adapter must implement allocatePublicId, upload, and delete'
    );
  }
  testAdapter = adapter;
};


const resetCloudinaryAdapterForTests = () => {
  testAdapter = null;
};


const liveAdapter = {
  allocatePublicId: (folder) => `${folder}/${crypto.randomUUID()}`,
  upload: (buffer, { folder, publicId, tags = [] }) => {
    assertCloudinaryConfigured();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          ...(publicId ? { public_id: publicId } : { folder }),
          tags,
          use_filename: false,
          unique_filename: true,
          overwrite: false,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
      stream.end(buffer);
    });
  },
  delete: async (publicId) => {
    assertCloudinaryConfigured();
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });
  },
};


const getAdapter = () => {
  if (testAdapter) {
    return testAdapter;
  }
  if (env.NODE_ENV === 'test') {
    throw new Error(
      'Tests must inject a fake Cloudinary adapter; external media calls are disabled'
    );
  }
  return liveAdapter;
};


const allocateCloudinaryPublicId = (folder) =>
  getAdapter().allocatePublicId(folder);


const uploadImageBuffer = (buffer, options) =>
  getAdapter().upload(buffer, options);


const deleteCloudinaryImage = async (publicId) => {
  if (!publicId) {
    return;
  }
  await getAdapter().delete(publicId);
};


export {
  allocateCloudinaryPublicId,
  uploadImageBuffer,
  deleteCloudinaryImage,
  setCloudinaryAdapterForTests,
  resetCloudinaryAdapterForTests,
};
