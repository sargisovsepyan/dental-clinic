import crypto from 'crypto';

import User from '../modules/users/user.model.js';
import Session from '../modules/sessions/session.model.js';

const version =
  '20260814_003_auth_security_fields';

const description =
  'Backfill staff authorization versions, setup state, and refresh session family identifiers';

const run = async ({ dryRun = true }) => {
  const userFilter = {
    $or: [
      { authVersion: { $exists: false } },
      { isSetupComplete: { $exists: false } },
    ],
  };
  const sessionFilter = {
    familyId: { $exists: false },
  };

  const [users, sessions] = await Promise.all([
    User.collection.countDocuments(userFilter),
    Session.collection.countDocuments(sessionFilter),
  ]);

  if (!dryRun) {
    await User.collection.updateMany(
      { authVersion: { $exists: false } },
      { $set: { authVersion: 0 } }
    );
    await User.collection.updateMany(
      { isSetupComplete: { $exists: false } },
      { $set: { isSetupComplete: true } }
    );

    const legacySessions = Session.collection
      .find(sessionFilter, { projection: { _id: 1 } })
      .batchSize(250);

    for await (const session of legacySessions) {
      await Session.collection.updateOne(
        {
          _id: session._id,
          familyId: { $exists: false },
        },
        {
          $set: {
            familyId: crypto.randomUUID(),
          },
        }
      );
    }
  }

  return {
    usersScanned: users,
    sessionsScanned: sessions,
  };
};

export {
  version,
  description,
  run,
};
