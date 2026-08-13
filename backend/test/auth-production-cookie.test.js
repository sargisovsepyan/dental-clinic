import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'production';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'https://clinic.example.test';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/modules/users/user.model.js');

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('dental_clinic_test'));
  await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'correct horse battery staple',
    role: 'admin',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('production refresh cookie is Secure, HttpOnly, Strict, and path-scoped', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'https://clinic.example.test')
    .send({ email: 'admin@example.com', password: 'correct horse battery staple' });
  assert.equal(response.status, 200);
  const setCookie = response.headers['set-cookie'][0];
  assert.match(setCookie, /; Secure/i);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/api\/v1\/auth/i);
});
