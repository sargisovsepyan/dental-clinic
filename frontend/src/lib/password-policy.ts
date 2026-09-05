export const PASSWORD_MIN_CHARACTERS = 6;
export const BCRYPT_MAX_BYTES = 72;

export function passwordCharacterLength(password: string) {
  return Array.from(password).length;
}

export function passwordByteLength(password: string) {
  return new TextEncoder().encode(password).byteLength;
}

export function validateNewPassword(password: string) {
  if (passwordCharacterLength(password) < PASSWORD_MIN_CHARACTERS) return "too-short" as const;
  if (passwordByteLength(password) > BCRYPT_MAX_BYTES) return "too-long" as const;
  return null;
}
