import Clinic from '../modules/clinic/clinic.model.js';
import Dentist from '../modules/dentists/dentist.model.js';
import Service from '../modules/services/service.model.js';
import ServiceCategory from '../modules/serviceCategories/serviceCategory.model.js';


const version = '20260814_009_schedule_revisions';
const description =
  'Initialize missing schedule and catalog booking concurrency revisions';


const missing = (field) => ({
  [field]: { $exists: false },
});


const run = async ({ dryRun = true }) => {
  const [
    clinicsMissingScheduleRevision,
    clinicsMissingBookingGuardVersion,
    dentistsMissingScheduleRevision,
    dentistsMissingBookingGuardVersion,
    servicesMissingBookingGuardVersion,
    categoriesMissingServiceMutationVersion,
  ] = await Promise.all([
    Clinic.collection.countDocuments(missing('scheduleRevision')),
    Clinic.collection.countDocuments(missing('bookingGuardVersion')),
    Dentist.collection.countDocuments(missing('scheduleRevision')),
    Dentist.collection.countDocuments(missing('bookingGuardVersion')),
    Service.collection.countDocuments(missing('bookingGuardVersion')),
    ServiceCategory.collection.countDocuments(missing('serviceMutationVersion')),
  ]);

  const result = {
    clinicsMissingScheduleRevision,
    clinicsMissingBookingGuardVersion,
    dentistsMissingScheduleRevision,
    dentistsMissingBookingGuardVersion,
    servicesMissingBookingGuardVersion,
    categoriesMissingServiceMutationVersion,
    clinicScheduleRevisionsInitialized: 0,
    clinicBookingGuardsInitialized: 0,
    dentistScheduleRevisionsInitialized: 0,
    dentistBookingGuardsInitialized: 0,
    serviceBookingGuardsInitialized: 0,
    categoryServiceMutationVersionsInitialized: 0,
  };

  if (dryRun) {
    return result;
  }

  const [
    clinicScheduleRevision,
    clinicBookingGuard,
    dentistScheduleRevision,
    dentistBookingGuard,
    serviceBookingGuard,
    categoryServiceMutationVersion,
  ] = await Promise.all([
    Clinic.collection.updateMany(
      missing('scheduleRevision'),
      { $set: { scheduleRevision: 0 } }
    ),
    Clinic.collection.updateMany(
      missing('bookingGuardVersion'),
      { $set: { bookingGuardVersion: 0 } }
    ),
    Dentist.collection.updateMany(
      missing('scheduleRevision'),
      { $set: { scheduleRevision: 0 } }
    ),
    Dentist.collection.updateMany(
      missing('bookingGuardVersion'),
      { $set: { bookingGuardVersion: 0 } }
    ),
    Service.collection.updateMany(
      missing('bookingGuardVersion'),
      { $set: { bookingGuardVersion: 0 } }
    ),
    ServiceCategory.collection.updateMany(
      missing('serviceMutationVersion'),
      { $set: { serviceMutationVersion: 0 } }
    ),
  ]);

  return {
    ...result,
    clinicScheduleRevisionsInitialized:
      clinicScheduleRevision.modifiedCount,
    clinicBookingGuardsInitialized:
      clinicBookingGuard.modifiedCount,
    dentistScheduleRevisionsInitialized:
      dentistScheduleRevision.modifiedCount,
    dentistBookingGuardsInitialized:
      dentistBookingGuard.modifiedCount,
    serviceBookingGuardsInitialized:
      serviceBookingGuard.modifiedCount,
    categoryServiceMutationVersionsInitialized:
      categoryServiceMutationVersion.modifiedCount,
  };
};


export { version, description, run };
