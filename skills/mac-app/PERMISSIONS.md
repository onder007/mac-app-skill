# Permissions (TCC)

For each protected feature: the API that triggers the prompt, the `Info.plist` usage key that must exist first, the TCC service name for `tccutil reset`, and the hardened runtime entitlement when one is needed.

| Feature | Triggered by | Info.plist key | `tccutil` service | Hardened runtime entitlement |
|---|---|---|---|---|
| Control another app (Automation) | `NSAppleScript`, `NSAppleEventDescriptor` sends | `NSAppleEventsUsageDescription` | `AppleEvents` | `com.apple.security.automation.apple-events` |
| Speech recognition | `SFSpeechRecognizer.requestAuthorization` | `NSSpeechRecognitionUsageDescription` | `SpeechRecognition` | |
| Microphone | `AVCaptureDevice` audio, `AVAudioEngine` input | `NSMicrophoneUsageDescription` | `Microphone` | `com.apple.security.device.audio-input` |
| Camera | `AVCaptureDevice` video | `NSCameraUsageDescription` | `Camera` | `com.apple.security.device.camera` |
| Contacts | `CNContactStore` | `NSContactsUsageDescription` | `AddressBook` | |
| Calendars | `EKEventStore.requestFullAccessToEvents` | `NSCalendarsFullAccessUsageDescription` | `Calendar` | |
| Reminders | `EKEventStore.requestFullAccessToReminders` | `NSRemindersFullAccessUsageDescription` | `Reminders` | |
| Photos | `PHPhotoLibrary.requestAuthorization` | `NSPhotoLibraryUsageDescription` | `Photos` | |
| Location | `CLLocationManager` | `NSLocationUsageDescription` | (System Settings → Location Services) | |
| Desktop / Documents / Downloads folders | First file access there | `NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription`, `NSDownloadsFolderUsageDescription` | `SystemPolicyDesktopFolder`, `SystemPolicyDocumentsFolder`, `SystemPolicyDownloadsFolder` | |
| Screen recording | `ScreenCaptureKit`, `CGWindowListCreateImage` | none | `ScreenCapture` | |
| Accessibility | `AXIsProcessTrustedWithOptions`, `CGEvent.post` | none | `Accessibility` | |
| Input Monitoring | key events from other apps, listen-only event taps | none | `ListenEvent` | |
| Full Disk Access | none, the user adds the app by hand | none | `SystemPolicyAllFiles` | |

## Rules

- Usage strings say what the app does with the data, in one sentence: "Orbit turns speech in your audio and video files into text, on this Mac."
- Ask at the moment of use, not at launch. A prompt with no visible reason gets denied.
- After a denial the system does not ask again. Detect it and point the user to the right pane:

```swift
NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")!)
// Privacy_SpeechRecognition, Privacy_Microphone, Privacy_Camera, Privacy_Accessibility, Privacy_ScreenCapture, ...
```

- To reset during development (the user runs these, they change security settings):

```bash
tccutil reset AppleEvents com.example.App
tccutil reset SpeechRecognition com.example.App
```

- After a reset the app disappears from the list in System Settings until it asks again. That is expected.

## Checking a grant from code

| Service | Check |
|---|---|
| Accessibility | `AXIsProcessTrusted()` |
| Screen recording | `CGPreflightScreenCaptureAccess()` |
| Speech | `SFSpeechRecognizer.authorizationStatus()` |
| Apple Events | `AEDeterminePermissionToAutomateTarget(...)`, or run the script and read error -1743 |
