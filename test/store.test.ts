import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/server/store.js";

let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "calendiro-"));
  store = new Store(dir);
  await store.load();
});

afterEach(async () => {
  await store.flush();
  await rm(dir, { recursive: true, force: true });
});

function setup() {
  store.addYear(2026);
  const space = store.addSpace(2026, "Biking tours");
  const idea = store.addIdea(2026, space.id, { name: "Tour 1" });
  return { space, idea };
}

describe("years", () => {
  it("adds empty boards and refuses duplicates", () => {
    store.addYear(2026);
    expect(store.boardView(2026).board.spaces).toEqual([]);
    expect(() => store.addYear(2026)).toThrow(/already exists/);
  });

  it("removes only years without spaces", async () => {
    setup();
    await expect(store.removeYear(2026)).rejects.toThrow(/without activity spaces/);
    store.addYear(2027);
    await store.removeYear(2027);
    expect(store.listYears()).toEqual([2026]);
  });
});

describe("spaces", () => {
  it("deletes only empty spaces", () => {
    const { space, idea } = setup();
    expect(() => store.deleteSpace(2026, space.id)).toThrow(/empty/);
    store.deleteIdea(2026, idea.id);
    store.deleteSpace(2026, space.id);
    expect(store.boardView(2026).board.spaces).toEqual([]);
  });
});

describe("space colours", () => {
  it("gives the same name the same hue in every year, and different names different hues", () => {
    store.addYear(2026);
    store.addYear(2027);
    const bike26 = store.addSpace(2026, "Biking tours");
    const hike26 = store.addSpace(2026, "Hiking");
    const bike27 = store.addSpace(2027, "  biking   TOURS ");
    const colors26 = store.boardView(2026).spaceColors;
    const colors27 = store.boardView(2027).spaceColors;
    expect(colors27[bike27.id]).toEqual(colors26[bike26.id]);
    expect(colors26[hike26.id].color).not.toBe(colors26[bike26.id].color);
    expect(colors26[bike26.id].custom).toBe(false);
  });

  it("remembers names after their spaces are deleted, and registers renames", () => {
    store.addYear(2026);
    store.addYear(2027);
    const first = store.addSpace(2026, "Trips");
    const color = store.boardView(2026).spaceColors[first.id];
    store.deleteSpace(2026, first.id);
    const other = store.addSpace(2027, "Other");
    store.renameSpace(2027, other.id, "Trips");
    expect(store.boardView(2027).spaceColors[other.id]).toEqual(color);
  });

  it("changes the color for the name in every year, and resets it to automatic", () => {
    store.addYear(2026);
    store.addYear(2027);
    const s26 = store.addSpace(2026, "Trips");
    const s27 = store.addSpace(2027, "trips");
    const automatic = store.boardView(2026).spaceColors[s26.id];

    store.setSpaceColor(2027, s27.id, "#3E63DD");
    expect(store.boardView(2026).spaceColors[s26.id]).toEqual({ color: "#3e63dd", custom: true });
    expect(() => store.setSpaceColor(2026, s26.id, "red")).toThrow(/#3366cc/);

    store.setSpaceColor(2026, s26.id, null);
    expect(store.boardView(2027).spaceColors[s27.id]).toEqual(automatic);
  });

  it("persists the registry and fills it from existing boards", async () => {
    store.addYear(2026);
    const space = store.addSpace(2026, "Trips");
    const color = store.boardView(2026).spaceColors[space.id];
    await store.flush();
    await rm(path.join(dir, "space-names.json"));

    const migrated = new Store(dir);
    await migrated.load();
    expect(migrated.boardView(2026).spaceColors[space.id]).toEqual(color);
    migrated.setSpaceColor(2026, space.id, "#12a594");
    await migrated.flush();
    const file = JSON.parse(await readFile(path.join(dir, "space-names.json"), "utf8"));
    expect(file.names).toEqual([{ key: "trips", hue: expect.any(Number), color: "#12a594" }]);

    const reloaded = new Store(dir);
    await reloaded.load();
    expect(reloaded.boardView(2026).spaceColors[space.id]).toEqual({ color: "#12a594", custom: true });
  });
});

describe("ideas", () => {
  it("enforces the board date bounds", () => {
    const { idea } = setup();
    expect(() => store.updateIdea(2026, idea.id, { start: "2025-12-31", end: "2026-01-02" })).toThrow(/within 2026/);
    expect(() => store.updateIdea(2026, idea.id, { start: "2026-12-30", end: "2027-02-01" })).toThrow(/2027-01-31/);
    expect(() => store.updateIdea(2026, idea.id, { start: "2026-05-03", end: "2026-05-02" })).toThrow(/before/);
    expect(() => store.updateIdea(2026, idea.id, { start: "2026-05-03" })).toThrow(/both/);
    const updated = store.updateIdea(2026, idea.id, { start: "2026-12-30", end: "2027-01-31" });
    expect(updated.end).toBe("2027-01-31");
  });

  it("keeps ticks when sent back and bumps the sequence", () => {
    const { idea } = setup();
    const anna = store.addPerson("Anna");
    store.updateIdea(2026, idea.id, { participants: [anna.id, "unknown"] });
    store.updateIdea(2026, idea.id, { start: "2026-03-01", end: "2026-03-03" });
    const back = store.updateIdea(2026, idea.id, { start: null, end: null });
    expect(back.participants).toEqual([anna.id]);
    expect(back.start).toBeNull();
    expect(back.sequence).toBe(3);
  });

  it("shows the previous year's January tails as carry-over", () => {
    const { idea } = setup();
    store.updateIdea(2026, idea.id, { start: "2026-12-28", end: "2027-01-03" });
    store.addYear(2027);
    const view = store.boardView(2027);
    expect(view.carryOver.map((c) => c.idea.id)).toEqual([idea.id]);
    expect(view.carryOver[0].year).toBe(2026);
  });
});

describe("people and feeds", () => {
  it("requires unique names, case-insensitively", () => {
    store.addPerson("Anna");
    expect(() => store.addPerson(" anna ")).toThrow(/already/);
    const ben = store.addPerson("Ben");
    expect(() => store.renamePerson(ben.id, "ANNA")).toThrow(/already/);
  });

  it("feeds only placed ideas the person is ticked on, across years", () => {
    const { space, idea } = setup();
    const anna = store.addPerson("Anna");
    const ben = store.addPerson("Ben");
    const unplaced = store.addIdea(2026, space.id, { name: "Unplaced", participants: [anna.id] });
    store.updateIdea(2026, idea.id, { start: "2026-06-01", end: "2026-06-02", participants: [anna.id] });
    store.addYear(2027);
    const s27 = store.addSpace(2027, "Trips");
    const later = store.addIdea(2027, s27.id, { name: "Later", participants: [anna.id, ben.id] });
    store.updateIdea(2027, later.id, { start: "2027-02-01", end: "2027-02-01" });

    expect(store.feed(anna.feedId)!.ideas.map((i) => i.id)).toEqual([idea.id, later.id]);
    expect(store.feed(ben.feedId)!.ideas.map((i) => i.id)).toEqual([later.id]);
    expect(store.feed(anna.feedId)!.ideas.map((i) => i.id)).not.toContain(unplaced.id);
  });

  it("rotating invalidates the old feed, rename keeps it", () => {
    const anna = store.addPerson("Anna");
    const oldFeed = anna.feedId;
    store.renamePerson(anna.id, "Anna B.");
    expect(store.feed(oldFeed)?.person.name).toBe("Anna B.");
    store.rotateFeed(anna.id);
    expect(store.feed(oldFeed)).toBeNull();
    expect(store.feed(anna.feedId)).not.toBeNull();
  });

  it("deleting a person removes their ticks and feed", () => {
    const { idea } = setup();
    const anna = store.addPerson("Anna");
    store.updateIdea(2026, idea.id, { participants: [anna.id] });
    store.deletePerson(anna.id);
    expect(store.boardView(2026).board.spaces[0].ideas[0].participants).toEqual([]);
    expect(store.feed(anna.feedId)).toBeNull();
  });
});

describe("settings", () => {
  it("stores the selected school holiday states in a fixed order and rejects unknown codes", async () => {
    expect(store.getSettings().schoolHolidayStates).toEqual([]);
    store.setSchoolHolidayStates(["NI", "BY", "NI"]);
    expect(store.getSettings().schoolHolidayStates).toEqual(["BY", "NI"]);
    expect(() => store.setSchoolHolidayStates(["XX"])).toThrow(/Unknown state/);

    await store.flush();
    const reloaded = new Store(dir);
    await reloaded.load();
    expect(reloaded.getSettings().schoolHolidayStates).toEqual(["BY", "NI"]);
  });
});

describe("persistence", () => {
  it("writes JSON files and reloads them", async () => {
    const { idea } = setup();
    store.addPerson("Anna");
    store.updateIdea(2026, idea.id, { note: "Bring snacks" });
    await store.flush();

    const board = JSON.parse(await readFile(path.join(dir, "boards", "2026.json"), "utf8"));
    expect(board.spaces[0].ideas[0].note).toBe("Bring snacks");

    const reloaded = new Store(dir);
    await reloaded.load();
    expect(reloaded.listYears()).toEqual([2026]);
    expect(reloaded.listPeople().map((p) => p.name)).toEqual(["Anna"]);
  });
});
