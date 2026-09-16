import assert from 'node:assert/strict';
import request from 'supertest';

if (process.env.NODE_ENV !== 'production') throw new Error('Production fixture only');
// Health/transport errors may report generically; never deliver to monitoring.
globalThis.fetch = async () => { throw new Error('Fixture blocks outbound fetch'); };
const { default: app } = await import('../src/app.js');
const trusted = process.argv.includes('--trusted');
const origin = process.env.CLIENT_URL;
const plain = await request(app).get('/api/v1/health/live');
assert.equal(plain.status, 426);
const live = await request(app).get('/api/v1/health/live')
  .set('X-Forwarded-Proto', 'https').set('Origin', origin);
assert.equal(live.status, trusted ? 200 : 426);
if (trusted) {
  assert.deepEqual(live.body, { success: true, status: 'live' });
  const ready = await request(app).get('/api/v1/health/ready').set('X-Forwarded-Proto', 'https');
  assert.equal(ready.status, 503);
  assert.deepEqual(ready.body, { success: false, status: 'not_ready' });
  const denied = await request(app).get('/api/v1/health/live')
    .set('X-Forwarded-Proto', 'https').set('Origin', 'https://untrusted.example.test');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.stack, undefined);
  const error = await request(app).get('/api/v1/private-sensitive-value').set('X-Forwarded-Proto', 'https');
  assert.equal(error.status, 500);
  assert.deepEqual(error.body, { success: false, message: 'Internal server error' });
}
process.stdout.write('transport_passed\n');
