import 'dotenv/config';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import User from '../modules/users/user.model.js';

const createAdmin = async () => {
  try {
    await connectDB();

    const name = process.env.ADMIN_NAME?.trim();

    const email = process.env.ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

    const password =
      process.env.ADMIN_PASSWORD;

    if (!name || !email || !password) {
      throw new Error(
        'ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be defined in .env'
      );
    }

    if (password.length < 12) {
      throw new Error(
        'ADMIN_PASSWORD must contain at least 12 characters'
      );
    }

    const existingUser =
      await User.findOne({ email });

    if (existingUser) {
      console.log(
        `Admin already exists: ${email}`
      );

      return;
    }

    const admin = await User.create({
      name,
      email,
      password,
      role: 'admin',
      isActive: true,
    });

    console.log(
      `Admin created successfully: ${admin.email}`
    );
  } catch (error) {
    console.error(
      `Failed to create admin: ${error.message}`
    );

    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

createAdmin();

