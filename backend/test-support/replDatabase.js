import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

const connectReplTestDatabase = async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Refusing to start the test replica set outside NODE_ENV=test'
    );
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });
  const uri = replSet.getUri('dental_clinic_test');

  if (new URL(uri).pathname !== '/dental_clinic_test') {
    throw new Error(
      'Refusing to run tests against a non-test database'
    );
  }

  await mongoose.connect(uri);

  if (mongoose.connection.name !== 'dental_clinic_test') {
    throw new Error(
      'Connected database did not pass the test database guard'
    );
  }
};

const clearReplTestDatabase = async () => {
  const collections = Object.values(
    mongoose.connection.collections
  );
  await Promise.all(
    collections.map((collection) =>
      collection.deleteMany({})
    )
  );
};

const disconnectReplTestDatabase = async () => {
  await mongoose.disconnect();
  await replSet?.stop();
};

export {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
};
