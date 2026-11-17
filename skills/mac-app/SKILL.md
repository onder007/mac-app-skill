---
name: mac-app
description: Build, bundle, sign and ship a macOS app with SwiftPM and the Command Line Tools only, no Xcode project. Use when creating a menu bar or desktop Mac app from the terminal, turning a Swift package into a .app, fixing macOS permission (TCC) prompts that never appear or keep resetting, adding a login item, or preparing a DMG, notarized build or Homebrew release.
---

# mac-app

Ship a real `.app` from a Swift package without opening Xcode. The Command Line Tools bring `swift`, `notarytool` and `stapler`. `codesign`, `hdiutil` and `iconutil` ship with macOS in `/usr/bin`. That is everything this needs.

## Workflow

1. **Scaffold** a package and the app shell. Read [SCAFFOLD.md](SCAFFOLD.md). Start from `templates/menubar/` for a menu bar app.
2. **Before writing SwiftUI**, read [PITFALLS.md](PITFALLS.md) section 1. Without Xcode, `@State`, `@Entry` and `#Preview` do not compile.
3. **Bundle** with `scripts/bundle.sh`. It builds in release mode, writes `Info.plist`, copies the binary and signs the bundle.
4. **Permissions:** for every protected API the app calls, add its usage string and know its TCC service. Read [PERMISSIONS.md](PERMISSIONS.md).
5. **Verify** with `node scripts/verify-app.mjs <App.app>`. Fix every `error` before going further. Read the `warn` lines; each one says why it matters.
6. **Release** as a DMG, optionally notarized, optionally through a Homebrew tap. Read [RELEASE.md](RELEASE.md).

## Rules

- Never claim a permission flow works without running the bundled app (`open App.app`), not the bare binary. TCC attributes a binary started from a terminal to the terminal, so prompts and grants differ.
- Every protected API needs its usage string in `Info.plist` before the first call. A missing string ends the process at the request, with no dialog.
- Prefer a stable signing identity during development (PITFALLS.md section 3). Ad-hoc signatures change on every build and TCC may treat each build as a new app.
- Keep the app's own state in `ObservableObject` classes and pass `Binding(get:set:)` to controls.
- Run `verify-app.mjs` after every change to `Info.plist`, entitlements or signing.

## Files

| File | Read when |
|---|---|
| [SCAFFOLD.md](SCAFFOLD.md) | Starting a new app, or turning a package into a bundle |
| [PITFALLS.md](PITFALLS.md) | Something compiles in Xcode but not here; a window, panel or event monitor behaves oddly |
| [PERMISSIONS.md](PERMISSIONS.md) | Adding camera, mic, speech, contacts, calendars, Apple Events, accessibility, screen recording or folder access |
| [RELEASE.md](RELEASE.md) | Making a DMG, notarizing, publishing a GitHub release or Homebrew cask |
| `scripts/bundle.sh` | Building the `.app` |
| `scripts/verify-app.mjs` | Checking a built `.app` |
| `scripts/make-dmg.sh` | Packaging for download |
