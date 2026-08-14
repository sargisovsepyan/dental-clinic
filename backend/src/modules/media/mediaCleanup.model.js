import mongoose from 'mongoose';


const mediaCleanupSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      unique: true,
    },
    reason: {
      type: String,
      enum: [
        'replacement',
        'removal',
        'rollback',
        'consent_purge',
        'reconciliation',
      ],
      required: true,
    },
    sourceType: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    sourceId: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'held',
        'pending',
        'processing',
        'completed',
        'failed',
        'cancelled',
      ],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      min: 1,
      max: 50,
      required: true,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    lastErrorCode: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

mediaCleanupSchema.index({
  status: 1,
  nextAttemptAt: 1,
  createdAt: 1,
});


const MediaCleanupJob = mongoose.model(
  'MediaCleanupJob',
  mediaCleanupSchema
);


export default MediaCleanupJob;
