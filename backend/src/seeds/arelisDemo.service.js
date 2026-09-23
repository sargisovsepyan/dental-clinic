import { isDeepStrictEqual } from 'node:util';

import Appointment from '../modules/appointments/appointment.model.js';
import Clinic from '../modules/clinic/clinic.model.js';
import Dentist from '../modules/dentists/dentist.model.js';
import ServiceCategory from '../modules/serviceCategories/serviceCategory.model.js';
import Service from '../modules/services/service.model.js';
import User from '../modules/users/user.model.js';
import { inviteStaff } from '../modules/staff/staff.service.js';
import runTransaction from '../utils/runTransaction.js';
import { isEmail } from '../../../shared/booking-input.mjs';

import { ArelisDemoData } from './arelisDemo.data.js';

const PRODUCTION_ACKNOWLEDGEMENT =
  'confirmed-preserve-admin-and-seed-demo-content';

const normalize = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

const projectShape = (actual, expected) => {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      ? expected.map((entry, index) => projectShape(actual[index], entry))
      : actual;
  }
  if (expected?.constructor?.name === 'ObjectId') {
    return actual;
  }
  if (expected && typeof expected === 'object') {
    return Object.fromEntries(
      Object.entries(expected).map(([key, value]) => [
        key,
        projectShape(actual?.[key], value),
      ])
    );
  }
  return actual;
};

const matchesShape = (actual, expected) => isDeepStrictEqual(
  normalize(projectShape(actual, expected)),
  normalize(expected)
);

const assertExpectedRecord = (kind, slug, actual, expected) => {
  if (!matchesShape(actual, expected)) {
    const differingFields = Object.keys(expected)
      .filter((field) => !matchesShape(actual?.[field], expected[field]))
      .join(', ');
    throw new Error(
      `Arelis demo seed conflict: existing ${kind} "${slug}" differs from the approved fixture (${differingFields})`
    );
  }
};

const normalizeEmail = (value, fieldName) => {
  const email = String(value || '').trim().toLowerCase();
  if (!isEmail(email, true)) {
    throw new Error(`${fieldName} must be a valid email address`);
  }
  if (email.endsWith('@preview.local')) {
    throw new Error(`${fieldName} cannot use a preview-local address`);
  }
  return email;
};

const assertProductionAcknowledgement = ({
  nodeEnv = process.env.NODE_ENV,
  acknowledgement = process.env.ARELIS_DEMO_SEED_ACK,
} = {}) => {
  if (
    nodeEnv === 'production' &&
    acknowledgement !== PRODUCTION_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      'Production Arelis demo seed requires the documented acknowledgement'
    );
  }
};

const assertClinicCompatibility = (clinic, defaults) => {
  const desired = ArelisDemoData.clinic;
  const simpleFields = [
    'clinicName',
    'tagline',
    'description',
    'address',
    'mapUrl',
  ];

  for (const field of simpleFields) {
    const current = clinic[field];
    const allowed = [desired[field], defaults[field], '', undefined, null];
    if (
      field === 'clinicName' &&
      current === 'Ատամնաբուժական կլինիկա'
    ) {
      continue;
    }
    if (!allowed.some((value) => isDeepStrictEqual(current, value))) {
      throw new Error(
        `Arelis demo seed conflict: clinic ${field} contains production content`
      );
    }
  }

  for (const locale of ['hy', 'ru', 'en']) {
    for (const field of ['clinicName', 'tagline', 'description', 'address']) {
      const current = clinic.translations?.[locale]?.[field];
      const desiredValue = desired.translations[locale][field];
      if (
        current !== undefined &&
        current !== '' &&
        current !== desiredValue &&
        !(locale === 'hy' && field === 'clinicName' &&
          current === 'Ատամնաբուժական կլինիկա')
      ) {
        throw new Error(
          `Arelis demo seed conflict: clinic ${locale}.${field} contains production content`
        );
      }
    }
  }

  for (const field of ['weeklySchedule', 'bookingSettings']) {
    if (
      !matchesShape(clinic[field], desired[field]) &&
      !matchesShape(clinic[field], defaults[field])
    ) {
      throw new Error(
        `Arelis demo seed conflict: clinic ${field} contains production settings`
      );
    }
  }
};

const getExistingAdmin = async () => {
  const admin = await User.findOne({
    role: 'admin',
    isActive: true,
    isSetupComplete: { $ne: false },
    deactivatedAt: null,
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('+dentistProfile');

  if (!admin) {
    throw new Error(
      'Arelis demo seed requires an existing active, setup-complete admin'
    );
  }
  return admin;
};

const assertPendingStaff = ({
  user,
  expected,
  dentistProfile = null,
  adminId,
}) => {
  if (!user) {
    return { exists: false, needsTranslations: false };
  }

  const expectedProfile = dentistProfile ? String(dentistProfile) : '';
  const actualProfile = user.dentistProfile
    ? String(user.dentistProfile)
    : '';
  const translations = user.nameTranslations?.toObject?.() ||
    user.nameTranslations;
  const translationsMatch = translations === undefined ||
    matchesShape(translations, expected.nameTranslations);

  if (
    user.name !== expected.name ||
    user.role !== expected.role ||
    user.isActive !== false ||
    user.isSetupComplete !== false ||
    user.deactivatedAt !== null ||
    actualProfile !== expectedProfile ||
    String(user.invitedBy || '') !== String(adminId) ||
    !translationsMatch
  ) {
    throw new Error(
      `Arelis demo seed conflict: staff email ${user.email} is already in use`
    );
  }

  return {
    exists: true,
    needsTranslations: translations === undefined,
  };
};

const reconcileStaff = async ({
  email,
  expected,
  dentistProfile = null,
  admin,
}) => {
  let user = await User.findOne({ email })
    .select('+dentistProfile');
  const state = assertPendingStaff({
    user,
    expected,
    dentistProfile,
    adminId: admin._id,
  });
  let invitationSent = false;

  if (!state.exists) {
    await inviteStaff({
      name: expected.name,
      email,
      role: expected.role,
      ...(dentistProfile ? { dentistProfileId: dentistProfile } : {}),
    }, admin._id);
    invitationSent = true;
    user = await User.findOne({ email }).select('+dentistProfile');
  }

  if (state.needsTranslations || invitationSent) {
    await User.updateOne(
      {
        _id: user._id,
        isSetupComplete: false,
        deactivatedAt: null,
      },
      { $set: { nameTranslations: expected.nameTranslations } },
      { runValidators: true }
    );
  }

  return invitationSent;
};

const seedCatalogAndTeam = async ({
  receptionistEmail,
  dentistEmail,
  admin,
}) => runTransaction(async (session) => {
  const clinicCount = await Clinic.countDocuments({}).session(session);
  const clinic = await Clinic.findOne({ key: 'default' })
    .select('+bookingGuardVersion')
    .session(session);
  if (!clinic || clinicCount !== 1) {
    throw new Error(
      'Arelis demo seed requires exactly one existing default clinic singleton'
    );
  }

  const defaults = new Clinic({ key: 'default' }).toObject();
  assertClinicCompatibility(clinic.toObject(), defaults);

  const scheduleChanged =
    !matchesShape(clinic.weeklySchedule, ArelisDemoData.clinic.weeklySchedule) ||
    !matchesShape(clinic.bookingSettings, ArelisDemoData.clinic.bookingSettings);
  if (scheduleChanged && await Appointment.exists({}).session(session)) {
    throw new Error(
      'Arelis demo seed will not replace clinic scheduling settings after appointments exist'
    );
  }

  const clinicChanged = !matchesShape(
    clinic.toObject(),
    ArelisDemoData.clinic
  );
  if (clinicChanged) {
    clinic.set(ArelisDemoData.clinic);
    if (scheduleChanged) {
      clinic.scheduleRevision = (clinic.scheduleRevision || 0) + 1;
      clinic.bookingGuardVersion = (clinic.bookingGuardVersion || 0) + 1;
    }
    await clinic.save({ session });
  }

  const categories = new Map();
  for (const definition of ArelisDemoData.categories) {
    let category = await ServiceCategory.findOne({ slug: definition.slug })
      .session(session);
    if (category) {
      assertExpectedRecord(
        'service category',
        definition.slug,
        category.toObject(),
        definition
      );
    }
    else {
      [category] = await ServiceCategory.create([definition], { session });
    }
    categories.set(definition.slug, category);
  }

  const services = new Map();
  for (const definition of ArelisDemoData.services) {
    const { categorySlug, ...fields } = definition;
    const expected = {
      ...fields,
      category: categories.get(categorySlug)._id,
    };
    let service = await Service.findOne({ slug: definition.slug })
      .session(session);
    if (service) {
      assertExpectedRecord(
        'service',
        definition.slug,
        service.toObject(),
        expected
      );
    }
    else {
      [service] = await Service.create([expected], { session });
    }
    services.set(definition.slug, service);
  }

  const dentists = new Map();
  for (const definition of ArelisDemoData.dentists) {
    const { serviceSlugs, ...fields } = definition;
    const expected = {
      ...fields,
      services: serviceSlugs.map((slug) => services.get(slug)._id),
    };
    let dentist = await Dentist.findOne({ slug: definition.slug })
      .session(session);
    if (dentist) {
      assertExpectedRecord(
        'dentist',
        definition.slug,
        dentist.toObject(),
        expected
      );
    }
    else {
      [dentist] = await Dentist.create([expected], { session });
    }
    dentists.set(definition.slug, dentist);
  }

  const davit = dentists.get(ArelisDemoData.staff.dentist.dentistSlug);
  const staffByEmail = new Map(
    (await User.find({
      email: { $in: [receptionistEmail, dentistEmail] },
    }).select('+dentistProfile').session(session))
      .map((user) => [user.email, user])
  );
  assertPendingStaff({
    user: staffByEmail.get(receptionistEmail),
    expected: ArelisDemoData.staff.receptionist,
    adminId: admin._id,
  });
  assertPendingStaff({
    user: staffByEmail.get(dentistEmail),
    expected: ArelisDemoData.staff.dentist,
    dentistProfile: davit._id,
    adminId: admin._id,
  });

  const conflictingReceptionistIdentity = await User.exists({
    name: ArelisDemoData.staff.receptionist.name,
    role: 'receptionist',
    deactivatedAt: null,
    email: { $ne: receptionistEmail },
  }).session(session);
  if (conflictingReceptionistIdentity) {
    throw new Error(
      'Arelis demo seed conflict: Lusine Grigoryan already has current staff access'
    );
  }

  const conflictingDentistLink = await User.exists({
    dentistProfile: davit._id,
    deactivatedAt: null,
    email: { $ne: dentistEmail },
  }).session(session);
  if (conflictingDentistLink) {
    throw new Error(
      'Arelis demo seed conflict: Davit Petrosyan already has current staff access'
    );
  }

  return { clinic, davit };
});

const seedArelisDemo = async ({
  receptionistEmail: rawReceptionistEmail,
  dentistEmail: rawDentistEmail,
}) => {
  const receptionistEmail = normalizeEmail(
    rawReceptionistEmail,
    'ARELIS_DEMO_RECEPTIONIST_EMAIL'
  );
  const dentistEmail = normalizeEmail(
    rawDentistEmail,
    'ARELIS_DEMO_DENTIST_EMAIL'
  );
  if (receptionistEmail === dentistEmail) {
    throw new Error('Arelis demo staff emails must be different');
  }

  const admin = await getExistingAdmin();
  const { clinic, davit } = await seedCatalogAndTeam({
    receptionistEmail,
    dentistEmail,
    admin,
  });

  const receptionistInvitationSent = await reconcileStaff({
    email: receptionistEmail,
    expected: ArelisDemoData.staff.receptionist,
    admin,
  });
  const dentistInvitationSent = await reconcileStaff({
    email: dentistEmail,
    expected: ArelisDemoData.staff.dentist,
    dentistProfile: davit._id,
    admin,
  });

  return {
    clinicId: clinic._id,
    categories: ArelisDemoData.categories.length,
    services: ArelisDemoData.services.length,
    dentists: ArelisDemoData.dentists.length,
    staff: 2,
    invitationsSent:
      Number(receptionistInvitationSent) + Number(dentistInvitationSent),
  };
};

export {
  PRODUCTION_ACKNOWLEDGEMENT,
  assertProductionAcknowledgement,
  seedArelisDemo,
};
