#!/usr/bin/env bash
# Updates a Calendiro installation to the latest version, or to a specific one.
#
#   ./update.sh            latest release
#   ./update.sh 0.2        a specific version (x.y)
#   ./update.sh edge       newest build of the main branch
#   ./update.sh --force    restart even if the image did not change
#
# Run it from cron, for example nightly at 03:30:
#   30 3 * * * /opt/calendiro/update.sh >> /opt/calendiro/update.log 2>&1
set -euo pipefail

PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"
cd "$(dirname "$0")"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

target="latest"
force=0
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    latest | edge) target="$arg" ;;
    *)
      [[ "$arg" =~ ^[0-9]+\.[0-9]+$ ]] || fail "Unknown argument '$arg'. Use latest, edge, a version like 0.2, or --force."
      target="$arg"
      ;;
  esac
done

[ -f docker-compose.yml ] || fail "No docker-compose.yml in $(pwd)."
command -v docker >/dev/null || fail "docker is not installed or not in PATH."
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null; then
  compose() { docker-compose "$@"; }
else
  fail "Docker Compose is not installed."
fi

if ! mkdir .update.lock 2>/dev/null; then
  fail "Another update is running (remove $(pwd)/.update.lock if that is not the case)."
fi
trap 'rmdir .update.lock' EXIT

# Stores KEY=VALUE in .env, replacing an existing line for KEY.
set_env() {
  touch .env
  if grep -q "^$1=" .env; then
    sed "s|^$1=.*|$1=$2|" .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

set_env CALENDIRO_VERSION "$target"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
image="${CALENDIRO_IMAGE:-ghcr.io/ralf31337/calendiro}:${CALENDIRO_VERSION}"

container="$(compose ps -q calendiro 2>/dev/null || true)"
running_image=""
[ -n "$container" ] && running_image="$(docker inspect -f '{{.Image}}' "$container" 2>/dev/null || true)"

log "Pulling $image"
compose pull --quiet calendiro || fail "Pulling $image failed; the running version was left untouched."
pulled_image="$(docker image inspect -f '{{.Id}}' "$image")"

if [ "$force" -eq 0 ] && [ -n "$running_image" ] && [ "$running_image" = "$pulled_image" ]; then
  log "Already up to date ($image)."
  exit 0
fi

log "Stopping Calendiro"
compose down
log "Starting Calendiro"
compose up -d

container="$(compose ps -q calendiro)"
for _ in $(seq 1 30); do
  if health="$(docker exec "$container" wget -q -O - "http://127.0.0.1:3000/api/health" 2>/dev/null)"; then
    log "Calendiro is up: $health"
    docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/ralf31337/calendiro" >/dev/null || true
    exit 0
  fi
  sleep 2
done
compose logs --tail 30 calendiro || true
fail "Calendiro did not become healthy within 60 seconds."
