# Setup

No secrets live in this repo. API keys go in a local `.env` (gitignored); a `.env.example` with
blank placeholders will be added alongside the backend.

## iOS app

**Requirements:** macOS with Xcode 16+ (developed on Xcode 26), iOS 18+ simulator or device.

### Run in Xcode

1. Open `ios/Cram.xcodeproj` in Xcode.
2. Pick an iOS Simulator (e.g. iPhone 17) or your device.
3. Press **Run** (⌘R).

### Build from the command line

```sh
cd ios
xcodebuild -project Cram.xcodeproj -scheme Cram \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

> The iOS project is scaffolded next; this section will be exact once `ios/Cram.xcodeproj` exists.

## Backend (added on Windows)

FastAPI + Supabase. Will document `.env.example`, install, and run steps when it lands.

## Web (added on Windows)

Next.js. Will document `npm install` / `npm run dev` when it lands.
