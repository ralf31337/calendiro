import type { ISODate } from "./types.js";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function toISO(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseISO(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUTC(date: ISODate): number {
  const { year, month, day } = parseISO(date);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Number of days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Bounds for ideas of a year board: start within the year, end at latest Jan 31 of the next year. */
export function boardBounds(year: number): { firstStart: ISODate; lastStart: ISODate; lastEnd: ISODate } {
  return {
    firstStart: toISO(year, 1, 1),
    lastStart: toISO(year, 12, 31),
    lastEnd: toISO(year + 1, 1, 31),
  };
}

/** Returns an error message, or null when the range is allowed on the given year board. */
export function validateRange(year: number, start: ISODate, end: ISODate): string | null {
  if (!isISODate(start) || !isISODate(end)) return "Dates must be valid YYYY-MM-DD dates.";
  const { firstStart, lastStart, lastEnd } = boardBounds(year);
  if (start < firstStart || start > lastStart) return `The start must be within ${year}.`;
  if (end < start) return "The end must not be before the start.";
  if (end > lastEnd) return `The end must be on or before ${lastEnd}.`;
  return null;
}
