export function parsePublicPage(value: string | string[] | undefined) {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^[1-9]\d{0,6}$/.test(value)) return null;

  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}
