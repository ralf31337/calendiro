import { describe, expect, it } from "vitest";
import { boardColumns, segmentsForColumn, type CalendarItem } from "../src/client/layout.js";
import { validateRange } from "../src/shared/dates.js";
import type { Idea } from "../src/shared/types.js";

function item(id: string, start: string, end: string): CalendarItem {
  const idea = { id, name: id, note: "", start, end, participants: [], createdAt: "", updatedAt: "", sequence: 0 } as Idea;
  return { idea, start, end, spaceId: "s", spaceName: "S", readOnly: false, fromYear: 2026 };
}

describe("layout", () => {
  it("has 13 columns ending with next January", () => {
    const columns = boardColumns(2028);
    expect(columns).toHaveLength(13);
    expect(columns[1].last).toBe("2028-02-29");
    expect(columns[12]).toMatchObject({ year: 2029, month: 1, first: "2029-01-01", last: "2029-01-31" });
  });

  it("gives lone ideas the full width and splits overlapping groups into lanes", () => {
    const [, , march] = boardColumns(2026);
    const segments = segmentsForColumn(march, [
      item("a", "2026-03-01", "2026-03-05"),
      item("b", "2026-03-04", "2026-03-06"),
      item("c", "2026-03-06", "2026-03-08"),
      item("d", "2026-03-20", "2026-03-22"),
    ]);
    const layout = Object.fromEntries(segments.map((s) => [s.item.idea.id, [s.lane, s.laneCount]]));
    expect(layout).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it("computes the width per month for a bar crossing months", () => {
    const [jan, feb] = boardColumns(2026);
    const items = [item("a", "2026-01-30", "2026-02-02"), item("b", "2026-01-31", "2026-01-31")];
    expect(segmentsForColumn(jan, items).find((s) => s.item.idea.id === "a")?.laneCount).toBe(2);
    expect(segmentsForColumn(feb, items)[0]).toMatchObject({ lane: 0, laneCount: 1 });
  });

  it("splits a bar across month columns", () => {
    const items = [item("a", "2026-01-30", "2026-02-02")];
    const [jan, feb, mar] = boardColumns(2026);
    expect(segmentsForColumn(jan, items)[0]).toMatchObject({ fromDay: 30, toDay: 31, isFirst: true, isLast: false });
    expect(segmentsForColumn(feb, items)[0]).toMatchObject({ fromDay: 1, toDay: 2, isFirst: false, isLast: true });
    expect(segmentsForColumn(mar, items)).toEqual([]);
  });
});

describe("validateRange", () => {
  it("accepts ends in next January only", () => {
    expect(validateRange(2026, "2026-12-31", "2027-01-31")).toBeNull();
    expect(validateRange(2026, "2027-01-01", "2027-01-02")).toMatch(/within/);
    expect(validateRange(2026, "2026-02-30", "2026-03-01")).toMatch(/valid/);
  });
});
