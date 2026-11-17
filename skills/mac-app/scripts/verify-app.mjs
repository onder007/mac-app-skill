#!/usr/bin/env node
// Checks a built macOS .app for the mistakes that break it after bundling:
// Info.plist basics, missing usage strings for linked protected frameworks,
// hardened runtime without the entitlements its APIs need, and signature state.
//
// Usage: node verify-app.mjs <App.app> [--json]
// Exit code: 1 when any finding has level "error".

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Frameworks that need a usage string as soon as their protected API is called,
 *  and the entitlement they need under the hardened runtime. Apple documents the calendars
 *  entitlement for calendar access only, so EventKit needs it only with a calendar usage string. */
const FRAMEWORK_KEYS = {
  Speech: { anyOf: ["NSSpeechRecognitionUsageDescription"], what: "speech recognition" },
  Contacts: { anyOf: ["NSContactsUsageDescription"], what: "contacts", entitlement: "com.apple.security.personal-information.addressbook" },
  EventKit: { anyOf: ["NSCalendarsFullAccessUsageDescription", "NSRemindersFullAccessUsageDescription"], what: "calendars or reminders", entitlement: "com.apple.security.personal-information.calendars",
    entitlementWith: ["NSCalendarsFullAccessUsageDescription", "NSCalendarsWriteOnlyAccessUsageDescription"] },
  Photos: { anyOf: ["NSPhotoLibraryUsageDescription"], what: "the photo library", entitlement: "com.apple.security.personal-information.photos-library" },
  CoreLocation: { anyOf: ["NSLocationUsageDescription"], what: "location", entitlement: "com.apple.security.personal-information.location" },
};

/** Strings that appear in a binary that calls these APIs (class or symbol names). */
const MARKERS = ["NSAppleScript", "NSAppleEventDescriptor", "AEDeterminePermissionToAutomateTarget", "AVCaptureDevice"];

const finding = (id, level, message, fix) => ({ id, level, message, fix });

/**
 * Pure checks over collected facts, so they can be tested without building an app.
 * @param {{plist: object|null, executableOk: boolean, frameworks: string[], markers: string[],
 *          sign: {signed: boolean, adhoc: boolean, runtime: boolean, authority: string[], valid: boolean},
 *          entitlements: string[], notarized: boolean}} f
 */
export function analyze(f) {
  const out = [];
  const p = f.plist;
  if (!p) return [finding("plist-missing", "error", "Contents/Info.plist is missing or unreadable.", "Run scripts/bundle.sh, or create it with plutil -create xml1.")];

  for (const key of ["CFBundleIdentifier", "CFBundleExecutable", "CFBundlePackageType"]) {
    if (!p[key]) out.push(finding(`plist-${key}`, "error", `Info.plist has no ${key}.`, `plutil -insert ${key} -string ... Contents/Info.plist`));
  }
  if (p.CFBundlePackageType && p.CFBundlePackageType !== "APPL") {
    out.push(finding("plist-package-type", "error", `CFBundlePackageType is "${p.CFBundlePackageType}", expected "APPL".`, "Set it to APPL."));
  }
  if (p.CFBundleExecutable && !f.executableOk) {
    out.push(finding("executable-missing", "error", `Contents/MacOS/${p.CFBundleExecutable} is missing or not executable.`, "Copy the built binary there and chmod +x it."));
  }
  if (!p.LSMinimumSystemVersion) {
    out.push(finding("min-os", "warn", "No LSMinimumSystemVersion: older macOS versions will try to launch it and fail.", "plutil -insert LSMinimumSystemVersion -string 14.0 ..."));
  }

  // Usage strings for linked frameworks.
  for (const fw of f.frameworks) {
    const rule = FRAMEWORK_KEYS[fw];
    if (rule && !rule.anyOf.some((k) => p[k])) {
      out.push(finding(`usage-${fw}`, "error", `Links ${fw} but has no ${rule.anyOf.join(" or ")}. The app quits when it asks for ${rule.what}.`,
        `bundle.sh ... --usage ${rule.anyOf[0]} "What the app does with ${rule.what}."`));
    }
  }
  const usesAppleEvents = f.markers.some((m) => m.startsWith("NSAppleScript") || m.startsWith("NSAppleEvent") || m.startsWith("AEDetermine"));
  if (usesAppleEvents && !p.NSAppleEventsUsageDescription) {
    out.push(finding("usage-AppleEvents", "error", "Sends Apple Events (NSAppleScript) but has no NSAppleEventsUsageDescription. The Automation prompt cannot appear.",
      'bundle.sh ... --usage NSAppleEventsUsageDescription "Why the app controls Finder."'));
  }
  const usesCapture = f.markers.includes("AVCaptureDevice");
  if (usesCapture && !p.NSCameraUsageDescription && !p.NSMicrophoneUsageDescription) {
    out.push(finding("usage-capture", "warn", "References AVCaptureDevice but has neither NSCameraUsageDescription nor NSMicrophoneUsageDescription.",
      "Add the key for each device the app opens."));
  }

  // Hardened runtime needs entitlements for protected resources.
  if (f.sign.runtime) {
    const need = [];
    if (usesAppleEvents) need.push("com.apple.security.automation.apple-events");
    if (usesCapture && p.NSCameraUsageDescription) need.push("com.apple.security.device.camera");
    if (usesCapture && p.NSMicrophoneUsageDescription) need.push("com.apple.security.device.audio-input");
    for (const k of f.frameworks.map((fw) => FRAMEWORK_KEYS[fw])) {
      if (k?.entitlement && (!k.entitlementWith || k.entitlementWith.some((u) => p[u]))) need.push(k.entitlement);
    }
    for (const e of need.filter((e) => !f.entitlements.includes(e))) {
      out.push(finding(`entitlement-${e}`, "error", `Hardened runtime is on but ${e} is missing; the API fails without a prompt.`,
        `Add <key>${e}</key><true/> to the entitlements file and pass --entitlements to bundle.sh.`));
    }
  }

  // Signature.
  if (!f.sign.signed) {
    out.push(finding("unsigned", "error", "The bundle is not signed; at most the executable carries the linker's ad-hoc signature, which does not cover Info.plist or resources.", "codesign --force --sign - App.app"));
  } else {
    if (!f.sign.valid) out.push(finding("signature-invalid", "error", "codesign --verify --deep --strict fails: the bundle changed after signing.", "Sign again as the last step."));
    if (f.sign.adhoc) {
      out.push(finding("adhoc", "warn", "Ad-hoc signature: permissions may reset on every rebuild. Other Macs need System Settings > Privacy & Security > Open Anyway, or xattr -dr com.apple.quarantine.",
        "Sign with a stable identity (PITFALLS.md section 3), or Developer ID + notarization for distribution (RELEASE.md)."));
    } else if (f.sign.authority.some((a) => a.startsWith("Developer ID Application")) && !f.notarized) {
      out.push(finding("not-notarized", "info", "Signed with Developer ID but no notarization ticket is stapled.", "xcrun notarytool submit ... --wait, then xcrun stapler staple App.app"));
    }
  }
  return out;
}

/**
 * Signature facts from `codesign -dv` output. A bundle carrying only the linker's ad-hoc
 * signature on its arm64 executable (flags "linker-signed") was not signed as a bundle.
 */
export function parseSignature(text, status) {
  const flags = (text.match(/flags=0x[0-9a-f]+\(([^)]*)\)/) || [])[1] || "";
  return {
    signed: status === 0 && !/not signed/i.test(text) && !flags.includes("linker-signed"),
    adhoc: /Signature=adhoc/.test(text) || flags.includes("adhoc"),
    runtime: flags.includes("runtime"),
    authority: [...text.matchAll(/^Authority=(.+)$/gm)].map((m) => m[1]),
  };
}

/** Gathers the facts analyze() needs from a real bundle. */
export function collect(app) {
  const contents = join(app, "Contents");
  const plistPath = join(contents, "Info.plist");
  let plist = null;
  if (existsSync(plistPath)) {
    try { plist = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plistPath], { encoding: "utf8" })); } catch { plist = null; }
  }
  const exe = plist?.CFBundleExecutable ? join(contents, "MacOS", plist.CFBundleExecutable) : null;
  const executableOk = !!exe && existsSync(exe) && (statSync(exe).mode & 0o111) !== 0;

  let frameworks = [], markers = [];
  if (executableOk) {
    const libs = spawnSync("otool", ["-L", exe], { encoding: "utf8" }).stdout || "";
    frameworks = [...libs.matchAll(/\/([A-Za-z0-9]+)\.framework\//g)].map((m) => m[1]);
    const bin = readFileSync(exe);
    markers = MARKERS.filter((m) => bin.includes(m));
  }

  const info = spawnSync("codesign", ["-dv", "--verbose=2", app], { encoding: "utf8" });
  const sign = parseSignature((info.stderr || "") + (info.stdout || ""), info.status);
  const signed = sign.signed;
  sign.valid = signed && spawnSync("codesign", ["--verify", "--deep", "--strict", app]).status === 0;
  const ent = signed ? spawnSync("codesign", ["-d", "--entitlements", "-", "--xml", app], { encoding: "utf8" }).stdout || "" : "";
  const entitlements = [...ent.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
  const notarized = signed && spawnSync("xcrun", ["stapler", "validate", app]).status === 0;
  return { plist, executableOk, frameworks, markers, sign, entitlements, notarized };
}

function main() {
  const args = process.argv.slice(2);
  const app = args.find((a) => !a.startsWith("--"));
  if (!app) { console.error("usage: verify-app.mjs <App.app> [--json]"); process.exit(2); }
  if (!existsSync(app)) { console.error(`no such bundle: ${app}`); process.exit(2); }
  const findings = analyze(collect(app));
  if (args.includes("--json")) {
    console.log(JSON.stringify({ app, findings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(5)} ${f.id}: ${f.message}\n      fix: ${f.fix}`);
    const errors = findings.filter((f) => f.level === "error").length;
    console.log(errors ? `\n${errors} error(s)` : `\nOK${findings.length ? ` (${findings.length} note(s))` : ""}`);
  }
  process.exit(findings.some((f) => f.level === "error") ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
