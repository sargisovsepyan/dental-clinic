import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

import {
  validateNewPassword,
} from '../../security/passwordPolicy.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required() {
        return this.isSetupComplete;
      },
      select: false,
      validate: {
        validator(value) {
          return (
            !this.isModified('password') ||
            !validateNewPassword(value)
          );
        },
        message: ({ value }) =>
          validateNewPassword(value),
      },
    },

    role: {
      type: String,
      enum: ['admin', 'receptionist', 'dentist'],
      default: 'receptionist',
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isSetupComplete: {
      type: Boolean,
      default: true,
      index: true,
    },

    authVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },

    deactivatedAt: {
      type: Date,
      default: null,
    },

    deactivatedBy: {
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

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;

