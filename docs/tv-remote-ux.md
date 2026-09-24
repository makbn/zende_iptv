# TV Remote UX Guidelines

Zende’s TV shells (Tizen, webOS, Android TV, `?tv=1`) must work with **Up / Down / Left / Right / Select / Back** only. Mouse and hover are secondary. These rules follow Samsung Smart TV design principles and tvOS focus guidance.

Source of truth for agents and reviewers. Implementation lives in [`src/components/tv/tv-spatial-navigation.tsx`](../src/components/tv/tv-spatial-navigation.tsx) and declarative `data-tv-*` attributes.

## Principles

### 1. Four-direction only

- Every interactive feature must be reachable with the D-pad and Select/Back.
- No hover-only or mouse-only hit targets on TV.
- A direction key must never be a silent no-op mid-screen. Stops only at **list edges** (focus does not loop).

### 2. Grid topology

- Focusable items form orthogonal grids/rails — not diagonal or floating islands.
- Prefer: `data-tv-layout="horizontal|vertical|grid"` with indexes where needed.
- Floating actions (Skip Intro, FABs, toasts with buttons) are forbidden unless they join an **explicit focus graph** with bidirectional bridges.

### 3. Predictable neighbors

- Left/Right stay in-row; Up/Down change row or region.
- Cross-region movement uses `data-tv-nav-{up|down|left|right}="#id"`.
- Geometric nearest-neighbor search is a last resort for unannotated legacy screens.

### 4. One clear focus

- Exactly one focused object.
- Focus must be obvious at ~3m (pink remote outline under `html[data-tv-input="remote"]`).
- Focused items scroll fully into view with safe margins (overscan).

### 5. Hierarchy and Back

- Back closes the top overlay → previous screen → exit app (at home).
- Popups trap focus; backdrops are **not** focusable (`tabIndex={-1}` or non-button dimmer).
- Match [`live-preview-dialog.tsx`](../src/components/library/live-preview-dialog.tsx).

### 6. Ten-foot density

- Min control size ~56px in remote mode; large type; fewer items per viewport.
- Hide desktop-only controls with `data-tv-hide-control` / `data-tv-download` / `data-tv-external-link`.
- Minimize text entry; keep keyboard guard; Up/Down must escape inputs (`data-tv-nav-input="spatial"` when Left/Right should also leave).

### 7. Player remote model

| Remote state | Left / Right | Up / Down | Select | Play/Pause |
|---|---|---|---|---|
| Chrome hidden | Seek ±10s (VOD) or channel zap (live) + reveal | Reveal chrome, focus Play | Reveal, focus Play | Toggle + reveal, focus Play |
| Chrome visible | Move among controls / seek on scrubber | Top chrome ↔ seek ↔ controls ↔ transient actions | Activate | Toggle, keep chrome |
| Overlay open | Stay inside overlay | Stay inside overlay | Activate | May still toggle playback |

While a transient primary action (Skip Intro) is focused, chrome may stay hidden, but **any direction that leaves that control must wake chrome first**.

### 8. Lists and tabs

- Horizontal content rows + top category tabs.
- Remember last focused item when leaving/returning to a content region when practical.
- **Home fixed-focus lane (Prime-style):** under `html[data-tv-input="remote"]`, the hero stays locked; D-pad Down slides the shelves track (`translateY`) so the focused row stays at a constant height. Mark with `data-tv-fixed-focus-root` — spatial nav must not `scrollIntoView` vertically there.

## Attribute cheat sheet

| Attribute | Purpose |
|-----------|---------|
| `data-tv-layout="horizontal\|vertical\|grid"` | Explicit neighbor order |
| `data-tv-columns` / `data-tv-index` | Grid cell math |
| `data-tv-item-index` + `data-tv-item-count` | O(1) rail left/right; column-preserving up/down |
| `data-tv-nav-{up,down,left,right}="#id"` | Region bridges |
| `data-tv-initial-focus` / `data-tv-page-entry` | Entry focus |
| `data-tv-skip-initial` | Skip hero/actions for first content focus |
| `data-tv-card` | Card is one remote stop |
| `data-tv-hide-control` | Hidden on TV via CSS |
| `data-tv-nav-input="spatial"` | D-pad can leave text fields on left/right |
| `data-tv-keyboard-guard` | Soft-keyboard guard |
| `data-tv-backdrop` | Full-viewport dismiss — excluded from focus candidates |
| `data-tv-focus-group` | Named group for transient neighbors (e.g. `player`) |

## Page focus graph template

```
[ Top nav: horizontal ]
        ↓↑ explicit bridge
[ Primary content: rails / grid / list ]
        ↓↑
[ Secondary / filters: adjacent layout ]
```

No focusable element may sit visually between two regions without belonging to one of them.

## Acceptance checklist

- From any focusable, U/D/L/R moves to a predictable neighbor or stops at a list edge.
- Skip Intro: OK skips; Down reaches Play in ≤1 key after chrome wake; Up reaches Back; return to Skip in ≤2 keys while intro is active.
- Player: chrome hidden and visible modes fully controllable.
- Every dialog: focus enters primary action; Back closes; backdrop not in focus order.
- Home → Library → Detail → Watch → Back restores expected browse focus.
- Manual pass with `?tv=1` plus a real TV shell when shipping TV changes.

### Implementation status (2026-09-23)

| Gate | Status |
|------|--------|
| Engine wakes inert bridge targets (`__zendeTvWakePlayer`) | Done |
| Mid-screen dead keys banned (fall through except list edges) | Done |
| `data-tv-backdrop` excludes full-viewport dismiss | Done (search, watch-together, recordings, proxies, issues) |
| Skip Intro ↔ Play/Back explicit graph | Done |
| Player top chrome horizontal layout + multi-selector bridges | Done |
| Guide / Favorites / Settings / Recordings / Detail / Login / Setup wired | Done (baseline graphs) |
| Unit contracts for nav selectors | `src/components/tv/tv-spatial-navigation.test.ts` |

### Remaining gaps (follow-up)

- Guide detail portal (full-channel schedule) still relies mostly on geometric focus inside the overlay.
- Settings panel bodies are dense forms — tabs + panel entry are wired; individual card fields may still need per-panel vertical layouts.
- Recordings start-dialog internals (channel search → schedule form) need a deeper pass beyond backdrop + page sections.
- Manual `?tv=1` / device shell pass should be run before TV release.

### Browse chrome (2026-09-23)

Favorites, Discover (Guide), and Recordings use the compact **Library-style** header + sticky filter deck (`.tv-browse-chrome` / `.tv-browse-filter-deck`) instead of giant `AppicaHero` branding blocks. Category / sort / layout controls sit inside a single horizontal `data-tv-layout` graph.

## Debug

On TV / `?tv=1`, set `localStorage.setItem("zendeTvFocusDebug", "1")` to log focus moves (`from → direction → to`) in the console.
