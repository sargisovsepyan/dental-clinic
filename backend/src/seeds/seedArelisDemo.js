import 'dotenv/config';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import { redactText } from '../observability/logger.js';
import { assertMaintenanceSafety } from '../scripts/maintenanceGuard.js';
import {
  assertProductionAcknowledgement,
  seedArelisDemo,
} from './arelisDemo.service.js';

const run = async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'The Arelis demo seed command is restricted to NODE_ENV=production'
      );
    }
    assertMaintenanceSafety();
    assertProductionAcknowledgement();
    await connectDB();

    const result = await seedArelisDemo({
      receptionistEmail:
        process.env.ARELIS_DEMO_RECEPTIONIST_EMAIL,
      dentistEmail:
        process.env.ARELIS_DEMO_DENTIST_EMAIL,
    });

    console.log(
      'Arelis demo seed completed:',
      `${result.categories} categories,`,
      `${result.services} services,`,
      `${result.dentists} dentists,`,
      `${result.staff} staff accounts,`,
      `${result.invitationsSent} invitations sent`
    );
  }
  catch (error) {
    console.error(
      `Arelis demo seed failed: ${redactText(error.message)}`
    );
    process.exitCode = 1;
  }
  finally {
    await mongoose.connection.close();
  }
};

await run();
