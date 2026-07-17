# Contributing to Murici

## Branches & release channels

Murici ships on three channels. **Branch = channel = update track.**

| Branch | Channel | Tag pattern | GitHub Release | App identity |
|--------|---------|-------------|----------------|--------------|
| `main` | stable (`latest`) | `vX.Y.Z` | release | `Murici` · `com.entelekheia.murici` |
| `beta` | beta | `vX.Y.Z-beta.N` | pre-release | `Murici Beta` · `…murici.beta` |
| `alpha` | alpha | `vX.Y.Z-alpha.N` | pre-release | `Murici Alpha` · `…murici.alpha` |

Promotion flows one way: `feature/* → alpha → beta → main`. `main` only ever
carries code already validated on a prerelease. Design record: [`project/plans/019-prerelease-track.md`](project/plans/019-prerelease-track.md).

Auto-update cascade (electron-updater): an **alpha** install receives alpha +
beta + stable; a **beta** install receives beta + stable; a **stable** install
receives stable only. So a tester always rides down to the eventual stable
release and never gets stuck on a prerelease.

### The three channels install side by side

Because each channel has a distinct `appId` and `productName`, you can keep
`Murici` (stable) installed and run `Murici Beta` / `Murici Alpha` next to it to
test. They are separate apps with **separate data** (`userData` / IndexedDB keyed
by product name) — chats and settings are not shared, which is intentional for
integration testing. (`~/.config/murici` is currently shared across channels;
window/app config only — not chat data.)

## Cutting a prerelease

Everything is driven by the tag — CI ([`.github/workflows/electron-release.yml`](.github/workflows/electron-release.yml))
derives channel, release type, icon, and app identity from it. No manual config.

```bash
# 1. Land the features on the prerelease branch (e.g. beta for a release candidate)
git checkout beta && git pull
#    integrate: merge alpha, or merge the feature PRs

# 2. Bump the version WITH the channel suffix, in package.json
npm version 0.11.0-beta.1 --no-git-tag-version
git commit -am "chore: 0.11.0-beta.1"

# 3. Tag and push — this triggers the build/publish for all 3 OSes
git tag v0.11.0-beta.1
git push origin beta --tags
```

CI publishes a GitHub **pre-release** with `beta.yml` + installers named
`Murici Beta`. Only beta installs pick it up. Iterate `-beta.2`, `-beta.3`… for
each round of fixes. Same flow on `alpha` with `-alpha.N` for rougher builds.

Version ordering is SemVer: `-alpha.1 < -alpha.2 < -beta.1 < 0.11.0`.

## Promoting to stable

When a `-beta.N` passed integration and the final check:

```bash
git checkout main && git pull
git merge --ff-only beta          # or open a PR beta -> main
npm version 0.11.0 --no-git-tag-version
git commit -am "chore: 0.11.0"
git tag v0.11.0
git push origin main --tags       # publishes the full release on `latest`

# resync the test branches onto the new stable
git checkout beta  && git merge --ff-only main && git push
git checkout alpha && git merge main && git push
```

## Icons

Per-channel icon masters live in [`electron/assets/icon/`](electron/assets/icon/),
one set per channel — `<channel>.icon` (macOS Icon Composer), `<channel>.icns`,
`<channel>.ico` (Windows), `<channel>.png` (1024×1024, Linux), `<channel>.svg`
(source). CI selects the set by channel; `electron-builder.yml` defaults to
`latest` for local builds.

Rules: masters only (electron-builder generates every derived size), always
**square 1024×1024**, never commit `@2x`/`@3x`/`-N` export variants.
