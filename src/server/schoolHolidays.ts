import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isISODate } from "../shared/dates.js";
import type { ISODate, SchoolHoliday, SchoolHolidaysResponse } from "../shared/types.js";

const DAY_MS = 86_400_000;

interface CacheEntry {
  fetchedAt: number;
  holidays: SchoolHoliday[];
}

interface ApiHoliday {
  start?: unknown;
  end?: unknown;
  name?: unknown;
  name_cp?: unknown;
  stateCode?: unknown;
}

/**
 * School holidays from schulferien-api.de, cached in memory and on disk per year and state.
 * The API lists a holiday under the year it starts in, so Christmas holidays belong to the old year.
 */
export class SchoolHolidays {
  private memory = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<SchoolHoliday[]>>();

  constructor(
    private readonly cacheDir: string,
    private readonly baseUrl = "https://schulferien-api.de/api/v1",
    private readonly fetcher: typeof fetch = fetch,
    private readonly maxAgeMs = 7 * DAY_MS,
  ) {}

  /** Holidays of the given states that overlap the date range, from every year the range touches. */
  async between(states: string[], from: ISODate, to: ISODate): Promise<SchoolHolidaysResponse> {
    const firstYear = Number(from.slice(0, 4)) - 1;
    const lastYear = Number(to.slice(0, 4));
    const jobs: Promise<SchoolHoliday[]>[] = [];
    for (const state of states) {
      for (let year = firstYear; year <= lastYear; year++) jobs.push(this.forYear(year, state));
    }
    const results = await Promise.allSettled(jobs);
    const seen = new Set<string>();
    const holidays: SchoolHoliday[] = [];
    let incomplete = false;
    for (const result of results) {
      if (result.status === "rejected") {
        incomplete = true;
        continue;
      }
      for (const holiday of result.value) {
        const key = `${holiday.state}|${holiday.start}|${holiday.end}`;
        if (holiday.end < from || holiday.start > to || seen.has(key)) continue;
        seen.add(key);
        holidays.push(holiday);
      }
    }
    holidays.sort((a, b) => a.start.localeCompare(b.start) || a.state.localeCompare(b.state));
    return { holidays, incomplete };
  }

  forYear(year: number, state: string): Promise<SchoolHoliday[]> {
    const key = `${year}-${state}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const job = this.load(year, state, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private async load(year: number, state: string, key: string): Promise<SchoolHoliday[]> {
    const cached = this.memory.get(key) ?? (await this.readCache(key));
    if (cached && Date.now() - cached.fetchedAt < this.maxAgeMs) return cached.holidays;
    try {
      const holidays = await this.fetchFromApi(year, state);
      const entry = { fetchedAt: Date.now(), holidays };
      this.memory.set(key, entry);
      await this.writeCache(key, entry);
      return holidays;
    } catch (err) {
      if (cached) return cached.holidays;
      console.warn(`School holidays for ${state} ${year} unavailable:`, (err as Error).message);
      throw err;
    }
  }

  private async fetchFromApi(year: number, state: string): Promise<SchoolHoliday[]> {
    const res = await this.fetcher(`${this.baseUrl}/${year}/${state}/`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ApiHoliday[];
    if (!Array.isArray(data)) throw new Error("Unexpected response");
    const holidays: SchoolHoliday[] = [];
    for (const item of data) {
      const start = typeof item.start === "string" ? item.start.slice(0, 10) : "";
      const end = typeof item.end === "string" ? item.end.slice(0, 10) : "";
      if (!isISODate(start) || !isISODate(end) || end < start) continue;
      const name = typeof item.name_cp === "string" ? item.name_cp : typeof item.name === "string" ? item.name : "Ferien";
      holidays.push({ state: typeof item.stateCode === "string" ? item.stateCode : state, name, start, end });
    }
    return holidays;
  }

  private file(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  private async readCache(key: string): Promise<CacheEntry | undefined> {
    try {
      const entry = JSON.parse(await readFile(this.file(key), "utf8")) as CacheEntry;
      this.memory.set(key, entry);
      return entry;
    } catch {
      return undefined;
    }
  }

  private async writeCache(key: string, entry: CacheEntry): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const tmp = `${this.file(key)}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(entry) + "\n", "utf8");
      await rename(tmp, this.file(key));
    } catch (err) {
      console.warn(`Could not cache school holidays ${key}:`, (err as Error).message);
    }
  }
}
