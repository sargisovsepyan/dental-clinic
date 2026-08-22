import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { DateTime } from 'luxon';

import env from '../config/env.js';
import CRITICAL_INDEXES from './criticalIndexes.js';
import { migrationManifest } from '../migrations/runner.js';
import User from '../modules/users/user.model.js';
import Migration from '../modules/migrations/migration.model.js';
import ServiceCategory from '../modules/serviceCategories/serviceCategory.model.js';
import Service from '../modules/services/service.model.js';
import Dentist from '../modules/dentists/dentist.model.js';
import Clinic from '../modules/clinic/clinic.model.js';
import MediaAsset from '../modules/media/media.model.js';
import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';
import PhoneDailyQuota from '../modules/appointments/phoneDailyQuota.model.js';
import Appointment from '../modules/appointments/appointment.model.js';
import BookingIdempotency from '../modules/appointments/bookingIdempotency.model.js';
import NotificationJob from '../modules/notifications/notificationJob.model.js';
import { isSafeSingleMailbox } from '../mail/mail.validation.js';
import {
  isExactDate,
  isObjectId,
  isSupportedNotificationLocale,
  isValidNotificationJobShape,
} from '../modules/notifications/notificationIntegrity.js';
import DentistScheduleException from '../modules/dentists/dentistScheduleException.model.js';
import {
  exactPhoneQuotaKeyVersionExpression,
  getPhoneQuotaIdentityStatus,
  reconcilePhoneDailyQuotas,
} from '../modules/appointments/phoneDailyQuota.service.js';
import {
  isAllowedSocialUrl,
  isSafeHttpsUrl,
} from '../utils/publicUrl.js';
import {
  VERIFIED_CONSENT_METHODS,
  UNVERIFIED_POLICY,
} from '../modules/beforeAfter/beforeAfter.consent.js';


const normalizeKey = (key) => Object.entries(key)
  .map(([field, direction]) => [field, Number(direction)])
  .reduce((result, [field, direction]) => {
    result[field] = direction;
    return result;
  }, {});


const keysEqual = (left, right) =>
  JSON.stringify(normalizeKey(left)) === JSON.stringify(normalizeKey(right));


const canonicalValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])])
    );
  }
  return value;
};


const valuesEqual = (left, right) => (
  JSON.stringify(canonicalValue(left)) ===
  JSON.stringify(canonicalValue(right))
);


const verifyMigrationLedger = async () => {
  const records = await Migration.collection.find({}).toArray();
  const expected = new Map(
    migrationManifest.map((entry) => [entry.version, entry])
  );
  const actual = new Map(records.map((entry) => [entry.version, entry]));
  const missing = migrationManifest
    .filter(({ version }) => !actual.has(version))
    .map(({ version }) => version);
  const unexpected = records
    .filter(({ version }) => !expected.has(version))
    .map(({ version }) => version);
  const incomplete = records
    .filter((record) => expected.has(record.version) && record.state !== 'applied')
    .map(({ version, state }) => ({ version, state: state || 'legacy' }));
  const checksumFailures = records
    .filter((record) => {
      const manifestEntry = expected.get(record.version);
      return manifestEntry && record.checksum !== manifestEntry.checksum;
    })
    .map(({ version, checksum }) => ({
      version,
      issue: checksum ? 'checksum_mismatch' : 'checksum_missing',
    }));
  const inconsistent = records.flatMap((record) => {
    const expectedEntry = expected.get(record.version);
    if (!expectedEntry) return [];
    const issues = [];
    if (record.description !== expectedEntry.description) {
      issues.push('description_mismatch');
    }
    if (!Number.isInteger(record.attempts) || record.attempts < 0) {
      issues.push('invalid_attempt_count');
    }
    if (record.state === 'applied') {
      if (!(record.appliedAt instanceof Date)) issues.push('applied_at_missing');
      if (record.ownerToken !== undefined) issues.push('residual_owner');
      if (record.leaseExpiresAt !== undefined) issues.push('residual_lease');
      if (record.lastFailure !== undefined) issues.push('residual_failure');
    }
    else if (record.state === 'running') {
      if (typeof record.ownerToken !== 'string' || !record.ownerToken) {
        issues.push('owner_missing');
      }
      if (!(record.leaseExpiresAt instanceof Date)) issues.push('lease_missing');
      if (!(record.lastStartedAt instanceof Date)) issues.push('started_at_missing');
    }
    else if (record.state === 'failed') {
      if (typeof record.lastFailure !== 'string' || !record.lastFailure) {
        issues.push('failure_missing');
      }
      if (record.ownerToken !== undefined) issues.push('residual_owner');
      if (record.leaseExpiresAt !== undefined) issues.push('residual_lease');
    }
    return issues.map((issue) => ({ version: record.version, issue }));
  });

  return {
    ok: missing.length === 0 && unexpected.length === 0 &&
      incomplete.length === 0 && checksumFailures.length === 0 &&
      inconsistent.length === 0,
    missing,
    unexpected,
    incomplete,
    checksumFailures,
    inconsistent,
  };
};


const verifyCriticalIndexes = async (
  db,
  expectations = CRITICAL_INDEXES
) => {
  const failures = [];
  const byCollection = new Map();
  for (const expected of expectations) {
    if (!byCollection.has(expected.collection)) {
      byCollection.set(expected.collection, []);
    }
    byCollection.get(expected.collection).push(expected);
  }

  for (const [collectionName, collectionExpectations] of byCollection) {
    let actualIndexes;
    try {
      actualIndexes = await db.collection(collectionName).listIndexes().toArray();
    }
    catch (error) {
      failures.push({
        collection: collectionName,
        issue: error.codeName === 'NamespaceNotFound'
          ? 'collection_missing'
          : 'index_catalog_unavailable',
      });
      continue;
    }

    for (const expected of collectionExpectations) {
      const actual = actualIndexes.find((index) => keysEqual(index.key, expected.key));
      if (!actual) {
        failures.push({
          collection: collectionName,
          key: expected.key,
          issue: 'index_missing',
        });
        continue;
      }
      if (expected.name && actual.name !== expected.name) {
        failures.push({
          collection: collectionName,
          key: expected.key,
          issue: 'index_name_mismatch',
        });
      }
      const booleanOptions = ['unique', 'sparse', 'hidden'];
      for (const option of booleanOptions) {
        if (Boolean(actual[option]) !== Boolean(expected[option])) {
          failures.push({
            collection: collectionName,
            key: expected.key,
            issue:
              option === 'unique' && expected.unique === true
                ? 'unique_option_missing'
                : 'index_option_mismatch',
            option,
          });
        }
      }

      const actualTtl = actual.expireAfterSeconds === undefined
        ? undefined
        : Number(actual.expireAfterSeconds);
      if (actualTtl !== expected.expireAfterSeconds) {
        failures.push({
          collection: collectionName,
          key: expected.key,
          issue: expected.expireAfterSeconds === undefined
            ? 'index_option_mismatch'
            : 'ttl_option_mismatch',
          option: 'expireAfterSeconds',
        });
      }

      for (const option of ['partialFilterExpression', 'collation']) {
        if (!valuesEqual(actual[option], expected[option])) {
          failures.push({
            collection: collectionName,
            key: expected.key,
            issue: 'index_option_mismatch',
            option,
          });
        }
      }
    }

    for (const actual of actualIndexes) {
      if (actual.name === '_id_') {
        continue;
      }
      const declared = collectionExpectations.some(
        (expected) => keysEqual(actual.key, expected.key)
      );
      if (!declared && actual.unique === true) {
        failures.push({
          collection: collectionName,
          key: actual.key,
          issue: 'unexpected_unique_index',
        });
      }
      if (!declared && actual.expireAfterSeconds !== undefined) {
        failures.push({
          collection: collectionName,
          key: actual.key,
          issue: 'unexpected_ttl_index',
        });
      }
    }
  }
  return failures;
};


const verifyMongoGuarantees = async (db) => {
  const hello = await db.admin().command({ hello: 1 });
  const supportsTransactions = Boolean(
    hello.logicalSessionTimeoutMinutes &&
    (hello.setName || hello.msg === 'isdbgrid')
  );
  return {
    ok: supportsTransactions,
    topology: hello.msg === 'isdbgrid'
      ? 'sharded'
      : (hello.setName ? 'replica_set' : 'standalone'),
  };
};


const missingArmenian = (field) => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: '' },
  ],
});


const verifyArmenianPublicationContent = async () => {
  const checks = [
    ['service_categories', ServiceCategory, { isActive: true }, 'translations.hy.name'],
    ['services', Service, { isActive: true }, 'translations.hy.name'],
    ['dentists', Dentist, { isActive: true }, 'translations.hy.title'],
    ['clinic', Clinic, {}, 'translations.hy.clinicName'],
    ['gallery', MediaAsset, { isActive: true }, 'translations.hy.altText'],
    [
      'before_after',
      BeforeAfterCase,
      {
        isActive: true,
        publicationStatus: 'published',
        consentStatus: 'active',
      },
      'translations.hy.title',
    ],
  ];

  const failures = [];
  for (const [resource, Model, activeFilter, field] of checks) {
    const count = await Model.countDocuments({
      ...activeFilter,
      ...missingArmenian(field),
    });
    if (count > 0) {
      failures.push({ resource, count });
    }
  }
  return failures;
};


const timeToMinutes = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) {
    return null;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};


const countIncompleteAppointmentLocks = async () => {
  let invalid = 0;
  const cursor = Appointment.find({ status: { $ne: 'cancelled' } })
    .select('date startTime endTime bufferMinutes +lockKeys')
    .lean()
    .cursor();

  for await (const appointment of cursor) {
    const start = timeToMinutes(appointment.startTime);
    const end = timeToMinutes(appointment.endTime);
    const buffer = appointment.bufferMinutes;
    const actual = appointment.lockKeys;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(String(appointment.date || '')) ||
      start === null ||
      end === null ||
      !Number.isInteger(buffer) ||
      buffer < 0 ||
      end <= start ||
      end + buffer > 1440 ||
      !Array.isArray(actual)
    ) {
      invalid += 1;
      continue;
    }

    const expected = [];
    for (let minute = start; minute < end + buffer; minute += 1) {
      expected.push(`${appointment.date}:${minute}`);
    }
    if (
      actual.length !== expected.length ||
      new Set(actual).size !== actual.length ||
      actual.some((key, index) => key !== expected[index])
    ) {
      invalid += 1;
    }
  }

  return invalid;
};


const countInvalidCancelledAppointmentLocks = async () => {
  let invalid = 0;
  const cursor = Appointment.find({ status: 'cancelled' })
    .select('+lockKeys')
    .lean()
    .cursor();

  for await (const appointment of cursor) {
    const expected = `released:${appointment._id}`;
    if (
      !Array.isArray(appointment.lockKeys) ||
      appointment.lockKeys.length !== 1 ||
      appointment.lockKeys[0] !== expected
    ) {
      invalid += 1;
    }
  }
  return invalid;
};


const countInvalidAppointmentMutationVersions = async () => (
  Appointment.aggregate([
    {
      $match: {
        $expr: {
          $cond: [
            {
              $in: [
                { $type: '$mutationVersion' },
                ['int', 'long', 'double', 'decimal'],
              ],
            },
            {
              $or: [
                { $lt: ['$mutationVersion', 0] },
                {
                  $ne: [
                    '$mutationVersion',
                    { $trunc: '$mutationVersion' },
                  ],
                },
              ],
            },
            true,
          ],
        },
      },
    },
    { $count: 'count' },
  ]).then(([result]) => result?.count || 0)
);


const countInvalidBookingIdempotencyRows = async () => {
  let invalid = 0;
  const cursor = BookingIdempotency.collection.aggregate([
    {
      $project: {
        keyHash: 1,
        requestHash: 1,
        requestHashVersion: 1,
        appointment: 1,
        expiresAt: 1,
        responseSnapshotType: { $type: '$responseSnapshot' },
      },
    },
  ]);
  for await (const row of cursor) {
    if (
      typeof row.keyHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(row.keyHash) ||
      typeof row.requestHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(row.requestHash) ||
      typeof row.requestHashVersion !== 'string' ||
      !['v1', 'v2'].includes(row.requestHashVersion) ||
      !isObjectId(row.appointment) ||
      !isExactDate(row.expiresAt) ||
      row.responseSnapshotType === 'missing'
    ) {
      invalid += 1;
    }
  }
  return invalid;
};


const countInvalidAppointmentPrivacyEvidence = async () => {
  let invalid = 0;
  const cursor = Appointment.collection.find(
    {},
    {
      projection: {
        privacyConsentAt: 1,
        privacyConsentMethod: 1,
        privacyPolicyVersion: 1,
      },
    }
  );
  for await (const appointment of cursor) {
    if (appointment.privacyPolicyVersion === 'legacy-unverified') continue;
    if (
      !isExactDate(appointment.privacyConsentAt) ||
      typeof appointment.privacyConsentMethod !== 'string' ||
      !['website', 'phone', 'in_person'].includes(
        appointment.privacyConsentMethod
      ) ||
      typeof appointment.privacyPolicyVersion !== 'string' ||
      !/^(?:[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?)$/.test(
        appointment.privacyPolicyVersion
      )
    ) {
      invalid += 1;
    }
  }
  return invalid;
};


const countInvalidAppointmentNotificationLocales = async () => {
  let invalid = 0;
  const cursor = Appointment.collection.find(
    {},
    { projection: { notificationLocale: 1 } }
  );
  for await (const appointment of cursor) {
    if (!isSupportedNotificationLocale(appointment.notificationLocale)) {
      invalid += 1;
    }
  }
  return invalid;
};


const countInvalidNotificationShapes = async (collection) => {
  let invalid = 0;
  const cursor = collection.find(
    {},
    {
      projection: {
        dedupeKey: 1,
        appointment: 1,
        eventType: 1,
        eventRevision: 1,
        scheduleRevision: 1,
        channel: 1,
        recipientKind: 1,
        locale: 1,
        dueAt: 1,
        nextAttemptAt: 1,
        status: 1,
        attempts: 1,
        maxAttempts: 1,
        eventSnapshot: 1,
      },
    }
  );
  for await (const job of cursor) {
    if (!isValidNotificationJobShape(job)) invalid += 1;
  }
  return invalid;
};


const countActionablePatientJobsWithUnsafeEmail = async (
  collection,
  actionable
) => {
  let invalid = 0;
  const cursor = collection.aggregate([
    {
      $match: {
        status: { $in: actionable },
        recipientKind: 'appointment_patient',
      },
    },
    {
      $lookup: {
        from: 'appointments',
        let: { appointmentId: '$appointment' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$appointmentId'] } } },
          { $project: { _id: 0, patientEmail: 1 } },
        ],
        as: 'appointments',
      },
    },
    {
      $project: {
        patientEmail: { $arrayElemAt: ['$appointments.patientEmail', 0] },
      },
    },
  ]);
  for await (const row of cursor) {
    if (!isSafeSingleMailbox(row.patientEmail)) invalid += 1;
  }
  return invalid;
};


const inspectNotificationStateShapes = async (
  collection,
  actionable,
  terminal
) => {
  const result = {
    invalidProcessingLeases: 0,
    residualLeases: 0,
    invalidTerminalRetention: 0,
    actionableWithPurgeAt: 0,
    exhaustedActionable: 0,
    invalidMetadata: 0,
  };
  const absent = (value) => value === undefined || value === null;
  const cursor = collection.find(
    {},
    {
      projection: {
        status: 1,
        attempts: 1,
        maxAttempts: 1,
        leaseOwner: 1,
        leaseToken: 1,
        leaseExpiresAt: 1,
        claimedAt: 1,
        deliveryStartedAt: 1,
        sentAt: 1,
        failedAt: 1,
        cancelledAt: 1,
        purgeAt: 1,
        cancellationCode: 1,
        lastErrorCategory: 1,
        lastErrorCode: 1,
        lastResponseCode: 1,
      },
    }
  );
  for await (const job of cursor) {
    if (job.status === 'processing') {
      if (
        typeof job.leaseOwner !== 'string' ||
        job.leaseOwner.length < 1 ||
        job.leaseOwner.length > 200 ||
        typeof job.leaseToken !== 'string' ||
        job.leaseToken.length < 1 ||
        job.leaseToken.length > 100 ||
        !isExactDate(job.leaseExpiresAt) ||
        !isExactDate(job.claimedAt) ||
        (!absent(job.deliveryStartedAt) && !isExactDate(job.deliveryStartedAt))
      ) {
        result.invalidProcessingLeases += 1;
      }
    }
    else if (
      !absent(job.leaseOwner) ||
      !absent(job.leaseToken) ||
      !absent(job.leaseExpiresAt) ||
      !absent(job.claimedAt) ||
      !absent(job.deliveryStartedAt)
    ) {
      result.residualLeases += 1;
    }

    if (terminal.includes(job.status)) {
      const terminalTimestamp = job.status === 'sent'
        ? job.sentAt
        : (job.status === 'failed' ? job.failedAt : job.cancelledAt);
      if (!isExactDate(job.purgeAt) || !isExactDate(terminalTimestamp)) {
        result.invalidTerminalRetention += 1;
      }
    }
    else if (actionable.includes(job.status) && !absent(job.purgeAt)) {
      result.actionableWithPurgeAt += 1;
    }

    if (
      ['pending', 'retry'].includes(job.status) &&
      Number.isInteger(job.attempts) &&
      Number.isInteger(job.maxAttempts) &&
      job.attempts >= job.maxAttempts
    ) {
      result.exhaustedActionable += 1;
    }

    if (
      (!absent(job.cancellationCode) && (
        typeof job.cancellationCode !== 'string' ||
        job.cancellationCode.length > 80 ||
        /[\r\n\u0000]/.test(job.cancellationCode)
      )) ||
      (!absent(job.lastErrorCategory) && ![
        '',
        'timeout',
        'connection',
        'authentication',
        'recipient_rejected',
        'invalid_message',
        'unsupported_channel',
        'unknown',
      ].includes(job.lastErrorCategory)) ||
      (!absent(job.lastErrorCode) && (
        typeof job.lastErrorCode !== 'string' ||
        !/^[A-Za-z0-9_]{0,80}$/.test(job.lastErrorCode)
      )) ||
      (!absent(job.lastResponseCode) && (
        !Number.isInteger(job.lastResponseCode) ||
        job.lastResponseCode < 100 ||
        job.lastResponseCode > 999
      ))
    ) {
      result.invalidMetadata += 1;
    }
  }
  return result;
};


const verifyNotificationOutbox = async ({ now = new Date() } = {}) => {
  const collection = NotificationJob.collection;
  const actionable = ['pending', 'processing', 'retry'];
  const terminal = ['sent', 'failed', 'cancelled'];
  const [
    invalidShape,
    orphanAppointments,
    stateShapes,
    unsupportedActiveSms,
    patientJobsWithoutEmail,
    activeProcessingLeases,
    expiredProcessingLeases,
    overdueJobs,
    retryJobs,
    terminalFailures,
  ] = await Promise.all([
    countInvalidNotificationShapes(collection),
    collection.aggregate([
      {
        $lookup: {
          from: 'appointments',
          localField: 'appointment',
          foreignField: '_id',
          as: 'appointments',
        },
      },
      { $match: { appointments: { $size: 0 } } },
      { $count: 'count' },
    ]).toArray().then(([result]) => result?.count || 0),
    inspectNotificationStateShapes(collection, actionable, terminal),
    collection.countDocuments({
      status: { $in: actionable },
      channel: 'sms',
    }),
    countActionablePatientJobsWithUnsafeEmail(collection, actionable),
    collection.countDocuments({
      status: 'processing',
      leaseExpiresAt: { $gt: now },
    }),
    collection.countDocuments({
      status: 'processing',
      leaseExpiresAt: { $lte: now },
    }),
    collection.countDocuments({
      status: { $in: ['pending', 'retry'] },
      dueAt: { $lte: now },
      nextAttemptAt: { $lte: now },
    }),
    collection.countDocuments({ status: 'retry' }),
    collection.countDocuments({ status: 'failed' }),
  ]);

  const {
    invalidProcessingLeases,
    residualLeases,
    invalidTerminalRetention,
    actionableWithPurgeAt,
    exhaustedActionable,
    invalidMetadata,
  } = stateShapes;

  const invalid = {
    invalidShape,
    orphanAppointments,
    invalidProcessingLeases,
    residualLeases,
    invalidTerminalRetention,
    actionableWithPurgeAt,
    exhaustedActionable,
    invalidMetadata,
    unsupportedActiveSms,
    patientJobsWithoutEmail,
    activeProcessingLeases,
  };
  return {
    ok: Object.values(invalid).every((count) => count === 0),
    ...invalid,
    metrics: {
      overdueJobs,
      retryJobs,
      terminalFailures,
      expiredProcessingLeases,
    },
  };
};


const countInvalidRevisionState = async (Model, fields) => (
  Model.aggregate([
    {
      $match: {
        $expr: {
          $or: fields.map((field) => ({
            $cond: [
              {
                $in: [
                  { $type: `$${field}` },
                  ['int', 'long', 'double', 'decimal'],
                ],
              },
              {
                $or: [
                  { $lt: [`$${field}`, 0] },
                  { $ne: [`$${field}`, { $trunc: `$${field}` }] },
                ],
              },
              true,
            ],
          })),
        },
      },
    },
    { $count: 'count' },
  ]).then(([result]) => result?.count || 0)
);


const countInvalidAppointmentTimestamps = async () => {
  let invalid = 0;
  const cursor = Appointment.find({})
    .select('date startTime endTime startAt endAt')
    .lean()
    .cursor();

  for await (const appointment of cursor) {
    const start = appointment.startAt instanceof Date
      ? DateTime.fromJSDate(appointment.startAt, { zone: 'utc' })
        .setZone(env.CLINIC_TIMEZONE)
      : null;
    const end = appointment.endAt instanceof Date
      ? DateTime.fromJSDate(appointment.endAt, { zone: 'utc' })
        .setZone(env.CLINIC_TIMEZONE)
      : null;
    if (
      !start?.isValid || !end?.isValid || end <= start ||
      start.toFormat('yyyy-MM-dd HH:mm') !==
        `${appointment.date} ${appointment.startTime}` ||
      end.toFormat('yyyy-MM-dd HH:mm') !==
        `${appointment.date} ${appointment.endTime}`
    ) {
      invalid += 1;
    }
  }
  return invalid;
};


const verifyCatalogAndScheduleReferences = async () => {
  const activeCategoryIds = await ServiceCategory.distinct('_id', {
    isActive: true,
  });
  const activeServicesWithInvalidCategory = await Service.countDocuments({
    isActive: true,
    category: { $nin: activeCategoryIds },
  });

  const validServiceIds = await Service.distinct('_id', {
    isActive: true,
    category: { $in: activeCategoryIds },
  });
  const validServiceSet = new Set(validServiceIds.map(String));
  let bookableDentistsWithInvalidServices = 0;
  const dentistCursor = Dentist.find({
    isActive: true,
    bookingEnabled: true,
  })
    .select('services')
    .lean()
    .cursor();
  for await (const dentist of dentistCursor) {
    if (
      !Array.isArray(dentist.services) ||
      dentist.services.length === 0 ||
      dentist.services.some((id) => !validServiceSet.has(String(id)))
    ) {
      bookableDentistsWithInvalidServices += 1;
    }
  }

  const dentistIds = await Dentist.distinct('_id');
  const orphanDentistScheduleExceptions =
    await DentistScheduleException.countDocuments({
      dentist: { $nin: dentistIds },
    });

  return {
    activeServicesWithInvalidCategory,
    bookableDentistsWithInvalidServices,
    orphanDentistScheduleExceptions,
  };
};


const isUnsafeStoredUrl = (value, validator) => (
  value !== undefined &&
  value !== null &&
  value !== '' &&
  !validator(value)
);


const countUnsafeStoredPublicUrls = async () => {
  let count = 0;
  const publicUrlFields = [
    [ServiceCategory, 'imageUrl'],
    [Service, 'imageUrl'],
    [Dentist, 'photoUrl'],
  ];

  for (const [Model, field] of publicUrlFields) {
    const cursor = Model.find({ [field]: { $exists: true } })
      .select(field)
      .lean()
      .cursor();
    for await (const row of cursor) {
      if (isUnsafeStoredUrl(row[field], isSafeHttpsUrl)) {
        count += 1;
      }
    }
  }

  const clinicCursor = Clinic.find({
    $or: [
      { mapUrl: { $exists: true } },
      { socialLinks: { $exists: true } },
    ],
  })
    .select('mapUrl socialLinks')
    .lean()
    .cursor();
  for await (const clinic of clinicCursor) {
    if (isUnsafeStoredUrl(clinic.mapUrl, isSafeHttpsUrl)) {
      count += 1;
    }
    for (const platform of [
      'instagram',
      'facebook',
      'whatsapp',
      'telegram',
    ]) {
      const value = clinic.socialLinks?.[platform];
      if (
        isUnsafeStoredUrl(
          value,
          (candidate) => isAllowedSocialUrl(platform, candidate)
        )
      ) {
        count += 1;
      }
    }
  }

  return count;
};


const countUsableActiveAdmins = async () => {
  const admins = await User.find({
    role: 'admin',
    isActive: true,
    isSetupComplete: true,
  })
    .select('+password')
    .lean();

  return admins.filter(({ password }) => {
    try {
      const rounds = bcrypt.getRounds(password);
      return Number.isInteger(rounds) && rounds >= 4 && rounds <= 31;
    }
    catch {
      return false;
    }
  }).length;
};


const dataInvariantsPass = (invariants) => Object.entries(invariants)
  .filter(([name]) => name !== 'unverifiedLegacyAppointmentPrivacyVersions')
  .every(([, count]) => count === 0);


const verifyDataInvariants = async () => {
  const clinic = await Clinic.findOne({ key: 'default' })
    .select('timezone bookingSettings.maxAppointmentsPerPhonePerDay')
    .lean();
  const quotaLimit = clinic?.bookingSettings?.maxAppointmentsPerPhonePerDay;

  const [
    clinicCount,
    invalidQuotaRows,
    overLimitQuotaRows,
    duplicateQuotaReservationRows,
    invalidAppointmentLocks,
    invalidAppointmentLockShapeRows,
    missingAppointmentQuotaReferences,
    duplicateAppointmentQuotaReferences,
    incompleteAppointmentLocks,
    invalidCancelledAppointmentLocks,
    invalidAppointmentMutationVersions,
    invalidAppointmentScheduleRevisions,
    invalidAppointmentNotificationLocales,
    invalidClinicScheduleRevisionState,
    invalidDentistScheduleRevisionState,
    invalidServiceBookingGuardState,
    invalidCategoryServiceMutationState,
    invalidAppointmentTimestamps,
    missingAppointmentPrivacyVersions,
    unverifiedLegacyAppointmentPrivacyVersions,
    invalidAppointmentPrivacyEvidence,
    legacyAppointmentIdempotencyHashes,
    invalidBookingIdempotencyRecords,
    orphanBookingIdempotencyRecords,
    quotaKeyVersionMismatchRows,
    quotaIdentityStatus,
    invalidConsentCases,
    referenceFailures,
    unsafeStoredPublicUrls,
    quotaReconciliation,
  ] =
    await Promise.all([
      Clinic.countDocuments({ key: 'default' }),
      PhoneDailyQuota.countDocuments({ reservations: { $not: { $type: 'array' } } }),
      Number.isInteger(quotaLimit)
        ? PhoneDailyQuota.countDocuments({
            reservations: { $type: 'array' },
            $expr: { $gt: [{ $size: '$reservations' }, quotaLimit] },
          })
        : 0,
      PhoneDailyQuota.aggregate([
        { $match: { reservations: { $type: 'array' } } },
        {
          $project: {
            count: { $size: '$reservations' },
            uniqueCount: {
              $size: {
                $setUnion: ['$reservations.reservationId', []],
              },
            },
          },
        },
        { $match: { $expr: { $ne: ['$count', '$uniqueCount'] } } },
        { $count: 'count' },
      ]).then(([result]) => result?.count || 0),
      Appointment.countDocuments({
        status: { $ne: 'cancelled' },
        $or: [
          { lockKeys: { $not: { $type: 'array' } } },
          { lockKeys: { $size: 0 } },
        ],
      }),
      Appointment.aggregate([
        {
          $match: {
            status: { $ne: 'cancelled' },
            lockKeys: { $type: 'array' },
          },
        },
        { $unwind: '$lockKeys' },
        {
          $match: {
            $expr: {
              $not: {
                $regexMatch: {
                  input: {
                    $convert: {
                      input: '$lockKeys',
                      to: 'string',
                      onError: '',
                      onNull: '',
                    },
                  },
                  regex: {
                    $concat: [
                      '^',
                      { $convert: { input: '$date', to: 'string' } },
                      ':(?:[0-9]|[1-9][0-9]{1,2}|1[0-3][0-9]{2}|14[0-3][0-9])$',
                    ],
                  },
                },
              },
            },
          },
        },
        { $group: { _id: '$_id' } },
        { $count: 'count' },
      ]).then(([result]) => result?.count || 0),
      Appointment.countDocuments({
        status: { $ne: 'cancelled' },
        $or: [
          { quotaReservationId: { $exists: false } },
          { quotaReservationId: null },
        ],
      }),
      Appointment.aggregate([
        {
          $match: {
            status: { $ne: 'cancelled' },
            quotaReservationId: { $type: 'objectId' },
          },
        },
        {
          $group: {
            _id: '$quotaReservationId',
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: 'count' },
      ]).then(([result]) => result?.count || 0),
      countIncompleteAppointmentLocks(),
      countInvalidCancelledAppointmentLocks(),
      countInvalidAppointmentMutationVersions(),
      countInvalidRevisionState(Appointment, ['scheduleRevision']),
      countInvalidAppointmentNotificationLocales(),
      countInvalidRevisionState(
        Clinic,
        ['scheduleRevision', 'bookingGuardVersion']
      ),
      countInvalidRevisionState(
        Dentist,
        ['scheduleRevision', 'bookingGuardVersion']
      ),
      countInvalidRevisionState(Service, ['bookingGuardVersion']),
      countInvalidRevisionState(ServiceCategory, ['serviceMutationVersion']),
      countInvalidAppointmentTimestamps(),
      Appointment.countDocuments({
        $or: [
          { privacyPolicyVersion: { $exists: false } },
          { privacyPolicyVersion: null },
          { privacyPolicyVersion: '' },
        ],
      }),
      Appointment.countDocuments({
        privacyPolicyVersion: 'legacy-unverified',
      }),
      countInvalidAppointmentPrivacyEvidence(),
      Appointment.countDocuments({
        $or: [
          { idempotencyKeyHash: { $type: 'string' } },
          { idempotencyRequestHash: { $type: 'string' } },
        ],
      }),
      countInvalidBookingIdempotencyRows(),
      BookingIdempotency.aggregate([
        {
          $lookup: {
            from: 'appointments',
            localField: 'appointment',
            foreignField: '_id',
            as: 'appointments',
          },
        },
        { $match: { appointments: { $size: 0 } } },
        { $count: 'count' },
      ]).then(([result]) => result?.count || 0),
      PhoneDailyQuota.countDocuments({
        $expr: {
          $not: [exactPhoneQuotaKeyVersionExpression()],
        },
      }),
      getPhoneQuotaIdentityStatus(),
      BeforeAfterCase.countDocuments({
        publicationStatus: 'published',
        $or: [
          { consentStatus: { $ne: 'active' } },
          { isActive: { $ne: true } },
          { beforeImage: null },
          { afterImage: null },
          { consentMethod: { $nin: VERIFIED_CONSENT_METHODS } },
          { consentPolicyVersion: { $ne: env.BEFORE_AFTER_CONSENT_VERSION } },
          { consentPolicyVersion: UNVERIFIED_POLICY },
          { consentConfirmedAt: { $not: { $type: 'date' } } },
          { consentRecordedBy: { $not: { $type: 'objectId' } } },
        ],
      }),
      verifyCatalogAndScheduleReferences(),
      countUnsafeStoredPublicUrls(),
      Number.isInteger(quotaLimit)
        ? reconcilePhoneDailyQuotas({
            dryRun: true,
            includeLiveOrphans: true,
          })
        : {
            missingReservations: 0,
            orphanReservations: 0,
            repairConflicts: 0,
            invalidAppointmentReferences: 0,
          },
    ]);
  return {
    invalidClinicSingleton: clinicCount === 1 ? 0 : 1,
    invalidClinicTimezone:
      clinic && clinic.timezone === env.CLINIC_TIMEZONE ? 0 : 1,
    invalidQuotaRows,
    overLimitQuotaRows,
    duplicateQuotaReservationRows,
    invalidAppointmentLocks,
    invalidAppointmentLockShapeRows,
    missingAppointmentQuotaReferences,
    duplicateAppointmentQuotaReferences,
    incompleteAppointmentLocks,
    invalidCancelledAppointmentLocks,
    invalidAppointmentMutationVersions,
    invalidAppointmentScheduleRevisions,
    invalidAppointmentNotificationLocales,
    invalidClinicScheduleRevisionState,
    invalidDentistScheduleRevisionState,
    invalidServiceBookingGuardState,
    invalidCategoryServiceMutationState,
    invalidAppointmentTimestamps,
    missingAppointmentPrivacyVersions,
    unverifiedLegacyAppointmentPrivacyVersions,
    invalidAppointmentPrivacyEvidence,
    legacyAppointmentIdempotencyHashes,
    invalidBookingIdempotencyRecords,
    orphanBookingIdempotencyRecords,
    quotaKeyVersionMismatchRows,
    invalidQuotaKeyIdentity: quotaIdentityStatus.matches ? 0 : 1,
    invalidQuotaAppointmentReferences:
      quotaReconciliation.invalidAppointmentReferences,
    missingQuotaReservations: quotaReconciliation.missingReservations,
    staleOrphanQuotaReservations: quotaReconciliation.orphanReservations,
    quotaRepairConflicts: quotaReconciliation.repairConflicts,
    ...referenceFailures,
    unsafeStoredPublicUrls,
    invalidConsentCases,
  };
};


const runProductionPreflight = async (
  connection = mongoose.connection
) => {
  if (connection.readyState !== 1 || !connection.db) {
    throw new Error('MongoDB is not connected');
  }

  const checks = [];
  const mongoGuarantees = await verifyMongoGuarantees(connection.db);
  checks.push({ name: 'mongo_transaction_topology', ...mongoGuarantees });

  const indexFailures = await verifyCriticalIndexes(connection.db);
  checks.push({
    name: 'critical_indexes',
    ok: indexFailures.length === 0,
    failures: indexFailures,
  });

  const migrationLedger = await verifyMigrationLedger();
  checks.push({ name: 'migrations', ...migrationLedger });

  const activeAdmins = await countUsableActiveAdmins();
  checks.push({ name: 'active_admin', ok: activeAdmins > 0, count: activeAdmins });

  const armenianFailures = await verifyArmenianPublicationContent();
  checks.push({
    name: 'armenian_publication_content',
    ok: armenianFailures.length === 0,
    failures: armenianFailures,
  });

  const invariants = await verifyDataInvariants();
  checks.push({
    name: 'data_invariants',
    ok: dataInvariantsPass(invariants),
    ...invariants,
  });

  const notificationOutbox = await verifyNotificationOutbox();
  checks.push({ name: 'notification_outbox', ...notificationOutbox });

  checks.push({
    name: 'production_integrations',
    ok: Boolean(
      env.REDIS_URL && env.SMTP_HOST && env.CLOUDINARY_CLOUD_NAME &&
      env.ERROR_MONITOR_WEBHOOK_URL && env.BEFORE_AFTER_CONSENT_VERSION &&
      env.NOTIFICATIONS_ENABLED && env.CLINIC_NOTIFICATION_EMAIL
    ),
  });

  return {
    ok: checks.every(({ ok }) => ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
};


export {
  verifyCriticalIndexes,
  verifyMongoGuarantees,
  verifyArmenianPublicationContent,
  verifyDataInvariants,
  countUsableActiveAdmins,
  dataInvariantsPass,
  verifyMigrationLedger,
  verifyNotificationOutbox,
  runProductionPreflight,
};
