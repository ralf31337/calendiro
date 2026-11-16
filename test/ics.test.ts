import { describe, expect, it } from "vitest";
import { buildCalendar } from "../src/server/ics.js";
import type { Idea, Person } from "../src/shared/types.js";

const person: Person = { id: "p1", name: "Anna", feedId: "f1", createdAt: "2026-01-01T00:00:00.000Z" };

function idea(overrides: Partial<Idea>): Idea {
  return {
    id: "i1",
    name: "Tour",
    note: "",
    start: "2026-12-30",
    end: "2027-01-02",
    participants: ["p1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-04T05:06:07.890Z",
    sequence: 2,
    ...overrides,
  };
}

describe("buildCalendar", () => {
  it("emits all-day events with an exclusive end and stable UID", () => {
    const ics = buildCalendar(person, [idea({})]);
    expect(ics).toContain("UID:i1@calendiro\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261230\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270103\r\n");
    expect(ics).toContain("DTSTAMP:20260304T050607Z\r\n");
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).not.toContain("DESCRIPTION");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes text and folds long lines", () => {
    const note = "Bring: tent, stove; maps\nand a very long description ".repeat(4) + "äöü€";
    const ics = buildCalendar(person, [idea({ name: "A, B; C", note })]);
    expect(ics).toContain("SUMMARY:A\\, B\\; C\r\n");
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Bring: tent\\, stove\\; maps\\nand");
    expect(unfolded).toContain("äöü€");
  });
});
