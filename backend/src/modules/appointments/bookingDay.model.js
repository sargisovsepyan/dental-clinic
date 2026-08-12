import mongoose from 'mongoose';

const bookingDaySchema = new mongoose.Schema(
  {
    dentist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dentist',
      required: true,
    },

    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    occupiedMinutes: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);


bookingDaySchema.index(
  {
    dentist: 1,
    date: 1,
  },
  {
    unique: true,
  }
);


const BookingDay = mongoose.model(
  'BookingDay',
  bookingDaySchema
);

export default BookingDay;
