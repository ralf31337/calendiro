import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { ChangeEvents } from "../src/server/events.js";
import { Store } from "../src/server/store.js";

let dir: string;
let server: Server;
let base: string;
let store: Store;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "calendiro-api-"));
  store = new Store(dir);
  await store.load();
  server = createApp(store, new ChangeEvents()).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await store.flush();
  await rm(dir, { recursive: true, force: true });
});

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("API", () => {
  it("runs the planning flow end to end and serves the ICS feed", async () => {
    expect((await call("POST", "/api/years", { year: 2026 })).status).toBe(200);
    const space = (await call("POST", "/api/boards/2026/spaces", { name: "Biking" })).body;
    const idea = (await call("POST", `/api/boards/2026/spaces/${space.id}/ideas`, { name: "Alps tour" })).body;
    const anna = (await call("POST", "/api/people", { name: "Anna" })).body;
    expect((await call("POST", "/api/people", { name: "anna" })).status).toBe(409);

    const patched = await call("PATCH", `/api/boards/2026/ideas/${idea.id}`, {
      start: "2026-07-10",
      end: "2026-07-12",
      participants: [anna.id],
      note: "Bring the tent",
    });
    expect(patched.status).toBe(200);

    const bad = await call("PATCH", `/api/boards/2026/ideas/${idea.id}`, { start: "2027-01-02", end: "2027-01-03" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/within 2026/);

    expect((await call("DELETE", `/api/boards/2026/spaces/${space.id}`)).status).toBe(409);

    const ics = await fetch(`${base}/ics/${anna.feedId}.ics`);
    expect(ics.headers.get("content-type")).toMatch(/text\/calendar/);
    const text = await ics.text();
    expect(text).toContain("SUMMARY:Alps tour");
    expect(text).toContain("DTEND;VALUE=DATE:20260713");

    const rotated = (await call("POST", `/api/people/${anna.id}/rotate`)).body;
    expect((await fetch(`${base}/ics/${anna.feedId}.ics`)).status).toBe(404);
    expect((await fetch(`${base}/ics/${rotated.feedId}`)).status).toBe(200);
  });

  it("reports health and version", async () => {
    const res = await call("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: process.env.APP_VERSION ?? "dev" });
  });

  it("rejects invalid input and invalid JSON", async () => {
    expect((await call("POST", "/api/years", { year: "x" })).status).toBe(400);
    const res = await fetch(`${base}/api/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
  });
});
