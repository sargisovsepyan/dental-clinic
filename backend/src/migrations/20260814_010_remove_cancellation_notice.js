import Clinic from '../modules/clinic/clinic.model.js';


const version = '20260814_010_remove_cancellation_notice';
const description =
  'Remove the unused legacy patient cancellation notice setting';


const run = async ({ dryRun = true }) => {
  const clinicsWithLegacySetting = await Clinic.collection.countDocuments({
    'bookingSettings.cancellationNoticeHours': { $exists: true },
  });
  const result = {
    clinicsWithLegacySetting,
    legacySettingsRemoved: 0,
  };

  if (dryRun || clinicsWithLegacySetting === 0) {
    return result;
  }

  const removed = await Clinic.collection.updateMany(
    { 'bookingSettings.cancellationNoticeHours': { $exists: true } },
    { $unset: { 'bookingSettings.cancellationNoticeHours': '' } }
  );
  return {
    ...result,
    legacySettingsRemoved: removed.modifiedCount,
  };
};


export { version, description, run };
