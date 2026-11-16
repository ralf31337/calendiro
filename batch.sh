#!/usr/bin/env bash
# Installs Calendiro on a machine with Docker.
#
#   curl -fsSL https://raw.githubusercontent.com/ralf31337/calendiro/main/batch.sh | bash
#
# Options, passed after `bash -s --` (or as environment variables):
#   --dir DIR        install directory  (CALENDIRO_DIR, default /opt/calendiro as root, else ~/calendiro)
#   --port PORT      port on the host   (CALENDIRO_PORT, default 3000)
#   --version X.Y    version to install (CALENDIRO_VERSION, default latest)
#   --cron           also add a nightly update at 03:30 to the current user's crontab
#
#   curl -fsSL https://raw.githubusercontent.com/ralf31337/calendiro/main/batch.sh | bash -s -- --port 8080 --cron
#
# Running it again on an existing installation keeps docker-compose.yml and the data.
set -euo pipefail

REPO_RAW="${CALENDIRO_REPO_RAW:-https://raw.githubusercontent.com/ralf31337/calendiro/main}"

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -eq 0 ]; then default_dir="/opt/calendiro"; else default_dir="$HOME/calendiro"; fi
dir="${CALENDIRO_DIR:-$default_dir}"
port="${CALENDIRO_PORT:-3000}"
version="${CALENDIRO_VERSION:-latest}"
cron="${CALENDIRO_CRON:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="${2:?--dir needs a value}"; shift 2 ;;
    --port) port="${2:?--port needs a value}"; shift 2 ;;
    --version) version="${2:?--version needs a value}"; shift 2 ;;
    --cron) cron=1; shift ;;
    -h | --help) sed -n '2,15p' "$0" 2>/dev/null || true; exit 0 ;;
    *) fail "Unknown option '$1'." ;;
  esac
done

[[ "$port" =~ ^[0-9]+$ ]] || fail "The port must be a number, got '$port'."
[[ "$version" =~ ^([0-9]+\.[0-9]+|latest|edge)$ ]] || fail "The version must look like 0.1, or be latest or edge."

command -v docker >/dev/null || fail "Docker is not installed. See https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || fail "Cannot talk to Docker. Is it running, and may this user use it (try sudo)?"
docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null ||
  fail "Docker Compose is not installed. See https://docs.docker.com/compose/install/"
command -v curl >/dev/null || fail "curl is required."

log "Installing Calendiro into $dir"
mkdir -p "$dir/data"
cd "$dir"

# The container runs as this user, so it can write the data directory.
if [ "$(id -u)" -eq 0 ]; then
  uid=1000
  gid=1000
  chown -R "$uid:$gid" data
else
  uid="$(id -u)"
  gid="$(id -g)"
fi

if [ -f docker-compose.yml ]; then
  log "Keeping the existing docker-compose.yml"
else
  cat > docker-compose.yml <<'YAML'
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
YAML
fi

set_env() {
  touch .env
  if grep -q "^$1=" .env; then
    sed "s|^$1=.*|$1=$2|" .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
set_env CALENDIRO_PORT "$port"
set_env CALENDIRO_UID "$uid"
set_env CALENDIRO_GID "$gid"

log "Downloading update.sh"
curl -fsSL "$REPO_RAW/update.sh" -o update.sh.tmp
mv update.sh.tmp update.sh
chmod +x update.sh

./update.sh "$version" --force

if [ "$cron" = "1" ]; then
  entry="30 3 * * * $dir/update.sh >> $dir/update.log 2>&1"
  if crontab -l 2>/dev/null | grep -Fq "$dir/update.sh"; then
    log "A cron entry for update.sh already exists"
  else
    (crontab -l 2>/dev/null || true; echo "$entry") | crontab -
    log "Added nightly update: $entry"
  fi
fi

log "Done. Calendiro runs at http://$(hostname):$port"
log "Update later with: $dir/update.sh [latest|X.Y|edge]"
