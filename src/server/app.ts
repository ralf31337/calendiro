import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { boardBounds } from "../shared/dates.js";
import { ChangeEvents } from "./events.js";
import { buildCalendar } from "./ics.js";
import type { SchoolHolidays } from "./schoolHolidays.js";
import { HttpError, Store } from "./store.js";

const nameBody = z.object({ name: z.string() });
const statesBody = z.object({ states: z.array(z.string()) });
const yearBody = z.object({ year: z.number().int() });
const colorBody = z.object({ color: z.string().nullable() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ideaCreateBody = z.object({
  name: z.string(),
  note: z.string().max(10_000).optional(),
  participants: z.array(z.string()).optional(),
});
const ideaPatchBody = z
  .object({
    name: z.string().optional(),
    note: z.string().max(10_000).optional(),
    participants: z.array(z.string()).optional(),
    start: isoDate.nullable().optional(),
    end: isoDate.nullable().optional(),
  })
  .strict();

function yearParam(req: Request): number {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) throw new HttpError(400, "Invalid year.");
  return year;
}

function param(req: Request, name: string): string {
  return String(req.params[name]);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "Invalid request.");
  return result.data;
}

interface AppOptions {
  clientDir?: string;
  schoolHolidays?: SchoolHolidays;
}

export function createApp(store: Store, events: ChangeEvents, { clientDir, schoolHolidays }: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();

  /** Runs a mutation, then tells every open browser to refresh. */
  const mutate =
    (handler: (req: Request, res: Response) => unknown | Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await handler(req, res);
        events.publish();
        if (!res.headersSent) res.json(result ?? { ok: true });
      } catch (err) {
        next(err);
      }
    };

  const read =
    (handler: (req: Request) => unknown) => (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(handler(req));
      } catch (err) {
        next(err);
      }
    };

  api.get("/events", (_req, res) => events.subscribe(res));

  api.get("/years", read(() => store.listYears()));
  api.post("/years", mutate((req) => store.addYear(parse(yearBody, req.body).year)));
  api.delete("/years/:year", mutate((req) => store.removeYear(yearParam(req))));

  api.get("/boards/:year", read((req) => store.boardView(yearParam(req))));

  api.post(
    "/boards/:year/spaces",
    mutate((req) => store.addSpace(yearParam(req), parse(nameBody, req.body).name)),
  );
  api.patch(
    "/boards/:year/spaces/:spaceId",
    mutate((req) => store.renameSpace(yearParam(req), param(req, "spaceId"), parse(nameBody, req.body).name)),
  );
  api.put(
    "/boards/:year/spaces/:spaceId/color",
    mutate((req) =>
      store.setSpaceColor(yearParam(req), param(req, "spaceId"), parse(colorBody, req.body).color),
    ),
  );
  api.delete(
    "/boards/:year/spaces/:spaceId",
    mutate((req) => store.deleteSpace(yearParam(req), param(req, "spaceId"))),
  );

  api.post(
    "/boards/:year/spaces/:spaceId/ideas",
    mutate((req) => store.addIdea(yearParam(req), param(req, "spaceId"), parse(ideaCreateBody, req.body))),
  );
  api.patch(
    "/boards/:year/ideas/:ideaId",
    mutate((req) => store.updateIdea(yearParam(req), param(req, "ideaId"), parse(ideaPatchBody, req.body))),
  );
  api.delete(
    "/boards/:year/ideas/:ideaId",
    mutate((req) => store.deleteIdea(yearParam(req), param(req, "ideaId"))),
  );

  api.get("/settings", read(() => store.getSettings()));
  api.put(
    "/settings/school-holiday-states",
    mutate((req) => store.setSchoolHolidayStates(parse(statesBody, req.body).states)),
  );

  /** School holidays of the selected states for a board: its year plus the next January. */
  api.get("/school-holidays/:year", async (req, res, next) => {
    try {
      const year = yearParam(req);
      const states = store.getSettings().schoolHolidayStates;
      if (!schoolHolidays || states.length === 0) {
        res.json({ holidays: [], incomplete: false });
        return;
      }
      res.json(await schoolHolidays.between(states, `${year}-01-01`, boardBounds(year).lastEnd));
    } catch (err) {
      next(err);
    }
  });

  api.get("/people", read(() => store.listPeople()));
  api.post("/people", mutate((req) => store.addPerson(parse(nameBody, req.body).name)));
  api.patch(
    "/people/:id",
    mutate((req) => store.renamePerson(param(req, "id"), parse(nameBody, req.body).name)),
  );
  api.post("/people/:id/rotate", mutate((req) => store.rotateFeed(param(req, "id"))));
  api.delete("/people/:id", mutate((req) => store.deletePerson(param(req, "id"))));

  api.use((_req, _res, next) => next(new HttpError(404, "Not found.")));
  app.use("/api", api);

  app.get("/ics/:feed", (req, res) => {
    const feedId = param(req, "feed").replace(/\.ics$/i, "");
    const feed = store.feed(feedId);
    if (!feed) {
      res.status(404).type("text/plain").send("Unknown calendar.");
      return;
    }
    res
      .type("text/calendar; charset=utf-8")
      .set("Cache-Control", "no-cache")
      .set("Content-Disposition", 'inline; filename="calendiro.ics"')
      .send(buildCalendar(feed.person, feed.ideas));
  });

  if (clientDir && existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
    app.get(/^\/(?!api\/|ics\/).*/, (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}
