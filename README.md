# mac-app-skill

An agent skill for building macOS apps from the terminal: SwiftPM and the Command Line Tools only, no Xcode project. It covers the parts that break after `swift build` works: bundling, permissions, signing and release.

Works with any coding agent that reads `SKILL.md` skills.

## Install

```bash
npx skills add https://github.com/onder007/mac-app-skill --skill mac-app
```

Or copy `skills/mac-app/` into your agent's skills folder.

## What is inside

| File | Contents |
|---|---|
| [`SKILL.md`](skills/mac-app/SKILL.md) | Workflow and rules: scaffold, bundle, permissions, verify, release |
| [`PITFALLS.md`](skills/mac-app/PITFALLS.md) | 15 problems with symptom, cause and fix, e.g. `@State` and `@Observable` failing to compile without Xcode, permissions resetting after a rebuild, AppleScript error -1743 vs -1700, panels opening off screen |
| [`PERMISSIONS.md`](skills/mac-app/PERMISSIONS.md) | Every protected feature: the API that prompts, its `Info.plist` key, its `tccutil` service, its hardened runtime entitlement |
| [`SCAFFOLD.md`](skills/mac-app/SCAFFOLD.md) | `Package.swift`, an AppKit-hosted `main.swift`, icons, developer flags that make an app testable without clicking |
| [`RELEASE.md`](skills/mac-app/RELEASE.md) | Signing levels, notarization with `notarytool`, DMG, GitHub release, Homebrew tap |
| [`scripts/bundle.sh`](skills/mac-app/scripts/bundle.sh) | `swift build` to a signed `.app` with `Info.plist`, usage strings, icon, entitlements |
| [`scripts/verify-app.mjs`](skills/mac-app/scripts/verify-app.mjs) | Checks a built `.app` (below) |
| [`scripts/make-dmg.sh`](skills/mac-app/scripts/make-dmg.sh) | DMG with an Applications link |
| [`templates/menubar/`](skills/mac-app/templates/menubar) | A menu bar app with a SwiftUI popover, no macros, with a `--selftest` flag |

## verify-app

```bash
node skills/mac-app/scripts/verify-app.mjs MyApp.app          # readable report, exit 1 on errors
node skills/mac-app/scripts/verify-app.mjs MyApp.app --json   # {"app": ..., "findings": [{id, level, message, fix}]}
```

| Check | Level |
|---|---|
| `Info.plist` present; `CFBundleIdentifier`, `CFBundleExecutable`, `CFBundlePackageType` = `APPL` | error |
| The executable exists and is executable | error |
| Linked Speech, Contacts, EventKit, Photos or CoreLocation without its usage string (the app quits at the request) | error |
| `NSAppleScript` in the binary without `NSAppleEventsUsageDescription` | error |
| Hardened runtime without the entitlement an API needs (Apple Events, camera, microphone) | error |
| Unsigned, or the signature no longer verifies | error |
| `AVCaptureDevice` without a camera or microphone usage string | warn |
| No `LSMinimumSystemVersion` | warn |
| Ad-hoc signature (permissions may reset on rebuild) | warn |
| Developer ID without a stapled notarization ticket | info |

Frameworks come from `otool -L`; API use is detected from class and symbol names in the binary.

## Quick start

```bash
cp -R skills/mac-app/templates/menubar MyApp && cd MyApp
../skills/mac-app/scripts/bundle.sh App com.example.myapp 0.1.0 --menu-bar
open App.app
node ../skills/mac-app/scripts/verify-app.mjs App.app
```

## Tests

```bash
npm test     # unit tests for verify-app, then an end-to-end run:
             # template -> bundle.sh -> app selftest -> verify-app -> DMG, plus a broken bundle that must fail
```

Requires macOS 14+, the Command Line Tools (`xcode-select --install`) and Node 18+.

## License

MIT, see [LICENSE](LICENSE).
