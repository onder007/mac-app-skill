# Release

## 1. Signing levels

| Level | Who can run it | Needs |
|---|---|---|
| Ad-hoc (`codesign -s -`) | You; others after right click → Open, or `xattr -dr com.apple.quarantine` | Nothing |
| Self-signed identity | Same as ad-hoc for others; for you, permissions survive rebuilds | A code signing cert in your keychain |
| Developer ID + notarized | Everyone, double click opens | Apple Developer Program |

## 2. Notarize (Developer ID)

`notarytool` and `stapler` come with the Command Line Tools.

```bash
SIGN_ID="Developer ID Application: Your Name (TEAMID)" HARDENED=1 \
  scripts/bundle.sh App com.example.myapp 1.0.0 --entitlements App.entitlements

xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID   # once, app-specific password
ditto -c -k --keepParent App.app App.zip
xcrun notarytool submit App.zip --keychain-profile notary --wait
xcrun stapler staple App.app
spctl -a -vv App.app        # "source=Notarized Developer ID" means done
```

Hardened runtime is required for notarization; add the entitlements from PERMISSIONS.md for every protected API.

## 3. DMG

```bash
scripts/make-dmg.sh App.app App-1.0.0.dmg
```

On macOS 27 `hdiutil` prints a deprecation notice pointing to `diskutil image`; the DMG it builds is still valid and mounts on older systems.

Sign and notarize the DMG too when the app is notarized (`codesign -s "$SIGN_ID" App-1.0.0.dmg`, then `notarytool submit` and `stapler staple`).

## 4. GitHub release

```bash
shasum -a 256 App-1.0.0.dmg
gh release create v1.0.0 App-1.0.0.dmg --title "App 1.0.0" --notes "First release"
```

## 5. Homebrew

The official `homebrew/cask` tap expects apps that pass Gatekeeper. For ad-hoc or self-signed builds, publish your own tap: a repo named `homebrew-tap` with `Casks/app.rb`.

```ruby
cask "app" do
  version "1.0.0"
  sha256 "<shasum of the dmg>"
  url "https://github.com/you/app/releases/download/v#{version}/App-#{version}.dmg"
  name "App"
  desc "One sentence about what it does"
  homepage "https://github.com/you/app"
  depends_on macos: ">= :sonoma"
  app "App.app"
end
```

Users install with `brew install --cask you/tap/app`.

## Checklist

- [ ] `node scripts/verify-app.mjs App.app` shows no errors
- [ ] Opened from Finder (not the terminal) and every permission prompt was answered once
- [ ] Version bumped in `bundle.sh` arguments and the tag
- [ ] DMG mounts and the app runs from `/Applications`
