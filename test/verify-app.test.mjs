import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../skills/mac-app/scripts/verify-app.mjs";

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
