import {
  SUPPORTED_LOCALES,
} from '../i18n/localization.js';

import ServiceCategory from '../modules/serviceCategories/serviceCategory.model.js';
import Service from '../modules/services/service.model.js';
import Dentist from '../modules/dentists/dentist.model.js';
import Clinic from '../modules/clinic/clinic.model.js';
import MediaAsset from '../modules/media/media.model.js';
import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';

const version =
  '20260814_001_localized_content';

const description =
  'Copy legacy editorial strings into an explicitly selected translation locale';

const WRITE_BATCH_SIZE = 250;

const targets = [
  {
    name: 'serviceCategories',
    model: ServiceCategory,
    fields: ['name', 'description'],
  },
  {
    name: 'services',
    model: Service,
    fields: [
      'name',
      'shortDescription',
      'description',
    ],
  },
  {
    name: 'dentists',
    model: Dentist,
    fields: [
      'title',
      'bio',
      'specializations',
    ],
  },
  {
    name: 'clinics',
    model: Clinic,
    fields: [
      'clinicName',
      'tagline',
      'description',
      'address',
    ],
  },
  {
    name: 'mediaAssets',
    model: MediaAsset,
    fields: ['altText', 'caption'],
  },
  {
    name: 'beforeAfterCases',
    model: BeforeAfterCase,
    fields: ['title', 'description'],
  },
];

const hasValue = (value) => (
  Array.isArray(value)
    ? value.length > 0
    : typeof value === 'string' &&
      value.length > 0
);

const run = async ({
  legacyLocale,
  dryRun = true,
}) => {
  if (!SUPPORTED_LOCALES.includes(legacyLocale)) {
    throw new Error(
      'LEGACY_CONTENT_LOCALE must be one of hy, ru, en'
    );
  }

  const stats = {};

  for (const target of targets) {
    const cursor = target.model.collection
      .find({})
      .batchSize(WRITE_BATCH_SIZE);
    const operations = [];
    let scanned = 0;
    let changed = 0;

    for await (const document of cursor) {
      scanned += 1;
      const set = {};

      for (const field of target.fields) {
        const existing =
          document.translations
            ?.[legacyLocale]
            ?.[field];

        if (
          existing !== undefined ||
          !hasValue(document[field])
        ) {
          continue;
        }

        set[
          `translations.${legacyLocale}.${field}`
        ] = document[field];
      }

      if (Object.keys(set).length) {
        changed += 1;
        if (!dryRun) {
          operations.push({
            updateOne: {
              filter: { _id: document._id },
              update: { $set: set },
            },
          });

          if (
            operations.length >= WRITE_BATCH_SIZE
          ) {
            await target.model.collection.bulkWrite(
              operations.splice(0),
              { ordered: false }
            );
          }
        }
      }
    }

    stats[target.name] = {
      scanned,
      changed,
    };

    if (!dryRun && operations.length) {
      await target.model.collection.bulkWrite(
        operations,
        { ordered: false }
      );
    }
  }

  return stats;
};

export {
  version,
  description,
  run,
};
