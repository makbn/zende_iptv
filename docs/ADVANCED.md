# Zende — advanced setup

This document expands on [README.md](../README.md): iptv-org mechanics, Docker options, VPN/Gluetun details, authentication, and automation.

## iptv-org integration

The project **[iptv-org/iptv](https://github.com/iptv-org/iptv)** publishes a **CC0** aggregate playlist:

`https://iptv-org.github.io/iptv/index.m3u`

Zende registers this URL as the built-in preset in [`src/config/builtin-playlist-sources.ts`](../src/config/builtin-playlist-sources.ts):

* **Preset ID:** `iptv-org-world-index`
* **Source URL:** `https://iptv-org.github.io/iptv/index.m3u`
* **Attribution:** Follow iptv-org’s license and documentation; the repository stores links, not media.

### Built-in catalog flow

1. **Allowlist.** The server exposes `GET /api/playlists/builtin/[presetId]` only for known preset IDs mapped to fixed URLs. Arbitrary user-supplied URLs are not fetched server-side (SSRF mitigation).
2. **Fetch.** For the iptv-org preset, the route retrieves the upstream `index.m3u` and returns the raw body to the client.
3. **Parse.** The client parses `EXTINF` and stream URL lines into structured records.
4. **Cache.** Parsed data is stored in IndexedDB per preset to avoid full re-download each session.
5. **Registry (optional).** Metadata may sync into SQLite-backed registry and health features when those options are enabled.

Streams are operated by third parties. Zende does not re-host streams; playback uses the URL from the playlist in the browser player. Legal and availability considerations for the index are described in the **[iptv-org Legal](https://github.com/iptv-org/iptv#legal)** section of their repository.

## Local development

```bash
npm install
npm run dev
```

By default the app listens on port **8077** (see **`PORT`** in **`.env.example`**). To use another port, set **`PORT`** in **`.env`** or in the environment before starting (for example `PORT=9000 npm run dev` on Unix shells).

Copy **`.env.example`** to **`.env`** if you need to override `DATABASE_URL` (defaults to a local SQLite file for Prisma) or **`PORT`**.

## Docker

**Requirements:** Docker Engine 24+ with Compose v2 (`docker compose`).

### Quick start

```bash
# Create the Gluetun config directory next to docker-compose.yml (required even
# if you never use VPN proxies — Compose mounts it unconditionally).
mkdir -p ./gluetun-work

docker compose up --build
```

Then open **http://localhost:8077**.

On first start the container adjusts ownership of the `/data` volume, runs Prisma migrations (`migrate deploy`, with legacy baseline fallback), detects the Docker socket GID and grants the app user access to it, then starts the application.

### Publish on a specific host IP

By default Compose maps the container port to **all** interfaces (`0.0.0.0`). To bind a specific address, put a **`.env`** file next to `docker-compose.yml` and set `DOCKER_PUBLISH`:

| Goal | `.env` |
|------|--------|
| Localhost only | `DOCKER_PUBLISH=127.0.0.1:8077:8077` |
| One LAN address | `DOCKER_PUBLISH=192.168.1.50:8077:8077` |
| Custom port on an IP | `PORT=9000` and `DOCKER_PUBLISH=192.168.1.50:9000:9000` |

### Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | set in Compose | Prisma SQLite path; keep `file:/data/zende.db` with the bundled volume. |
| `ZENDE_RECORDINGS_DIR` | No | `/data/recordings` in Compose | Directory for DVR MP4 files; must live on a **persisted** volume in Docker (same `/data` tree as the DB). Override only if you change mounts. |
| `PORT` | No | `8077` | HTTP port inside the container and on the host. |
| `DOCKER_PUBLISH` | No | `PORT:PORT` | Compose-only: full `host_ip:host_port:container_port` to bind a specific IP. |
| `PUBLIC_APP_URL` | No | — | Optional. Force public origin in rewritten HLS URLs if your reverse proxy omits `Host` / `X-Forwarded-*` / `Forwarded`. |
| `AUTH_JWT_SECRET` | Strongly recommended | insecure default | Signs JWT tokens when authentication is enabled. |
| `CRON_SECRET` | No | — | `Authorization: Bearer` guard for cron and registry APIs. |
| `LOG_LEVEL` | No | `info` | Server log verbosity. |
| `GLUETUN_HOST_WORKDIR` | No | `./gluetun-work` (relative to project dir) | **Host** path where Gluetun OpenVPN/WireGuard config dirs are stored. Must be an absolute host path when running inside Docker — set it in `.env`, e.g. `GLUETUN_HOST_WORKDIR=/your/host/path/gluetun-work`. See [VPN Proxies](#vpn-proxies). |
| `GLUETUN_CONTAINER_WORKDIR` | No | `/gluetun-work` | Path inside the Zende container where the same directory is mounted. Do not change unless you edit `docker-compose.yml`. |
| `ZENDE_THREADFIN_URL` | No | `http://threadfin:34400` | Internal Threadfin base URL for sync/API. |
| `ZENDE_THREADFIN_SOURCE_ORIGIN` | No | `http://zende:8077` | Origin Threadfin uses to fetch Zende M3U/EPG. |
| `ZENDE_THREADFIN_PUBLIC_HOST` | No | — | Hostname/IP for Plex (defaults to request host in Settings UI). |
| `ZENDE_THREADFIN_PUBLIC_BASE_URL` | No | — | Full public Threadfin proxy base, including an optional path such as `https://example.com/thf`. Takes precedence over host and port. |
| `ZENDE_THREADFIN_PUBLIC_PORT` | No | `34400` | Public Threadfin port shown in Settings. |
| `ZENDE_THREADFIN_MAX_CHANNELS` | No | `480` | Plex-safe cap for the mixed Live+Movies lineup (maximum `480`). |
| `ZENDE_THREADFIN_SYNC` | No | `1` | Set `0` to disable auto Threadfin provisioning. |
| `ZENDE_HDHR_ENABLED` | No | `0` in Compose | Built-in HDHomeRun emulator (legacy). Prefer Threadfin. |
| `THREADFIN_PUBLISH` | No | `34400:34400` | Host publish mapping for the Threadfin container. |

### Plex via Threadfin

Compose starts a **`threadfin`** sidecar ([Threadfin](https://github.com/Threadfin/Threadfin)). On boot, Zende:

1. Creates a dedicated portal user `threadfin` (password derived from `AUTH_JWT_SECRET`).
2. Seeds Threadfin’s `settings.json` with M3U/XMLTV URLs pointing at Zende.
3. Calls Threadfin’s API to refresh playlists.

In the UI: **Settings → Integrations → Plex DVR (Threadfin)** shows the HDHomeRun address (`host:34400`), portal credentials, and Plex setup steps.

Plex: **Settings → Live TV & DVR → Set Up Plex DVR → HDHomeRun** → enter `YOUR_LAN_IP:34400` (requires Plex Pass).

Do not commit secrets; inject them via the host environment or your orchestrator.

### Volumes and mounts

| Mount | Purpose |
|-------|---------|
| `zende-data:/data` | Named volume — persists SQLite (`zende.db`) and recordings (`recordings/` when `ZENDE_RECORDINGS_DIR` is under `/data`). Remove with `docker compose down -v`. |
| `/var/run/docker.sock` | Docker socket — lets Zende start/stop Gluetun sibling containers. Required for VPN proxy feature. |
| `GLUETUN_HOST_WORKDIR:/gluetun-work` | Shared config directory — Zende writes OpenVPN/WireGuard files here; Gluetun containers mount sub-directories from the **host** side of this path. |

### Common commands

```bash
docker compose logs -f zende
docker compose exec zende sh
docker compose down          # stop, keep volume
docker compose down -v       # stop + wipe SQLite and recordings on the named volume
```

Compose includes a **healthcheck** on `GET /api/health`; wait until the service is **healthy** before routing traffic.

## VPN proxies (deep dive)

Some streams are geo-blocked or rate-limited by IP. Zende can route **individual channels** through an HTTP/SOCKS5 proxy or a containerized VPN — all managed from **Settings → VPN Proxies**.

### How it works

When a channel is assigned to a proxy, every segment, manifest, and key request for that channel passes through the proxy server. The proxy is applied only at the stream session layer — the player itself makes no direct upstream connections.

For VPN-backed proxies, Zende launches a **[Gluetun](https://github.com/qdm12/gluetun)** Docker container that establishes the VPN tunnel and exposes a local HTTP proxy port on `127.0.0.1`. Zende then routes the channel's stream traffic through that port.

### Proxy types

| Type | When to use |
|------|-------------|
| **Direct proxy** | You already have an HTTP, HTTPS, or SOCKS5 proxy server (e.g. Squid, Dante, or a paid proxy service). Enter the host, port, and optional credentials. |
| **Gluetun VPN** | You want an isolated VPN tunnel per proxy slot. Requires Docker on the host running Zende. |

### Supported VPN providers (Gluetun)

| Provider | Credentials needed |
|----------|--------------------|
| NordVPN | OpenVPN username + password, target countries |
| ExpressVPN | Activation code, target countries |
| ProtonVPN | OpenVPN username + password, target countries |
| Custom OpenVPN | `.ovpn` config file + optional username/password + any referenced cert/key files |
| Custom WireGuard | Private key, peer public key, endpoint IP + port, tunnel addresses |

### Custom OpenVPN setup

1. Paste your `.ovpn` file contents into the config field.
2. If the config references external files (`ca`, `cert`, `key`, `tls-auth`, etc.) by filename, extra fields appear automatically — one per referenced file.
3. Drag and drop each cert/key file directly onto its field to load it, or paste the PEM content manually.
4. Enter your OpenVPN username and password if the server requires them.
5. Click **Add VPN**. Zende resolves any hostnames in `remote` lines to IPs (Gluetun requires IP addresses) and rewrites file paths before writing them into the container.

### Docker requirements for Gluetun

| Requirement | Where it applies | Notes |
|-------------|-----------------|-------|
| Docker socket `/var/run/docker.sock` | Zende container | Already mounted by `docker-compose.yml`. The entrypoint detects the socket GID at runtime and grants the app user access — no hardcoded group needed. |
| `/dev/net/tun` device | **Host kernel** | Standard on Linux. Gluetun containers request it via `HostConfig.Devices` when spawned; Zende itself does **not** need this device. |
| `NET_ADMIN` capability | **Gluetun containers** | Granted automatically when Zende starts each Gluetun container. Zende itself does **not** need `cap_add: [NET_ADMIN]`. |
| `GLUETUN_HOST_WORKDIR` directory | Host filesystem | Create it once: `mkdir -p /opt/zende/gluetun-work`. Used only for Custom OpenVPN/WireGuard — providers like NordVPN need no config files. |

The Gluetun image (`ghcr.io/qdm12/gluetun:latest`) is pulled automatically on first launch.

#### Why the work directory matters

Gluetun containers are spawned as **siblings** on the host Docker daemon (not nested inside Zende). Bind-mount paths in `HostConfig.Binds` must resolve on the **host** filesystem. Zende writes OpenVPN/WireGuard config files to `GLUETUN_CONTAINER_WORKDIR` (inside the container), which is the same physical path as `GLUETUN_HOST_WORKDIR` on the host via the bind mount. When creating the Gluetun container, Zende passes the host-side path so Docker resolves it correctly.

### Assigning channels to a proxy

Open a proxy in **Settings → VPN Proxies** and click the **Channels** button. A dialog lets you search catalog channels and assign them to that proxy. Assignments are keyed by channel stream URL hash. Assigned channels route through the proxy whenever a stream session starts (web app and IPTV portal playback); unassigned channels connect directly.

### Container lifecycle

| Action | What happens |
|--------|-------------|
| **Launch** | Gluetun container starts; status shows `starting` while the tunnel negotiates, then `running` once healthy. |
| **Stop** | Container is stopped and removed; the DB entry retains the configuration. |
| **Relaunch** | Previous container is removed and a fresh one is created with the current config. |

A proxy in `error` or `stopped` state blocks playback for channels assigned to it — Zende returns a clear message rather than silently timing out.

## IPTV apps (Xtream-style portal)

Zende can expose an **Xtream Codes–compatible** API for players such as **TiviMate**:

* **`player_api.php`**, **`get.php`** (M3U), **`xmltv.php`**, and **`/live/...`** playback URLs.
* Long-lived **portal keys** under **Settings → Integrations**.

Place the deployment behind HTTPS with correct **`Host`** / **`X-Forwarded-Proto`** (or set **`PUBLIC_APP_URL`**) so HLS manifests rewrite to your public origin, not `127.0.0.1`. See [`src/lib/http/request-origin.ts`](../src/lib/http/request-origin.ts).

## Authentication (optional)

The application runs without login by default. **Settings → Authentication** can require sign-in, create the initial administrator account, and manage additional users.

* **`AUTH_JWT_SECRET`:** Use a long random value in production. It signs access and refresh tokens. Development may use a fallback; do not rely on that in production.
* **`CRON_SECRET`:** Separate from JWT signing. Protects scheduled and registry-style routes via `Authorization: Bearer`. Both may be set on one deployment for different endpoints.

### Reset bootstrap administrator

If the first administrator credentials are lost, run inside the container:

```bash
docker compose exec zende node scripts/reset-bootstrap-admin.cjs --username admin --password 'your-new-password'
```

Requires `DATABASE_URL` and a password of at least eight characters.

## Scheduling and hosting

For automated registry or health sweeps, set **`CRON_SECRET`** and configure callers to send `Authorization: Bearer <CRON_SECRET>`.

* From **Settings → Server**, operators may store the same secret for browser-initiated calls to protected routes, or call APIs from scripts with the Bearer header.
* **Nightly health:** `GET /api/cron/nightly-health` on your deployment’s base URL. Schedule with host **cron**, **systemd** timers, **Kubernetes CronJob**, **Nomad**, **GitHub Actions** `schedule`, or any job runner that can issue HTTPS GET with the header.

Example host cron entry (05:00 UTC daily):

```bash
0 5 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.example/api/cron/nightly-health >/dev/null
```

These features are optional for local use of the iptv-org catalog; they matter when running a persistent registry and automated checks in production.

## Further reading

* **[iptv-org/iptv](https://github.com/iptv-org/iptv)** and **[PLAYLISTS.md](https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md)**
