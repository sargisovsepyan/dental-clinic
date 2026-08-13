import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;

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

  if (mongoose.connection.name !== 'dental_clinic_test') {
    throw new Error('Connected database did not pass the test database guard');
  }
};

export const clearTestDatabase = async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const disconnectTestDatabase = async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await mongoose.disconnect();
  await mongo?.stop();
};
