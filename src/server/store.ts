import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isISODate, validateRange } from "../shared/dates.js";
import { STATE_CODES } from "../shared/states.js";
import type { Board, BoardView, CarryOver, Idea, IdeaPatch, Person, Settings, Space, SpaceColor } from "../shared/types.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface PeopleFile {
  people: Person[];
}

interface SpaceNameEntry {
  /** Automatically assigned when the name is first used. */
  hue: number;
  /** Chosen by a user (`#rrggbb`); wins over the hue. */
  color?: string;
}

/** Every space name ever used, with its color. Entries are never removed. */
interface SpaceNamesFile {
  names: ({ key: string } & SpaceNameEntry)[];
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Space names that differ only in case or spacing share one registry entry. */
export function spaceNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Golden-angle steps keep consecutive hues far apart, however many names are registered. */
function hueForIndex(index: number): number {
  return Math.round(((210 + index * 137.508) % 360) * 10) / 10;
}

const MIN_YEAR = 1970;
const MAX_YEAR = 9998;

function now(): string {
  return new Date().toISOString();
}

function cleanName(value: string, what: string): string {
  const name = value.trim();
  if (!name) throw new HttpError(400, `${what} must not be empty.`);
  if (name.length > 200) throw new HttpError(400, `${what} is too long.`);
  return name;
}

export class Store {
  private people: Person[] = [];
  private boards = new Map<number, Board>();
  private spaceNames = new Map<string, SpaceNameEntry>();
  private settings: Settings = { schoolHolidayStates: [] };
  private writes: Promise<void> = Promise.resolve();
  private readonly boardsDir: string;
  private readonly peoplePath: string;
  private readonly spaceNamesPath: string;
  private readonly settingsPath: string;

  constructor(private readonly dataDir: string) {
    this.boardsDir = path.join(dataDir, "boards");
    this.peoplePath = path.join(dataDir, "people.json");
    this.spaceNamesPath = path.join(dataDir, "space-names.json");
    this.settingsPath = path.join(dataDir, "settings.json");
  }

  async load(): Promise<void> {
    await mkdir(this.boardsDir, { recursive: true });
    try {
      const file = JSON.parse(await readFile(this.peoplePath, "utf8")) as PeopleFile;
      this.people = file.people ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.people = [];
    }
    this.boards.clear();
    for (const entry of await readdir(this.boardsDir)) {
      const match = /^(\d{4})\.json$/.exec(entry);
      if (!match) continue;
      const board = JSON.parse(await readFile(path.join(this.boardsDir, entry), "utf8")) as Board;
      this.boards.set(Number(match[1]), board);
    }

    this.spaceNames.clear();
    try {
      const file = JSON.parse(await readFile(this.spaceNamesPath, "utf8")) as SpaceNamesFile;
      for (const { key, ...entry } of file.names ?? []) this.spaceNames.set(key, entry);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const known = this.spaceNames.size;
    for (const year of this.listYears()) {
      for (const space of this.boards.get(year)!.spaces) this.registerSpaceName(space.name, false);
    }
    if (this.spaceNames.size !== known) this.saveSpaceNames();

    try {
      const file = JSON.parse(await readFile(this.settingsPath, "utf8")) as Partial<Settings>;
      this.settings = {
        schoolHolidayStates: (file.schoolHolidayStates ?? []).filter((code) => STATE_CODES.includes(code)),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.settings = { schoolHolidayStates: [] };
    }
  }

  // Settings

  getSettings(): Settings {
    return this.settings;
  }

  setSchoolHolidayStates(states: string[]): Settings {
    const unknown = states.filter((code) => !STATE_CODES.includes(code));
    if (unknown.length) throw new HttpError(400, `Unknown state: ${unknown.join(", ")}.`);
    this.settings = { ...this.settings, schoolHolidayStates: STATE_CODES.filter((code) => states.includes(code)) };
    this.enqueueWrite(this.settingsPath, this.settings);
    return this.settings;
  }

  /** Resolves once every write queued so far is on disk. */
  flush(): Promise<void> {
    return this.writes;
  }

  private enqueueWrite(file: string, data: unknown): void {
    const json = JSON.stringify(data, null, 2) + "\n";
    this.queue(async () => {
      const tmp = `${file}.${randomUUID()}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, file);
    }, file);
  }

  private queue(job: () => Promise<void>, file: string): Promise<void> {
    const run = this.writes.then(job);
    this.writes = run.catch((err) => console.error(`Failed to write ${file}:`, err));
    return run;
  }

  private savePeople(): void {
    this.enqueueWrite(this.peoplePath, { people: this.people } satisfies PeopleFile);
  }

  private saveBoard(board: Board): void {
    this.enqueueWrite(path.join(this.boardsDir, `${board.year}.json`), board);
  }

  private saveSpaceNames(): void {
    const names = [...this.spaceNames].map(([key, entry]) => ({ key, ...entry }));
    this.enqueueWrite(this.spaceNamesPath, { names } satisfies SpaceNamesFile);
  }

  private registerSpaceName(name: string, save = true): SpaceNameEntry {
    const key = spaceNameKey(name);
    let entry = this.spaceNames.get(key);
    if (!entry) {
      entry = { hue: hueForIndex(this.spaceNames.size) };
      this.spaceNames.set(key, entry);
      if (save) this.saveSpaceNames();
    }
    return entry;
  }

  private colorOf(spaceName: string): SpaceColor {
    const entry = this.spaceNames.get(spaceNameKey(spaceName)) ?? { hue: 0 };
    return entry.color
      ? { color: entry.color, custom: true }
      : { color: `hsl(${entry.hue} 62% 52%)`, custom: false };
  }

  // Years

  listYears(): number[] {
    return [...this.boards.keys()].sort((a, b) => a - b);
  }

  private board(year: number): Board {
    const board = this.boards.get(year);
    if (!board) throw new HttpError(404, `There is no board for ${year}.`);
    return board;
  }

  boardView(year: number): BoardView {
    const board = this.board(year);
    const carryOver: CarryOver[] = [];
    const previous = this.boards.get(year - 1);
    if (previous) {
      const january = `${year}-01-01`;
      for (const space of previous.spaces) {
        for (const idea of space.ideas) {
          if (idea.end && idea.end >= january) {
            carryOver.push({ year: year - 1, spaceId: space.id, spaceName: space.name, idea });
          }
        }
      }
    }
    const spaceColors: Record<string, SpaceColor> = {};
    for (const space of board.spaces) spaceColors[space.id] = this.colorOf(space.name);
    for (const c of carryOver) spaceColors[c.spaceId] = this.colorOf(c.spaceName);
    return { board, carryOver, spaceColors };
  }

  addYear(year: number): void {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      throw new HttpError(400, `The year must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
    }
    if (this.boards.has(year)) throw new HttpError(409, `The board for ${year} already exists.`);
    const board: Board = { year, spaces: [] };
    this.boards.set(year, board);
    this.saveBoard(board);
  }

  async removeYear(year: number): Promise<void> {
    const board = this.board(year);
    if (board.spaces.length > 0) {
      throw new HttpError(409, "Only a year without activity spaces can be removed.");
    }
    this.boards.delete(year);
    const file = path.join(this.boardsDir, `${year}.json`);
    await this.queue(() => rm(file, { force: true }), file);
  }

  // Spaces

  private space(board: Board, spaceId: string): Space {
    const space = board.spaces.find((s) => s.id === spaceId);
    if (!space) throw new HttpError(404, "This activity space no longer exists.");
    return space;
  }

  addSpace(year: number, name: string): Space {
    const board = this.board(year);
    const space: Space = { id: randomUUID(), name: cleanName(name, "The space name"), createdAt: now(), ideas: [] };
    board.spaces.push(space);
    this.registerSpaceName(space.name);
    this.saveBoard(board);
    return space;
  }

  renameSpace(year: number, spaceId: string, name: string): void {
    const board = this.board(year);
    const space = this.space(board, spaceId);
    space.name = cleanName(name, "The space name");
    this.registerSpaceName(space.name);
    this.saveBoard(board);
  }

  /** Sets the color of the space's name, so it applies to every space with that name in every year. */
  setSpaceColor(year: number, spaceId: string, color: string | null): void {
    const space = this.space(this.board(year), spaceId);
    const entry = this.registerSpaceName(space.name, false);
    if (color === null) {
      delete entry.color;
    } else {
      const normalized = color.toLowerCase();
      if (!HEX_COLOR.test(normalized)) throw new HttpError(400, "The color must look like #3366cc.");
      entry.color = normalized;
    }
    this.saveSpaceNames();
  }

  deleteSpace(year: number, spaceId: string): void {
    const board = this.board(year);
    const space = this.space(board, spaceId);
    if (space.ideas.length > 0) throw new HttpError(409, "Only an empty activity space can be deleted.");
    board.spaces = board.spaces.filter((s) => s !== space);
    this.saveBoard(board);
  }

  // Ideas

  private findIdea(board: Board, ideaId: string): { space: Space; idea: Idea } {
    for (const space of board.spaces) {
      const idea = space.ideas.find((i) => i.id === ideaId);
      if (idea) return { space, idea };
    }
    throw new HttpError(404, "This idea no longer exists.");
  }

  private knownParticipants(ids: string[]): string[] {
    const known = new Set(this.people.map((p) => p.id));
    return [...new Set(ids)].filter((id) => known.has(id));
  }

  addIdea(year: number, spaceId: string, input: { name: string; note?: string; participants?: string[] }): Idea {
    const board = this.board(year);
    const space = this.space(board, spaceId);
    const timestamp = now();
    const idea: Idea = {
      id: randomUUID(),
      name: cleanName(input.name, "The idea name"),
      note: input.note ?? "",
      start: null,
      end: null,
      participants: this.knownParticipants(input.participants ?? []),
      createdAt: timestamp,
      updatedAt: timestamp,
      sequence: 0,
    };
    space.ideas.push(idea);
    this.saveBoard(board);
    return idea;
  }

  updateIdea(year: number, ideaId: string, patch: IdeaPatch): Idea {
    const board = this.board(year);
    const { idea } = this.findIdea(board, ideaId);
    const next: Idea = { ...idea };

    if (patch.name !== undefined) next.name = cleanName(patch.name, "The idea name");
    if (patch.note !== undefined) next.note = patch.note;
    if (patch.participants !== undefined) next.participants = this.knownParticipants(patch.participants);

    if (patch.start !== undefined || patch.end !== undefined) {
      const start = patch.start === undefined ? idea.start : patch.start;
      const end = patch.end === undefined ? idea.end : patch.end;
      if (start === null || end === null) {
        if (start !== end) throw new HttpError(400, "Start and end must both be set or both be cleared.");
      } else {
        const problem = validateRange(year, start, end);
        if (problem) throw new HttpError(400, problem);
      }
      next.start = start;
      next.end = end;
    }

    Object.assign(idea, next, { updatedAt: now(), sequence: idea.sequence + 1 });
    this.saveBoard(board);
    return idea;
  }

  deleteIdea(year: number, ideaId: string): void {
    const board = this.board(year);
    const { space, idea } = this.findIdea(board, ideaId);
    space.ideas = space.ideas.filter((i) => i !== idea);
    this.saveBoard(board);
  }

  // People

  listPeople(): Person[] {
    return this.people;
  }

  private person(id: string): Person {
    const person = this.people.find((p) => p.id === id);
    if (!person) throw new HttpError(404, "This person no longer exists.");
    return person;
  }

  private assertUniqueName(name: string, exceptId?: string): void {
    const lower = name.toLocaleLowerCase();
    if (this.people.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === lower)) {
      throw new HttpError(409, `There is already a person named "${name}".`);
    }
  }

  addPerson(name: string): Person {
    const clean = cleanName(name, "The name");
    this.assertUniqueName(clean);
    const person: Person = { id: randomUUID(), name: clean, feedId: randomUUID(), createdAt: now() };
    this.people.push(person);
    this.savePeople();
    return person;
  }

  renamePerson(id: string, name: string): Person {
    const person = this.person(id);
    const clean = cleanName(name, "The name");
    this.assertUniqueName(clean, id);
    person.name = clean;
    this.savePeople();
    return person;
  }

  rotateFeed(id: string): Person {
    const person = this.person(id);
    person.feedId = randomUUID();
    this.savePeople();
    return person;
  }

  deletePerson(id: string): void {
    this.person(id);
    this.people = this.people.filter((p) => p.id !== id);
    this.savePeople();
    for (const board of this.boards.values()) {
      let changed = false;
      for (const space of board.spaces) {
        for (const idea of space.ideas) {
          if (idea.participants.includes(id)) {
            idea.participants = idea.participants.filter((p) => p !== id);
            changed = true;
          }
        }
      }
      if (changed) this.saveBoard(board);
    }
  }

  // Feeds

  feed(feedId: string): { person: Person; ideas: Idea[] } | null {
    const person = this.people.find((p) => p.feedId === feedId);
    if (!person) return null;
    const ideas: Idea[] = [];
    for (const year of this.listYears()) {
      for (const space of this.boards.get(year)!.spaces) {
        for (const idea of space.ideas) {
          if (idea.start && idea.end && isISODate(idea.start) && idea.participants.includes(person.id)) {
            ideas.push(idea);
          }
        }
      }
    }
    return { person, ideas };
  }
}
