import { addDays } from "../shared/dates.js";
import type { Idea, ISODate, Person } from "../shared/types.js";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 line folding: at most 75 octets per line, without splitting UTF-8 characters. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function dateValue(date: ISODate): string {
  return date.replace(/-/g, "");
}

function timestampValue(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildCalendar(person: Person, ideas: Idea[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendiro//Calendiro//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`Calendiro – ${person.name}`)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const idea of ideas) {
    if (!idea.start || !idea.end) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${idea.id}@calendiro`,
      `DTSTAMP:${timestampValue(idea.updatedAt)}`,
      `LAST-MODIFIED:${timestampValue(idea.updatedAt)}`,
      `SEQUENCE:${idea.sequence}`,
      `DTSTART;VALUE=DATE:${dateValue(idea.start)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(idea.end, 1))}`,
      `SUMMARY:${escapeText(idea.name)}`,
    );
    if (idea.note.trim()) lines.push(`DESCRIPTION:${escapeText(idea.note)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
