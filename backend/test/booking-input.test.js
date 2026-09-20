import test from 'node:test';
import assert from 'node:assert/strict';
import { isHumanName, canonicalPhone, isCalendarDate } from '../../shared/booking-input.mjs';
import normalizePhone from '../src/utils/normalizePhone.js';
import { createAppointmentSchema } from '../src/modules/appointments/appointment.validation.js';
import { inviteStaffSchema } from '../src/modules/staff/staff.validation.js';

const validNames = ['Մարիամ Հակոբյան', 'Анна-Мария Иванова', "Jean-Luc O'Neill", 'Davit Petrosyan', 'Jose\u0301 Martin', '  Anna Maria  '];
const invalidNames = ['123', 'A1', '`Ab`', '😀😀', "'Anna", 'Anna-', 'A', '---', 'Anna\n', 'Anna\u200bMaria', '  \tAnna  ', 'Anna@Maria'];
const booking = { patientName: 'Anna Maria', patientPhone: '+37499123456', dentistId: '64b000000000000000000021', serviceId: '64b000000000000000000011', date: '2026-09-22', startTime: '09:00', privacyAccepted: true };
test('one Unicode name policy applies to raw patient and staff invitation boundaries', () => {
  for (const name of validNames) {
    assert.equal(isHumanName(name), true, name);
    assert.equal(createAppointmentSchema.body.validate({ ...booking, patientName: name }).error, undefined, name);
    assert.equal(inviteStaffSchema.body.validate({ name, email: 'anna@example.com', role: 'dentist' }).error, undefined, name);
  }
  for (const name of invalidNames) {
    assert.equal(isHumanName(name), false, name);
    assert.ok(createAppointmentSchema.body.validate({ ...booking, patientName: name }).error, name);
    assert.ok(inviteStaffSchema.body.validate({ name, email: 'anna@example.com', role: 'dentist' }).error, name);
  }
  assert.equal(isHumanName('A'.repeat(121)), false);
  assert.ok(inviteStaffSchema.body.validate({ name: 'A'.repeat(101), email: 'anna@example.com', role: 'dentist' }).error);
});
test('phone normalization rejects forbidden raw characters without changing canonical identity', () => {
  for (const phone of ['099 123 456', '99-123-456', '+374 (99) 123-456', '37499123456']) assert.equal(normalizePhone(phone), '+37499123456');
  for (const phone of ['ABC099123456', '099123456abc', '099123456\n', '++37499123456', '374+99123456', '099.123.456', '123', '😀099123456', '9'.repeat(16)]) {
    assert.equal(canonicalPhone(phone), null, phone); assert.throws(() => normalizePhone(phone), { statusCode: 400 });
    assert.ok(createAppointmentSchema.body.validate({ ...booking, patientPhone: phone }).error, phone);
  }
});
test('calendar validation never normalizes impossible dates or low years into this century', () => {
  for (const date of ['0001-01-01', '0002-02-28', '0099-12-31', '2028-02-29']) assert.equal(isCalendarDate(date), true, date);
  for (const date of ['0000-01-01', '2026-02-29', '2026-02-30', '2026-13-01', '2026-04-31', '2026-9-01']) assert.equal(isCalendarDate(date), false, date);
});
