import mongoose from 'mongoose';

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
import {
  reconcilePhoneDailyQuotas,
} from '../modules/appointments/phoneDailyQuota.service.js';


const normalizeKey = (key) => Object.entries(key)
  .map(([field, direction]) => [field, Number(direction)])
  .reduce((result, [field, direction]) => {
    result[field] = direction;
    return result;
  }, {});


const keysEqual = (left, right) =>
  JSON.stringify(normalizeKey(left)) === JSON.stringify(normalizeKey(right));


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
      if (expected.unique === true && actual.unique !== true) {
        failures.push({
          collection: collectionName,
          key: expected.key,
          issue: 'unique_option_missing',
        });
      }
      if (
        expected.expireAfterSeconds !== undefined &&
        Number(actual.expireAfterSeconds) !== expected.expireAfterSeconds
      ) {
        failures.push({
          collection: collectionName,
          key: expected.key,
          issue: 'ttl_option_mismatch',
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


const verifyDataInvariants = async () => {
  const clinic = await Clinic.findOne({ key: 'default' })
    .select('bookingSettings.maxAppointmentsPerPhonePerDay')
    .lean();
  const quotaLimit = clinic?.bookingSettings?.maxAppointmentsPerPhonePerDay;

  const [
    clinicCount,
    invalidQuotaRows,
    overLimitQuotaRows,
    duplicateQuotaReservationRows,
    invalidAppointmentLocks,
    missingAppointmentQuotaReferences,
    invalidConsentCases,
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
          { lockKeys: { $exists: false } },
          { lockKeys: { $size: 0 } },
        ],
      }),
      Appointment.countDocuments({
        status: { $ne: 'cancelled' },
        $or: [
          { quotaReservationId: { $exists: false } },
          { quotaReservationId: null },
        ],
      }),
      BeforeAfterCase.countDocuments({
        publicationStatus: 'published',
        $or: [
          { consentStatus: { $ne: 'active' } },
          { isActive: { $ne: true } },
          { beforeImage: null },
          { afterImage: null },
        ],
      }),
      reconcilePhoneDailyQuotas({ dryRun: true }),
    ]);
  return {
    invalidClinicSingleton: clinicCount === 1 ? 0 : 1,
    invalidQuotaRows,
    overLimitQuotaRows,
    duplicateQuotaReservationRows,
    invalidAppointmentLocks,
    missingAppointmentQuotaReferences,
    missingQuotaReservations: quotaReconciliation.missingReservations,
    staleOrphanQuotaReservations: quotaReconciliation.orphanReservations,
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

  const appliedMigrations = new Set(
    await Migration.distinct('version')
  );
  const missingMigrations = migrationManifest
    .map(({ version }) => version)
    .filter((version) => !appliedMigrations.has(version));
  checks.push({
    name: 'migrations',
    ok: missingMigrations.length === 0,
    missing: missingMigrations,
  });

  const activeAdmins = await User.countDocuments({
    role: 'admin',
    isActive: true,
    isSetupComplete: { $ne: false },
  });
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
    ok: Object.values(invariants).every((count) => count === 0),
    ...invariants,
  });

  checks.push({
    name: 'production_integrations',
    ok: Boolean(
      env.REDIS_URL && env.SMTP_HOST && env.CLOUDINARY_CLOUD_NAME &&
      env.ERROR_MONITOR_WEBHOOK_URL && env.BEFORE_AFTER_CONSENT_VERSION
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
  runProductionPreflight,
};
