# Pitfalls

Each entry: the symptom you see, the cause and the fix. All were hit building a real menu bar app with the Command Line Tools only.

## 1. SwiftUI macros do not compile without Xcode

**Symptom**

```
error: external macro implementation type 'SwiftUIMacros.StateMacro' could not be found for macro 'State()';
plugin for module 'SwiftUIMacros' not found
```

**Cause:** In current SDKs `@State`, `@Observable`, `@Entry` and `#Preview` are macros. Their compiler plugin ships inside Xcode, not with the Command Line Tools.

**Fix:** Keep view state in an `ObservableObject` and observe it.

```swift
@MainActor
final class EditorModel: ObservableObject {
    @Published var padding = 0.1
    @Published var shown = false          // animation flags too
}

struct EditorView: View {
    @ObservedObject var m: EditorModel    // property wrapper, not a macro: compiles
    var body: some View {
        Slider(value: Binding(get: { m.padding }, set: { m.padding = $0 }), in: 0...0.3)
            .onAppear { withAnimation { m.shown = true } }
    }
}
```

`@Published`, `@ObservedObject` and `@StateObject` are property wrappers and work. `Binding(get:set:)` replaces `$state`.

## 2. No `xcodebuild`, no `.xcodeproj`

**Symptom:** `xcode-select: error: tool 'xcodebuild' requires Xcode`.

**Fix:** `swift build -c release`, then assemble the bundle by hand (`scripts/bundle.sh`). An app bundle is only a folder:

```
App.app/Contents/Info.plist
App.app/Contents/MacOS/App          # the binary, named as CFBundleExecutable
App.app/Contents/Resources/         # icons, assets
```

Use `// swift-tools-version:5.10` in `Package.swift` unless you are ready for Swift 6 strict concurrency everywhere; AppKit callbacks then need `MainActor.assumeIsolated { ... }`.

## 3. Permissions reset or silently stay denied after a rebuild

**Symptom:** You allowed a permission and rebuilt. Now the app is denied again with no prompt, or System Settings no longer lists it.

**Cause:** TCC stores grants against the app's code requirement. An ad-hoc signature (`codesign -s -`) has no stable identity, so a rebuild can count as a new app.

**Fix:** Sign development builds with a stable identity.

1. Keychain Access → Certificate Assistant → Create a Certificate… → name it, Identity Type "Self-Signed Root", Certificate Type "Code Signing".
2. `SIGN_ID="My Dev Cert" scripts/bundle.sh ...`
3. To start over: `tccutil reset <Service> <bundle-id>` (service names in PERMISSIONS.md).

## 4. The app quits the moment it asks for a permission

**Cause:** The usage string for that API is missing from `Info.plist`. macOS terminates the process instead of showing a dialog.

**Fix:** Add the key from PERMISSIONS.md, rebuild, run `verify-app.mjs`; it flags frameworks linked without their keys.

## 5. Alerts and windows of a menu bar app open behind other apps

**Cause:** With `LSUIElement` the app is never frontmost on its own.

**Fix:** `NSApp.activate(ignoringOtherApps: true)` before `runModal()` or `makeKeyAndOrderFront`. Give tool windows `window.level = .floating`.

## 6. A borderless panel ignores the keyboard

**Fix:** Subclass and allow key status; handle Esc through `cancelOperation`.

```swift
final class RingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    var onEscape: (() -> Void)?
    override func cancelOperation(_ sender: Any?) { onEscape?() }
}
// styleMask: [.borderless, .nonactivatingPanel], level: .popUpMenu
```

## 7. Global event monitors: what works without Accessibility

| Need | Works without permission | Needs |
|---|---|---|
| Mouse clicks and drags anywhere (`addGlobalMonitorForEvents` with mouse masks) | yes | |
| Mouse position, pressed buttons, modifier flags (`NSEvent.mouseLocation`, `.pressedMouseButtons`, `.modifierFlags`) | yes | |
| Key presses in other apps | no | Input Monitoring (`ListenEvent`) |
| Posting synthetic events (`CGEvent.post`) | no | Accessibility |
| A global hotkey (`RegisterEventHotKey`) | yes | |

## 8. Detecting a file drag from Finder without any permission

Poll the drag pasteboard: its `changeCount` moves when a drag starts.

```swift
let pb = NSPasteboard(name: .drag)
var baseline = pb.changeCount
Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { _ in
    guard NSEvent.pressedMouseButtons & 1 != 0 else { baseline = pb.changeCount; return }
    guard pb.changeCount != baseline else { return }
    let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
    // a file drag is in progress: show a drop target near NSEvent.mouseLocation
}
```

Make the drop target a plain `NSView` with `registerForDraggedTypes([.fileURL])`. Call `unregisterDraggedTypes()` on any `NSHostingView` above it, or SwiftUI swallows the drop.

## 9. Reading the Finder selection

```swift
let src = """
tell application "Finder"
    set out to ""
    repeat with f in (get selection as alias list)
        set out to out & POSIX path of f & linefeed
    end repeat
    return out
end tell
"""
var err: NSDictionary?
let paths = NSAppleScript(source: src)?.executeAndReturnError(&err).stringValue ?? ""
if let err { NSLog("Finder: %@", err) }   // never swallow this
```

Read `NSAppleScriptErrorNumber` before blaming permissions:

| Number | Meaning |
|---|---|
| -1743 | Not permitted: the user denied Automation, or it was reset and the prompt was dismissed |
| -1700, -1728 | A script error (bad coercion, no such object). The Apple Event reached Finder, so permission is fine |
| -600 | Finder is not running |

## 10. A popover opened at the cursor ends up off screen

Opened from the menu bar, the cursor is at the top edge. Clamp the frame to the screen under the cursor:

```swift
static func frame(around p: NSPoint, size: NSSize, in visible: NSRect) -> NSRect {
    var f = NSRect(x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height)
    f.origin.x = min(max(f.minX, visible.minX), visible.maxX - size.width)
    f.origin.y = min(max(f.minY, visible.minY), visible.maxY - size.height)
    return f
}
let screen = NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main
```

## 11. Login item

```swift
import ServiceManagement
if SMAppService.mainApp.status != .enabled { try? SMAppService.mainApp.register() }
```

Works from `/Applications` or `~/Applications`. Check with `sfltool dumpbtm | grep -A3 <AppName>`.

## 12. Hardened runtime blocks Apple Events

With `codesign --options runtime` (required for notarization), `NSAppleScript` fails unless the entitlement is present:

```xml
<key>com.apple.security.automation.apple-events</key><true/>
```

Same pattern for camera (`com.apple.security.device.camera`) and microphone (`com.apple.security.device.audio-input`).

## 13. A child process hangs forever

**Cause:** Reading stdout to the end while stderr fills its pipe buffer (about 64 KB); the child blocks writing, you block reading. Common with `ffmpeg`.

**Fix:** Drain stderr on another thread, or send it to a file.

## 14. Glass looks wrong under the other system theme

`NSVisualEffectView` follows the system appearance. Pin it with `window.appearance = NSAppearance(named: .aqua)` (or `.darkAqua`). Put a tint layer over the material so text stays readable on any wallpaper.

## 15. Semi-transparent shapes show a darker outline

Filling and stroking the same translucent color doubles the alpha where they overlap. Draw both opaque, then apply the opacity once:

```swift
ZStack { shape.fill(color); shape.stroke(color, lineWidth: 16) }
    .compositingGroup()
    .opacity(0.7)
```

`Color.opacity(1)` does not undo an earlier `.opacity(0.3)`; it multiplies.
