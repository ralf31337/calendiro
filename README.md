# Calendiro

A shared year planner for activities and vacations. Collect ideas in activity spaces ("Biking tours", "Hiking", …), drag them onto a year calendar, tick who joins, and subscribe to your own calendar feed (ICS) in Outlook or Google Calendar. German school holidays can be marked on the calendar.

There is no login: everyone who can open the app can edit it. Run it on a trusted network.

The full behavior is described in [SPEC.md](SPEC.md).

## Install with Docker

Requirements: a machine with [Docker](https://docs.docker.com/engine/install/) and Docker Compose. Images are published for `linux/amd64` and `linux/arm64` (for example a Raspberry Pi 4/5).

### Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/ralf31337/calendiro/main/batch.sh | bash
```

This creates an installation directory (`/opt/calendiro` when run as root, otherwise `~/calendiro`), writes `docker-compose.yml` and `.env`, downloads `update.sh`, and starts Calendiro on port 3000.

Options go after `bash -s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/ralf31337/calendiro/main/batch.sh \
  | sudo bash -s -- --dir /opt/calendiro --port 8080 --version 0.1 --cron
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--dir DIR` | `/opt/calendiro` (root), `~/calendiro` | Installation directory |
| `--port PORT` | `3000` | Port on the host |
| `--version X.Y` | `latest` | Version to install (`latest`, `edge`, or for example `0.1`) |
| `--cron` | off | Add a nightly update at 03:30 to the crontab |

Running the script again keeps your `docker-compose.yml` and data.

### Manual install

Create a directory with these two files:

`docker-compose.yml`

```yaml
services:
  calendiro:
    image: ${CALENDIRO_IMAGE:-ghcr.io/ralf31337/calendiro}:${CALENDIRO_VERSION:-latest}
    container_name: calendiro
    restart: unless-stopped
    user: "${CALENDIRO_UID:-1000}:${CALENDIRO_GID:-1000}"
    ports:
      - "${CALENDIRO_PORT:-3000}:3000"
    volumes:
      - ./data:/data
```

`.env`

```bash
# latest, edge, or a version like 0.1
CALENDIRO_VERSION=latest
CALENDIRO_PORT=3000
# The container runs as this user and must be able to write ./data (see `id -u` and `id -g`).
CALENDIRO_UID=1000
CALENDIRO_GID=1000
```

Then start it:

```bash
mkdir -p data
sudo chown 1000:1000 data   # match CALENDIRO_UID / CALENDIRO_GID
docker compose up -d
```

Open `http://<host>:3000`.

If you prefer a fixed configuration without `.env`, write the values directly into the compose file:

```yaml
services:
  calendiro:
    image: ghcr.io/ralf31337/calendiro:0.1
    container_name: calendiro
    restart: unless-stopped
    user: "1000:1000"
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
```

### Behind a reverse proxy

Calendar feed links are built from the address the app is opened at. If people subscribe from Outlook or Google Calendar, open Calendiro at an address those services can reach, for example `https://calendiro.example.com`. The app uses server-sent events for live updates, so the proxy must not buffer responses on `/api/events` (Calendiro already sends `X-Accel-Buffering: no` for nginx).

## Updating

`update.sh` lives in the installation directory (or download it next to your `docker-compose.yml` from [update.sh](update.sh)):

```bash
./update.sh          # latest release
./update.sh 0.2      # a specific version
./update.sh edge     # newest build of the main branch
./update.sh --force  # restart even if nothing changed
```

It pulls the image first, so a failed download leaves the running version untouched. If the image did not change, it does nothing. Otherwise it stops the container, starts the new one, waits until it reports healthy, and removes old Calendiro images. The chosen version is stored in `.env`.

Nightly update via cron (`crontab -e`):

```cron
30 3 * * * /opt/calendiro/update.sh >> /opt/calendiro/update.log 2>&1
```

Without an argument, `update.sh` always moves to `latest`. To stay on a version, call it with that version in cron as well, for example `/opt/calendiro/update.sh 0.1`.

## Versions and images

Images are published to `ghcr.io/ralf31337/calendiro`:

| Tag | Content |
| --- | --- |
| `latest` | Newest release |
| `0.1`, `0.2`, … | A specific release (version format `x.y`) |
| `edge` | Newest build of the `main` branch, may be unreleased |
| `sha-<commit>` | A specific commit |

The running version is shown at `/api/health`, for example `{"ok":true,"version":"0.1"}`.

To release a new version, change [VERSION](VERSION) (for example from `0.1` to `0.2`) and push to `main`. The [workflow](.github/workflows/docker.yml) runs the tests, builds the image, tags it `0.2` and `latest`, and creates the git tag `v0.2` with a GitHub release. Pushes without a version change only update `edge`.

## Data and backup

Everything is stored as JSON files in `./data`:

- `people.json`: people and their feed links
- `boards/<year>.json`: activity spaces and ideas per year
- `space-names.json`: colors per space name
- `settings.json`: shared settings such as the school holiday states
- `cache/`: cached school holidays (safe to delete)

Back up the `data` directory. Edit the files only while Calendiro is stopped; it reads them once at startup.

School holidays are loaded from [schulferien-api.de](https://schulferien-api.de), so the container needs outbound internet access for that feature.

## Configuration

Environment variables of the container:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container |
| `DATA_DIR` | `/data` | Data directory |
| `SCHOOL_HOLIDAYS_API` | `https://schulferien-api.de/api/v1` | School holiday API |

## Development

Requires Node.js 24 or newer.

```bash
npm install
npm run dev        # server on :3000, client with live reload on http://localhost:5173
npm test           # tests
npm run typecheck
npm run build && npm start   # production build on http://localhost:3000
```

Build the image locally:

```bash
docker build -t calendiro .
docker run -p 3000:3000 -v "$PWD/data:/data" calendiro
```
