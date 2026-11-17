#!/bin/zsh
# End to end: template -> bundle.sh -> app selftest -> verify-app -> DMG, plus one broken bundle,
# a hardened build with and without entitlements and Calculator.app.
# Needs the Command Line Tools and Node. Works in a temp folder; nothing is written to the repo.
set -euo pipefail
root=${0:A:h:h}
skill=$root/skills/mac-app
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass() { print "PASS $1" }
fail() { print "FAIL $1"; exit 1 }

cp -R "$skill/templates/menubar" "$work/app"
cd "$work/app"

"$skill/scripts/bundle.sh" App com.example.macappskill 0.1.0 --menu-bar \
  --usage NSAppleEventsUsageDescription "Example usage string." >/dev/null 2>&1 || fail "bundle.sh"
[[ -x App.app/Contents/MacOS/App ]] && pass "bundle.sh builds App.app" || fail "bundle.sh output"

[[ $(plutil -extract LSUIElement raw App.app/Contents/Info.plist) == true ]] && pass "--menu-bar sets LSUIElement" || fail "LSUIElement"
[[ $(plutil -extract NSAppleEventsUsageDescription raw App.app/Contents/Info.plist) == "Example usage string." ]] \
  && pass "--usage writes the key" || fail "--usage"

App.app/Contents/MacOS/App --selftest | grep -q "PASS counter" && pass "app selftest" || fail "app selftest"

node "$skill/scripts/verify-app.mjs" App.app >/dev/null && pass "verify-app accepts the template" || fail "verify-app on template"

"$skill/scripts/make-dmg.sh" App.app App.dmg >/dev/null || fail "make-dmg.sh"
mnt=$(hdiutil attach -nobrowse -readonly App.dmg | awk -F'\t' '/\/Volumes\// {print $NF}')
[[ -x "$mnt/App.app/Contents/MacOS/App" && -L "$mnt/Applications" ]] && pass "DMG holds the app and an Applications link" || fail "DMG contents"
hdiutil detach "$mnt" -quiet

# A broken bundle must fail: no bundle identifier, re-signed so only the plist is wrong.
plutil -remove CFBundleIdentifier App.app/Contents/Info.plist
codesign --force --sign - App.app 2>/dev/null
if node "$skill/scripts/verify-app.mjs" App.app --json > report.json; then fail "verify-app missed a broken bundle"; fi
grep -q '"plist-CFBundleIdentifier"' report.json && pass "verify-app flags a missing CFBundleIdentifier" || fail "finding id"

# Hardened runtime: an app that uses protected APIs fails without its entitlements and passes with them.
cat > Sources/App/Protected.swift <<'EOF'
import AppKit
import Contacts

// Kept by the linker through the Objective-C class list; not called.
final class ProtectedAPIs: NSObject {
    @objc func use() {
        _ = NSAppleScript(source: "return 1")
        _ = CNContactStore()
    }
}
EOF
hardened() {
  HARDENED=1 "$skill/scripts/bundle.sh" App com.example.macappskill 0.1.0 "$@" \
    --usage NSAppleEventsUsageDescription "Example usage string." \
    --usage NSContactsUsageDescription "Example usage string." >/dev/null 2>&1 || fail "bundle.sh HARDENED=1"
}
hardened
if node "$skill/scripts/verify-app.mjs" App.app --json > report.json; then fail "verify-app missed missing entitlements"; fi
grep -q '"entitlement-com.apple.security.automation.apple-events"' report.json \
  && grep -q '"entitlement-com.apple.security.personal-information.addressbook"' report.json \
  && pass "verify-app flags missing hardened runtime entitlements" || fail "entitlement finding ids"
cat > App.entitlements <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.automation.apple-events</key><true/>
  <key>com.apple.security.personal-information.addressbook</key><true/>
</dict></plist>
EOF
hardened --entitlements App.entitlements
node "$skill/scripts/verify-app.mjs" App.app >/dev/null && pass "verify-app accepts the hardened app with entitlements" || fail "verify-app on hardened app"

node "$skill/scripts/verify-app.mjs" /System/Applications/Calculator.app >/dev/null && pass "verify-app accepts Calculator.app" || fail "verify-app on Calculator.app"

print "ALL PASSED"
