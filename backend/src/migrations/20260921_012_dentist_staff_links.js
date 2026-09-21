import User from '../modules/users/user.model.js';

const version = '20260921_012_dentist_staff_links';
const description =
  'Enforce one current dentist staff account per dentist profile';

const indexKey = { dentistProfile: 1 };
const indexOptions = {
  unique: true,
  name: 'unique_current_dentist_staff_profile',
  partialFilterExpression: {
    dentistProfile: { $type: 'objectId' },
    deactivatedAt: null,
  },
};

const countDuplicateCurrentLinks = async () => {
  const rows = await User.collection.aggregate([
    {
      $match: {
        dentistProfile: { $type: 'objectId' },
        deactivatedAt: null,
      },
    },
    { $group: { _id: '$dentistProfile', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'count' },
  ]).toArray();
  return rows[0]?.count || 0;
};

const run = async ({ dryRun = true, assertLease = async () => {} }) => {
  const [duplicateCurrentDentistLinks, currentDentistsWithoutProfiles,
    currentNonDentistsWithProfiles] = await Promise.all([
    countDuplicateCurrentLinks(),
    User.collection.countDocuments({
      role: 'dentist',
      deactivatedAt: null,
      $or: [
        { dentistProfile: { $exists: false } },
        { dentistProfile: null },
      ],
    }),
    User.collection.countDocuments({
      role: { $ne: 'dentist' },
      deactivatedAt: null,
      dentistProfile: { $type: 'objectId' },
    }),
  ]);
  const result = {
    duplicateCurrentDentistLinks,
    currentDentistsWithoutProfiles,
    currentNonDentistsWithProfiles,
    indexCreated: false,
  };
  if (dryRun) return result;
  if (
    duplicateCurrentDentistLinks > 0 ||
    currentDentistsWithoutProfiles > 0 ||
    currentNonDentistsWithProfiles > 0
  ) {
    throw new Error('Dentist staff link migration preconditions are not satisfied');
  }
  await assertLease();
  await User.collection.createIndex(indexKey, indexOptions);
  await assertLease();
  return { ...result, indexCreated: true };
};

export { version, description, run };
