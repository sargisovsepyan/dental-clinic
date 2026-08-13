import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret-not-used';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
const { seedCore, seedStaff } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { cloudinary } = await import('../src/config/cloudinary.js');
const mediaService = await import('../src/modules/media/media.service.js');
const beforeAfterService = await import('../src/modules/beforeAfter/beforeAfter.service.js');
const { default: MediaAsset } = await import('../src/modules/media/media.model.js');
const { default: BeforeAfterCase } = await import('../src/modules/beforeAfter/beforeAfter.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const image = (publicId, overrides = {}) => ({
  publicId,
  secureUrl: `https://images.example.test/${publicId}`,
  width: 640,
  height: 480,
  format: 'png',
  bytes: 1024,
  ...overrides,
});

const cloudinaryResult = (asset) => ({
  public_id: asset.publicId,
  secure_url: asset.secureUrl,
  width: asset.width,
  height: asset.height,
  format: asset.format,
  bytes: asset.bytes,
});

const originalUploadStream = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;

let uploadQueue;
let uploadCalls;
let destroyCalls;
let destroyFailure;
let core;
let staff;

const installCloudinaryStub = () => {
  uploadQueue = [];
  uploadCalls = [];
  destroyCalls = [];
  destroyFailure = null;

  cloudinary.uploader.upload_stream = (options, callback) => ({
    end(buffer) {
      uploadCalls.push({ options, bytes: buffer.length });
      const next = uploadQueue.shift();
      if (!next) {
        callback(new Error('Unexpected Cloudinary upload in test'));
      } else if (next instanceof Error) {
        callback(next);
      } else {
        callback(null, cloudinaryResult(next));
      }
    },
  });

  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyCalls.push({ publicId, options });
    if (destroyFailure) {
      throw destroyFailure;
    }
    return { result: 'ok' };
  };
};

before(connectTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
  installCloudinaryStub();
});
after(async () => {
  cloudinary.uploader.upload_stream = originalUploadStream;
  cloudinary.uploader.destroy = originalDestroy;
  await disconnectTestDatabase();
});

const admin = () => ({ Authorization: `Bearer ${staff.adminToken}` });

const localizedCase = (title) => ({
  title,
  translations: {
    hy: { title: `Հայերեն ${title}` },
    en: { title },
  },
  consentConfirmed: true,
});

test('media upload requires admin and rejects fake, invalid, unsupported, and oversized files', async () => {
  assert.equal(
    (await request(app).post('/api/v1/media/gallery').attach('image', png, 'image.png')).status,
    401,
  );
  assert.equal(
    (await request(app).post('/api/v1/media/gallery').set({ Authorization: `Bearer ${staff.receptionistToken}` }).attach('image', png, 'image.png')).status,
    403,
  );
  assert.equal(
    (await request(app).post('/api/v1/media/gallery').set(admin()).attach('image', Buffer.from('plain text'), 'fake.png')).status,
    415,
  );
  assert.equal(
    (await request(app).post('/api/v1/media/gallery').set(admin()).attach('image', Buffer.from([0, 1, 2, 3]), 'invalid.bin')).status,
    415,
  );
  assert.equal(
    (await request(app).post('/api/v1/media/gallery').set(admin()).attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')).status,
    413,
  );
  assert.equal(uploadCalls.length, 0);
});

test('media upload rejects MIME and extension values that disagree with magic bytes', async () => {
  const wrongMime = await request(app)
    .post('/api/v1/media/gallery')
    .set(admin())
    .attach('image', png, {
      filename: 'image.png',
      contentType: 'image/jpeg',
    });

  assert.equal(wrongMime.status, 415);

  const wrongExtension = await request(app)
    .post('/api/v1/media/gallery')
    .set(admin())
    .attach('image', png, {
      filename: 'image.jpg',
      contentType: 'image/png',
    });

  assert.equal(wrongExtension.status, 415);
  assert.equal(uploadCalls.length, 0);
});

test('multipart localized media rejects unsupported locale keys before Cloudinary', async () => {
  const response = await request(app)
    .post('/api/v1/media/gallery')
    .set(admin())
    .field('translations', JSON.stringify({
      hy: { altText: 'Վավեր' },
      fr: { altText: 'Interdit' },
    }))
    .attach('image', png, 'image.png');

  assert.equal(response.status, 400);
  assert.equal(uploadCalls.length, 0);
});

test('valid gallery upload uses the expected folder and public/admin listings minimize data', async () => {
  uploadQueue.push(image('gallery-one'));
  const created = await request(app)
    .post('/api/v1/media/gallery')
    .set(admin())
    .field('altText', 'Clinic reception')
    .field('caption', 'Welcome area')
    .field('translations', JSON.stringify({
      hy: {
        altText: 'Կլինիկայի ընդունարան',
        caption: 'Սպասասրահ',
      },
      en: {
        altText: 'Clinic reception',
        caption: 'Welcome area',
      },
    }))
    .field('sortOrder', '2')
    .attach('image', png, 'reception.png');
  assert.equal(created.status, 201);
  assert.equal(uploadCalls[0].options.folder, 'dental-clinic/clinic-gallery');
  assert.deepEqual(uploadCalls[0].options.tags, ['clinic-gallery']);

  const publicList = await request(app).get('/api/v1/media/gallery');
  assert.equal(publicList.body.data.images[0].createdBy, undefined);
  assert.equal(publicList.body.data.images[0].altText, 'Clinic reception');
  assert.equal(publicList.body.data.images[0].translations.hy.altText, 'Կլինիկայի ընդունարան');

  const localizedUpdate = await request(app)
    .patch(`/api/v1/media/gallery/${created.body.data.image._id}`)
    .set(admin())
    .send({
      translations: {
        ru: { caption: 'Зона ожидания' },
      },
    });
  assert.equal(localizedUpdate.status, 200);
  assert.equal(localizedUpdate.body.data.image.translations.hy.altText, 'Կլինիկայի ընդունարան');
  assert.equal(localizedUpdate.body.data.image.translations.ru.caption, 'Зона ожидания');
  const adminList = await request(app).get('/api/v1/media/gallery/admin').set(admin());
  assert.equal(adminList.body.data.images[0].createdBy.email, 'admin@example.com');
});

test('gallery database failure cleans up the newly uploaded asset', async () => {
  uploadQueue.push(image('gallery-rollback'));
  await assert.rejects(
    mediaService.createGalleryImage({
      file: { buffer: png },
      userId: null,
      translations: {
        hy: { altText: 'Պատկեր' },
      },
    }),
    (error) => error.name === 'ValidationError',
  );
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['gallery-rollback']);
  assert.equal(await MediaAsset.countDocuments(), 0);
});

test('dentist image replacement deletes old only after success and rolls back invalid new data', async () => {
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { photo: image('dentist-old') } });
  uploadQueue.push(image('dentist-new'));
  const success = await request(app)
    .put(`/api/v1/media/dentists/${core.dentist._id}/photo`)
    .set(admin())
    .attach('image', png, 'dentist.png');
  assert.equal(success.status, 200);
  assert.equal(uploadCalls[0].options.folder, 'dental-clinic/dentists');
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['dentist-old']);
  assert.equal((await Dentist.findById(core.dentist._id).lean()).photo.publicId, 'dentist-new');

  uploadQueue.push(image('dentist-invalid', { width: 0 }));
  await assert.rejects(
    mediaService.replaceDentistPhoto(core.dentist._id, { buffer: png }),
    (error) => error.name === 'ValidationError',
  );
  assert.equal((await Dentist.findById(core.dentist._id).lean()).photo.publicId, 'dentist-new');
  assert.equal(destroyCalls.at(-1).publicId, 'dentist-invalid');
});

test('service image replacement and removal use rollback-safe ordering', async () => {
  await Service.updateOne({ _id: core.service._id }, { $set: { image: image('service-old') } });
  uploadQueue.push(image('service-new'));
  await mediaService.replaceServiceImage(core.service._id, { buffer: png });
  assert.equal(uploadCalls[0].options.folder, 'dental-clinic/services');
  assert.equal((await Service.findById(core.service._id).lean()).image.publicId, 'service-new');
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['service-old']);

  await mediaService.removeServiceImage(core.service._id);
  assert.equal((await Service.findById(core.service._id).lean()).image, null);
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['service-old', 'service-new']);
});

test('image removal commits database state and treats storage deletion failure as observable cleanup debt', async (t) => {
  t.mock.method(console, 'error', () => {});
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { photo: image('dentist-remove') } });
  destroyFailure = new Error('simulated storage outage');
  await assert.doesNotReject(mediaService.removeDentistPhoto(core.dentist._id));
  assert.equal((await Dentist.findById(core.dentist._id).lean()).photo, null);
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['dentist-remove']);
});

test('gallery soft delete hides publicly without Cloudinary deletion and restore reverses it', async () => {
  uploadQueue.push(image('gallery-soft-delete'));
  const asset = await mediaService.createGalleryImage({
    file: { buffer: png },
    userId: staff.admin._id,
    altText: 'Restorable',
    translations: {
      hy: { altText: 'Վերականգնվող' },
    },
  });
  await mediaService.deleteGalleryImage(asset._id);
  assert.equal((await mediaService.getPublicGallery()).length, 0);
  assert.equal(destroyCalls.length, 0);
  await mediaService.restoreGalleryImage(asset._id);
  assert.equal((await mediaService.getPublicGallery()).length, 1);
  assert.equal(destroyCalls.length, 0);
});

test('before/after HTTP creation requires both files and explicit consent', async () => {
  const missingAfter = await request(app)
    .post('/api/v1/before-after')
    .set(admin())
    .field('title', 'Case')
    .field('translations', JSON.stringify({
      hy: { title: 'Դեպք' },
    }))
    .field('consentConfirmed', 'true')
    .attach('beforeImage', png, 'before.png');
  assert.equal(missingAfter.status, 400);

  const missingConsent = await request(app)
    .post('/api/v1/before-after')
    .set(admin())
    .field('title', 'Case')
    .field('translations', JSON.stringify({
      hy: { title: 'Դեպք' },
    }))
    .attach('beforeImage', png, 'before.png')
    .attach('afterImage', png, 'after.png');
  assert.equal(missingConsent.status, 400);
  assert.equal(uploadCalls.length, 0);
});

test('before/after creation uploads both folders and rolls back when the second upload fails', async () => {
  uploadQueue.push(image('before-success'), image('after-success'));
  const created = await beforeAfterService.createCase({
    data: localizedCase('Successful case'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });
  assert.ok(created._id);
  assert.equal(created.translations.hy.title, 'Հայերեն Successful case');
  assert.deepEqual(
    uploadCalls.map(({ options }) => options.folder),
    ['dental-clinic/before-after/before', 'dental-clinic/before-after/after'],
  );

  uploadQueue.push(image('before-orphan-candidate'), new Error('second upload failed'));
  await assert.rejects(
    beforeAfterService.createCase({
      data: localizedCase('Failed case'),
      beforeFile: { buffer: png },
      afterFile: { buffer: png },
      userId: staff.admin._id,
    }),
    /second upload failed/,
  );
  assert.equal(destroyCalls.at(-1).publicId, 'before-orphan-candidate');
  assert.equal(await BeforeAfterCase.countDocuments(), 1);
});

test('before/after database creation failure deletes both uploaded assets', async () => {
  uploadQueue.push(image('before-db-fail'), image('after-db-fail'));
  await assert.rejects(
    beforeAfterService.createCase({
      data: localizedCase('Database failure'),
      beforeFile: { buffer: png },
      afterFile: { buffer: png },
      userId: null,
    }),
    (error) => error.name === 'ValidationError',
  );
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['after-db-fail', 'before-db-fail'],
  );
});

test('before/after replacement preserves old image on failure and deletes old after success', async () => {
  uploadQueue.push(image('before-old'), image('after-old'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Replace case'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });

  uploadQueue.push(image('before-invalid', { height: 0 }));
  await assert.rejects(
    beforeAfterService.replaceCaseImage(item._id, 'before', { buffer: png }),
    (error) => error.name === 'ValidationError',
  );
  assert.equal((await BeforeAfterCase.findById(item._id).lean()).beforeImage.publicId, 'before-old');
  assert.equal(destroyCalls.at(-1).publicId, 'before-invalid');

  uploadQueue.push(image('before-new'));
  await beforeAfterService.replaceCaseImage(item._id, 'before', { buffer: png });
  assert.equal((await BeforeAfterCase.findById(item._id).lean()).beforeImage.publicId, 'before-new');
  assert.equal(destroyCalls.at(-1).publicId, 'before-old');
});

test('before/after soft delete retains both assets and restore returns public visibility', async () => {
  uploadQueue.push(image('before-soft'), image('after-soft'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Soft delete case'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });
  await beforeAfterService.disableCase(item._id);
  assert.equal((await beforeAfterService.getPublicCases({ page: 1, limit: 10 })).cases.length, 0);
  assert.equal(destroyCalls.length, 0);
  await beforeAfterService.restoreCase(item._id);
  assert.equal((await beforeAfterService.getPublicCases({ page: 1, limit: 10 })).cases.length, 1);
  assert.equal(destroyCalls.length, 0);
});

test('invalid before/after relations fail before any upload', async () => {
  await assert.rejects(
    beforeAfterService.createCase({
      data: {
        ...localizedCase('Bad relation'),
        serviceId: new mongoose.Types.ObjectId(),
      },
      beforeFile: { buffer: png },
      afterFile: { buffer: png },
      userId: staff.admin._id,
    }),
    (error) => error.statusCode === 404,
  );
  assert.equal(uploadCalls.length, 0);
});
