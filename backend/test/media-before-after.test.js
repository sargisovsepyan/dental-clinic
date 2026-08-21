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
const {
  setCloudinaryAdapterForTests,
  resetCloudinaryAdapterForTests,
} = await import('../src/utils/cloudinaryImage.js');
const mediaService = await import('../src/modules/media/media.service.js');
const beforeAfterService = await import('../src/modules/beforeAfter/beforeAfter.service.js');
const { default: MediaAsset } = await import('../src/modules/media/media.model.js');
const { default: BeforeAfterCase } = await import('../src/modules/beforeAfter/beforeAfter.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');
const { default: ServiceCategory } = await import('../src/modules/serviceCategories/serviceCategory.model.js');
const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
const { default: MediaCleanupJob } = await import(
  '../src/modules/media/mediaCleanup.model.js'
);
const {
  enqueueMediaCleanup,
  cancelMediaCleanup,
  cleanupMediaAsset,
  processMediaCleanupJob,
  recoverHeldCleanupJobs,
} = await import('../src/modules/media/mediaCleanup.service.js');
const {
  finishHeldCleanup,
  uploadWithRollbackIntent,
} = await import(
  '../src/modules/media/mediaUpload.service.js'
);
const { uploadImageBuffer } = await import('../src/utils/cloudinaryImage.js');
const consentMigration = await import(
  '../src/migrations/20260814_004_before_after_consent.js'
);
const consentCorrectionMigration = await import(
  '../src/migrations/20260814_007_before_after_consent_correction.js'
);

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

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

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
  let failedAllocation = 0;

  setCloudinaryAdapterForTests({
    allocatePublicId(folder) {
      const next = uploadQueue[0];
      return next && !(next instanceof Error)
        ? next.publicId
        : `${folder}/failed-${failedAllocation += 1}`;
    },
    async upload(buffer, options) {
      uploadCalls.push({ options, bytes: buffer.length });
      const next = uploadQueue.shift();
      if (!next) {
        throw new Error('Unexpected Cloudinary upload in test');
      }
      if (next instanceof Error) {
        throw next;
      }
      assert.equal(next.publicId, options.publicId);
      return next;
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
      if (destroyFailure) {
        throw destroyFailure;
      }
    },
  });
};

before(connectTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
  installCloudinaryStub();
});
after(async () => {
  resetCloudinaryAdapterForTests();
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
  consentMethod: 'written',
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

test('concurrent dentist replacements keep one winner and clean the losing upload', async () => {
  await Dentist.updateOne(
    { _id: core.dentist._id },
    { $set: { photo: image('dentist-race-old') } }
  );

  const releaseUploads = deferred();
  const bothUploadsStarted = deferred();
  let uploadCount = 0;
  destroyCalls = [];
  setCloudinaryAdapterForTests({
    allocatePublicId() {
      uploadCount += 1;
      return `dentist-race-new-${uploadCount}`;
    },
    async upload(_buffer, options) {
      const { publicId } = options;
      uploadCalls.push({ publicId });
      if (uploadCalls.length === 2) {
        bothUploadsStarted.resolve();
      }
      await releaseUploads.promise;
      return image(publicId);
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
    },
  });

  const replacements = [
    mediaService.replaceDentistPhoto(core.dentist._id, { buffer: png }),
    mediaService.replaceDentistPhoto(core.dentist._id, { buffer: png }),
  ];
  await bothUploadsStarted.promise;
  releaseUploads.resolve();

  const results = await Promise.allSettled(replacements);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    results.find(({ status }) => status === 'rejected').reason.statusCode,
    409
  );

  const stored = await Dentist.findById(core.dentist._id).lean();
  const losingUpload = ['dentist-race-new-1', 'dentist-race-new-2']
    .find((publicId) => publicId !== stored.photo.publicId);
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['dentist-race-old', losingUpload].sort()
  );
  assert.equal(
    await MediaCleanupJob.countDocuments({
      publicId: stored.photo.publicId,
      status: 'cancelled',
    }),
    1
  );
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

test('concurrent service removal defeats a stale replacement and cleans its upload', async () => {
  await Service.updateOne(
    { _id: core.service._id },
    { $set: { image: image('service-race-old') } }
  );

  const uploadStarted = deferred();
  const releaseUpload = deferred();
  destroyCalls = [];
  setCloudinaryAdapterForTests({
    allocatePublicId() {
      return 'service-race-stale-upload';
    },
    async upload() {
      uploadStarted.resolve();
      await releaseUpload.promise;
      return image('service-race-stale-upload');
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
    },
  });

  const replacement = mediaService.replaceServiceImage(
    core.service._id,
    { buffer: png }
  );
  await uploadStarted.promise;
  await mediaService.removeServiceImage(core.service._id);
  releaseUpload.resolve();

  await assert.rejects(
    replacement,
    (error) => error.statusCode === 409
  );
  assert.equal((await Service.findById(core.service._id).lean()).image, null);
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['service-race-old', 'service-race-stale-upload'].sort()
  );
});

test('image removal commits database state and treats storage deletion failure as observable cleanup debt', async (t) => {
  t.mock.method(console, 'error', () => {});
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { photo: image('dentist-remove') } });
  destroyFailure = new Error('simulated storage outage');
  await assert.doesNotReject(mediaService.removeDentistPhoto(core.dentist._id));
  assert.equal((await Dentist.findById(core.dentist._id).lean()).photo, null);
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), ['dentist-remove']);
  const cleanup = await MediaCleanupJob.findOne({ publicId: 'dentist-remove' }).lean();
  assert.equal(cleanup.status, 'pending');
  assert.equal(cleanup.attempts, 1);
  assert.equal(cleanup.lastErrorCode, 'Error');
  assert.ok(cleanup.nextAttemptAt > cleanup.updatedAt);
});

test('tests fail closed unless an explicit fake Cloudinary adapter is installed', async () => {
  resetCloudinaryAdapterForTests();
  assert.throws(
    () => uploadImageBuffer(png, { folder: 'never-contact-external' }),
    /Tests must inject a fake Cloudinary adapter/
  );
  assert.equal(uploadCalls.length, 0);
  installCloudinaryStub();
});

test('unexpected upload public ID cleans the returned asset without losing the allocated rollback hold', async () => {
  setCloudinaryAdapterForTests({
    allocatePublicId() {
      return 'allocated-rollback-candidate';
    },
    async upload() {
      return image('unexpected-returned-asset');
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
    },
  });

  await assert.rejects(
    uploadWithRollbackIntent({
      buffer: png,
      folder: 'dental-clinic/gallery',
      sourceType: 'gallery',
    }),
    /unexpected public ID/
  );

  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['allocated-rollback-candidate', 'unexpected-returned-asset']
  );
  const cleanupJobs = await MediaCleanupJob.find({
    publicId: {
      $in: ['allocated-rollback-candidate', 'unexpected-returned-asset'],
    },
  }).sort({ publicId: 1 }).lean();
  assert.deepEqual(
    cleanupJobs.map(({ publicId, status }) => ({ publicId, status })),
    [
      { publicId: 'allocated-rollback-candidate', status: 'completed' },
      { publicId: 'unexpected-returned-asset', status: 'completed' },
    ]
  );
});

test('cleanup retries are operator-resettable, bounded, idempotent, and single-claim', async () => {
  destroyFailure = new Error('simulated storage outage');
  const job = await enqueueMediaCleanup({
    publicId: 'retryable-orphan',
    reason: 'reconciliation',
  });
  job.maxAttempts = 1;
  await job.save();

  const [winner, loser] = await Promise.all([
    processMediaCleanupJob(job._id, { force: true, workerId: 'worker-a' }),
    processMediaCleanupJob(job._id, { force: true, workerId: 'worker-b' }),
  ]);
  assert.equal([winner, loser].filter(Boolean).length, 1);
  assert.equal(destroyCalls.length, 1);
  assert.equal((await MediaCleanupJob.findById(job._id)).status, 'failed');

  assert.equal(
    (await request(app).get('/api/v1/media/cleanup-jobs')).status,
    401
  );
  assert.equal(
    (await request(app)
      .get('/api/v1/media/cleanup-jobs')
      .set({ Authorization: `Bearer ${staff.receptionistToken}` })).status,
    403
  );
  const listed = await request(app)
    .get('/api/v1/media/cleanup-jobs?status=failed')
    .set(admin());
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.jobs.length, 1);

  const scheduled = await request(app)
    .post(`/api/v1/media/cleanup-jobs/${job._id}/retry`)
    .set(admin());
  assert.equal(scheduled.status, 202);

  destroyFailure = null;
  const reset = await MediaCleanupJob.findById(job._id);
  assert.equal(reset.status, 'pending');
  assert.equal(reset.attempts, 0);
  const completed = await processMediaCleanupJob(job._id, { force: true });
  assert.equal(completed.status, 'completed');
  assert.equal(destroyCalls.length, 2);
  assert.equal(await processMediaCleanupJob(job._id, { force: true }), null);
});

test('cleanup never deletes referenced media and reconciles abandoned held jobs safely', async () => {
  await Dentist.updateOne(
    { _id: core.dentist._id },
    { $set: { photo: image('still-referenced') } }
  );
  const referenced = await enqueueMediaCleanup({
    publicId: 'still-referenced',
    reason: 'reconciliation',
  });
  const deferred = await processMediaCleanupJob(referenced._id, { force: true });
  assert.equal(deferred.status, 'pending');
  assert.equal(deferred.attempts, 0);
  assert.equal(deferred.lastErrorCode, 'still_referenced');
  assert.equal(destroyCalls.length, 0);

  const heldOrphan = await enqueueMediaCleanup({
    publicId: 'abandoned-held-orphan',
    reason: 'rollback',
    held: true,
  });
  const heldReference = await enqueueMediaCleanup({
    publicId: 'still-referenced',
    reason: 'replacement',
    held: true,
  });
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await MediaCleanupJob.collection.updateMany(
    { _id: { $in: [heldOrphan._id, heldReference._id] } },
    { $set: { status: 'held', updatedAt: old } }
  );

  assert.equal(await recoverHeldCleanupJobs(), 2);
  assert.equal((await MediaCleanupJob.findById(heldOrphan._id)).status, 'pending');
  assert.equal((await MediaCleanupJob.findById(heldReference._id)).status, 'cancelled');
  await processMediaCleanupJob(heldOrphan._id, { force: true });
  assert.deepEqual(destroyCalls.map(({ publicId }) => publicId), [
    'abandoned-held-orphan',
  ]);
});

test('reference cancellation defeats stale held cleanup without blocking a later explicit deletion', async () => {
  const publicId = 'cancel-wins-over-stale-held-cleanup';
  await Dentist.updateOne(
    { _id: core.dentist._id },
    { $set: { photo: image(publicId) } }
  );
  const staleHeldJob = await enqueueMediaCleanup({
    publicId,
    reason: 'rollback',
    sourceType: 'dentist',
    sourceId: core.dentist._id,
    held: true,
  });

  await cancelMediaCleanup(publicId);
  const staleCompletion = await finishHeldCleanup(staleHeldJob);

  assert.equal(staleCompletion.status, 'cancelled');
  assert.equal(
    (await MediaCleanupJob.findById(staleHeldJob._id)).status,
    'cancelled'
  );
  assert.equal(
    await MediaCleanupJob.countDocuments({ publicId, status: 'pending' }),
    0
  );
  assert.equal(
    await processMediaCleanupJob(staleHeldJob._id, { force: true }),
    null
  );
  assert.deepEqual(destroyCalls, []);

  await Dentist.updateOne(
    { _id: core.dentist._id },
    { $set: { photo: null } }
  );
  const explicitDeletion = await cleanupMediaAsset({
    publicId,
    reason: 'removal',
    sourceType: 'dentist',
    sourceId: core.dentist._id,
  });

  assert.equal(explicitDeletion.status, 'completed');
  assert.deepEqual(destroyCalls, [{ publicId }]);
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
    .field('consentMethod', 'written')
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

test('durable rollback intent exists before each before/after upload starts', async () => {
  const plannedIds = ['before-preupload-intent', 'after-preupload-intent'];
  const observed = [];
  setCloudinaryAdapterForTests({
    allocatePublicId() {
      return plannedIds[observed.length];
    },
    async upload(_buffer, options) {
      const job = await MediaCleanupJob.findOne({
        publicId: options.publicId,
      }).lean();
      assert.equal(job.status, 'held');
      observed.push(options.publicId);
      return image(options.publicId);
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
    },
  });

  await beforeAfterService.createCase({
    data: localizedCase('Pre-upload intent'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });

  assert.deepEqual(observed, plannedIds);
  assert.equal(
    await MediaCleanupJob.countDocuments({
      publicId: { $in: plannedIds },
      status: 'cancelled',
    }),
    2
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

test('consent withdrawal and purge defeat an in-flight image replacement', async () => {
  uploadQueue.push(image('before-governance-race'), image('after-governance-race'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Governance replacement race'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });

  const uploadStarted = deferred();
  const releaseUpload = deferred();
  destroyCalls = [];
  setCloudinaryAdapterForTests({
    allocatePublicId() {
      return 'before-governance-late-upload';
    },
    async upload() {
      uploadStarted.resolve();
      await releaseUpload.promise;
      return image('before-governance-late-upload');
    },
    async delete(publicId) {
      destroyCalls.push({ publicId });
    },
  });

  const replacement = beforeAfterService.replaceCaseImage(
    item._id,
    'before',
    { buffer: png }
  );
  await uploadStarted.promise;

  await beforeAfterService.withdrawConsent(item._id, {
    reason: 'Consent withdrawn during replacement',
    userId: staff.admin._id,
  });
  await beforeAfterService.purgeCaseMedia(item._id, {
    reason: 'Governed purge during replacement',
    userId: staff.admin._id,
  });
  releaseUpload.resolve();

  await assert.rejects(
    replacement,
    (error) => error.statusCode === 409
  );
  const final = await BeforeAfterCase.findById(item._id).lean();
  assert.equal(final.consentStatus, 'purged');
  assert.equal(final.beforeImage, null);
  assert.equal(final.afterImage, null);
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    [
      'after-governance-race',
      'before-governance-late-upload',
      'before-governance-race',
    ].sort()
  );
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

test('consent evidence is server-versioned, minimized publicly, and withdrawal blocks restore', async () => {
  uploadQueue.push(image('before-consent'), image('after-consent'));
  const created = await request(app)
    .post('/api/v1/before-after')
    .set(admin())
    .field('title', 'Governed case')
    .field('translations', JSON.stringify({
      hy: { title: 'Կառավարվող դեպք' },
    }))
    .field('consentConfirmed', 'true')
    .field('consentMethod', 'external')
    .field('externalConsentReference', 'CONSENT:2026/opaque-42')
    .attach('beforeImage', png, 'before.png')
    .attach('afterImage', png, 'after.png');
  assert.equal(created.status, 201);
  const caseId = created.body.data.case._id;

  const stored = await BeforeAfterCase.findById(caseId)
    .select('+externalConsentReference')
    .lean();
  assert.equal(stored.consentPolicyVersion, '2026-01');
  assert.equal(stored.consentMethod, 'external');
  assert.equal(stored.consentRecordedBy.toString(), staff.admin._id.toString());
  assert.equal(stored.externalConsentReference, 'CONSENT:2026/opaque-42');
  assert.equal(stored.consentHistory.length, 1);
  assert.equal(stored.publicationStatus, 'published');

  const publicCase = await request(app).get(`/api/v1/before-after/${caseId}`);
  assert.equal(publicCase.status, 200);
  const publicJson = JSON.stringify(publicCase.body);
  assert.equal(publicJson.includes('CONSENT:2026/opaque-42'), false);
  assert.equal(publicJson.includes('consentHistory'), false);
  assert.equal(publicJson.includes('withdrawalReason'), false);

  assert.equal(
    (await request(app)
      .post(`/api/v1/before-after/${caseId}/consent/withdraw`)
      .set({ Authorization: `Bearer ${staff.receptionistToken}` })
      .send({ reason: 'Consent holder requested withdrawal' })).status,
    403
  );
  const withdrawn = await request(app)
    .post(`/api/v1/before-after/${caseId}/consent/withdraw`)
    .set(admin())
    .send({ reason: 'Consent holder requested withdrawal' });
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.data.case.consentStatus, 'withdrawn');
  assert.equal(
    (await request(app).get(`/api/v1/before-after/${caseId}`)).status,
    404
  );

  const restore = await request(app)
    .patch(`/api/v1/before-after/${caseId}/restore`)
    .set(admin());
  assert.equal(restore.status, 409);
  assert.ok(await AuditLog.exists({
    action: 'before_after.restore.rejected',
    entityId: caseId,
  }));
  assert.equal(destroyCalls.length, 0);
});

test('permanent purge requires withdrawal and confirmation, leaves a tombstone, and uses cleanup jobs', async () => {
  uploadQueue.push(image('before-purge'), image('after-purge'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Purge case'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });

  const beforeWithdrawal = await request(app)
    .post(`/api/v1/before-after/${item._id}/purge`)
    .set(admin())
    .send({
      confirmation: 'PERMANENTLY PURGE BEFORE AFTER MEDIA',
      reason: 'Retention policy request',
    });
  assert.equal(beforeWithdrawal.status, 409);

  await beforeAfterService.withdrawConsent(item._id, {
    reason: 'Consent holder requested withdrawal',
    userId: staff.admin._id,
  });
  const wrongConfirmation = await request(app)
    .post(`/api/v1/before-after/${item._id}/purge`)
    .set(admin())
    .send({ confirmation: 'PURGE', reason: 'Retention policy request' });
  assert.equal(wrongConfirmation.status, 400);

  const purged = await request(app)
    .post(`/api/v1/before-after/${item._id}/purge`)
    .set(admin())
    .send({
      confirmation: 'PERMANENTLY PURGE BEFORE AFTER MEDIA',
      reason: 'Retention policy request',
    });
  assert.equal(purged.status, 202);
  const tombstone = await BeforeAfterCase.findById(item._id)
    .select('+externalConsentReference')
    .lean();
  assert.equal(tombstone.beforeImage, null);
  assert.equal(tombstone.afterImage, null);
  assert.equal(tombstone.publicationStatus, 'purged');
  assert.equal(tombstone.consentStatus, 'purged');
  assert.ok(tombstone.purgedAt);
  assert.equal(tombstone.externalConsentReference, '');
  assert.equal(tombstone.consentHistory.at(-1).action, 'purged');
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['after-purge', 'before-purge']
  );
  assert.equal(
    await MediaCleanupJob.countDocuments({
      sourceId: item._id.toString(),
      reason: 'consent_purge',
      status: 'completed',
    }),
    2
  );
  assert.equal(
    (await request(app)
      .patch(`/api/v1/before-after/${item._id}/restore`)
      .set(admin())).status,
    409
  );
});

test('failed purge deletion never republishes and remains durable cleanup debt', async () => {
  uploadQueue.push(image('before-purge-debt'), image('after-purge-debt'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Purge debt'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });
  await beforeAfterService.withdrawConsent(item._id, {
    reason: 'Consent holder requested withdrawal',
    userId: staff.admin._id,
  });
  destroyFailure = new Error('temporary Cloudinary failure');
  const purged = await beforeAfterService.purgeCaseMedia(item._id, {
    reason: 'Retention policy request',
    userId: staff.admin._id,
  });
  assert.equal(purged.publicationStatus, 'purged');
  assert.equal((await beforeAfterService.getPublicCases({})).cases.length, 0);
  assert.equal(
    await MediaCleanupJob.countDocuments({
      sourceId: item._id.toString(),
      reason: 'consent_purge',
      status: 'pending',
    }),
    2
  );
});

test('concurrent restore versus withdrawal always ends hidden with withdrawn consent', async () => {
  uploadQueue.push(image('before-withdraw-race'), image('after-withdraw-race'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Withdrawal race'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });
  await beforeAfterService.disableCase(item._id);

  await Promise.allSettled([
    beforeAfterService.restoreCase(item._id),
    beforeAfterService.withdrawConsent(item._id, {
      reason: 'Concurrent consent withdrawal',
      userId: staff.admin._id,
    }),
  ]);

  const final = await BeforeAfterCase.findById(item._id).lean();
  assert.equal(final.consentStatus, 'withdrawn');
  assert.equal(final.publicationStatus, 'withdrawn');
  assert.equal(final.isActive, false);
  assert.equal((await beforeAfterService.getPublicCases({})).cases.length, 0);
});

test('concurrent permanent purge is compare-and-set and deletes each asset once', async () => {
  uploadQueue.push(image('before-purge-race'), image('after-purge-race'));
  const item = await beforeAfterService.createCase({
    data: localizedCase('Purge race'),
    beforeFile: { buffer: png },
    afterFile: { buffer: png },
    userId: staff.admin._id,
  });
  await beforeAfterService.withdrawConsent(item._id, {
    reason: 'Consent holder requested withdrawal',
    userId: staff.admin._id,
  });

  const results = await Promise.allSettled([
    beforeAfterService.purgeCaseMedia(item._id, {
      reason: 'Concurrent purge request A',
      userId: staff.admin._id,
    }),
    beforeAfterService.purgeCaseMedia(item._id, {
      reason: 'Concurrent purge request B',
      userId: staff.admin._id,
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.deepEqual(
    destroyCalls.map(({ publicId }) => publicId).sort(),
    ['after-purge-race', 'before-purge-race']
  );
  const final = await BeforeAfterCase.findById(item._id).lean();
  assert.equal(final.publicationStatus, 'purged');
  assert.equal(final.consentHistory.filter(({ action }) => action === 'purged').length, 1);
});

test('consent migration quarantines unknown legacy history without inventing evidence', async () => {
  const legacyId = new mongoose.Types.ObjectId();
  const evidenceFreeId = new mongoose.Types.ObjectId();
  const historicalTime = new Date('2025-01-02T00:00:00Z');
  await BeforeAfterCase.collection.insertMany([{
    _id: legacyId,
    title: 'Legacy governed case',
    translations: { hy: { title: 'Ժառանգված դեպք' } },
    beforeImage: image('legacy-before'),
    afterImage: image('legacy-after'),
    consentConfirmedAt: historicalTime,
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    createdBy: staff.admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, {
    _id: evidenceFreeId,
    title: 'Legacy case without evidence',
    translations: { hy: { title: 'Ժառանգական դեպք' } },
    beforeImage: image('legacy-no-evidence-before'),
    afterImage: image('legacy-no-evidence-after'),
    isActive: true,
    isFeatured: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }]);

  const dryRun = await consentMigration.run({ dryRun: true });
  assert.equal(dryRun.casesScanned, 2);
  assert.equal(
    (await BeforeAfterCase.collection.findOne({ _id: legacyId }))
      .consentPolicyVersion,
    undefined
  );
  const applied = await consentMigration.run({ dryRun: false });
  assert.equal(applied.migrated, 2);

  const migrated = await BeforeAfterCase.collection.findOne({ _id: legacyId });
  assert.equal(migrated.consentPolicyVersion, 'legacy-history-unverified');
  assert.equal(migrated.consentMethod, 'legacy_unverified');
  assert.equal(migrated.consentStatus, 'unverified');
  assert.equal(migrated.publicationStatus, 'draft');
  assert.equal(migrated.isActive, false);
  assert.equal(migrated.isFeatured, false);
  assert.equal(migrated.consentRecordedBy, undefined);
  assert.equal(migrated.consentConfirmedAt.toISOString(), historicalTime.toISOString());
  assert.deepEqual(migrated.consentHistory, []);

  const evidenceFree = await BeforeAfterCase.collection.findOne({
    _id: evidenceFreeId,
  });
  assert.equal(evidenceFree.consentConfirmedAt, undefined);
  assert.equal(evidenceFree.consentRecordedBy, undefined);
  assert.equal(evidenceFree.consentStatus, 'unverified');
  await assert.rejects(
    beforeAfterService.getPublicCaseById(legacyId),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    beforeAfterService.restoreCase(legacyId),
    (error) => error.statusCode === 409
  );
  await assert.rejects(
    beforeAfterService.replaceCaseImage(legacyId, 'before', { buffer: png }),
    (error) => error.statusCode === 409
  );
  assert.equal(uploadCalls.length, 0);
  assert.equal((await consentMigration.run({ dryRun: false })).migrated, 0);
});

test('corrective consent migration quarantines fabricated and partial rows idempotently', async () => {
  const legacyId = new mongoose.Types.ObjectId();
  const partialId = new mongoose.Types.ObjectId();
  await BeforeAfterCase.collection.insertMany([{
    _id: legacyId,
    title: 'Fabricated legacy case',
    translations: { hy: { title: 'Կեղծված ժառանգական դեպք' } },
    beforeImage: image('fabricated-before'),
    afterImage: image('fabricated-after'),
    publicationStatus: 'published',
    consentStatus: 'active',
    consentPolicyVersion: '2026-01',
    consentMethod: 'legacy_migrated',
    consentConfirmedAt: new Date('2025-01-01T00:00:00Z'),
    consentRecordedBy: staff.admin._id,
    consentHistory: [{
      action: 'confirmed',
      policyVersion: '2026-01',
      method: 'legacy_migrated',
      actor: staff.admin._id,
      occurredAt: new Date('2025-01-01T00:00:00Z'),
      reason: '',
    }],
    isActive: true,
    isFeatured: true,
    createdBy: staff.admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, {
    _id: partialId,
    title: 'Partially migrated legacy case',
    translations: { hy: { title: 'Մասնակի տեղափոխված դեպք' } },
    beforeImage: image('partial-before'),
    afterImage: image('partial-after'),
    publicationStatus: 'published',
    consentMethod: 'legacy_migrated',
    isActive: true,
    createdBy: staff.admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }]);

  await assert.rejects(
    beforeAfterService.getPublicCaseById(legacyId),
    (error) => error.statusCode === 404
  );
  const dryRun = await consentCorrectionMigration.run({ dryRun: true });
  assert.equal(dryRun.casesScanned, 2);
  const applied = await consentCorrectionMigration.run({ dryRun: false });
  assert.equal(applied.corrected, 2);

  for (const id of [legacyId, partialId]) {
    const corrected = await BeforeAfterCase.collection.findOne({ _id: id });
    assert.equal(corrected.publicationStatus, 'draft');
    assert.equal(corrected.consentStatus, 'unverified');
    assert.equal(corrected.consentPolicyVersion, 'legacy-history-unverified');
    assert.equal(corrected.consentMethod, 'legacy_unverified');
    assert.equal(corrected.isActive, false);
    assert.equal(corrected.isFeatured, false);
    assert.equal(corrected.consentRecordedBy, undefined);
    assert.deepEqual(corrected.consentHistory, []);
  }
  assert.equal(
    (await consentCorrectionMigration.run({ dryRun: false })).corrected,
    0
  );
});

test('corrective consent migration does not overwrite a concurrent explicit historical attestation', async () => {
  const legacyId = new mongoose.Types.ObjectId();
  const occurredAt = new Date('2024-06-01T00:00:00Z');
  await BeforeAfterCase.collection.insertOne({
    _id: legacyId,
    title: 'Concurrently attested legacy case',
    translations: { hy: { title: 'Հաստատված պատմական դեպք' } },
    beforeImage: image('attested-before'),
    afterImage: image('attested-after'),
    publicationStatus: 'published',
    consentStatus: 'active',
    consentPolicyVersion: '2026-01',
    consentMethod: 'legacy_migrated',
    consentConfirmedAt: occurredAt,
    consentRecordedBy: staff.admin._id,
    consentHistory: [{
      action: 'confirmed',
      policyVersion: '2026-01',
      method: 'legacy_migrated',
      actor: staff.admin._id,
      occurredAt,
      reason: '',
    }],
    isActive: true,
    isFeatured: false,
    createdBy: staff.admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const collection = BeforeAfterCase.collection;
  const originalUpdateOne = collection.updateOne;
  let intercepted = false;
  collection.updateOne = async function (filter, update, options) {
    if (!intercepted && String(filter?._id) === String(legacyId)) {
      intercepted = true;
      await originalUpdateOne.call(
        this,
        { _id: legacyId },
        {
          $set: {
            publicationStatus: 'draft',
            consentStatus: 'active',
            consentPolicyVersion: 'historical-policy-2024-02',
            consentMethod: 'written',
            consentConfirmedAt: occurredAt,
            consentRecordedBy: staff.admin._id,
            consentHistory: [{
              action: 'confirmed',
              policyVersion: 'historical-policy-2024-02',
              method: 'written',
              actor: staff.admin._id,
              occurredAt,
              reason: 'Operator-attested historical record',
            }],
            isActive: false,
            isFeatured: false,
          },
        }
      );
    }
    return originalUpdateOne.call(this, filter, update, options);
  };

  try {
    const result = await consentCorrectionMigration.run({ dryRun: false });
    assert.equal(result.corrected, 0);
  }
  finally {
    collection.updateOne = originalUpdateOne;
  }

  const attested = await BeforeAfterCase.collection.findOne({ _id: legacyId });
  assert.equal(attested.consentMethod, 'written');
  assert.equal(attested.consentPolicyVersion, 'historical-policy-2024-02');
  assert.equal(
    (await consentCorrectionMigration.run({ dryRun: false })).corrected,
    0
  );
  await beforeAfterService.restoreCase(legacyId);
  assert.equal((await beforeAfterService.getPublicCaseById(legacyId))._id.toString(), String(legacyId));
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

test('before/after relation validation rejects a service under an inactive category before upload', async () => {
  await ServiceCategory.collection.updateOne(
    { _id: core.category._id },
    { $set: { isActive: false } }
  );

  await assert.rejects(
    beforeAfterService.createCase({
      data: {
        ...localizedCase('Inactive category relation'),
        serviceId: core.service._id,
      },
      beforeFile: { buffer: png },
      afterFile: { buffer: png },
      userId: staff.admin._id,
    }),
    (error) => error.statusCode === 409,
  );
  assert.equal(uploadCalls.length, 0);
});
