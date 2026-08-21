import 'dotenv/config';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import { redactText } from '../observability/logger.js';
import User from '../modules/users/user.model.js';
import {
  validateNewPassword,
} from '../security/passwordPolicy.js';
import { assertMaintenanceSafety } from '../scripts/maintenanceGuard.js';

const createAdmin = async () => {
  try {
    assertMaintenanceSafety();
    await connectDB();

    const name = process.env.ADMIN_NAME?.trim();

    const email = process.env.ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

    const password =
      process.env.ADMIN_PASSWORD;

    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ADMIN_BOOTSTRAP_ACKNOWLEDGED !== 'true'
    ) {
      throw new Error(
        'Production bootstrap requires ADMIN_BOOTSTRAP_ACKNOWLEDGED=true'
      );
    }

    if (!name || !email || !password) {
      throw new Error(
        'ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env'
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('ADMIN_EMAIL must be a valid email address');
    }

    const passwordError =
      validateNewPassword(password);

    if (passwordError) {
      throw new Error(
        `Invalid ADMIN_PASSWORD: ${passwordError}`
      );
    }

    const existingUser =
      await User.findOne({ email });

    if (existingUser) {
      console.log(
        'Admin already exists; no bootstrap change was made'
      );

      return;
    }

    await User.create({
      name,
      email,
      password,
      role: 'admin',
      isActive: true,
    });

    console.log(
      'Admin created successfully'
    );
  } catch (error) {
    console.error(
      `Failed to create admin: ${redactText(error.message)}`
    );

    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

createAdmin();

