# Zende Stream Concurrency and Provider Stability Report

**Date:** 2026-08-26  
**Scope:** One, two, and four simultaneous live-channel sessions from Zende to the tested Xtream provider  
**Security:** Provider credentials, tokens, and subscriber identifiers are intentionally omitted.

## Executive summary

Zende is capable of issuing concurrent upstream requests. The application does not serialize all provider traffic through a single request, its stream cache is keyed by the upstream channel URL, and its direct upstream connection pool now permits up to 256 connections.

The tested provider account is the principal constraint. Its Xtream account API reported `max_connections=1`. The provider feed was also unstable when only one channel was being watched: the single-session 15-minute test required 91 reconnects. Increasing the number of distinct channels reduced the time during which every requested stream was delivering media:

| Test | Wall time | Primary availability measurement | Reconnects |
| --- | ---: | --- | --- |
| One channel | 900.6 s | Active for 759 of 899 sampled seconds (84.4%) | 91 |
| Two channels | 900.4 s | Both active together for 614 of 899 sampled seconds (68.3%) | 99 and 98 |
| Four channels (stopped early) | 480 s | All four active together for 110 of 480 sampled seconds (22.9%) | 50, 49, 49, and 49 |

The results show two related problems:

1. The provider closes or stalls streams frequently even with one viewer.
2. The account's one-connection policy makes multiple distinct channels increasingly unreliable.

Zende can conceal many short provider failures from viewers by sharing same-channel upstream connections, keeping downstream sessions alive while reconnecting upstream, buffering carefully, and scheduling work across multiple provider accounts or sources. It cannot reliably supply 100 different channels from an account whose provider permits one upstream connection. That requires additional legitimate connection capacity or fallback providers.

## Test methodology

The tests ran from the Zende host and used the same network path and public IP. No VPN or secondary proxy was introduced.

Each tested channel used the provider's raw MPEG-TS live endpoint. An FFmpeg decoder consumed the stream through the same-origin Zende proxy. The resilience harness restarted the decoder after an upstream closure and sampled decoder progress once per second. This tests the ability to recover repeatedly rather than treating the first provider disconnect as the end of the experiment.

Important interpretation notes:

- An **active second** means the decoder made media progress during that sample.
- **Overlap** means every stream in that test made progress during the same sampled second.
- **Reconnects** count decoder/upstream restarts following a closure or failure.
- Decoded media duration can exceed wall time because the provider sometimes releases buffered content in bursts. Consequently, decoded duration is not used as an uptime percentage.
- The four-channel run was stopped at the user's request after eight minutes. It is a useful directional result, but it is not a complete 15-minute result.

## Detailed results

### One channel: 15-minute baseline

- Wall time: 900.6 seconds
- Sampled seconds: 899
- Active seconds: 759
- Observed activity: 84.4%
- Reconnects: 91
- Decoded media reported by FFmpeg: 3,004.9 seconds

This is the most important baseline. The provider connection was not stable even when there was no competing channel from the tested account. On average, the source needed a reconnect roughly every ten seconds, although reconnect spacing was not uniform.

### Two distinct channels: 15 minutes

- Wall time: 900.4 seconds
- Sampled seconds: 899
- Both streams active together: 614 seconds
- Simultaneous activity: 68.3%
- Channel 1 reconnects: 99
- Channel 2 reconnects: 98
- Decoded media reported: 3,233.0 and 2,378.3 seconds

Both requests could receive and decode media, proving that Zende was not executing only one fetch at a time. However, frequent closures and reduced simultaneous activity show that the provider did not deliver two consistently usable live feeds for the duration.

### Four distinct channels: eight-minute partial run

- Wall time at stop: 480 seconds
- All four streams active together: 110 seconds
- Simultaneous activity: 22.9%
- Per-stream active seconds: 408, 375, 391, and 191
- Per-stream reconnects: 50, 49, 49, and 49

The fourth stream was particularly weak, and all four produced media together for less than one quarter of the observed period. At four minutes, all-four overlap was already only 50 of 240 seconds (20.8%), so the eight-minute measurement is consistent with the earlier portion of the run.

The test was stopped cleanly. Four temporary Zende sessions and four test processes were removed; no real user stream or recording was stopped.

## How a Zende playback request works

### Current raw MPEG-TS workflow

1. A user selects a live channel in the browser or sends it to their user-associated TV session.
2. The client creates an opaque stream session with `POST /api/stream/session`. Zende applies authentication, parental controls, source resolution, and proxy policy without exposing provider credentials to the browser.
3. Zende stores the session and returns a session identifier.
4. The client retrieves session metadata and receives a same-origin playback URL such as `/api/stream/proxy/<session-id>`.
5. Xtream live URLs ending in `.ts` remain MPEG-TS. They are no longer automatically rewritten to `.m3u8`.
6. In the browser, `mpegts.js` requests the Zende proxy and transmuxes MPEG-TS into fragmented MP4 for Media Source Extensions and the HTML video element.
7. The Zende proxy opens the provider request with its direct upstream HTTP connection agent. The connection pool permits concurrent requests; it is not protected by a global one-request-at-a-time lock.
8. Provider bytes are passed downstream as a readable stream. For one active upstream request per viewer, a provider EOF currently ends that response and the playback path must reconnect.

### Previous HLS workflow and why it was problematic

The previous Xtream live path converted `.ts` addresses to `.m3u8`:

1. Zende requested the provider-origin HLS manifest.
2. The provider redirected the request to a CDN URL containing a temporary token.
3. Zende pinned/cached the redirected origin to reduce repeated redirects.
4. The browser or player repeatedly requested manifests and media segments.
5. When another channel/session affected the account or token, the pinned CDN URL began returning `403 Forbidden`.
6. Retrying against the provider origin could also end at another 403 response.

Token invalidation made this route fragile for concurrent Xtream channels. Preserving raw `.ts` avoids the HLS token-pinning failure mode, but it cannot prevent the provider from closing the underlying transport stream.

## Request types observed

| Layer | Method and request | Purpose |
| --- | --- | --- |
| Xtream account API | `GET /player_api.php` with credentials | Account status, limits, and catalog metadata |
| Provider raw live stream | `GET /live/<redacted>/<redacted>/<stream-id>.ts` | Long-lived MPEG-TS byte stream |
| Provider HLS path (previous) | `GET .../<stream-id>.m3u8` | Manifest request, normally followed by a redirect and segment requests |
| Zende session creation | `POST /api/stream/session` | Create a credential-safe, user-authorized playback session |
| Zende session metadata | `GET /api/stream/session/<id>` | Return playback mode and same-origin proxy URL |
| Zende media relay | `GET /api/stream/proxy/<id>` | Fetch upstream media and stream it to the authorized client |

The provider account API reported `status=Active`, `active_cons=1`, and `max_connections=1` during inspection. `active_cons` is a point-in-time value; `max_connections=1` is the significant declared account policy.

## Provider failure and closure behavior

The following failure modes were observed:

- `Pinned CDN returned 403`
- `403 Forbidden` after retrying through the provider origin
- `SocketError: other side closed`
- A clean upstream EOF with no HTTP error. FFmpeg may exit with status 0 in this case even though a supposedly long-lived live feed ended unexpectedly.
- H.264 corruption after a truncated or discontinuous transport stream, including messages such as `cabac decode of qscale diff failed` and `error while decoding MB`.

The first uninterrupted two-stream raw test illustrates the clean-closure case: one feed decoded about 48 seconds and the other about 65 seconds before ending. The wall-clock run finished after about 45 seconds because buffered media can be decoded faster than real time. There was no evidence that Zende deliberately cancelled one stream to start the other.

The provider can therefore fail in two distinct ways:

1. **Explicit rejection:** HTTP 403, often associated with HLS/CDN token or account enforcement.
2. **Implicit termination:** the remote server or intermediary closes the socket or completes the response body early, sometimes without an error status.

Both must be handled by a resilient live-stream service.

## Recommended robust architecture

```text
Browser / TV clients
        |
        v
Authentication + opaque Zende stream sessions
        |
        v
Channel relay registry  -----> Account/source scheduler
        |                              |
        | one worker per source/channel|
        v                              v
Bounded ring buffer <---- reconnecting provider worker
        |
        +---- fan-out to viewer A
        +---- fan-out to viewer B
        +---- fan-out to viewer N
```

### Priority 0: continuity and same-channel fan-out

1. **Introduce a persistent relay worker keyed by provider, account, and channel ID.** Multiple viewers of the same channel should attach to one upstream feed instead of opening duplicate provider connections.
2. **Keep downstream sessions stable while reconnecting upstream.** A provider EOF should trigger a worker reconnect, not immediately destroy every viewer's logical session.
3. **Use a bounded ring buffer.** It should absorb short stalls and let newly attached viewers start at a clean boundary. Bound it by duration and bytes to prevent unbounded memory use.
4. **Remux through a continuity-aware process.** FFmpeg or GStreamer can regenerate timestamps and handle MPEG-TS discontinuities. HLS outputs must emit discontinuity markers when appropriate.
5. **Add client stall detection.** Detect the absence of media progress, reconnect with exponential backoff and jitter, and preserve the selected channel and UI state.
6. **Apply backpressure.** A slow client must not block the provider worker or other viewers; disconnect clients that fall beyond the allowed ring-buffer lag.

This design materially improves 100 viewers watching a small set of popular channels. For example, 100 viewers distributed across five channels need approximately five upstream feeds rather than 100.

### Priority 1: capacity scheduling and isolation

1. **Use a legitimate pool of provider accounts or sources.** The scheduler must honor each account's declared connection limit. With `max_connections=1`, assign at most one distinct active upstream channel to that account.
2. **Isolate circuit breakers per account and channel.** A failing channel must not pause unrelated relay workers.
3. **Track source health.** Score each account/channel combination using connection latency, time to first byte, closure rate, active-media ratio, 403 rate, and reconnect success.
4. **Add fallback mappings.** If the same channel exists on another authorized account or provider, fail over after a configurable threshold.
5. **Enforce an upstream connection budget.** When no provider slot is available, queue briefly or return an explicit capacity response rather than allowing streams to thrash each other indefinitely.

### Priority 2: efficiency and operations

1. Keep a relay warm for a short grace interval after the last viewer disconnects to avoid needless provider reconnects during channel switching.
2. Cache HLS segments only for viewers of the same source rendition. Segment caching cannot turn one provider slot into capacity for many different channels.
3. Add structured metrics and dashboards:
   - active viewers per channel
   - upstream connections per account
   - same-channel fan-out ratio
   - time to first frame
   - media-active percentage
   - provider EOF/socket-close count
   - HTTP status distribution
   - reconnect count and recovery time
   - buffer depth, dropped clients, and bytes relayed
4. Rate-limit retries and add jitter so a provider outage does not cause a reconnect storm.
5. Redact credentials and signed CDN tokens from logs and diagnostics.

## Capacity implications for 100 users

Viewer count and distinct-channel count are different capacity dimensions:

- **100 users watching one channel:** one healthy provider connection plus Zende fan-out can serve all users, subject to Zende bandwidth and CPU.
- **100 users watching five channels:** approximately five provider streams are required when each channel is shared internally.
- **100 users watching 100 different channels:** approximately 100 usable provider connection slots or equivalent multi-channel source capacity are required.

No cache, HTTP pool size, or application-level concurrency setting can reliably provide 100 distinct live channels through an account contractually and technically limited to one connection. Zende should enforce this constraint rather than allowing provider-side eviction to appear as random freezing.

## Proposed implementation phases and acceptance tests

### Phase 1: reconnect continuity

- Build an upstream state machine: connecting, streaming, stalled, backing off, and failed.
- Reconnect on EOF, socket closure, 403 where retry is appropriate, and lack of byte/media progress.
- Preserve the user's player session across a reconnect.
- Acceptance: a provider closure does not produce a permanent “no stream selected” state, and the player recovers without requiring the user to select the channel again.

### Phase 2: channel relay registry

- Add one worker and bounded buffer per provider/account/channel key.
- Attach all same-channel viewers to that worker.
- Acceptance: 20 viewers of the same channel create one provider request, and disconnecting one viewer does not interrupt the others.

### Phase 3: account/source scheduler

- Model account connection limits explicitly.
- Add health-based allocation, circuit breakers, and authorized fallbacks.
- Acceptance: opening channel B does not evict channel A when another valid provider slot exists; without a slot, Zende returns an explicit capacity state.

### Phase 4: staged load validation

Run reproducible tests for 1, 2, 4, 10, 25, and 100 viewers, separating these scenarios:

- all viewers on one channel
- viewers spread across a fixed small channel set
- every viewer on a distinct channel

Measure player-visible freeze time, recovery latency, provider requests, Zende bandwidth/CPU/memory, and upstream slot use. A useful initial target is recovery from a short provider closure within two seconds when an immediate reconnect succeeds, while never exceeding configured account limits.

## Security follow-up

The test credentials were supplied interactively and are not stored in this report. Because they were shared in a conversation and used for diagnostics, rotate them after testing. Future test scripts should read secrets only from environment variables or a secret manager, and logs should never contain full provider URLs with embedded usernames, passwords, or CDN tokens.

## Conclusion

The observed switching and freezing is not caused by a one-at-a-time Zende fetch implementation. Concurrent requests were issued and multiple channels decoded simultaneously, but the provider account declares a one-connection limit and the provider closes feeds frequently even in the single-channel baseline.

The best Zende-side solution is a reconnecting per-channel relay with bounded buffering and same-channel fan-out, combined with an account-aware scheduler and fallback sources. This will make short provider failures much less visible and drastically reduce redundant connections. Reliable playback of many different channels still requires legitimate upstream capacity for those distinct channels; software cannot manufacture that capacity from a one-connection provider account.
