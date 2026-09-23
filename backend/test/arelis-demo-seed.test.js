import test, {
  after,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.FRONTEND_URL =
  'https://staff.clinic.example.test';
process.env.CORS_ORIGINS =
  'http://localhost:5173,https://staff.clinic.example.test';

const {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { default: Appointment } = await import(
  '../src/modules/appointments/appointment.model.js'
);
const { default: Clinic } = await import(
  '../src/modules/clinic/clinic.model.js'
);
const { default: Dentist } = await import(
  '../src/modules/dentists/dentist.model.js'
);
const { default: OneTimeToken } = await import(
  '../src/modules/auth/oneTimeToken.model.js'
);
const { default: ServiceCategory } = await import(
  '../src/modules/serviceCategories/serviceCategory.model.js'
);
const { default: Service } = await import(
  '../src/modules/services/service.model.js'
);
const { default: User } = await import(
  '../src/modules/users/user.model.js'
);
const {
  resetMailAdapterForTests,
  setMailAdapterForTests,
} = await import('../src/mail/mail.service.js');
const {
  PRODUCTION_ACKNOWLEDGEMENT,
  assertProductionAcknowledgement,
  seedArelisDemo,
} = await import('../src/seeds/arelisDemo.service.js');

const receptionistEmail = 'receptionist@arelis.example';
const dentistEmail = 'davit.staff@arelis.example';

let admin;
let clinic;
let sentMail;

before(async () => {
  await connectReplTestDatabase();
  await Promise.all([
    User.init(),
    Clinic.init(),
    ServiceCategory.init(),
    Service.init(),
    Dentist.init(),
    OneTimeToken.init(),
  ]);
});

beforeEach(async () => {
  await clearReplTestDatabase();
  clinic = await Clinic.create({
    key: 'default',
    clinicName: 'Ատամնաբուժական կլինիկա',
    translations: {
      hy: { clinicName: 'Ատամնաբուժական կլինիկա' },
    },
    phone: '+37411111111',
  });
  admin = await User.create({
    name: 'Production Admin',
    email: 'admin@arelis.example',
    password: 'secure-admin-password',
    role: 'admin',
    isActive: true,
    isSetupComplete: true,
  });
  sentMail = [];
  setMailAdapterForTests({
    async send(message) {
      sentMail.push(message);
    },
  });
});

after(async () => {
  resetMailAdapterForTests();
  await disconnectReplTestDatabase();
});

test('production acknowledgement is exact and preview-local emails fail closed', async () => {
  assert.throws(
    () => assertProductionAcknowledgement({
      nodeEnv: 'production',
      acknowledgement: 'true',
    }),
    /documented acknowledgement/
  );
  assert.doesNotThrow(() => assertProductionAcknowledgement({
    nodeEnv: 'production',
    acknowledgement: PRODUCTION_ACKNOWLEDGEMENT,
  }));
  await assert.rejects(
    seedArelisDemo({
      receptionistEmail: 'reception@preview.local',
      dentistEmail,
    }),
    /preview-local/
  );
  assert.equal(sentMail.length, 0);
});

test('seed is idempotent, preserves the admin, and creates pending linked staff once', async () => {
  const adminBefore = await User.findById(admin._id)
    .select('+password +dentistProfile')
    .lean();

  const first = await seedArelisDemo({
    receptionistEmail,
    dentistEmail,
  });
  assert.deepEqual(first, {
    clinicId: clinic._id,
    categories: 9,
    services: 19,
    dentists: 5,
    staff: 2,
    invitationsSent: 2,
  });

  const davit = await Dentist.findOne({ slug: 'davit-petrosyan' });
  const receptionist = await User.findOne({ email: receptionistEmail })
    .select('+password +dentistProfile');
  const dentist = await User.findOne({ email: dentistEmail })
    .select('+password +dentistProfile');

  assert.equal(receptionist.name, 'Lusine Grigoryan');
  assert.equal(receptionist.role, 'receptionist');
  assert.equal(receptionist.isActive, false);
  assert.equal(receptionist.isSetupComplete, false);
  assert.equal(receptionist.password, undefined);
  assert.equal(receptionist.dentistProfile, null);
  assert.equal(String(receptionist.invitedBy), String(admin._id));
  assert.equal(dentist.name, 'Davit Petrosyan');
  assert.equal(dentist.role, 'dentist');
  assert.equal(dentist.isActive, false);
  assert.equal(dentist.isSetupComplete, false);
  assert.equal(dentist.password, undefined);
  assert.equal(String(dentist.dentistProfile), String(davit._id));
  assert.equal(String(dentist.invitedBy), String(admin._id));

  assert.deepEqual(
    sentMail.map(({ to }) => to).sort(),
    [dentistEmail, receptionistEmail].sort()
  );
  assert.equal(await ServiceCategory.countDocuments({}), 9);
  assert.equal(await Service.countDocuments({}), 19);
  assert.equal(await Dentist.countDocuments({}), 5);
  assert.equal(await User.countDocuments({}), 3);
  assert.equal(await OneTimeToken.countDocuments({ purpose: 'invite' }), 2);
  assert.equal(await Appointment.countDocuments({}), 0);
  assert.equal((await Clinic.findOne({ key: 'default' })).phone, '+37411111111');

  const second = await seedArelisDemo({
    receptionistEmail,
    dentistEmail,
  });
  assert.equal(second.invitationsSent, 0);
  assert.equal(String(second.clinicId), String(clinic._id));
  assert.equal(sentMail.length, 2);
  assert.equal(await ServiceCategory.countDocuments({}), 9);
  assert.equal(await Service.countDocuments({}), 19);
  assert.equal(await Dentist.countDocuments({}), 5);
  assert.equal(await User.countDocuments({}), 3);
  assert.equal(await OneTimeToken.countDocuments({ purpose: 'invite' }), 2);

  const adminAfter = await User.findById(admin._id)
    .select('+password +dentistProfile')
    .lean();
  assert.deepEqual(adminAfter, adminBefore);
});

test('conflicting staff data aborts before catalog or invitation changes', async () => {
  await User.create({
    name: 'Different Person',
    email: receptionistEmail,
    password: 'another-secure-password',
    role: 'receptionist',
    isActive: true,
    isSetupComplete: true,
  });

  await assert.rejects(
    seedArelisDemo({ receptionistEmail, dentistEmail }),
    /seed conflict/
  );
  assert.equal(await ServiceCategory.countDocuments({}), 0);
  assert.equal(await Service.countDocuments({}), 0);
  assert.equal(await Dentist.countDocuments({}), 0);
  assert.equal(sentMail.length, 0);
  assert.equal((await Clinic.findById(clinic._id)).clinicName,
    'Ատամնաբուժական կլինիկա');
  assert.equal((await User.findById(admin._id)).name, 'Production Admin');
});

test('changed staff emails cannot duplicate seeded identities or dentist links', async () => {
  await seedArelisDemo({ receptionistEmail, dentistEmail });
  sentMail = [];

  await assert.rejects(
    seedArelisDemo({
      receptionistEmail: 'other.receptionist@arelis.example',
      dentistEmail,
    }),
    /Lusine Grigoryan already has current staff access/
  );
  await assert.rejects(
    seedArelisDemo({
      receptionistEmail,
      dentistEmail: 'other.dentist@arelis.example',
    }),
    /already has current staff access/
  );
  assert.equal(sentMail.length, 0);
  assert.equal(await User.countDocuments({}), 3);
  assert.equal(await OneTimeToken.countDocuments({ purpose: 'invite' }), 2);
});
