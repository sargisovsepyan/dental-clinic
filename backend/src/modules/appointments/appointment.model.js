import mongoose from 'mongoose';


import {
  createTranslationsSchema,
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


const Appointment = mongoose.model(
  'Appointment',
  appointmentSchema
);


export default Appointment;

