# Zende TV shells

This directory packages the existing hosted Zende React/Next.js application for TV platforms. It
does not copy the frontend or run the Node.js backend on the television.

```text
Android TV / Tizen shell  ->  hosted Zende URL  ->  existing Next.js UI and APIs
```

## Android TV

The Android project is a small native WebView container. It provides:

- Android TV launcher and banner metadata
- D-pad, Back, fullscreen video, cookies, and DOM storage
- a configurable Zende server URL
- same-host navigation containment
- persistent login through the WebView cookie store

Build a debug APK:

```bash
cd tv
ZENDE_TV_URL=http://192.168.1.10:8077 npm run android:build
```

Install it on a connected or paired Android TV:

```bash
ZENDE_TV_DEVICE=192.168.1.20:5555 npm run android:install
```

Press the remote's Menu button to change the server URL. A failed initial load also opens the
server dialog. Plain HTTP is supported for private LAN testing; use HTTPS for deployed instances.

The build script looks for the SDK in `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or
`$HOME/Library/Android/sdk`. It uses the checked-in Gradle wrapper once generated.

## Samsung Tizen

The Tizen project is a hosted Web application launcher. On first launch it asks for the Zende URL,
stores it locally on the television, and navigates the top-level TV browser to the existing app.
Older Samsung browsers are automatically served Zende's existing `/legacy/` client by the server.

Tizen packages must be signed with a Samsung certificate. After installing Tizen Studio, its Web
CLI, TV Extension, and Certificate Extension:

```bash
cd tv
npm run tizen:build
TIZEN_CERT_PROFILE=your-profile npm run tizen:package
```

To test on a Samsung TV, enable Developer Mode, connect with Tizen Device Manager/SDB on port
`26101`, then install the generated `.wgt` package.

## Shared frontend behavior

TV spatial focus and platform Back handling live in the main frontend at
`src/components/tv/tv-spatial-navigation.tsx`. Both shells therefore get the same remote behavior
without duplicating React components or business logic.

