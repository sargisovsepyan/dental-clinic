import User from '../modules/users/user.model.js';
import Session from '../modules/sessions/session.model.js';
import OneTimeToken from '../modules/auth/oneTimeToken.model.js';
import ServiceCategory from '../modules/serviceCategories/serviceCategory.model.js';
import Service from '../modules/services/service.model.js';
import Dentist from '../modules/dentists/dentist.model.js';
import Clinic from '../modules/clinic/clinic.model.js';
import ClinicClosure from '../modules/clinic/clinicClosure.model.js';
import DentistScheduleException from '../modules/dentists/dentistScheduleException.model.js';
import Appointment from '../modules/appointments/appointment.model.js';
import PhoneDailyQuota from '../modules/appointments/phoneDailyQuota.model.js';
import AuditLog from '../modules/audit/audit.model.js';
import MediaAsset from '../modules/media/media.model.js';
import MediaCleanupJob from '../modules/media/mediaCleanup.model.js';
import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';
import Migration from '../modules/migrations/migration.model.js';
import AdminInvariant from '../modules/staff/adminInvariant.model.js';


const productionModels = Object.freeze([
  User,
  Session,
  OneTimeToken,
  ServiceCategory,
  Service,
  Dentist,
  Clinic,
  ClinicClosure,
  DentistScheduleException,
  Appointment,
  PhoneDailyQuota,
  AuditLog,
  MediaAsset,
  MediaCleanupJob,
  BeforeAfterCase,
  Migration,
  AdminInvariant,
]);


export default productionModels;
