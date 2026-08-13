import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema(
  {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reservedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const phoneDailyQuotaSchema = new mongoose.Schema(
  {
    phoneKey: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    reservations: {
      type: [reservationSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

phoneDailyQuotaSchema.index(
  {
    phoneKey: 1,
    date: 1,
  },
  {
    unique: true,
    name: 'unique_phone_daily_quota',
  }
);

const PhoneDailyQuota = mongoose.model(
  'PhoneDailyQuota',
  phoneDailyQuotaSchema
);

export default PhoneDailyQuota;
