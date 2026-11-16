import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ChangeEvents } from "./events.js";
import { SchoolHolidays } from "./schoolHolidays.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
const clientDir = path.resolve(
  process.env.CLIENT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client"),
);

const store = new Store(dataDir);
await store.load();
const events = new ChangeEvents();
const schoolHolidays = new SchoolHolidays(
  path.join(dataDir, "cache", "school-holidays"),
  process.env.SCHOOL_HOLIDAYS_API ?? "https://schulferien-api.de/api/v1",
);
const server = createApp(store, events, { clientDir, schoolHolidays }).listen(port, () => {
  console.log(
    `Calendiro ${process.env.APP_VERSION ?? "dev"} listening on http://localhost:${port} (data: ${dataDir})`,
  );
});

async function shutdown() {
  events.closeAll();
  server.close();
  await store.flush();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
