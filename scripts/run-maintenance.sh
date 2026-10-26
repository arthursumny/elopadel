#!/usr/bin/env sh
set -eu

: "${APP_URL:?APP_URL é obrigatório}"
: "${MAINTENANCE_TOKEN:?MAINTENANCE_TOKEN é obrigatório}"

curl --fail --silent --show-error --X POST \
  --header "x-maintenance-token: ${MAINTENANCE_TOKEN}" \
  "${APP_URL%/}/api/internal/maintenance"
printf '\n'
