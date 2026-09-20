// Pure policy shared by the API, browser and isolated local preview.
export function isHumanName(value, maxLength = 120) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  const name = value.replace(/^ +| +$/g, '');
  return name.length <= maxLength && (name.match(/\p{L}/gu) || []).length >= 2 &&
    /^\p{L}[\p{L}\p{M}]*(?:(?: +|[-'’])\p{L}[\p{L}\p{M}]*)*$/u.test(name);
}

export function canonicalPhone(value) {
  if (typeof value !== 'string' || value.length > 30) return null;
  const phone = value.replace(/^ +| +$/g, '');
  if (!/^\+?[0-9 ()-]+$/.test(phone)) return null;
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 9 && digits.startsWith('0')) digits = `374${digits.slice(1)}`;
  else if (digits.length === 8) digits = `374${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function isEmail(value, required = false) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email) return !required;
  return email.length <= 254 && !/[\s\p{Cc}\p{Cf}]/u.test(email) &&
    /^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(email) && !email.split('@')[0].startsWith('.') &&
    !email.split('@')[0].endsWith('.') && !email.includes('..');
}

// Gregorian years 0001–9999, without Date.UTC's 1900 offset for 0–99.
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isBookingDate(value, range) {
  return isCalendarDate(value) && value >= range.min && value <= range.max;
}
