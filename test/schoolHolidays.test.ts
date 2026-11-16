import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SchoolHolidays } from "../src/server/schoolHolidays.js";

const DATA: Record<string, unknown[]> = {
  "2025/NI": [{ start: "2025-12-22T00:00Z", end: "2026-01-05T23:59Z", name_cp: "Weihnachtsferien", stateCode: "NI" }],
  "2026/NI": [
    { start: "2026-03-23T00:00Z", end: "2026-04-07T23:59Z", name_cp: "Osterferien", stateCode: "NI" },
    { start: "2026-12-23T00:00Z", end: "2027-01-09T23:59Z", name_cp: "Weihnachtsferien", stateCode: "NI" },
    { start: "broken", end: "2026-05-01T23:59Z", name_cp: "Invalid" },
  ],
  "2027/NI": [{ start: "2027-03-22T00:00Z", end: "2027-04-02T23:59Z", name_cp: "Osterferien", stateCode: "NI" }],
};

let dir: string;
let calls: string[];
let offline: boolean;

const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  calls.push(url);
  if (offline) throw new Error("network down");
  const key = url.replace("https://api.test/", "").replace(/\/$/, "");
  const data = DATA[key];
  return new Response(JSON.stringify(data ?? { error: "none" }), { status: data ? 200 : 404 });
}) as typeof fetch;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "calendiro-holidays-"));
  calls = [];
  offline = false;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SchoolHolidays", () => {
  it("returns holidays overlapping a board, including Christmas from the previous year", async () => {
    const service = new SchoolHolidays(dir, "https://api.test", fakeFetch);
    const result = await service.between(["NI"], "2026-01-01", "2027-01-31");
    expect(result.incomplete).toBe(false);
    expect(result.holidays).toEqual([
      { state: "NI", name: "Weihnachtsferien", start: "2025-12-22", end: "2026-01-05" },
      { state: "NI", name: "Osterferien", start: "2026-03-23", end: "2026-04-07" },
      { state: "NI", name: "Weihnachtsferien", start: "2026-12-23", end: "2027-01-09" },
    ]);
  });

  it("caches per year and state, also across restarts", async () => {
    const service = new SchoolHolidays(dir, "https://api.test", fakeFetch);
    await service.between(["NI"], "2026-01-01", "2027-01-31");
    const first = calls.length;
    await service.between(["NI"], "2026-01-01", "2027-01-31");
    expect(calls.length).toBe(first);

    const restarted = new SchoolHolidays(dir, "https://api.test", fakeFetch);
    await restarted.between(["NI"], "2026-01-01", "2027-01-31");
    expect(calls.length).toBe(first);
  });

  it("falls back to stale cache when the API is down, and reports missing data", async () => {
    const service = new SchoolHolidays(dir, "https://api.test", fakeFetch, 0);
    await service.forYear(2026, "NI");
    offline = true;
    expect(await service.forYear(2026, "NI")).toHaveLength(2);

    const result = await service.between(["HB"], "2026-01-01", "2027-01-31");
    expect(result).toEqual({ holidays: [], incomplete: true });
  });

  it("treats years without data as empty", async () => {
    const service = new SchoolHolidays(dir, "https://api.test", fakeFetch);
    expect(await service.forYear(2031, "NI")).toEqual([]);
  });
});
