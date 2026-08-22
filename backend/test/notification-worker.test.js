import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';
process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.CLINIC_NOTIFICATION_EMAIL = 'reception@example.test';

const {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedCore, seedStaff, publicBooking } = await import('../test-support/fixtures.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: NotificationJob } = await import(
  '../src/modules/notifications/notificationJob.model.js'
);
const {
  abortableDelay,
  claimNextNotification,
  classifyDeliveryError,
  createNotificationWorker,
} = await import('../src/modules/notifications/notificationWorker.service.js');
const { createChannelRegistry } = await import(
  '../src/modules/notifications/channels/channelRegistry.js'
);
const {
  assertSafeMailMessage,
} = await import('../src/mail/smtp.adapter.js');
const {
  sendNotificationEmail,
} = await import('../src/mail/mail.service.js');
const {
  renderPatientEmail,
  formatOccurrence,
} = await import(
  '../src/modules/notifications/templates/appointmentEmail.templates.js'
);
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
);
const { createWorkerShutdownController } = await import(
  '../src/scripts/notificationWorker.js'
);

let core;
let staff;

before(connectReplTestDatabase);
beforeEach(async () => {
  await clearReplTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
});
after(disconnectReplTestDatabase);

const create = async (startTime = '09:00', suffix = '801', locale = 'hy') => (
  appointmentService.createAppointment({
    ...publicBooking(core, startTime, suffix),
    locale,
  })
);

const prioritize = async (appointmentId, eventType, now = new Date()) => {
  await NotificationJob.collection.updateMany(
    {
      appointment: appointmentId,
      eventType: { $ne: eventType },
      status: { $in: ['pending', 'retry'] },
    },
    { $set: { nextAttemptAt: new Date(now.getTime() + 60 * 60 * 1000) } }
  );
  await NotificationJob.collection.updateOne(
    { appointment: appointmentId, eventType },
    {
      $set: {
        dueAt: new Date(now.getTime() - 1000),
        nextAttemptAt: new Date(now.getTime() - 1000),
      },
    }
  );
  return NotificationJob.findOne({ appointment: appointmentId, eventType }).lean();
};

const fakeRegistry = (deliver) => createChannelRegistry({
  emailDelivery: deliver,
});


test('worker sends a due localized job through an injected adapter and marks it sent', async () => {
  const appointment = await create('09:00', '811', 'ru');
  await Appointment.updateOne(
    { _id: appointment._id },
    { $set: { patientName: '<img src=x onerror=alert(1)>' } },
    { runValidators: false }
  );
  await prioritize(appointment._id, 'appointment_received');
  const messages = [];
  const worker = createNotificationWorker({
    ownerId: 'worker-success',
    concurrency: 1,
    channelRegistry: fakeRegistry(async (message) => {
      messages.push(message);
    }),
  });

  assert.deepEqual(await worker.runOnce(), { status: 'sent' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'patient@example.com');
  assert.equal(messages[0].subject, 'Ваша заявка на приём получена');
  assert.match(messages[0].text, /Она ещё не подтверждена/);
  assert.doesNotMatch(messages[0].html, /<img src=x/);
  assert.match(messages[0].html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(messages[0].messageId, /^<[a-f0-9]{64}@notifications\.invalid>$/);
  const stored = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).lean();
  assert.equal(stored.status, 'sent');
  assert.ok(stored.sentAt instanceof Date);
  assert.ok(stored.purgeAt instanceof Date);
});


test('clinic delivery always uses the operational recipient, not mutable public Clinic.email', async () => {
  const appointment = await create('10:00', '812');
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { email: 'reroute@example.test' } }
  );
  await prioritize(appointment._id, 'clinic_new_booking');
  let message;
  const worker = createNotificationWorker({
    ownerId: 'worker-clinic',
    concurrency: 1,
    channelRegistry: fakeRegistry(async (candidate) => { message = candidate; }),
  });
  await worker.runOnce();
  assert.equal(message.to, 'reception@example.test');
  assert.equal(message.subject, 'New online booking');
  assert.doesNotMatch(message.subject, /Test Patient|374|09:00/);
  assert.doesNotMatch(message.text, /patient@example\.com|internal|comment/i);
});


test('atomic claims allow one owner, protect active leases, and reclaim only after expiry', async () => {
  const appointment = await create('11:00', '813');
  const now = new Date();
  await prioritize(appointment._id, 'appointment_received', now);
  const claims = await Promise.all([
    claimNextNotification({ ownerId: 'worker-a', now, leaseMs: 60_000 }),
    claimNextNotification({ ownerId: 'worker-b', now, leaseMs: 60_000 }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find(Boolean);
  assert.equal(first.job.attempts, 1);

  assert.equal(
    await claimNextNotification({
      ownerId: 'worker-c',
      now: new Date(now.getTime() + 30_000),
      leaseMs: 60_000,
    }),
    null
  );
  const reclaimed = await claimNextNotification({
    ownerId: 'worker-c',
    now: new Date(now.getTime() + 60_001),
    leaseMs: 60_000,
  });
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.job.attempts, 2);
  assert.notEqual(reclaimed.job.leaseToken, first.job.leaseToken);
});


test('expired claims are reclaimed before new due work under backlog', async () => {
  const expiredAppointment = await create('11:30', '831');
  const dueAppointment = await create('14:30', '832');
  const now = new Date();
  await prioritize(expiredAppointment._id, 'appointment_received', now);
  const original = await claimNextNotification({
    ownerId: 'dead-worker',
    now,
    leaseMs: 10_000,
  });
  await NotificationJob.collection.updateOne(
    { _id: original.job._id },
    { $set: { leaseExpiresAt: new Date(now.getTime() - 1) } }
  );
  await prioritize(dueAppointment._id, 'appointment_received', now);

  const recovered = await claimNextNotification({
    ownerId: 'recovery-worker',
    now,
    leaseMs: 60_000,
  });
  assert.equal(recovered.reclaimed, true);
  assert.equal(String(recovered.job._id), String(original.job._id));
});


test('transient failures retry durably and exhaustion becomes terminal with sanitized metadata', async () => {
  const appointment = await create('12:00', '814');
  await prioritize(appointment._id, 'appointment_received');
  await NotificationJob.collection.updateOne(
    { appointment: appointment._id, eventType: 'appointment_received' },
    { $set: { maxAttempts: 2 } }
  );
  const worker = createNotificationWorker({
    ownerId: 'worker-retry',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => {
      const error = new Error('patient@example.com SMTP secret dialogue');
      error.code = 'ECONNECTION';
      throw error;
    }),
  });

  assert.equal((await worker.runOnce()).status, 'retry');
  let stored = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).lean();
  assert.equal(stored.status, 'retry');
  assert.equal(stored.lastErrorCategory, 'connection');
  assert.equal(JSON.stringify(stored).includes('patient@example.com'), false);
  assert.equal(JSON.stringify(stored).includes('secret dialogue'), false);

  await NotificationJob.collection.updateOne(
    { _id: stored._id },
    { $set: { nextAttemptAt: new Date(Date.now() - 1000) } }
  );
  assert.equal((await worker.runOnce()).status, 'failed');
  stored = await NotificationJob.findById(stored._id).lean();
  assert.equal(stored.status, 'failed');
  assert.equal(stored.attempts, 2);
  assert.ok(stored.failedAt instanceof Date);
  assert.ok(stored.purgeAt instanceof Date);
});


test('permanent recipient rejection fails immediately without retaining provider response', async () => {
  const appointment = await create('13:00', '815');
  await prioritize(appointment._id, 'appointment_received');
  const worker = createNotificationWorker({
    ownerId: 'worker-permanent',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => {
      const error = new Error('550 patient@example.com rejected');
      error.code = 'EENVELOPE';
      error.responseCode = 550;
      error.response = 'recipient and provider details';
      throw error;
    }),
  });
  assert.equal((await worker.runOnce()).status, 'failed');
  const stored = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).lean();
  assert.equal(stored.lastErrorCategory, 'recipient_rejected');
  assert.equal(stored.lastResponseCode, 550);
  assert.equal(JSON.stringify(stored).includes('recipient and provider'), false);
});


test('temporary SMTP envelope rejection remains retryable', () => {
  assert.deepEqual(
    classifyDeliveryError({ code: 'EENVELOPE', responseCode: 450 }),
    {
      permanent: false,
      category: 'recipient_rejected',
      code: 'EENVELOPE',
      responseCode: 450,
    }
  );
});


test('arbitrary provider error codes are replaced before persistence or logging', async () => {
  const sensitiveCode = 'TOKEN_patient@example.com_super-secret';
  assert.deepEqual(
    classifyDeliveryError({ code: sensitiveCode }),
    {
      permanent: false,
      category: 'unknown',
      code: 'DELIVERY_FAILED',
      responseCode: null,
    }
  );

  const appointment = await create('13:30', '833');
  await prioritize(appointment._id, 'appointment_received');
  const worker = createNotificationWorker({
    ownerId: 'worker-unsafe-provider-code',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => {
      const error = new Error('provider response with private values');
      error.code = sensitiveCode;
      throw error;
    }),
  });
  assert.equal((await worker.runOnce()).status, 'retry');
  const stored = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).lean();
  assert.equal(stored.lastErrorCode, 'DELIVERY_FAILED');
  assert.equal(JSON.stringify(stored).includes('patient@example.com'), false);
  assert.equal(JSON.stringify(stored).includes('super-secret'), false);
});


test('cancellation after claim fences the worker before SMTP and preserves cancellation state', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('14:00', '816');
  await prioritize(appointment._id, 'appointment_reminder');
  let sends = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-cancel-race',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
    beforeDelivery: async () => {
      await appointmentService.cancelAppointment(
        appointment._id,
        staff.admin._id,
        'race cancellation'
      );
    },
  });
  await worker.runOnce();
  assert.equal(sends, 0);
  const reminder = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_reminder',
  }).lean();
  assert.equal(reminder.status, 'cancelled');
  assert.equal(reminder.cancellationCode, 'appointment_cancelled');
});


test('reschedule after reminder claim fences stale delivery and schedules the new occurrence', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('09:00', '817');
  await prioritize(appointment._id, 'appointment_reminder');
  let sends = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-reschedule-race',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
    beforeDelivery: async () => {
      await appointmentService.rescheduleAppointment(
        appointment._id,
        { date: core.date, startTime: '16:00' },
        staff.admin._id
      );
    },
  });
  await worker.runOnce();
  assert.equal(sends, 0);
  const reminders = await NotificationJob.find({
    appointment: appointment._id,
    eventType: 'appointment_reminder',
  }).sort({ scheduleRevision: 1 }).lean();
  assert.deepEqual(
    reminders.map(({ status }) => status),
    ['cancelled', 'pending']
  );
});


test('authoritative reminder eligibility skips a stale queued job for terminal appointment state', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('15:00', '818');
  await prioritize(appointment._id, 'appointment_reminder');
  await Appointment.collection.updateOne(
    { _id: appointment._id },
    { $set: { status: 'no_show' } }
  );
  let sends = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-skip',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
  });
  assert.deepEqual(
    await worker.runOnce(),
    { status: 'cancelled', code: 'reminder_ineligible' }
  );
  assert.equal(sends, 0);
});


test('post-template send fence rechecks reminder time using a fresh clock value', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('15:30', '834');
  let currentTime = new Date();
  await prioritize(appointment._id, 'appointment_reminder', currentTime);
  let sends = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-fresh-send-fence',
    concurrency: 1,
    leaseMs: 30 * 24 * 60 * 60 * 1000,
    clock: () => new Date(currentTime),
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
    beforeSendFence: async () => {
      currentTime = new Date(new Date(appointment.startAt).getTime() + 1);
    },
  });
  assert.deepEqual(
    await worker.runOnce(),
    { status: 'cancelled', code: 'reminder_ineligible' }
  );
  assert.equal(sends, 0);
});


test('lost heartbeat prevents delivery and leaves an expired claim reclaimable', async () => {
  const appointment = await create('16:00', '835');
  await prioritize(appointment._id, 'appointment_received');
  let sends = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-lost-heartbeat',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
    beforeSendFence: async ({ job }) => {
      await NotificationJob.collection.updateOne(
        { _id: job._id },
        {
          $set: {
            leaseToken: 'replacement-token',
            leaseExpiresAt: new Date(Date.now() - 1),
          },
        }
      );
    },
  });
  assert.deepEqual(await worker.runOnce(), { status: 'lease_lost' });
  assert.equal(sends, 0);

  const recovery = createNotificationWorker({
    ownerId: 'worker-heartbeat-recovery',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => { sends += 1; }),
  });
  assert.deepEqual(await recovery.runOnce(), { status: 'sent' });
  assert.equal(sends, 1);
});


test('SMTP accepted/DB-unrecorded crash window reuses deterministic Message-ID on reclaim', async () => {
  const appointment = await create('16:00', '819');
  await prioritize(appointment._id, 'appointment_received');
  const messageIds = [];
  let deliveries = 0;
  const worker = createNotificationWorker({
    ownerId: 'worker-crash-window',
    concurrency: 1,
    channelRegistry: fakeRegistry(async (message) => {
      deliveries += 1;
      messageIds.push(message.messageId);
      if (deliveries === 1) {
        await NotificationJob.collection.updateOne(
          {
            appointment: appointment._id,
            eventType: 'appointment_received',
          },
          { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
        );
      }
    }),
  });
  assert.equal((await worker.runOnce()).status, 'delivery_result_unrecorded');
  assert.equal((await worker.runOnce()).status, 'sent');
  assert.equal(deliveries, 2);
  assert.equal(messageIds[0], messageIds[1]);
});


test('expired final-attempt leases are terminalized instead of becoming stuck', async () => {
  const appointment = await create('17:00', '820');
  await prioritize(appointment._id, 'appointment_received');
  const claimed = await claimNextNotification({
    ownerId: 'dead-worker',
    now: new Date(),
    leaseMs: 10_000,
  });
  await NotificationJob.collection.updateOne(
    { _id: claimed.job._id },
    {
      $set: {
        attempts: 1,
        maxAttempts: 1,
        leaseExpiresAt: new Date(Date.now() - 1000),
      },
    }
  );
  await claimNextNotification({ ownerId: 'recovery-worker', now: new Date() });
  const stored = await NotificationJob.findById(claimed.job._id).lean();
  assert.equal(stored.status, 'failed');
  assert.equal(stored.lastErrorCode, 'lease_expired_after_final_attempt');
});


test('template formatting is timezone-explicit and mail boundary rejects header/multi-recipient injection', async () => {
  const occurrence = {
    startAt: new Date('2026-11-01T05:30:00.000Z'),
    endAt: new Date('2026-11-01T06:30:00.000Z'),
    serviceName: 'Cleaning',
    serviceNames: { hy: 'Մաքրում' },
    dentistName: 'Ani <script>',
  };
  assert.notEqual(
    formatOccurrence(occurrence, 'en', 'America/New_York'),
    formatOccurrence(occurrence, 'en', 'Asia/Yerevan')
  );
  const rendered = renderPatientEmail({
    eventType: 'appointment_confirmed',
    locale: null,
    patientName: 'Անի <b>',
    confirmationCode: 'DC-ABC',
    eventSnapshot: { after: occurrence },
    clinic: { name: 'Կլինիկա & Co', phone: '', address: '' },
    timeZone: 'America/New_York',
  });
  assert.equal(rendered.locale, 'hy');
  assert.match(rendered.html, /&lt;b&gt;/);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.html, /&amp; Co/);

  assert.throws(() => assertSafeMailMessage({
    to: 'patient@example.test,attacker@example.test',
    subject: 'Safe',
    text: 'Body',
  }), /single-mailbox/);
  assert.throws(() => assertSafeMailMessage({
    to: 'patient@example.test',
    subject: 'Safe\r\nBcc: attacker@example.test',
    text: 'Body',
  }), /subject/);
});


test('tests fail closed without an explicitly injected mail adapter and worker shutdown is bounded', async () => {
  await assert.rejects(
    sendNotificationEmail({
      to: 'patient@example.test',
      subject: 'Fixed',
      text: 'Body',
    }),
    /Tests must inject a fake mail adapter/
  );

  const controller = new AbortController();
  controller.abort();
  const worker = createNotificationWorker({
    ownerId: 'worker-shutdown',
    concurrency: 1,
    channelRegistry: fakeRegistry(async () => {}),
  });
  await worker.run({ signal: controller.signal });
});


test('shutdown stops new claims and waits only for the current delivery to settle', async () => {
  const appointment = await create('17:00', '836');
  await prioritize(appointment._id, 'appointment_received');
  let announceDelivery;
  const deliveryStarted = new Promise((resolve) => { announceDelivery = resolve; });
  let releaseDelivery;
  const deliveryReleased = new Promise((resolve) => { releaseDelivery = resolve; });
  const controller = new AbortController();
  const worker = createNotificationWorker({
    ownerId: 'worker-inflight-shutdown',
    concurrency: 1,
    pollIntervalMs: 5,
    channelRegistry: fakeRegistry(async () => {
      announceDelivery();
      await deliveryReleased;
    }),
  });

  const running = worker.run({ signal: controller.signal });
  await deliveryStarted;
  controller.abort();
  const earlyResult = await Promise.race([
    running.then(() => 'stopped'),
    new Promise((resolve) => setTimeout(() => resolve('waiting'), 20)),
  ]);
  assert.equal(earlyResult, 'waiting');

  releaseDelivery();
  const finalResult = await Promise.race([
    running.then(() => 'stopped'),
    new Promise((resolve) => setTimeout(() => resolve('timed_out'), 1000)),
  ]);
  assert.equal(finalResult, 'stopped');
  const stored = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).lean();
  assert.equal(stored.status, 'sent');
});


test('standalone worker enforces the configured hard shutdown deadline', async () => {
  const controller = new AbortController();
  let forcedExitCode = null;
  const shutdown = createWorkerShutdownController({
    controller,
    timeoutMs: 10,
    onForcedExit: (code) => { forcedExitCode = code; },
  });
  shutdown.stop('test');
  assert.equal(controller.signal.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(forcedExitCode, 1);
  shutdown.clear();
});


test('idle polling removes abort listeners after every completed delay', async () => {
  const controller = new AbortController();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await abortableDelay(1, controller.signal);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});
