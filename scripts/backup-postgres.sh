#!/usr/bin/env bash
set -euo pipefail
# Manually back up Supabase Postgres OUTSIDE the Git repository.
if ! command -v pg_dump >/dev/null 2>&1; then
 echo 'pg_dump is required. Install the PostgreSQL client and retry.' >&2;exit 1
fi
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
 echo 'Set SUPABASE_DB_URL locally to the Supabase direct/session-pooler Postgres URI. Never commit it.' >&2;exit 1
fi
BACKUP_DIR="$HOME/Downloads/marketly-private-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
OUTPUT="$BACKUP_DIR/marketly-postgres-$(date +%Y%m%d-%H%M%S).dump"
umask 077
pg_dump --dbname="$SUPABASE_DB_URL" --format=custom --no-owner --no-acl --file="$OUTPUT"
pg_restore --list "$OUTPUT" >/dev/null
printf '✅ PostgreSQL backup saved: %s\n' "$OUTPUT"
printf '✅ Archive validated. Always test actual restore into a DIFFERENT test database.\n'
