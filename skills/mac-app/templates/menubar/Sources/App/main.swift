import AppKit
import SwiftUI

// A menu bar app with a SwiftUI popover, written without SwiftUI macros
// (@State / @Observable need Xcode's macro plugin; see PITFALLS.md section 1).

@MainActor
final class CounterModel: ObservableObject {
    @Published var count = 0
    func increment() { count += 1 }
}

struct PopoverView: View {
    @ObservedObject var model: CounterModel
    var body: some View {
        VStack(spacing: 12) {
            Text("Clicked \(model.count) times").font(.system(size: 13, weight: .medium, design: .rounded))
            HStack {
                Button("Click") { model.increment() }.keyboardShortcut(.defaultAction)
                Button("Quit") { NSApp.terminate(nil) }
            }
        }
        .padding(16)
        .frame(width: 220)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = CounterModel()
    let popover = NSPopover()
    var item: NSStatusItem!

    func applicationDidFinishLaunching(_ n: Notification) {
        popover.contentViewController = NSHostingController(rootView: PopoverView(model: model))
        popover.behavior = .transient
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sparkle", accessibilityDescription: "App")
        item.button?.action = #selector(toggle)
        item.button?.target = self
    }

    @objc func toggle() {
        guard let button = item.button else { return }
        if popover.isShown { popover.performClose(nil) } else {
            NSApp.activate(ignoringOtherApps: true)
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }
}

// `App --selftest`: checks the model without UI; exit code 0 means pass.
if CommandLine.arguments.contains("--selftest") {
    let ok = MainActor.assumeIsolated { () -> Bool in
        let m = CounterModel(); m.increment(); m.increment()
        return m.count == 2
    }
    print(ok ? "PASS counter" : "FAIL counter")
    exit(ok ? 0 : 1)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = MainActor.assumeIsolated { AppDelegate() }
app.delegate = delegate
app.run()
