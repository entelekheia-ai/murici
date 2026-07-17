# Murici — Claude Code instructions

The canonical agent guidelines live in [`AGENTS.md`](AGENTS.md) and are imported below.

@AGENTS.md

## Releases & channels

Murici ships on three side-by-side channels (`main`/stable, `beta`, `alpha`),
driven entirely by the git tag. Before cutting a release, bumping a version, or
touching `electron-builder.yml` / the release workflow / channel icons, read
[`CONTRIBUTING.md`](CONTRIBUTING.md) (operational guide) and
[`project/plans/019-prerelease-track.md`](project/plans/019-prerelease-track.md)
(design record). Never publish a prerelease directly to `main`.
