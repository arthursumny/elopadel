#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL é obrigatório}"
backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${backup_dir}/elo_padel_${timestamp}.dump"

mkdir -p "$backup_dir"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$backup_file"
printf 'Backup criado em %s\n' "$backup_file"
