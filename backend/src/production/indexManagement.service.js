import productionModels from './models.js';


const UNIQUE_DATA_CHECKS = Object.freeze([
  { collection: 'users', fields: ['email'] },
  { collection: 'sessions', fields: ['tokenHash'] },
  { collection: 'onetimetokens', fields: ['tokenHash'] },
  { collection: 'servicecategories', fields: ['slug'] },
  { collection: 'services', fields: ['slug'] },
  { collection: 'dentists', fields: ['slug'] },
  { collection: 'clinics', fields: ['key'] },
  { collection: 'clinicclosures', fields: ['date'] },
  { collection: 'dentistscheduleexceptions', fields: ['dentist', 'date'] },
  { collection: 'appointments', fields: ['confirmationCode'] },
  {
    collection: 'appointments',
    fields: ['dentist', 'lockKeys'],
    unwind: 'lockKeys',
  },
  { collection: 'phonedailyquotas', fields: ['phoneKey', 'date'] },
  { collection: 'mediacleanupjobs', fields: ['publicId'] },
]);


const findDuplicateUniqueData = async (db) => {
  const failures = [];
  const collections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name)
  );

  for (const check of UNIQUE_DATA_CHECKS) {
    if (!collections.has(check.collection)) {
      continue;
    }
    const id = Object.fromEntries(
      check.fields.map((field) => [field, `$${field}`])
    );
    const pipeline = [
      ...(check.unwind
        ? [{ $unwind: { path: `$${check.unwind}`, preserveNullAndEmptyArrays: false } }]
        : []),
      {
        $match: Object.fromEntries(
          check.fields.map((field) => [field, { $exists: true, $ne: null }])
        ),
      },
      { $group: { _id: id, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
      { $project: { _id: 0, duplicateFound: { $literal: true } } },
    ];
    const duplicate = await db.collection(check.collection)
      .aggregate(pipeline, { allowDiskUse: false })
      .hasNext();
    if (duplicate) {
      failures.push({
        collection: check.collection,
        fields: check.fields,
        issue: 'duplicate_unique_data',
      });
    }
  }
  return failures;
};


const createDeclaredIndexes = async () => {
  const results = [];
  for (const Model of productionModels) {
    const names = await Model.createIndexes();
    results.push({
      collection: Model.collection.collectionName,
      indexes: names,
    });
  }
  return results;
};


export {
  UNIQUE_DATA_CHECKS,
  findDuplicateUniqueData,
  createDeclaredIndexes,
};
