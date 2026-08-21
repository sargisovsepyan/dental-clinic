import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;

const TEST_DATABASE_NAME = 'dental_clinic_test';

export const assertSafeTestDatabaseConnection = ({
  nodeEnv = process.env.NODE_ENV,
  connection = mongoose.connection,
} = {}) => {
  if (nodeEnv !== 'test') {
    throw new Error('Refusing destructive test cleanup outside NODE_ENV=test');
  }
  if (connection?.readyState !== 1) {
    throw new Error('Refusing destructive test cleanup without an active database connection');
  }
  if (connection.name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing destructive test cleanup against a non-test database');
  }
};

export const connectTestDatabase = async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to start the test database outside NODE_ENV=test');
  }

  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('dental_clinic_test');

  if (new URL(uri).pathname !== '/dental_clinic_test') {
    throw new Error('Refusing to run tests against a non-test database');
  }

  await mongoose.connect(uri);

  assertSafeTestDatabaseConnection();
};

export const clearTestDatabase = async () => {
  assertSafeTestDatabaseConnection();
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const disconnectTestDatabase = async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await mongoose.disconnect();
  await mongo?.stop();
};
