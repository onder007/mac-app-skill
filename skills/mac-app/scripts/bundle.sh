#!/bin/zsh
# Builds a SwiftPM executable in release mode and wraps it in <Product>.app.
#
# Usage: bundle.sh <product> <bundle-id> [version] [options]
#   --menu-bar                 LSUIElement: no Dock icon
#   --icon <file.icns>         app icon
#   --usage <Key> <text>       a usage string, e.g. --usage NSSpeechRecognitionUsageDescription "..."
#   --entitlements <file>      entitlements plist for codesign
#   --min-os <version>         LSMinimumSystemVersion (default 14.0)
# Env:
#   SIGN_ID   codesign identity (default "-", ad-hoc)
#   HARDENED  1 to sign with the hardened runtime (needed for notarization)
# Run from the package root. Writes ./<product>.app
set -euo pipefail

if [[ $# -lt 2 ]]; then sed -n '2,15p' "$0"; exit 2; fi
product=$1 bundle_id=$2; shift 2
version=1.0.0
if [[ $# -gt 0 && $1 != --* ]]; then version=$1; shift; fi

menu_bar=0 icon="" entitlements="" min_os=14.0
typeset -a usage_keys usage_texts
while [[ $# -gt 0 ]]; do
  case $1 in
    --menu-bar) menu_bar=1; shift ;;
    --icon) icon=$2; shift 2 ;;
    --usage) usage_keys+=$2; usage_texts+=$3; shift 3 ;;
    --entitlements) entitlements=$2; shift 2 ;;
    --min-os) min_os=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

swift build -c release --product "$product"
bin="$(swift build -c release --show-bin-path)/$product"
[[ -x $bin ]] || { echo "no executable at $bin" >&2; exit 1; }

app="$product.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/$product"

plist="$app/Contents/Info.plist"
plutil -create xml1 "$plist"
plutil -insert CFBundleName -string "$product" "$plist"
plutil -insert CFBundleIdentifier -string "$bundle_id" "$plist"
plutil -insert CFBundleExecutable -string "$product" "$plist"
plutil -insert CFBundlePackageType -string APPL "$plist"
plutil -insert CFBundleShortVersionString -string "$version" "$plist"
plutil -insert CFBundleVersion -string "$version" "$plist"
plutil -insert LSMinimumSystemVersion -string "$min_os" "$plist"
plutil -insert NSHighResolutionCapable -bool true "$plist"
(( menu_bar )) && plutil -insert LSUIElement -bool true "$plist"
if [[ -n $icon ]]; then
  cp "$icon" "$app/Contents/Resources/AppIcon.icns"
  plutil -insert CFBundleIconFile -string AppIcon "$plist"
fi
for (( i = 1; i <= ${#usage_keys}; i++ )); do
  plutil -insert "${usage_keys[$i]}" -string "${usage_texts[$i]}" "$plist"
done

sign_args=(--force --sign "${SIGN_ID:--}")
[[ ${HARDENED:-0} == 1 ]] && sign_args+=(--options runtime --timestamp)
[[ -n $entitlements ]] && sign_args+=(--entitlements "$entitlements")
codesign "${sign_args[@]}" "$app"

echo "built $PWD/$app"
