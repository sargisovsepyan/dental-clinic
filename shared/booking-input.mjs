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

  const body = phone.startsWith('+') ? phone.slice(1) : phone;
  if (!body || (phone.startsWith('+') && !/^\d/.test(body))) return null;

  let parenthesesOpen = false;
  let parenthesesUsed = false;
  let separators = 0;
  let hyphens = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    const previous = body[index - 1];
    const next = body[index + 1];
    if (/\d/.test(character)) continue;
    if (character === '(') {
      if (parenthesesOpen || parenthesesUsed || !/\d/.test(next || '') ||
          (index > 0 && !/[0-9 ]/.test(previous))) return null;
      parenthesesOpen = true;
      parenthesesUsed = true;
      continue;
    }
    if (character === ')') {
      if (!parenthesesOpen || !/\d/.test(previous || '')) return null;
      parenthesesOpen = false;
      continue;
    }
    if (character === ' ') {
      separators += 1;
      if (parenthesesOpen || separators > 6 || !/[0-9)]/.test(previous || '') ||
          !/[0-9(]/.test(next || '')) return null;
      continue;
    }
    if (character === '-') {
      separators += 1;
      hyphens += 1;
      if (parenthesesOpen || separators > 6 || hyphens > 3 ||
          !/\d/.test(previous || '') || !/\d/.test(next || '')) return null;
    }
  }
  if (parenthesesOpen) return null;

  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 9 && digits.startsWith('0')) digits = `374${digits.slice(1)}`;
  else if (digits.length === 8) digits = `374${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function isEmail(value, required = false) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  const email = value.replace(/^ +| +$/g, '');
  if (!email) return !required;
  if (email.length > 254 || /\s/.test(email) || email.indexOf('@') !== email.lastIndexOf('@')) return false;
  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || !domain || domain.length > 253 ||
      !/^[A-Za-z0-9]+(?:[._%+-][A-Za-z0-9]+)*$/.test(local)) return false;
  const labels = domain.split('.');
  return labels.length >= 2 && /^[A-Za-z]{2,63}$/.test(labels.at(-1) || '') &&
    labels.every((label) => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
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
