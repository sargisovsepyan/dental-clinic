import mongoose from 'mongoose';


import {
  createTranslationsSchema,
  SUPPORTED_LOCALES,
} from '../../i18n/localization.js';

const snapshotNameTranslationSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 150,
      },
    },
    { _id: false }
  );

const snapshotTitleTranslationSchema =
  new mongoose.Schema(
    {
      title: {
        type: String,
        trim: true,
        maxlength: 150,
      },
    },
    { _id: false }
  );

const priceSnapshotSchema =
  new mongoose.Schema(
    {
      priceType: {
        type: String,
        enum: [
          'fixed',
          'from',
          'range',
          'on_request',
        ],
        required: true,
      },

      priceFrom: {
        type: Number,
        min: 0,
        default: null,
      },

      priceTo: {
        type: Number,
        min: 0,
        default: null,
      },

      currency: {
        type: String,
        enum: ['AMD'],
        default: 'AMD',
      },
    },
    {
      _id: false,
    }
  );


const serviceSnapshotSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      durationMinutes: {
        type: Number,
        required: true,
        min: 1,
      },

      translations: {
        type: createTranslationsSchema(
          snapshotNameTranslationSchema
        ),
        default: () => ({}),
      },
    },
    {
      _id: false,
    }
  );


const dentistSnapshotSchema =
  new mongoose.Schema(
    {
      firstName: {
        type: String,
        required: true,
      },

      lastName: {
        type: String,
        required: true,
      },

      title: {
        type: String,
        default: '',
      },

      translations: {
        type: createTranslationsSchema(
          snapshotTitleTranslationSchema
        ),
        default: () => ({}),
      },
    },
    {
      _id: false,
    }
  );


const reschedulePointSchema = new mongoose.Schema(
  {
    dentist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dentist',
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  { _id: false }
);


const rescheduleHistorySchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    from: {
      type: reschedulePointSchema,
      required: true,
    },
    to: {
      type: reschedulePointSchema,
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);


const appointmentSchema =
  new mongoose.Schema(
    {
      confirmationCode: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        uppercase: true,
        trim: true,
        index: true,
      },


      patientName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
      },

      patientPhone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20,
        index: true,
      },

      patientEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: '',
      },


      dentist: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dentist',
        required: true,
        index: true,
      },

      service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: true,
        index: true,
      },


      dentistSnapshot: {
        type: dentistSnapshotSchema,
        required: true,
      },

      serviceSnapshot: {
        type: serviceSnapshotSchema,
        required: true,
      },

      priceSnapshot: {
        type: priceSnapshotSchema,
        required: true,
      },


      date: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
        index: true,
      },

      startTime: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):[0-5]\d$/,
      },

      endTime: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):[0-5]\d$/,
      },

      startAt: {
        type: Date,
        required: true,
        index: true,
      },

      endAt: {
        type: Date,
        required: true,
      },

      bufferMinutes: {
        type: Number,
        min: 0,
        default: 0,
      },


      lockKeys: {
        type: [String],
        required: true,
        select: false,
      },

      quotaReservationId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        select: false,
      },

      idempotencyKeyHash: {
        type: String,
        minlength: 64,
        maxlength: 64,
        default: null,
        select: false,
      },

      idempotencyRequestHash: {
        type: String,
        minlength: 64,
        maxlength: 64,
        default: null,
        select: false,
      },

      mutationVersion: {
        type: Number,
        min: 0,
        default: 0,
      },

      scheduleRevision: {
        type: Number,
        min: 0,
        default: 0,
      },

      notificationLocale: {
        type: String,
        enum: SUPPORTED_LOCALES,
        default: null,
      },

      rescheduleHistory: {
        type: [rescheduleHistorySchema],
        default: [],
        validate: {
          validator: (entries) => entries.length <= 100,
          message: 'Reschedule history cannot exceed 100 entries',
        },
      },


      status: {
        type: String,

        enum: [
          'pending',
          'confirmed',
          'checked_in',
          'in_progress',
          'completed',
          'cancelled',
          'no_show',
        ],

        default: 'pending',

        index: true,
      },


      source: {
        type: String,

        enum: [
          'website',
          'phone',
          'admin',
        ],

        default: 'website',
      },


      patientComment: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: '',
      },

      internalNote: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: '',
      },


      privacyConsentAt: {
        type: Date,
        required: true,
      },

      privacyConsentMethod: {
        type: String,
        enum: [
          'website',
          'phone',
          'in_person',
        ],
        default: 'website',
      },

      privacyPolicyVersion: {
        type: String,
        required: true,
        match: /^(?:[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?|legacy-unverified)$/,
      },


      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },


      cancelledAt: {
        type: Date,
        default: null,
      },

      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },

      cancellationReason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );


appointmentSchema.index(
  {
    dentist: 1,
    lockKeys: 1,
  },
  {
    unique: true,
    name: 'unique_dentist_booking_lock',
  }
);


appointmentSchema.index({
  dentist: 1,
  date: 1,
  startAt: 1,
});


appointmentSchema.index({
  date: 1,
  status: 1,
});


appointmentSchema.index({
  patientPhone: 1,
  createdAt: -1,
});


appointmentSchema.index(
  { quotaReservationId: 1 },
  {
    unique: true,
    name: 'unique_appointment_quota_reservation',
    partialFilterExpression: {
      quotaReservationId: { $type: 'objectId' },
    },
  }
);


appointmentSchema.index(
  { idempotencyKeyHash: 1 },
  {
    unique: true,
    name: 'unique_booking_idempotency_key',
    partialFilterExpression: {
      idempotencyKeyHash: { $type: 'string' },
    },
  }
);


const Appointment = mongoose.model(
  'Appointment',
  appointmentSchema
);


export default Appointment;

