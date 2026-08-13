import mongoose from 'mongoose';

const oneTimeTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['invite', 'password_reset'],
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

oneTimeTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

oneTimeTokenSchema.index({
  user: 1,
  purpose: 1,
  consumedAt: 1,
});

const OneTimeToken = mongoose.model(
  'OneTimeToken',
  oneTimeTokenSchema
);

export default OneTimeToken;
