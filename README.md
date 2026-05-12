# Zenede

**Zenede** is a self-hosted **IPTV hub**: an app that combines a TV-style web UI with a **server-side stream relay**, **per-channel VPN / proxy routing**, **scheduled and ad-hoc recordings** (ffmpeg), **channel health probes**, **EPG** for favorites, and **Xtream-compatible** URLs for external players (e.g. TiviMate). The browser does not pull raw provider URLs for playback—sessions go through **`/api/stream/proxy/...`**, where the server applies your proxy, cookies, and HLS rewrites. Zenede does not host or transcode third-party streams; it orchestrates access to URLs you supply.

## Screenshots

| ![Home](docs/home.png) | ![Library](docs/library.png) | ![Watch](docs/player.png) |
| :---: | :---: | :---: |

## What it does

| Area | Details |
|------|---------|
| **Stream relay** | Registers an upstream URL in a short-lived **stream session**; the player and tools use **`/api/stream/proxy/{id}`**. Upstream fetches use **undici** with optional **HTTP/SOCKS** or **Gluetun** VPN, cookie jars, redirects, and **M3U8 rewriting** so segments and keys stay on your origin. |
| **Web UI** | Home, **Library** (catalog), **Watch** (HLS.js), **Favorites** (with EPG strip), **Recordings** (DVR), **Board**, **Settings** (proxies, integrations, auth, playback prefs), optional **Setup** / **Login**. |
| **VPN / proxy per channel** | In **Settings → VPN Proxies**, define direct proxies or **Gluetun** (NordVPN, ExpressVPN, ProtonVPN, custom OpenVPN/WireGuard). Assign channels by URL hash so only those streams use that exit; others stay direct. |
| **IPTV apps** | **Settings → Integrations**: portal credentials for **Xtream-style** clients — `player_api.php`, `get.php`, `xmltv.php`, `/live/...` on the same host as the app. |
| **Recordings** | Start captures from the UI; server runs **ffmpeg** against the **same relay URL** as playback (VPN/cookies apply). Schedules and metadata in SQLite; MP4s on disk — in Docker, **`ZENDE_RECORDINGS_DIR`** points at **`/data/recordings`** on the **`zende-data`** volume so files survive rebuilds. |
| **Channel health** | Registry sync, probes, aggregates (tiers), optional **cron**-style jobs (`CRON_SECRET`). |
| **EPG** | Favorites **“What’s on”** uses merged XMLTV sources + iptvx-style resolution; optional **`ZENDE_EPG_GUIDE_URLS`** for self-hosted guides ([iptv-org/epg](https://github.com/iptv-org/epg)). |
| **Auth & data** | Optional JWT auth, admin users, per-user **favorites** and **history** when enabled. **SQLite** (file or Docker volume) for catalog cache, proxies, portal keys, sessions, recordings metadata. |

Legal note: default catalog presets may link to third-party streams; you are responsible for rights and local law. See iptv-org’s [legal section](https://github.com/iptv-org/iptv#legal).

## Quick start (Docker)

**Requirements:** Docker with Compose v2.

```bash
mkdir -p ./gluetun-work
docker compose up --build
```

Open **http://localhost:8077** (or set `PORT` / `DOCKER_PUBLISH` in `.env` — see [Advanced setup](docs/ADVANCED.md)).

On first boot the entrypoint runs **`prisma migrate deploy`** against the persisted database on the **`zende-data`** volume. Recording MP4s are written to **`/data/recordings`** on that same volume so they survive image rebuilds and container recreation.

For production, set a strong **`AUTH_JWT_SECRET`** in `.env`. Behind a reverse proxy, ensure **`Host`** and **`X-Forwarded-Proto`** (or **`Forwarded`**) reach the app so HLS URLs rewrite correctly; use **`PUBLIC_APP_URL`** only if those headers are missing.

## Quick start (local dev)

```bash
npm install
npm run dev
```

Default port **8077**; override with **`PORT`** and other variables in a **`.env`** file (see [Advanced setup](docs/ADVANCED.md)). Install **ffmpeg** on the host if you use recordings outside Docker.

## Documentation

* **[Advanced setup](docs/ADVANCED.md)** — iptv-org pipeline, full Docker/env reference, VPN/Gluetun, per-channel assignment, Xtream portal notes, authentication, cron/health jobs, EPG env vars.

## Summary

Zenede is a **self-hosted IPTV control plane**: relayed playback and recordings through your server, **optional per-channel VPN exits**, **Xtream-compatible** portals for hardware/apps, and optional multi-user auth—without redistributing stream content.

## Disclaimer

Accessing streams without proper rights, or using VPNs or proxies to reach **geo-restricted** or otherwise restricted content, may be **unlawful** where you live. You alone are responsible for the streams, playlists, recordings, and any other material you configure in this application, and for complying with copyright, broadcasting, and computer-misuse rules that apply to you.

**Zenede and its authors provide software only.** We do not supply or endorse specific channels, do not operate your VPN or proxy providers, and **assume no liability** for how you use the app, what you add to it, or any consequences (legal, technical, or otherwise). Use at your own risk.
