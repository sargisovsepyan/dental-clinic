import test from 'node:test';
import assert from 'node:assert/strict';
import { isHumanName, canonicalPhone, isEmail, isCalendarDate } from '../../shared/booking-input.mjs';
import normalizePhone from '../src/utils/normalizePhone.js';
import { createAppointmentSchema, createAdminAppointmentSchema } from '../src/modules/appointments/appointment.validation.js';
import { loginSchema, forgotPasswordSchema } from '../src/modules/auth/auth.validation.js';
import { updateClinicSchema } from '../src/modules/clinic/clinic.validation.js';
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
test('phone normalization runs only after valid human formatting passes structural validation', () => {
  const valid = [
    ['+37499000001', '+37499000001'], ['+374 99 000 001', '+37499000001'],
    ['+374 (99) 000-001', '+37499000001'], ['099 000 001', '+37499000001'],
    ['(099) 000-001', '+37499000001'], ['99-000-001', '+37499000001'],
    ['+1 (212) 555-0123', '+12125550123'], ['+44 20 7946 0958', '+442079460958'],
  ];
  for (const [phone, canonical] of valid) {
    assert.equal(canonicalPhone(phone), canonical, phone);
    assert.equal(normalizePhone(phone), canonical, phone);
    assert.equal(createAppointmentSchema.body.validate({ ...booking, patientPhone: phone }).error, undefined, phone);
    assert.equal(createAdminAppointmentSchema.body.validate({ ...booking, patientPhone: phone, consentMethod: 'phone' }).error, undefined, phone);
  }
  for (const phone of [
    'ABC099123456', '099123456abc', '099123456\n', '++37499123456', '374+99123456',
    '+374((((99----000001', '+374(99))000001', '+374((99)000001', '+37499--00--00--01',
    '+3-7-4-9-9-0-0-0-0-0-1', '+374(99 000)001', '`37499000001', '<37499000001>',
    '+37499\u0000000001', '099.123.456', '()---   ', '--------', '123', '😀099123456', '9'.repeat(16),
  ]) {
    assert.equal(canonicalPhone(phone), null, phone); assert.throws(() => normalizePhone(phone), { statusCode: 400 });
    assert.ok(createAppointmentSchema.body.validate({ ...booking, patientPhone: phone }).error, phone);
    assert.ok(createAdminAppointmentSchema.body.validate({ ...booking, patientPhone: phone, consentMethod: 'phone' }).error, phone);
    assert.ok(updateClinicSchema.body.validate({ phone }).error, phone);
  }
});
test('one pragmatic email contract is a strict frontend/backend-compatible boundary', () => {
  const valid = ['person@example.com', 'person@care.example.com', 'person+booking@example.com', ' Person.Name@Example.COM '];
  const invalid = [
    'person.example.com', '@example.com', 'person@', 'person@example', 'person@-example.com',
    'person@example-.com', 'person@example..com', 'person@@example.com', 'person @example.com',
    'person..name@example.com', 'person@example.c', 'person@example.com\n', 'person\u200b@example.com',
  ];
  const schemas = (email) => [
    createAppointmentSchema.body.validate({ ...booking, patientEmail: email }),
    createAdminAppointmentSchema.body.validate({ ...booking, patientEmail: email, consentMethod: 'phone' }),
    inviteStaffSchema.body.validate({ name: 'Anna Maria', email, role: 'dentist' }),
    loginSchema.body.validate({ email, password: 'Strong123!' }),
    forgotPasswordSchema.body.validate({ email }),
    updateClinicSchema.body.validate({ email }),
  ];
  for (const email of valid) {
    assert.equal(isEmail(email, true), true, email);
    for (const result of schemas(email)) assert.equal(result.error, undefined, email);
  }
  for (const email of invalid) {
    assert.equal(isEmail(email, true), false, email);
    for (const result of schemas(email)) assert.ok(result.error, email);
  }
  assert.equal(isEmail('', false), true);
  assert.equal(isEmail('', true), false);
});
test('calendar validation never normalizes impossible dates or low years into this century', () => {
  for (const date of ['0001-01-01', '0002-02-28', '0099-12-31', '2028-02-29']) assert.equal(isCalendarDate(date), true, date);
  for (const date of ['0000-01-01', '2026-02-29', '2026-02-30', '2026-13-01', '2026-04-31', '2026-9-01']) assert.equal(isCalendarDate(date), false, date);
});
