#!/usr/bin/env bash
# Isolated email-auth DB integration harness.
#
# Creates exactly one disposable PostgreSQL 16 container with a unique
# elo-auth-verify-* name, no host volumes, no Dokploy network, and a random
# loopback port. Never runs compose/down and never touches existing databases.
# The container is removed by the trap only after verifying its test label.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE="postgres:16-alpine"
CONTAINER_NAME="elo-auth-verify-$(date +%s)-$$-${RANDOM}"
DB_USER="elo_test"
DB_PASSWORD="elo_test_fake_password"
DB_NAME="elo_auth_test"
TEST_DB_LABEL="1"

cleanup() {
  local exit_code=$?
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    local label
    label="$(docker inspect -f '{{ index .Config.Labels "elo.auth.test" }}' "$CONTAINER_NAME" 2>/dev/null || true)"
    if [ "$label" = "$TEST_DB_LABEL" ]; then
      echo "[harness] inspected target name=$CONTAINER_NAME label=$label"
      docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
      echo "[harness] removed container $CONTAINER_NAME"
    else
      echo "[harness] REFUSING to remove $CONTAINER_NAME: label elo.auth.test!=1" >&2
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "image $IMAGE not available locally; refusing to pull from the network" >&2
  exit 1
fi

if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "container name already exists: $CONTAINER_NAME" >&2
  exit 1
fi

echo "[harness] image=$IMAGE container=$CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  --label "elo.auth.test=$TEST_DB_LABEL" \
  --network bridge \
  --rm \
  -e "POSTGRES_USER=$DB_USER" \
  -e "POSTGRES_PASSWORD=$DB_PASSWORD" \
  -e "POSTGRES_DB=$DB_NAME" \
  -p 127.0.0.1::5432 \
  "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" != "1" ]; then
  echo "PostgreSQL container did not become ready" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  exit 1
fi

PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | tail -n 1 | awk -F: '{print $NF}')"
if [ -z "${PORT:-}" ]; then
  echo "could not resolve container port" >&2
  exit 1
fi

# Hard safety: only loopback, random port, explicitly named throwaway database.
if [ "$PORT" = "5432" ]; then
  echo "unexpected port 5432; refusing to continue" >&2
  exit 1
fi

export TEST_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}"
export DATABASE_URL="$TEST_DATABASE_URL"
export ALLOW_DB_INTEGRATION=1
export NODE_ENV=test
export AUTH_SECRET="integration-test-auth-secret-0123456789abcdef"
export NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"
# Do not inherit a real provider configuration for this DB-only test.
unset EMAIL_PROVIDER_URL EMAIL_PROVIDER_TOKEN GOOGLE_CLIENT_ID NEXT_PUBLIC_GOOGLE_CLIENT_ID GOOGLE_AUDIENCE APPLE_CLIENT_ID APPLE_BUNDLE_ID 2>/dev/null || true

echo "[harness] target=127.0.0.1:${PORT}/${DB_NAME}"
echo "[harness] applying migrations with tests/integration/email-auth-db.drizzle.config.ts"
npx drizzle-kit migrate --config=tests/integration/email-auth-db.drizzle.config.ts

echo "[harness] running integration test"
npx tsx tests/integration/email-auth-db.test.ts
