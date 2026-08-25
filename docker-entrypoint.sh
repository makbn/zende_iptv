#!/bin/sh
set -e

# Persisted SQLite on the mounted volume (see docker-compose.yml).
export DATABASE_URL="${DATABASE_URL:-file:/data/zende.db}"

mkdir -p /data /data/recordings

if [ "$(id -u)" -eq 0 ]; then
  # Named volumes are often root-owned on first mount — chown so Prisma can write zende.db.
  chown -R nextjs:nodejs /data

  # ── Docker socket access (required for VPN proxy containers) ────────────────
  # When /var/run/docker.sock is mounted the nextjs process must be able to
  # reach it.  The socket's GID on the host may differ from any group already
  # in this image, so we create a matching group at runtime and add nextjs.
  if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "")
    if [ -n "$DOCKER_GID" ] && [ "$DOCKER_GID" != "0" ]; then
      if ! grep -q ":${DOCKER_GID}:" /etc/group 2>/dev/null; then
        addgroup -g "$DOCKER_GID" docker-host
      fi
      DOCKER_GROUP=$(grep ":${DOCKER_GID}:" /etc/group | cut -d: -f1 | head -n1)
      adduser nextjs "$DOCKER_GROUP" 2>/dev/null || true
    else
      # Socket is root-owned — give nextjs direct rw access (less common).
      chmod 666 /var/run/docker.sock 2>/dev/null || true
    fi
  fi

  # ── Gluetun config work directory ───────────────────────────────────────────
  # Config files for custom OpenVPN/WireGuard are written here inside the
  # container; GLUETUN_HOST_WORKDIR maps the same path on the host so that
  # bind mounts passed to sibling Gluetun containers resolve correctly.
  # Threadfin shared conf — Zende (uid 1001) must be able to seed settings.json.
  if [ -d /threadfin-conf ]; then
    mkdir -p /threadfin-conf
    chown -R nextjs:nodejs /threadfin-conf 2>/dev/null || true
    chmod -R u+rwX,g+rwX /threadfin-conf 2>/dev/null || true
  fi
fi

# Apply pending SQL migrations (SQLite under DATABASE_URL). Runs as non-root after chown.
# Legacy volumes created with `db push` only hit P3005 (schema exists but no _prisma_migrations):
# sync once with db push, mark bundled migrations applied, then future boots use migrate deploy only.
echo "Applying database schema..."
set +e
DEPLOY_OUT=$(su-exec nextjs npx prisma migrate deploy 2>&1)
DEPLOY_RC=$?
set -e
printf '%s\n' "$DEPLOY_OUT"
if [ "$DEPLOY_RC" -eq 0 ]; then
  :
elif printf '%s\n' "$DEPLOY_OUT" | grep -q P3005; then
  echo "docker-entrypoint: existing DB without migration history (P3005) — prisma db push + migrate resolve baseline." >&2
  su-exec nextjs npx prisma db push --skip-generate
  for mig_dir in /app/prisma/migrations/*/; do
    [ -d "$mig_dir" ] || continue
    name=$(basename "$mig_dir")
    su-exec nextjs npx prisma migrate resolve --applied "$name" || true
  done
else
  exit "$DEPLOY_RC"
fi

exec su-exec nextjs "$@"
