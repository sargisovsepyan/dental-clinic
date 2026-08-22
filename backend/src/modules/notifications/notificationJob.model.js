import mongoose from 'mongoose';

import { SUPPORTED_LOCALES } from '../../i18n/localization.js';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_RECIPIENT_KINDS,
  NOTIFICATION_STATUSES,
} from './notification.constants.js';


const localizedNameSchema = new mongoose.Schema(
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },
    ])
  ),
  { _id: false }
);


const occurrenceSnapshotSchema = new mongoose.Schema(
  {
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    serviceNames: {
      type: localizedNameSchema,
      default: () => ({}),
    },
    dentistName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 301,
    },
  },
  { _id: false }
);


const eventSnapshotSchema = new mongoose.Schema(
  {
    before: {
      type: occurrenceSnapshotSchema,
      default: null,
    },
    after: {
      type: occurrenceSnapshotSchema,
      default: null,
    },
  },
  { _id: false }
);


const notificationJobSchema = new mongoose.Schema(
  {
    dedupeKey: {
      type: String,
      required: true,
      immutable: true,
      minlength: 20,
      maxlength: 300,
      select: false,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      immutable: true,
    },
    eventType: {
      type: String,
      enum: NOTIFICATION_EVENT_TYPES,
      required: true,
      immutable: true,
    },
    eventRevision: {
      type: Number,
      min: 0,
      required: true,
      immutable: true,
    },
    scheduleRevision: {
      type: Number,
      min: 0,
      default: null,
      immutable: true,
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      required: true,
      immutable: true,
    },
    recipientKind: {
      type: String,
      enum: NOTIFICATION_RECIPIENT_KINDS,
      required: true,
      immutable: true,
    },
    locale: {
      type: String,
      enum: [...SUPPORTED_LOCALES, null],
      default: null,
      immutable: true,
    },
    dueAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'pending',
      required: true,
    },
    attempts: {
      type: Number,
      min: 0,
      default: 0,
      required: true,
    },
    maxAttempts: {
      type: Number,
      min: 1,
      max: 50,
      required: true,
      immutable: true,
    },
    eventSnapshot: {
      type: eventSnapshotSchema,
      required: true,
      immutable: true,
    },
    leaseOwner: {
      type: String,
      maxlength: 200,
      default: null,
      select: false,
    },
    leaseToken: {
      type: String,
      maxlength: 100,
      default: null,
      select: false,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    deliveryStartedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    lastErrorCategory: {
      type: String,
      enum: [
        '',
        'timeout',
        'connection',
        'authentication',
        'recipient_rejected',
        'invalid_message',
        'unsupported_channel',
        'unknown',
      ],
      default: '',
    },
    lastErrorCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    lastResponseCode: {
      type: Number,
      min: 100,
      max: 999,
      default: null,
    },
    purgeAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'notificationjobs',
    timestamps: true,
    versionKey: false,
  }
);


notificationJobSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    name: 'unique_notification_logical_event',
  }
);

notificationJobSchema.index(
  { status: 1, nextAttemptAt: 1, _id: 1 },
  { name: 'notification_due_claim' }
);

notificationJobSchema.index(
  { status: 1, leaseExpiresAt: 1, _id: 1 },
  { name: 'notification_expired_lease' }
);

notificationJobSchema.index(
  { appointment: 1, status: 1, eventType: 1, scheduleRevision: 1 },
  { name: 'notification_appointment_reconciliation' }
);

notificationJobSchema.index(
  { purgeAt: 1 },
  {
    name: 'notification_terminal_retention',
    expireAfterSeconds: 0,
  }
);


const NotificationJob = mongoose.model(
  'NotificationJob',
  notificationJobSchema
);


export default NotificationJob;
