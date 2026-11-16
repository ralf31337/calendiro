import { parseISO } from "../shared/dates";
import type { ISODate } from "../shared/types";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(date: ISODate, withYear: boolean): string {
  const { year, month, day } = parseISO(date);
  return `${day} ${SHORT_MONTHS[month - 1]}${withYear ? ` ${year}` : ""}`;
}

export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDay(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
}

export const FALLBACK_COLOR = "hsl(220 10% 60%)";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function localToday(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
