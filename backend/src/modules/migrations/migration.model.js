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
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
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
