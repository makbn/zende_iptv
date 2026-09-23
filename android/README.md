# Zende Native Android TV

This is the fully native Jetpack Compose for TV client for Zende. It is intentionally a sibling
of `tv/`: the existing `tv/android` package remains the hosted WebView shell, while this project
renders the experience with composables, native D-pad focus, typed networking, and Media3 playback.

## Included screens

- Home hero, Continue Watching, movie, series, and live-TV rails
- QR phone pairing plus username/password sign-in
- Global search and Library search with All, Live, Movies, Shows, category, language, country, year, sort, and view controls
- Favorites synchronized with the server, including search, sort, category, poster, and list views
- Discover/EPG now-and-next guide
- Recording status, schedules, and recording playback
- Settings with server selection and account sign-in/out
- Fullscreen remote-controlled native HLS and recording playback

The Android app is a client of the existing Zende server. It does not duplicate credentials or
run the Next.js backend on the television.

## Build

The build target determines the default server URL. The physical-TV target always defaults to
`https://live.makbn.com`; the emulator target uses `10.0.2.2` to reach the host machine. Copy
`.env.example` to `.env` only when you need to override either endpoint locally.

```bash
cd android
# Physical Android TV / installed device
./gradlew :app:assembleTvDebug

# Android Studio emulator
./gradlew :app:assembleEmulatorDebug
```

The physical-TV APK is written to `app/build/outputs/apk/tv/debug/app-tv-debug.apk`.

Install on a connected Android TV:

```bash
adb install -r app/build/outputs/apk/tv/debug/app-tv-debug.apk
```

Plain HTTP is enabled for private LAN servers. Use HTTPS for an internet-accessible deployment.

## Remote controls

- D-pad: move focus; Left/Right seeks 10 seconds during VOD playback
- OK/Enter: activate; play/pause in the player
- Back: return Home, then exit; close the player
- Header Settings: change the Zende server URL or sign out

## TV design behavior

The UI follows the Zende web TV product: immersive Home artwork, persistent centered navigation,
the Signal deck Library controls, dense responsive poster grids, filter decks, saved-channel
controls, overscan-safe spacing, 10-foot typography, and one clearly indicated focus target at a time. Cards
combine scale, a 3dp brand outline, tonal elevation, and a short pressed transition. Moving
through Home rails updates the immersive hero preview without opening a new screen.

Playback uses Media3's native TV controls for play/pause and seeking, and releases the player when
the playback activity closes.
