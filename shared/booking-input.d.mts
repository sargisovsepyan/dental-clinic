export function isHumanName(value: unknown, maxLength?: number): boolean;
export function canonicalPhone(value: unknown): string | null;
export function isEmail(value: unknown, required?: boolean): boolean;
export function isCalendarDate(value: unknown): boolean;
export function isBookingDate(value: string, range: { min: string; max: string }): boolean;
