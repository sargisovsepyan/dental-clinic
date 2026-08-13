import mongoose from 'mongoose';

const adminInvariantSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'active-admin-invariant',
    },
    revision: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const AdminInvariant = mongoose.model(
  'AdminInvariant',
  adminInvariantSchema
);

export default AdminInvariant;
