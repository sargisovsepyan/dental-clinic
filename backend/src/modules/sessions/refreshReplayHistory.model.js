import mongoose from 'mongoose';


const refreshReplayHistorySchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      minlength: 64,
      maxlength: 64,
      select: false,
      immutable: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },

    familyId: {
      type: String,
      required: true,
      maxlength: 100,
      immutable: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'refreshreplayhistories',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);


refreshReplayHistorySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const RefreshReplayHistory = mongoose.model(
  'RefreshReplayHistory',
  refreshReplayHistorySchema
);


export default RefreshReplayHistory;
