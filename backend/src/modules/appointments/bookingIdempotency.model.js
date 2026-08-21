import mongoose from 'mongoose';


const bookingIdempotencySchema = new mongoose.Schema(
  {
    keyHash: {
      type: String,
      required: true,
      unique: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    requestHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      immutable: true,
      index: true,
    },
    responseSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'bookingidempotencies',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);


bookingIdempotencySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);


const BookingIdempotency = mongoose.model(
  'BookingIdempotency',
  bookingIdempotencySchema
);


export default BookingIdempotency;
