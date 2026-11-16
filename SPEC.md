# App Specification

## Purpose of the Application

Calendiro is a shared year planner for activities and vacations.

One group uses it. People are names, there is no login, and anyone who can open the app can view and edit. The app is meant to stay on a trusted network, because opening it also reveals every person's feed link.

Users collect ideas in activity spaces (for example "Biking tours" with five tours they want to make), drag them onto the calendar to give them dates, and tick who participates. Each person can subscribe to their own calendar feed (ICS) in Outlook or Google Calendar.

The app does not enforce planning rules between people. Anyone can change, move, send back, or delete anything; users coordinate among themselves.

## Boards

- Each year is a separate board. A new year starts empty.
- The top bar has a year switcher (previous, a list of existing years, next) and an "Add year" action. Years from 1970 to 9998 can be added; a year can exist only once.
- A year can be removed only when it has no activity spaces. The "Remove" action is shown only for such an empty board and asks for confirmation.
- The selected year is kept in the address as `#YEAR`, so a link or reload opens that board.
- Without a year in the address, the app opens the board of the current calendar year when it exists, otherwise the latest board. Without any board it shows an empty state with an action to add the current year.
- A board shows twelve month columns for that year and a thirteenth column for January of the next year.
- Each month is a vertical list of days, day 1 at the top, labelled with the day number and weekday. Weekends are shaded, each week starts with a separator line, and today is highlighted with a light blue row and a blue day number. The month columns sit side by side and scroll horizontally.
- Activity spaces are shown in a panel to the left of the calendar.
- A placed idea is drawn as one continuous bar from its start day to its end day, beside the day list. All month columns have the same width. A bar that overlaps no other idea in that month uses the full width of the month. Ideas that overlap, directly or through a chain, share the width equally in side-by-side lanes (two lanes: half each, three lanes: a third each), so a bar crossing into the next month can have a different width there. Narrow bars show their name vertically. A bar that crosses a month boundary continues at day 1 of the next month.
- An idea belongs to one year. Its start date lies inside that year's twelve months. Its end date may fall in January of the next year, and no later.
- The thirteenth column shows only the ideas of the current board. Ideas of the next year's board are not shown there.
- On the next year's board, ideas of the previous board that reach into January are shown read-only with a hatched bar. Clicking one shows its details and offers to open the board it belongs to; it is changed or removed only there.

## School Holidays

- The top bar has a "School holidays" drop-down listing the 16 German states. Any number of states can be ticked, and "Clear" unticks all.
- The selection is shared by everyone and saved immediately; other open browsers pick it up like any other change.
- School holidays of the ticked states are only marked, not planned: the day label (day number and weekday) of each holiday day gets a light yellow background. Hovering it shows the holiday names and states, for example "Osterferien (NI)".
- Holidays are marked on all 13 columns of a board, including Christmas holidays that started in the previous year and holidays in the next January.
- If holidays cannot be loaded, the calendar shows what is available and the drop-down says that some holidays could not be loaded.
- The data comes from [schulferien-api.de](https://schulferien-api.de), which lists holidays per year and state. The server fetches it, not the browser.

## Activity Spaces and Ideas

- An activity space is a named list on one year board.
- Each space has a color, used for its header and for its ideas' bars. The color comes from its name: spaces with the same name get the same color in every year. Names that differ only in upper/lower case or spacing count as the same name.
- The app keeps a hidden registry of every space name ever used. A name gets the next automatic color when it is first used, as a new space or by renaming one, and keeps that color for good. Names are never removed from the registry, so deleting a space and creating it again later, even in another year, brings back its color. The registry itself is not shown in the app.
- Anyone can change a space's color by clicking the color dot in front of its name. The picker offers twelve preset colors, a custom color, and "Automatic", which returns to the color assigned automatically.
- A chosen color is stored for the name in the registry, so it changes the color of every space with that name, in every year, including bars of ideas carried over into the next January.
- Anyone can add a space and rename it by clicking its name. A space can be deleted with its delete button only while it is empty; the button is disabled otherwise.
- Spaces, and the ideas within each space, are shown alphabetically by name, ignoring case and sorting numbers naturally ("Tour 2" before "Tour 10"). Equal names keep the order they were created in. There is no drag-reordering.
- An idea has a name and an optional note. New ideas are added by name at the bottom of a space.
- An idea always lives in the space where it was created. It cannot be moved to another space; to do that, delete it and create a new idea in the other space.
- Repeating an activity means creating another idea. Each idea can be on the calendar only once.
- Clicking an idea, in the space or on the calendar, opens its dialog: name, note, start and end date, and participant ticks. Every change there is saved immediately.

### Scheduling

- Dragging an unscheduled idea from its space onto a day places it on that single day.
- On the calendar, dragging the top edge of a bar changes its start, dragging the bottom edge changes its end, and dragging the bar itself moves it while keeping its length.
- Dates can also be typed into the start and end fields of the idea dialog.
- All changes stay within the board's bounds: the start within the year, the end not before the start and at latest January 31 of the next year.
- While dragging, the calendar scrolls when the pointer nears its edges, and Escape cancels the drag.
- While an idea is on the calendar, it is shown greyed out with its dates in its space and cannot be dropped a second time.
- An idea can be sent back to its space at any time, by dragging its bar onto the spaces panel or with "Send back to space" in its dialog. This clears its dates and removes its bar from the calendar.
- An idea can be deleted at any time from its dialog, after a confirmation, whether or not it has dates.

### Participants

- Participant ticks belong to the idea and are set in the idea dialog. They can be set before the idea is placed, and they are kept when the idea is sent back.
- Ticked people are shown as initials on the idea in its space.
- A bar with nobody ticked has a dashed outline, because it is in nobody's feed.

## People

- People are managed in the "People" dialog in the top bar.
- Anyone can add a person by name, rename them, delete them, or rotate their UUID. Deleting and rotating ask for confirmation.
- Names are unique, ignoring case and surrounding spaces.
- Renaming keeps the UUID, the feed URL, and the person's participant ticks.
- Deleting a person removes their ticks and their feed.
- Rotating the UUID ("New link") invalidates the old feed URL immediately.
- The dialog shows each person's feed URL with a copy button. The URL is built from the address the app is opened at, so it must be opened at an address the calendar services can reach.

## ICS Feeds

- Each person has one secret feed at `/ics/<UUID>.ics` (also reachable without `.ics`). The URL contains only their UUID; an unknown UUID returns 404.
- Anyone who knows the UUID can read the feed.
- The calendar is named "Calendiro – <name>" and suggests a refresh every hour.
- The feed contains every placed idea the person is ticked on, from every year, including ideas that end in the next January.
- Events are all-day events and are marked as free time. The event title is the idea name and the description is the idea note.
- Each idea has a stable event identity and a change counter: changing its dates, name, or note updates the same event in subscribed calendars.
- Sending an idea back to its space, deleting it, or removing a person's tick removes it from that person's feed.
- An idea without dates is in no feed, even if people are ticked. A placed idea with nobody ticked is in no feed.

## Editing Together

- Every change is saved immediately. A drag shows its result right away, before the server confirms it.
- Other open browsers show the change within a few seconds. The top bar shows "Live" while connected and "Offline" while reconnecting.
- If two people change the same thing at the same time, the last save wins. There is no conflict warning.
- A rejected change (for example a duplicate name or a date outside the bounds) is shown as an error banner, and the view is reloaded from the server.

## Architecture

- The app runs as one Docker container (`Dockerfile`, `docker-compose.yml`). It can also run directly with Node.
- `GET /api/health` returns `{ "ok": true, "version": "<version>" }`. The image's health check uses it.
- It is built with Node and TypeScript: an Express server with a JSON API, and a React client built with Vite. Live updates use server-sent events.
- The server listens on `PORT` (default 3000) and stores data in `DATA_DIR` (default `./data`, `/data` in the container, mounted as a volume).
- Data is stored in JSON files:
  - `people.json` for people,
  - `boards/<year>.json` per year board, containing its activity spaces and ideas,
  - `space-names.json` for the hidden registry of space names, their automatic colors, and any chosen colors. If it is missing, it is rebuilt at startup from the existing boards; chosen colors are then lost,
  - `settings.json` for shared settings: the states whose school holidays are marked,
  - `cache/school-holidays/<year>-<state>.json` for fetched school holidays. Entries are refreshed after 7 days; when the API is unreachable, older entries are still used. The cache can be deleted at any time.
- School holidays need outbound internet access from the server (or container). The API address can be changed with `SCHOOL_HOLIDAYS_API` (default `https://schulferien-api.de/api/v1`).
- Each file is written whole to a temporary file and then renamed, so a crash never leaves a half-written file.
- The files are read once at startup and the server keeps the data in memory. Edit the files only while the server is stopped; changes made while it runs are not picked up and will be overwritten.
- Names are limited to 200 characters and notes to 10,000.
- The web app has no authentication. The ICS feeds are public to anyone who knows a UUID.

## Releases and Installation

- The release version is stored in `VERSION` and has the format `x.y`. The first version is `0.1`.
- A GitHub Actions workflow (`.github/workflows/docker.yml`) runs on every push to `main` and on pull requests. It type-checks, runs the tests, and builds the image for `linux/amd64` and `linux/arm64`. Pull requests are built but not published.
- Every push to `main` publishes `ghcr.io/ralf31337/calendiro:edge` and `:sha-<commit>`. When `VERSION` holds a version that has no git tag yet, the same run also publishes `:<x.y>` and `:latest`, creates the git tag `v<x.y>`, and a GitHub release. Releasing therefore means bumping `VERSION`.
- The image carries the version as `APP_VERSION` (`x.y` for releases, `x.y-edge.<commit>` otherwise), reported by `/api/health`.
- `batch.sh` installs Calendiro on a machine with Docker and can be piped from curl. It creates the installation directory with `docker-compose.yml`, `.env`, `data/` and `update.sh`, and starts the app. Options: `--dir`, `--port`, `--version`, `--cron` (nightly update at 03:30). Running it again keeps an existing `docker-compose.yml` and the data.
- The container runs as the user given by `CALENDIRO_UID`/`CALENDIRO_GID` in `.env`, so it can write the mounted `data/` directory. As root, the installer uses 1000:1000 and hands `data/` to that user.
- `update.sh [latest|x.y|edge] [--force]` updates an installation and is meant to run from cron. It stores the version in `.env`, pulls the image, and does nothing if the running container already uses it. Otherwise it stops the container, starts the new one, waits up to 60 seconds for `/api/health`, and removes old Calendiro images. A failed pull leaves the running version untouched. Without an argument it moves to `latest`.
