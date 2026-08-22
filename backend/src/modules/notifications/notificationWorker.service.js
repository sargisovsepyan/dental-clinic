import crypto from 'node:crypto';

import env from '../../config/env.js';
import logger from '../../observability/logger.js';
import Appointment from '../appointments/appointment.model.js';
import Clinic from '../clinic/clinic.model.js';
import { createChannelRegistry } from './channels/channelRegistry.js';
import NotificationJob from './notificationJob.model.js';
import { terminalPurgeAt } from './notificationOutbox.service.js';
import {
  renderClinicBookingEmail,
  renderPatientEmail,
} from './templates/appointmentEmail.templates.js';


const leaseFilter = (job, now = new Date()) => ({
  _id: job._id,
  status: 'processing',
  leaseOwner: job.leaseOwner,
  leaseToken: job.leaseToken,
  leaseExpiresAt: { $gt: now },
});


const terminalizeExpiredFinalAttempts = async (now = new Date()) => {
  const result = await NotificationJob.updateMany(
    {
      status: 'processing',
      leaseExpiresAt: { $lte: now },
      $expr: { $gte: ['$attempts', '$maxAttempts'] },
    },
    {
      $set: {
        status: 'failed',
        failedAt: now,
        lastErrorCategory: 'unknown',
        lastErrorCode: 'lease_expired_after_final_attempt',
        purgeAt: terminalPurgeAt(now),
      },
      $unset: {
        leaseOwner: '',
        leaseToken: '',
        leaseExpiresAt: '',
        claimedAt: '',
        deliveryStartedAt: '',
      },
    }
  );
  if (result.modifiedCount > 0) {
    logger.error('notification_failed_terminal', {
      reason: 'lease_expired_after_final_attempt',
      count: result.modifiedCount,
    });
  }
  return result;
};


const claimNextNotification = async ({
  ownerId,
  now = new Date(),
  leaseMs = env.NOTIFICATION_WORKER_LEASE_MS,
  sweepExpiredFinalAttempts = true,
}) => {
  if (sweepExpiredFinalAttempts) {
    await terminalizeExpiredFinalAttempts(now);
  }

  const claim = async (filter, reclaimed) => {
    const leaseToken = crypto.randomUUID();
    const job = await NotificationJob.findOneAndUpdate(
      {
        ...filter,
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      {
        $set: {
          status: 'processing',
          leaseOwner: ownerId,
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          claimedAt: now,
        },
        $inc: { attempts: 1 },
        $unset: {
          deliveryStartedAt: '',
          lastErrorCategory: '',
          lastErrorCode: '',
          lastResponseCode: '',
        },
      },
      {
        returnDocument: 'after',
        sort: reclaimed
          ? { leaseExpiresAt: 1, _id: 1 }
          : { nextAttemptAt: 1, _id: 1 },
        runValidators: true,
      }
    )
      .select('+leaseOwner +leaseToken +dedupeKey')
      .lean();
    return job ? { job, reclaimed } : null;
  };

  const expired = await claim({
    status: 'processing',
    leaseExpiresAt: { $lte: now },
  }, true);
  if (expired) {
    return expired;
  }
  return claim({
    status: { $in: ['pending', 'retry'] },
    dueAt: { $lte: now },
    nextAttemptAt: { $lte: now },
  }, false);
};


const scheduleMatches = (appointment, job) => (
  Number(appointment.scheduleRevision || 0) === Number(job.scheduleRevision || 0) &&
  new Date(appointment.startAt).getTime() ===
    new Date(job.eventSnapshot?.after?.startAt).getTime()
);


const notificationEligibility = ({ job, appointment, now }) => {
  if (!appointment) {
    return { eligible: false, code: 'appointment_missing' };
  }
  if (job.channel !== 'email') {
    return { eligible: false, code: 'unsupported_channel' };
  }
  if (job.recipientKind === 'clinic_reception') {
    return (
      job.eventType === 'clinic_new_booking' &&
      appointment.source === 'website'
    )
      ? { eligible: true }
      : { eligible: false, code: 'not_online_booking' };
  }
  if (!appointment.patientEmail) {
    return { eligible: false, code: 'patient_email_missing' };
  }
  if (!scheduleMatches(appointment, job)) {
    return { eligible: false, code: 'schedule_superseded' };
  }

  switch (job.eventType) {
    case 'appointment_received':
      return appointment.status === 'pending'
        ? { eligible: true }
        : { eligible: false, code: 'request_no_longer_pending' };
    case 'appointment_confirmed':
      return appointment.status === 'confirmed'
        ? { eligible: true }
        : { eligible: false, code: 'appointment_not_confirmed' };
    case 'appointment_rescheduled':
      return ['pending', 'confirmed'].includes(appointment.status)
        ? { eligible: true }
        : { eligible: false, code: 'appointment_not_active' };
    case 'appointment_cancelled':
      return (
        appointment.status === 'cancelled' &&
        Number(appointment.mutationVersion || 0) === job.eventRevision
      )
        ? { eligible: true }
        : { eligible: false, code: 'cancellation_superseded' };
    case 'appointment_reminder':
      return (
        appointment.status === 'confirmed' &&
        new Date(appointment.startAt) > now
      )
        ? { eligible: true }
        : { eligible: false, code: 'reminder_ineligible' };
    default:
      return { eligible: false, code: 'unsupported_event' };
  }
};


const clinicView = (clinic, locale) => ({
  name:
    clinic?.translations?.[locale]?.clinicName ||
    clinic?.translations?.hy?.clinicName ||
    clinic?.clinicName ||
    'Dental Clinic',
  phone: clinic?.phone || '',
  address:
    clinic?.translations?.[locale]?.address ||
    clinic?.translations?.hy?.address ||
    clinic?.address ||
    '',
});


const buildDelivery = async ({ job, appointment }) => {
  const clinic = await Clinic.findOne({ key: 'default' })
    .select('clinicName phone address translations')
    .lean();
  if (!clinic) {
    const error = new Error('Clinic notification context is unavailable');
    error.code = 'CLINIC_CONTEXT_MISSING';
    return Promise.reject(error);
  }

  const template = job.recipientKind === 'clinic_reception'
    ? renderClinicBookingEmail({
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        confirmationCode: appointment.confirmationCode,
        eventSnapshot: job.eventSnapshot,
        timeZone: env.CLINIC_TIMEZONE,
      })
    : renderPatientEmail({
        eventType: job.eventType,
        locale: job.locale,
        patientName: appointment.patientName,
        confirmationCode: appointment.confirmationCode,
        eventSnapshot: job.eventSnapshot,
        clinic: clinicView(clinic, job.locale || 'hy'),
        timeZone: env.CLINIC_TIMEZONE,
      });
  const senderDomain = (env.MAIL_FROM.split('@')[1] || 'notifications.invalid')
    .toLowerCase();
  const opaqueId = crypto.createHash('sha256')
    .update('appointment-notification-message\0')
    .update(job.dedupeKey)
    .digest('hex');

  return {
    to: job.recipientKind === 'clinic_reception'
      ? env.CLINIC_NOTIFICATION_EMAIL
      : appointment.patientEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
    messageId: `<${opaqueId}@${senderDomain}>`,
  };
};


const SAFE_DELIVERY_ERROR_CODES = new Set([
  'INVALID_MESSAGE',
  'UNSUPPORTED_CHANNEL',
  'EAUTH',
  'EENVELOPE',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNECTION',
  'ECONNRESET',
  'ECONNREFUSED',
  'EDNS',
]);


const classifyDeliveryError = (error) => {
  const providerCode = String(error?.code || '').toUpperCase();
  const code = SAFE_DELIVERY_ERROR_CODES.has(providerCode)
    ? providerCode
    : 'DELIVERY_FAILED';
  const responseCode = (
    Number.isInteger(error?.responseCode) &&
    error.responseCode >= 100 &&
    error.responseCode <= 999
  )
    ? error.responseCode
    : null;
  if (code === 'INVALID_MESSAGE') {
    return {
      permanent: true,
      category: 'invalid_message',
      code,
      responseCode,
    };
  }
  if (code === 'UNSUPPORTED_CHANNEL') {
    return {
      permanent: true,
      category: 'unsupported_channel',
      code,
      responseCode,
    };
  }
  if (code === 'EAUTH') {
    return {
      permanent: true,
      category: 'authentication',
      code,
      responseCode,
    };
  }
  if (responseCode && responseCode >= 500) {
    return {
      permanent: true,
      category: 'recipient_rejected',
      code: code === 'EENVELOPE'
        ? code
        : 'SMTP_PERMANENT_REJECTION',
      responseCode,
    };
  }
  if (code === 'EENVELOPE') {
    return {
      permanent: false,
      category: 'recipient_rejected',
      code,
      responseCode,
    };
  }
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) {
    return { permanent: false, category: 'timeout', code, responseCode };
  }
  if (['ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'EDNS'].includes(code)) {
    return { permanent: false, category: 'connection', code, responseCode };
  }
  if (error?.permanent) {
    return {
      permanent: true,
      category: 'unknown',
      code: 'DELIVERY_FAILED',
      responseCode,
    };
  }
  return {
    permanent: false,
    category: 'unknown',
    code: 'DELIVERY_FAILED',
    responseCode,
  };
};


const retryDelayMs = (job) => {
  const base = env.NOTIFICATION_RETRY_BASE_SECONDS * 1000;
  const cap = env.NOTIFICATION_RETRY_MAX_SECONDS * 1000;
  const exponential = Math.min(cap, base * (2 ** Math.max(0, job.attempts - 1)));
  const digest = crypto.createHash('sha256')
    .update(`${job._id}:${job.attempts}`)
    .digest();
  const jitter = Math.floor(exponential * 0.2 * (digest.readUInt16BE(0) / 65535));
  return Math.min(cap, exponential + jitter);
};


const cancelClaim = async (job, code, now) => NotificationJob.updateOne(
  leaseFilter(job, now),
  {
    $set: {
      status: 'cancelled',
      cancelledAt: now,
      cancellationCode: code,
      purgeAt: terminalPurgeAt(now),
    },
    $unset: {
      leaseOwner: '',
      leaseToken: '',
      leaseExpiresAt: '',
      claimedAt: '',
      deliveryStartedAt: '',
    },
  }
);


const completeFailure = async (job, classification, now) => {
  const terminal = classification.permanent || job.attempts >= job.maxAttempts;
  const update = terminal
    ? {
        status: 'failed',
        failedAt: now,
        purgeAt: terminalPurgeAt(now),
      }
    : {
        status: 'retry',
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(job)),
      };
  const result = await NotificationJob.updateOne(
    leaseFilter(job, now),
    {
      $set: {
        ...update,
        lastErrorCategory: classification.category,
        lastErrorCode: classification.code,
        ...(classification.responseCode
          ? { lastResponseCode: classification.responseCode }
          : {}),
      },
      $unset: {
        leaseOwner: '',
        leaseToken: '',
        leaseExpiresAt: '',
        claimedAt: '',
        deliveryStartedAt: '',
      },
    }
  );
  if (result.modifiedCount === 1) {
    logger[terminal ? 'error' : 'warn'](
      terminal ? 'notification_failed_terminal' : 'notification_retry_scheduled',
      {
        notificationId: job._id,
        appointmentId: job.appointment,
        eventType: job.eventType,
        channel: job.channel,
        attempt: job.attempts,
        errorCategory: classification.category,
        errorCode: classification.code,
      }
    );
  }
  return result;
};


const createLeaseHeartbeat = ({ job, clock, leaseMs }) => {
  let stopped = false;
  let failure = null;
  let inFlight = null;
  const refresh = async () => {
    if (stopped || failure) return;
    if (inFlight) return inFlight;
    const now = clock();
    const operation = NotificationJob.updateOne(
      leaseFilter(job, now),
      {
        $set: {
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
      }
    ).then((result) => {
      if (result.matchedCount !== 1) {
        failure = new Error('Notification delivery lease was lost');
      }
    }).catch((error) => {
      failure = error;
    }).finally(() => {
      inFlight = null;
    });
    inFlight = operation;
    return operation;
  };
  const timer = setInterval(
    () => { void refresh(); },
    Math.max(100, Math.floor(leaseMs / 3))
  );
  timer.unref?.();
  return {
    async assertLease() {
      await refresh();
      if (failure) throw failure;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
};


const processClaimedNotification = async ({
  job,
  channelRegistry,
  clock = () => new Date(),
  leaseMs = env.NOTIFICATION_WORKER_LEASE_MS,
  beforeDelivery,
  beforeSendFence,
}) => {
  const heartbeat = createLeaseHeartbeat({ job, clock, leaseMs });
  const cancelIfOwned = async (currentJob, code) => {
    await heartbeat.assertLease();
    const cancelledAt = clock();
    const result = await cancelClaim(currentJob, code, cancelledAt);
    if (result.modifiedCount !== 1) {
      return { status: 'lease_lost' };
    }
    logger.info('notification_cancelled', {
      notificationId: job._id,
      appointmentId: job.appointment,
      eventType: job.eventType,
      cancellationCode: code,
    });
    return { status: 'cancelled', code };
  };
  try {
    let now = clock();
    let appointment = await Appointment.findById(job.appointment).lean();
    let eligibility = notificationEligibility({ job, appointment, now });
    if (!eligibility.eligible) {
      return cancelIfOwned(job, eligibility.code);
    }

    if (beforeDelivery) {
      await beforeDelivery({ job, appointment });
    }
    await heartbeat.assertLease();

    now = clock();
    const currentJob = await NotificationJob.findOne(
      leaseFilter(job, now)
    )
      .select('+leaseOwner +leaseToken +dedupeKey')
      .lean();
    if (!currentJob) {
      return { status: 'lease_lost' };
    }
    appointment = await Appointment.findById(job.appointment).lean();
    eligibility = notificationEligibility({
      job: currentJob,
      appointment,
      now,
    });
    if (!eligibility.eligible) {
      return cancelIfOwned(currentJob, eligibility.code);
    }

    const message = await buildDelivery({
      job: currentJob,
      appointment,
    });
    if (beforeSendFence) {
      await beforeSendFence({ job: currentJob, appointment, message });
    }
    await heartbeat.assertLease();

    now = clock();
    const sendFenceJob = await NotificationJob.findOne(
      leaseFilter(currentJob, now)
    )
      .select('+leaseOwner +leaseToken +dedupeKey')
      .lean();
    if (!sendFenceJob) {
      return { status: 'lease_lost' };
    }
    appointment = await Appointment.findById(job.appointment).lean();
    now = clock();
    eligibility = notificationEligibility({
      job: sendFenceJob,
      appointment,
      now,
    });
    if (!eligibility.eligible) {
      return cancelIfOwned(sendFenceJob, eligibility.code);
    }
    await heartbeat.assertLease();
    now = clock();
    const started = await NotificationJob.updateOne(
      leaseFilter(sendFenceJob, now),
      { $set: { deliveryStartedAt: now } }
    );
    if (started.modifiedCount !== 1) {
      return { status: 'lease_lost' };
    }
    await channelRegistry[sendFenceJob.channel].deliver(message);

    now = clock();
    const completed = await NotificationJob.updateOne(
      leaseFilter(sendFenceJob, now),
      {
        $set: {
          status: 'sent',
          sentAt: now,
          purgeAt: terminalPurgeAt(now),
        },
        $unset: {
          leaseOwner: '',
          leaseToken: '',
          leaseExpiresAt: '',
          claimedAt: '',
          deliveryStartedAt: '',
        },
      }
    );
    if (completed.modifiedCount !== 1) {
      logger.warn('notification_delivery_result_unrecorded', {
        notificationId: job._id,
        appointmentId: job.appointment,
        eventType: job.eventType,
        attempt: job.attempts,
      });
      return { status: 'delivery_result_unrecorded' };
    }
    logger.info('notification_sent', {
      notificationId: job._id,
      appointmentId: job.appointment,
      eventType: job.eventType,
      channel: job.channel,
      attempt: job.attempts,
    });
    return { status: 'sent' };
  }
  catch (error) {
    const now = clock();
    const classification = classifyDeliveryError(error);
    const result = await completeFailure(job, classification, now);
    if (result.modifiedCount !== 1) {
      return { status: 'lease_lost' };
    }
    return {
      status: classification.permanent || job.attempts >= job.maxAttempts
        ? 'failed'
        : 'retry',
      errorCategory: classification.category,
    };
  }
  finally {
    await heartbeat.stop();
  }
};


const abortableDelay = (milliseconds, signal) => new Promise((resolve) => {
  if (signal?.aborted) {
    resolve();
    return;
  }
  let settled = false;
  let timer;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', finish);
    resolve();
  };
  timer = setTimeout(finish, milliseconds);
  timer.unref?.();
  signal?.addEventListener('abort', finish, { once: true });
  if (signal?.aborted) finish();
});


const createNotificationWorker = ({
  ownerId = `${process.pid}:${crypto.randomUUID()}`,
  channelRegistry = createChannelRegistry(),
  clock = () => new Date(),
  beforeDelivery,
  pollIntervalMs = env.NOTIFICATION_WORKER_POLL_INTERVAL_MS,
  leaseMs = env.NOTIFICATION_WORKER_LEASE_MS,
  concurrency = env.NOTIFICATION_WORKER_CONCURRENCY,
  beforeSendFence,
} = {}) => {
  const runOnce = async ({ sweepExpiredFinalAttempts = true } = {}) => {
    const claimed = await claimNextNotification({
      ownerId,
      now: clock(),
      leaseMs,
      sweepExpiredFinalAttempts,
    });
    if (!claimed) return null;
    logger.info(
      claimed.reclaimed
        ? 'notification_reclaimed_after_lease'
        : 'notification_claimed',
      {
        notificationId: claimed.job._id,
        appointmentId: claimed.job.appointment,
        eventType: claimed.job.eventType,
        channel: claimed.job.channel,
        attempt: claimed.job.attempts,
      }
    );
    return processClaimedNotification({
      job: claimed.job,
      channelRegistry,
      clock,
      leaseMs,
      beforeDelivery,
      beforeSendFence,
    });
  };

  const run = async ({ signal } = {}) => {
    logger.info('notification_worker_started', { ownerId, concurrency });
    while (!signal?.aborted) {
      await terminalizeExpiredFinalAttempts(clock());
      const results = await Promise.all(
        Array.from(
          { length: concurrency },
          () => runOnce({ sweepExpiredFinalAttempts: false })
        )
      );
      if (results.every((result) => result === null)) {
        await abortableDelay(pollIntervalMs, signal);
      }
    }
    logger.info('notification_worker_stopped', { ownerId });
  };

  return Object.freeze({ ownerId, runOnce, run });
};


export {
  abortableDelay,
  claimNextNotification,
  terminalizeExpiredFinalAttempts,
  notificationEligibility,
  classifyDeliveryError,
  retryDelayMs,
  processClaimedNotification,
  createNotificationWorker,
};
