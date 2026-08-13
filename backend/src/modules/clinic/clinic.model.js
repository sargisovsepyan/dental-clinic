import mongoose from 'mongoose';

import {
  createTranslationsSchema,
  requirePrimaryContent,
} from '../../i18n/localization.js';

const clinicTranslationSchema = new mongoose.Schema(
  {
    clinicName: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: 250,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },

    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  {
    _id: false,
  }
);


const workingDaySchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },

    isOpen: {
      type: Boolean,
      default: true,
    },

    shifts: {
      type: [shiftSchema],
      default: [],
    },
  },
  {
    _id: false,
  }
);


const bookingSettingsSchema =
  new mongoose.Schema(
    {
      isBookingEnabled: {
        type: Boolean,
        default: true,
      },

      slotIntervalMinutes: {
        type: Number,
        enum: [
          10,
          15,
          20,
          30,
          60,
        ],
        default: 30,
      },

      minBookingNoticeMinutes: {
        type: Number,
        min: 0,
        max: 10080,
        default: 120,
      },

      maxBookingDaysAhead: {
        type: Number,
        min: 1,
        max: 365,
        default: 60,
      },

      bufferMinutes: {
        type: Number,
        min: 0,
        max: 120,
        default: 0,
      },

      allowSameDayBooking: {
        type: Boolean,
        default: true,
      },

      requireEmail: {
        type: Boolean,
        default: false,
      },

      autoConfirmAppointments: {
        type: Boolean,
        default: false,
      },

      cancellationNoticeHours: {
        type: Number,
        min: 0,
        max: 168,
        default: 12,
      },

      maxAppointmentsPerPhonePerDay: {
        type: Number,
        min: 1,
        max: 20,
        default: 3,
      },
    },
    {
      _id: false,
    }
  );


const socialLinksSchema =
  new mongoose.Schema(
    {
      instagram: {
        type: String,
        trim: true,
        default: '',
      },

      facebook: {
        type: String,
        trim: true,
        default: '',
      },

      whatsapp: {
        type: String,
        trim: true,
        default: '',
      },

      telegram: {
        type: String,
        trim: true,
        default: '',
      },
    },
    {
      _id: false,
    }
  );


const clinicSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'default',
      immutable: true,
    },

    clinicName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: 'Dental Clinic',
    },

    tagline: {
      type: String,
      trim: true,
      maxlength: 250,
      default: '',
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: '',
    },

    secondaryPhone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: '',
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: '',
    },

    address: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },

    translations: {
      type: createTranslationsSchema(
        clinicTranslationSchema
      ),
      default: () => ({}),
    },

    mapUrl: {
      type: String,
      trim: true,
      default: '',
    },

    latitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },

    timezone: {
      type: String,
      default: 'Asia/Yerevan',
      immutable: true,
    },

    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },

    weeklySchedule: {
      type: [workingDaySchema],

      default: () => [
        {
          dayOfWeek: 1,
          isOpen: true,
          shifts: [
            {
              start: '09:00',
              end: '19:00',
            },
          ],
        },

        {
          dayOfWeek: 2,
          isOpen: true,
          shifts: [
            {
              start: '09:00',
              end: '19:00',
            },
          ],
        },

        {
          dayOfWeek: 3,
          isOpen: true,
          shifts: [
            {
              start: '09:00',
              end: '19:00',
            },
          ],
        },

        {
          dayOfWeek: 4,
          isOpen: true,
          shifts: [
            {
              start: '09:00',
              end: '19:00',
            },
          ],
        },

        {
          dayOfWeek: 5,
          isOpen: true,
          shifts: [
            {
              start: '09:00',
              end: '19:00',
            },
          ],
        },

        {
          dayOfWeek: 6,
          isOpen: true,
          shifts: [
            {
              start: '10:00',
              end: '17:00',
            },
          ],
        },

        {
          dayOfWeek: 7,
          isOpen: false,
          shifts: [],
        },
      ],
    },

    bookingSettings: {
      type: bookingSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

clinicSchema.pre('validate', function () {
  requirePrimaryContent(
    this,
    ['clinicName'],
    'Published clinic settings'
  );
});


const Clinic = mongoose.model(
  'Clinic',
  clinicSchema
);

export default Clinic;
