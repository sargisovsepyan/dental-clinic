import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog } from '../../frontend/test/preview/arelis-catalog.mjs';
import { buildTeam } from '../../frontend/test/preview/arelis-team.mjs';
import { createMockApiServer, previewAccounts, previewPassword } from '../../frontend/test/e2e/mock-api.mjs';
import { createServiceSchema } from '../src/modules/services/service.validation.js';
import { createDentistSchema } from '../src/modules/dentists/dentist.validation.js';

test('manual Arelis catalog and team satisfy real backend input validation without providers', () => {
  const { services } = buildCatalog();
  for (const source of services) {
    const { error } = createServiceSchema.body.validate({
      translations: source.translations, category: source.category._id,
      priceType: source.priceType, priceFrom: source.priceFrom, priceTo: source.priceTo,
      currency: source.currency, durationMinutes: source.durationMinutes,
      isActive: source.isActive, bookingEnabled: source.bookingEnabled,
    });
    assert.equal(error, undefined, `${source.slug}: ${error?.message}`);
  }
  for (const source of buildTeam(services)) {
    const { error } = createDentistSchema.body.validate({
      firstName: source.firstName, lastName: source.lastName, translations: source.translations,
      experienceYears: source.experienceYears, languages: source.languages,
      weeklySchedule: source.weeklySchedule, services: source.services.map((item) => item._id),
      isActive: source.isActive, bookingEnabled: source.bookingEnabled,
    });
    assert.equal(error, undefined, `${source.slug}: ${error?.message}`);
  }
});

test('clean local preview books the catalog and preserves durations, scope, failed-reschedule locks and cancellation', async (t) => {
  const server = createMockApiServer(0, 'success', { profile: 'arelis' });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: await response.json() };
  };
  const { services } = buildCatalog(); const doctors = buildTeam(services);
  // A local, future Monday avoids timezone, Sunday and seeded-slot ambiguity.
  const clinic = await call('/clinic');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: clinic.json.data.clinic.timezone });
  const nextMonday = new Date(`${today}T12:00:00+04:00`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 8 + ((8 - (nextMonday.getUTCDay() || 7)) % 7));
  const date = nextMonday.toISOString().slice(0, 10);
  for (const selected of services) {
    const doctor = doctors.find((item) => item.services.some((service) => service._id === selected._id));
    const result = await call(`/availability?date=${date}&dentistId=${doctor._id}&serviceId=${selected._id}`);
    assert.equal(result.status, 200, selected.slug);
    assert.ok(result.json.data.availability.slots.length > 0, selected.slug);
    for (const slot of result.json.data.availability.slots) {
      const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      assert.equal(minutes(slot.end) - minutes(slot.start), selected.durationMinutes, selected.slug);
      assert.ok(slot.end <= '13:00' || slot.start >= '14:00', selected.slug);
    }
  }
  const auth = await call('/auth/login', 'POST', { email: previewAccounts.admin.email, password: previewPassword });
  const headers = { authorization: `Bearer ${auth.json.data.accessToken}` };
  const selected = services[6]; const doctor = doctors[3];
  const body = { patientName: 'Local Sample', patientPhone: '+37499000009', dentistId: doctor._id, serviceId: selected._id, date, startTime: '09:00', privacyAccepted: true, locale: 'en' };
  const booked = await call('/appointments', 'POST', body, { 'idempotency-key': 'local-catalog-booking' });
  assert.equal(booked.status, 201); assert.equal(booked.json.data.appointment.status, 'pending');
  assert.equal(booked.json.data.appointment.endTime, '10:30');
  const repeated = await call('/appointments', 'POST', body, { 'idempotency-key': 'local-catalog-booking' });
  assert.deepEqual(repeated.json.data.appointment, booked.json.data.appointment);
  const id = booked.json.data.appointment.id;
  const failed = await call(`/appointments/${id}/reschedule`, 'POST', { ...body, startTime: '12:00', expectedMutationVersion: 0 }, headers);
  assert.equal(failed.status, 409);
  const unchanged = await call(`/appointments/${id}`, 'GET', undefined, headers);
  assert.equal(unchanged.json.data.appointment.startTime, '09:00'); assert.equal(unchanged.json.data.appointment.mutationVersion, 0);
  const occupied = await call('/appointments', 'POST', { ...body, startTime: '09:00' }, { 'idempotency-key': 'other-local-booking' });
  assert.equal(occupied.status, 409);
  const moved = await call(`/appointments/${id}/reschedule`, 'POST', { ...body, startTime: '14:30', expectedMutationVersion: 0 }, headers);
  assert.equal(moved.status, 200); assert.equal(moved.json.data.appointment.endTime, '16:00');
  assert.equal(moved.json.data.appointment.serviceSnapshot.translations.en.name, selected.translations.en.name);
  const cancelled = await call(`/appointments/${id}/cancel`, 'POST', { expectedMutationVersion: 1, reason: 'Local cancellation' }, headers);
  assert.equal(cancelled.status, 200);
  const available = await call(`/availability?date=${date}&dentistId=${doctor._id}&serviceId=${selected._id}`);
  assert.ok(available.json.data.availability.slots.some((slot) => slot.start === '14:30'));
  const invalid = await call('/appointments', 'POST', { ...body, dentistId: doctors[1]._id }, { 'idempotency-key': 'invalid-local-relationship' });
  assert.equal(invalid.status, 400);

  // Production retains locks for every non-cancelled status, including terminal
  // completed/no-show records. The clean preview must not offer these slots.
  const retained = await call('/appointments', 'POST', body, { 'idempotency-key': 'retained-status-lock' });
  assert.equal(retained.status, 201);
  const retainedId = retained.json.data.appointment.id;
  for (const [version, status] of ['confirmed', 'checked_in', 'in_progress', 'completed'].entries()) {
    const changed = await call(`/appointments/${retainedId}/status`, 'PATCH', { status, expectedMutationVersion: version }, headers);
    assert.equal(changed.status, 200); assert.equal(changed.json.data.appointment.status, status);
    const slots = await call(`/availability?date=${date}&dentistId=${doctor._id}&serviceId=${selected._id}`);
    assert.ok(!slots.json.data.availability.slots.some((slot) => ['09:00', '09:30'].includes(slot.start)), status);
    for (const startTime of ['09:00', '09:30']) {
      const blocked = await call('/appointments', 'POST', { ...body, startTime }, { 'idempotency-key': `retained-${status}-${startTime}` });
      assert.equal(blocked.status, 409, `${status}: ${startTime}`);
    }
  }
  const missed = await call('/appointments', 'POST', { ...body, startTime: '14:30' }, { 'idempotency-key': 'retained-no-show-lock' });
  assert.equal(missed.status, 201);
  const noShow = await call(`/appointments/${missed.json.data.appointment.id}/status`, 'PATCH', { status: 'no_show', expectedMutationVersion: 0 }, headers);
  assert.equal(noShow.status, 200);
  const noShowSlots = await call(`/availability?date=${date}&dentistId=${doctor._id}&serviceId=${selected._id}`);
  assert.ok(!noShowSlots.json.data.availability.slots.some((slot) => ['14:30', '15:00'].includes(slot.start)));
  assert.equal((await call('/appointments', 'POST', { ...body, startTime: '15:00' }, { 'idempotency-key': 'blocked-no-show-overlap' })).status, 409);
});
