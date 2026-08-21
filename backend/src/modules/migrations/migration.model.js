import mongoose from 'mongoose';

const migrationSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 300,
    },
    checksum: {
      type: String,
      match: /^[a-f0-9]{64}$/,
    },
    state: {
      type: String,
      enum: ['running', 'failed', 'applied'],
      default: 'applied',
      index: true,
    },
    ownerToken: {
      type: String,
      select: false,
    },
    leaseExpiresAt: Date,
    attempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastStartedAt: Date,
    lastFailure: {
      type: String,
      maxlength: 500,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    appliedAt: {
      type: Date,
    },
  },
  {
    versionKey: false,
  }
);

const Migration = mongoose.model(
  'Migration',
  migrationSchema
);

export default Migration;
