#!/bin/zsh
# Packs an .app into a compressed DMG with an Applications shortcut.
# Usage: make-dmg.sh <App.app> <out.dmg> [volume name]
set -euo pipefail
[[ $# -ge 2 ]] || { sed -n '2,3p' "$0"; exit 2; }
app=$1 out=$2 vol=${3:-${${app:t}%.app}}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/${app:t}"
ln -s /Applications "$stage/Applications"
rm -f "$out"
hdiutil create -volname "$vol" -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$out" >/dev/null
echo "built $out ($(du -h "$out" | cut -f1))"
