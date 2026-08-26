# Zende

**Zende** is a self-hosted **IPTV hub**: an Appica-based, TV- and phone-friendly web UI with a **server-side stream relay**, a relational **multi-provider catalog**, **per-channel VPN / proxy routing**, **DVR recordings** (ffmpeg), **VOD subtitles**, **phone→TV remote control**, **channel health**, **EPG**, **Threadfin** for Plex/Jellyfin Live TV, and an **Xtream-compatible portal** for apps like TiviMate.

The browser does not pull raw provider URLs for playback—sessions go through **`/api/stream/proxy/...`**, where the server applies your proxy, cookies, and HLS rewrites. Zende does not host or transcode third-party streams; it orchestrates access to URLs you supply.

## Screenshots

| ![Home](docs/home.png) | ![Library](docs/library.png) | ![Watch](docs/player.png) |
| :---: | :---: | :---: |

## What it does

| Area | Details |
|------|---------|
| **Stream relay** | Registers an upstream URL in a short-lived **stream session**; the player and tools use **`/api/stream/proxy/{id}`**. Upstream fetches use **undici** with optional **HTTP/SOCKS** or **Gluetun** VPN, cookie jars, redirects, and **M3U8 rewriting** so segments and keys stay on your origin. On **iPhone/iPad**, live HLS prefers Safari’s **native player** so Picture-in-Picture and AirPlay keep working. |
| **Web UI** | Responsive **TV** and **mobile** layouts: **Home**, **Library** (live / movies / shows), **series detail** (seasons & episodes), **Watch**, **Favorites**, **Guide**, **Recordings** (DVR), **Board**, **Settings**, optional **Setup** / **Login**. |
| **Appica design system** | UI chrome uses **`@appica/ui-react`**, Tailwind CSS v4, and Appica’s role-based color, spacing, radius, typography, border, and shadow tokens. Light and dark themes share the same semantic token system. |
| **Multiple providers** | Add multiple **Xtream**, remote **M3U/M3U8**, pasted playlist, or manual URL sources. Every imported stream is a relational channel row linked to its provider. Two providers may both expose “TSN 1” without either entry overwriting the other. |
| **Provider management** | **Settings → Channels** lists providers and their linked streams. Administrators can search, edit, enable/disable, or remove providers and edit/remove individual channels. Provider credential changes rewrite the linked playback URLs safely. |
| **Phone remote** | Sign in on your phone and **control the TV browser** (navigate, play/pause, seek) without sharing the phone’s playback session URL with the TV. |
| **QR login** | On the TV login screen, scan a **QR code** with your phone to approve sign-in (or enter credentials on mobile). |
| **VPN / proxy per channel** | **Settings → VPN Proxies**: direct proxies or **Gluetun** (NordVPN, ExpressVPN, ProtonVPN, custom OpenVPN/WireGuard). Assign channels by URL hash so only those streams use that exit. |
| **IPTV apps** | **Settings → Integrations**: portal credentials for **Xtream-style** clients — `player_api.php`, `get.php`, `xmltv.php`, `/live/...` on the same host. |
| **Plex / Jellyfin DVR** | Docker Compose runs **[Threadfin](https://github.com/Threadfin/Threadfin)** alongside Zende. Zende auto-feeds Live + Movies + Shows as an M3U; Plex adds Threadfin as an **HDHomeRun** on port **34400**. Setup details are in **Settings → Integrations**. |
| **Recordings** | Start or schedule captures from the UI; **ffmpeg** records through the **same relay** as playback (VPN/cookies apply). Metadata in SQLite; MP4s on disk — in Docker, **`ZENDE_RECORDINGS_DIR=/data/recordings`** on the **`zende-data`** volume. |
| **Subtitles (VOD)** | Search and load external subtitles via **Wyzie** (+ optional **TMDB** title match) in **Settings → Integrations**. Search results and loaded VTT tracks are **cached ~7 days** on disk (`ZENDE_SUBTITLES_DIR`, default `/data/subtitles` in Docker). |
| **Channel health** | Registry sync, probes, aggregates (tiers), optional **cron**-style jobs (`CRON_SECRET`). |
| **EPG** | Favorites **“What’s on”** and **Guide** use merged XMLTV sources; optional **`ZENDE_EPG_GUIDE_URLS`** for self-hosted guides ([iptv-org/epg](https://github.com/iptv-org/epg)). |
| **Auth & data** | Optional JWT auth, admin users, QR pairing, per-user **favorites** / **history** / **playback position**. **SQLite** is authoritative for providers, channels, proxies, sessions, recordings, subtitle settings, and user data. |

## Provider and channel data model

User-added streams are not flattened into a shared JSON catalog. The runtime catalog is built from two relational tables:

- **`IptvProvider`** stores a named source, source kind, connection details, enabled state, and timestamps.
- **`IptvProviderChannel`** stores a generated channel ID, provider foreign key, provider-scoped external key, playback URL, content type, EPG metadata, artwork, language, group, description, owner, and timestamps.

Channel identity is based on the database row and provider relationship—not the display name. Consequently, identical names and even identical upstream URLs can coexist when they belong to different providers. Playback, series lookup, VOD metadata, Library, Guide, Threadfin, and provider management retain this relationship.

Manual URLs and pasted playlists also use this provider/channel schema through the manual-provider adapter. The former `ManualChannelsStore` JSON payload is read only by the one-time upgrade script, migrated transactionally, and emptied; application runtime paths do not read or write it.

### Adding sources

Open **Settings → Channels** and provide a meaningful provider name when importing a remote playlist or Xtream account. Zende stores all required connection fields with the provider and imports every discovered item as a linked channel row.

Supported source shapes include:

- Xtream server URL, username, and password
- Remote M3U/M3U8 playlist URL
- Pasted M3U content
- Individual stream URL with channel metadata

Disabling a provider removes its channels from active catalogs without deleting them. Deleting a provider cascades to only that provider’s channel rows.

Legal note: default catalog presets may link to third-party streams; you are responsible for rights and local law. See iptv-org’s [legal section](https://github.com/iptv-org/iptv#legal).

## Quick start (Docker)

**Requirements:** Docker with Compose v2.

```bash
mkdir -p ./gluetun-work
docker compose up --build
```

Open **http://localhost:8077** (or set `PORT` / `DOCKER_PUBLISH` in `.env` — see [Advanced setup](docs/ADVANCED.md)).

On first boot the entrypoint runs **`prisma migrate deploy`** against the persisted database on the **`zende-data`** volume. Upgrades from the former flattened channel store run a one-time relational migration before the app starts. Recordings and subtitle cache live under **`/data`** on that same volume so they survive image rebuilds.

For production, set a strong **`AUTH_JWT_SECRET`** in `.env`. Behind a reverse proxy, ensure **`Host`** and **`X-Forwarded-Proto`** (or **`Forwarded`**) reach the app so HLS URLs rewrite correctly; use **`PUBLIC_APP_URL`** only if those headers are missing.

### Useful environment variables

| Variable | Purpose |
|----------|---------|
| `AUTH_JWT_SECRET` | Signs access/refresh tokens when login is enabled (required in production). |
| `CRON_SECRET` | Optional Bearer token for cron / health / registry APIs. |
| `ZENDE_RECORDINGS_DIR` | DVR MP4 root (Compose default: `/data/recordings`). |
| `ZENDE_SUBTITLES_DIR` | Subtitle search + VTT cache (Compose default: `/data/subtitles`, ~7-day TTL). |
| `WYZIE_API_KEY` / `TMDB_API_KEY` | Optional env fallbacks for subtitle search (or set keys in Settings → Integrations). |
| `ZENDE_EPG_GUIDE_URLS` | Optional comma-separated XMLTV guide URLs. |
| `PUBLIC_APP_URL` | Force public origin for rewritten stream URLs when proxy headers are missing. |
| `DOCKER_PUBLISH` | Bind a specific host IP/port (e.g. `192.168.1.50:8077:8077`). |
| `ZENDE_THREADFIN_PUBLIC_HOST` | LAN hostname/IP Plex should use for Threadfin (default: request host). |
| `ZENDE_THREADFIN_PUBLIC_BASE_URL` | Optional full public proxy base, including a path (for example `https://example.com/thf`). |
| `ZENDE_THREADFIN_PUBLIC_PORT` | Threadfin published port (default `34400`). |
| `ZENDE_THREADFIN_MAX_CHANNELS` | Plex-safe Threadfin lineup cap (default and maximum `480`). |
| `THREADFIN_PUBLISH` | Host publish for Threadfin (default `34400:34400`). |

Full reference: [Advanced setup](docs/ADVANCED.md).

## Quick start (local dev)

```bash
npm install
npm run dev
```

Default port **8077**; override with **`PORT`**. Install **ffmpeg** on the host if you use recordings outside Docker.

```bash
npm test                 # unit tests
npm run test:recording   # recording-focused checks
```

## Documentation

* **[Advanced setup](docs/ADVANCED.md)** — iptv-org pipeline, Docker/env reference, VPN/Gluetun, per-channel assignment, Xtream portal, authentication, cron/health, EPG.

## Stack

* **Next.js 16** (App Router) + **React 19**
* **Appica UI** (`@appica/ui-react`) + **Tailwind CSS v4** semantic theme tokens
* **Prisma** / **SQLite** relational provider and channel catalog
* **hls.js** (desktop) / **native HLS** on Apple mobile
* **ffmpeg** for DVR, **undici** + optional **Gluetun** for upstream fetches

## Summary

Zende is a **self-hosted IPTV control plane**: a relational multi-provider catalog, relayed playback and recordings through your server, optional per-channel VPN exits, phone remote + QR login, VOD subtitles, Threadfin for Plex/Jellyfin, and Xtream-compatible portals—without redistributing stream content.

## Disclaimer

Accessing streams without proper rights, or using VPNs or proxies to reach **geo-restricted** or otherwise restricted content, may be **unlawful** where you live. You alone are responsible for the streams, playlists, recordings, and any other material you configure in this application, and for complying with copyright, broadcasting, and computer-misuse rules that apply to you.

**Zende and its authors provide software only.** We do not supply or endorse specific channels, do not operate your VPN or proxy providers, and **assume no liability** for how you use the app, what you add to it, or any consequences (legal, technical, or otherwise). Use at your own risk.
