import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseSignature } from "../skills/mac-app/scripts/verify-app.mjs";

const base = () => ({
  plist: { CFBundleIdentifier: "com.example.app", CFBundleExecutable: "App", CFBundlePackageType: "APPL", LSMinimumSystemVersion: "14.0" },
  executableOk: true,
  frameworks: ["Foundation", "AppKit"],
  markers: [],
  sign: { signed: true, adhoc: false, runtime: false, authority: ["Apple Development: x"], valid: true },
  entitlements: [],
  notarized: false,
});
const ids = (f) => analyze(f).map((x) => x.id);
const errors = (f) => analyze(f).filter((x) => x.level === "error").map((x) => x.id);

test("a clean bundle has no findings", () => assert.deepEqual(ids(base()), []));

test("missing Info.plist stops early", () => {
  assert.deepEqual(ids({ ...base(), plist: null }), ["plist-missing"]);
});

test("required keys and executable", () => {
  const f = base();
  delete f.plist.CFBundleIdentifier;
  f.executableOk = false;
  assert.deepEqual(errors(f).sort(), ["executable-missing", "plist-CFBundleIdentifier"]);
});

test("linked Speech without its usage string is an error", () => {
  const f = { ...base(), frameworks: ["Speech"] };
  assert.deepEqual(errors(f), ["usage-Speech"]);
  f.plist.NSSpeechRecognitionUsageDescription = "Transcribes your files on this Mac.";
  assert.deepEqual(errors(f), []);
});

test("EventKit accepts either calendars or reminders", () => {
  const f = { ...base(), frameworks: ["EventKit"] };
  assert.deepEqual(errors(f), ["usage-EventKit"]);
  f.plist.NSRemindersFullAccessUsageDescription = "Adds reminders.";
  assert.deepEqual(errors(f), []);
});

test("NSAppleScript needs the Apple Events usage string", () => {
  const f = { ...base(), markers: ["NSAppleScript"] };
  assert.deepEqual(errors(f), ["usage-AppleEvents"]);
});

test("hardened runtime needs the apple-events entitlement", () => {
  const f = { ...base(), markers: ["NSAppleScript"] };
  f.plist.NSAppleEventsUsageDescription = "Reads the Finder selection.";
  f.sign.runtime = true;
  assert.deepEqual(errors(f), ["entitlement-com.apple.security.automation.apple-events"]);
  f.entitlements = ["com.apple.security.automation.apple-events"];
  assert.deepEqual(errors(f), []);
});

test("hardened runtime needs the entitlement of each linked protected framework", () => {
  const f = { ...base(), frameworks: ["Contacts", "EventKit", "Photos", "CoreLocation"] };
  Object.assign(f.plist, {
    NSContactsUsageDescription: "a", NSCalendarsFullAccessUsageDescription: "b",
    NSPhotoLibraryUsageDescription: "c", NSLocationUsageDescription: "d",
  });
  assert.deepEqual(errors(f), []);
  f.sign.runtime = true;
  const ents = [
    "com.apple.security.personal-information.addressbook",
    "com.apple.security.personal-information.calendars",
    "com.apple.security.personal-information.photos-library",
    "com.apple.security.personal-information.location",
  ];
  assert.deepEqual(errors(f), ents.map((e) => `entitlement-${e}`));
  f.entitlements = ents;
  assert.deepEqual(errors(f), []);

  const reminders = { ...base(), frameworks: ["EventKit"] };
  reminders.plist.NSRemindersFullAccessUsageDescription = "e";
  reminders.sign.runtime = true;
  assert.deepEqual(errors(reminders), []);
});

test("camera and microphone entitlements follow the usage strings", () => {
  const f = { ...base(), markers: ["AVCaptureDevice"] };
  assert.deepEqual(ids(f), ["usage-capture"]);
  f.plist.NSMicrophoneUsageDescription = "Records voice notes.";
  f.sign.runtime = true;
  assert.deepEqual(errors(f), ["entitlement-com.apple.security.device.audio-input"]);
});

test("signature states", () => {
  assert.deepEqual(errors({ ...base(), sign: { ...base().sign, signed: false } }), ["unsigned"]);
  assert.deepEqual(errors({ ...base(), sign: { ...base().sign, valid: false } }), ["signature-invalid"]);
  assert.deepEqual(ids({ ...base(), sign: { ...base().sign, adhoc: true } }), ["adhoc"]);
  const devId = { ...base(), sign: { ...base().sign, authority: ["Developer ID Application: Me (TEAMID)"] } };
  assert.deepEqual(ids(devId), ["not-notarized"]);
  assert.deepEqual(ids({ ...devId, notarized: true }), []);
});

test("a linker-only signature counts as unsigned", () => {
  const linker = "Format=app bundle with Mach-O thin (arm64)\nCodeDirectory v=20400 size=924 flags=0x20002(adhoc,linker-signed) hashes=26+0 location=embedded\nSignature=adhoc\nSealed Resources=none\n";
  assert.equal(parseSignature(linker, 0).signed, false);
  assert.deepEqual(errors({ ...base(), sign: { ...parseSignature(linker, 0), valid: false } }), ["unsigned"]);
  const bundle = "CodeDirectory v=20500 size=430 flags=0x10002(adhoc,runtime) hashes=7+3 location=embedded\nSignature=adhoc\n";
  assert.deepEqual(parseSignature(bundle, 0), { signed: true, adhoc: true, runtime: true, authority: [] });
});
