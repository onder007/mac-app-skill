# Scaffold

## Start from the template

```bash
cp -R templates/menubar MyApp && cd MyApp
swift build                       # compiles in seconds
../scripts/bundle.sh App com.example.myapp 0.1.0 --menu-bar
open App.app                      # an icon appears in the menu bar
node ../scripts/verify-app.mjs App.app
```

`templates/menubar` is a status item with a SwiftUI popover and a model, written without macros.

## Package.swift

```swift
// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "App",
    platforms: [.macOS(.v14)],
    targets: [.executableTarget(name: "App", path: "Sources/App")]
)
```

- The executable target's name becomes the binary name and `CFBundleExecutable`.
- Top-level code goes in `main.swift`; do not also add `@main`.
- Tools version 5.10 keeps Swift 5 language mode. Moving to 6 turns on strict concurrency; AppKit callbacks then need `MainActor.assumeIsolated`.

## main.swift for an AppKit-hosted app

```swift
import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var item: NSStatusItem!
    func applicationDidFinishLaunching(_ n: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sparkle", accessibilityDescription: "App")
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)          // no Dock icon; pair with --menu-bar (LSUIElement)
let delegate = MainActor.assumeIsolated { AppDelegate() }
app.delegate = delegate
app.run()
```

## Developer flags worth adding early

Small command-line switches make the app testable without clicking:

- `--selftest`: build fixtures in a temp folder, run each feature, print PASS/FAIL, exit non-zero on failure.
- `--preview <out.png>`: render a SwiftUI view with `ImageRenderer` to check the look headlessly.
- `--do <action> <file>`: run one feature inside the bundled app, so permission prompts belong to the app.

Handle them in `main.swift` before `app.run()` (selftest, preview) or in `applicationDidFinishLaunching` (anything that needs the app context).

## Icons

```bash
mkdir App.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s icon-1024.png --out App.iconset/icon_${s}x${s}.png
  sips -z $((s*2)) $((s*2)) icon-1024.png --out App.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns App.iconset -o AppIcon.icns
```

Pass `--icon AppIcon.icns` to `bundle.sh`.
