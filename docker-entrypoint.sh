#!/bin/sh
set -e

# Persisted SQLite on the mounted volume (see docker-compose.yml).
export DATABASE_URL="${DATABASE_URL:-file:/data/zende.db}"

mkdir -p /data

# Named volumes are often root-owned on first mount — chown so Prisma can create zende.db.
if [ "$(id -u)" -eq 0 ]; then
  chown -R nextjs:nodejs /data
fi

# Apply schema (SQLite / app tables + auth). Runs as non-root after chown.
su-exec nextjs npx prisma db push --skip-generate

exec su-exec nextjs "$@"
