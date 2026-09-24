# Catalog pipeline (provider → DB → filters)

Intended workflow for IPTV providers and Library filters:

1. **Add provider once** — Xtream or M3U credentials in Settings / Setup.
2. **Scan content periodically** — import creates/updates one `IptvProviderChannel` row per stream (live / movie / series). Stream URLs for Xtream are stored **host-free** (`/movie/…/id.ext`) when the host is the portal; playback resolves them with `resolveXtreamPlayUrl` onto the active primary/backup server.
3. **Enrich metadata** — `MediaMetadataCache` stores title, year, overview, genres, cast, artwork, IMDb/TMDB ids (`payloadJson`). Enrichment runs:
   - On demand when opening a movie/show detail page (`getCachedMediaMetadata`)
   - Nightly via `/api/cron/imdb-ratings` (scores + minimal payloads)
4. **Filters use the DB** — Library facets/filters prefer enriched fields (e.g. `year` from `MediaMetadataCache`) and fall back to playlist title parsing (`Name (2016)`).
5. **Incremental sync** — re-scan adds new `IptvProviderChannel` rows; existing rows keep identity via `externalKey`. New rows get metadata on first detail view or the next ratings/enrichment pass. Presence of `MediaMetadataCache` for a channel is the practical “PROCESSED” signal today (`fetchedAt` + `payloadJson`).

## Bug fixes (2026-09-23)

- **Invalid stream URL** — movie detail returned the host-free DB path; session create rejected `new URL("/movie/…")`. Fixed by resolving paths in `vod-info` and preferring catalog absolute URLs in stream session create.
- **Year filter incomplete** — facets only used `(YYYY)` in the channel name. Titles like “Eddie the Eagle” with year only in metadata were missing. Filters now use metadata year when present, and metadata writes invalidate the catalog index.

## Follow-ups (not yet shipped)

- Explicit `metadataStatus` enum (`NOT_PROCESSED` / `PROCESSED` / `FAILED`) on `IptvProviderChannel` or `MediaMetadataCache`.
- Hourly provider re-scan + background enricher for all `NOT_PROCESSED` movie/series rows (batch TMDB), so year/genre filters work before anyone opens the detail page.
- Denormalized `year` column on `MediaMetadataCache` for cheaper facet builds.
