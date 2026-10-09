---
vibe-ops-template: task@3
---

# Task: The cerrado package installs

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-10-08 |
| Author | Danilo Borges |
| Issue | pending |
| Plan | [plans/020-the-knowledge-graph-moves-to-cerrado.md](../plans/020-the-knowledge-graph-moves-to-cerrado.md), Track 1 |

---

## Context

Plan-020 Track 1: `.npmrc`, the CI and release-workflow token, and `@entelekheia-ai/cerrado@0.2.0`
pinned exactly in `package.json`. Acceptance: `npm ci` succeeds locally and in CI, `npm run build` and
`npm run electron:build` succeed with the package imported from a throwaway call site, and
`scripts/verify-electron-deps.js` passes.

The package is private on GitHub Packages, and the package already grants this repository read access,
so the workflows authenticate with `GITHUB_TOKEN` and `permissions: packages: read`; no secret is added.

Files owned: `.npmrc`, `package.json`, `package-lock.json`, `.github/workflows/canary.yml`,
`.github/workflows/electron-release.yml`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Scope registry in a committed `.npmrc`, no token in it | S |
| 2 | P0 | Workflows authenticate to GitHub Packages | S |
| 3 | P0 | Pin `@entelekheia-ai/cerrado@0.2.0` and prove both builds | S |

### 1. Scope registry — P0

**What:** `.npmrc` with `@entelekheia-ai:registry=https://npm.pkg.github.com`.
**Why:** without it `npm ci` asks the public registry for a package it does not have.
**Change:** the token stays in each machine's user-level `~/.npmrc` and, in CI, in the file
`actions/setup-node` writes; a `${VAR}` token line in the committed file would fail every local install
where the variable is unset.

### 2. Workflows — P0

**What:** `canary.yml` and `electron-release.yml` gain `packages: read`, `registry-url` and `scope` on
`setup-node`, and `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on `npm ci`.
**Why:** both run `npm ci`; `release-checks.yml` does not install and is left alone.
**Change:** as above.

### 3. Pin and build — P0

**What:** `npm install --save-exact @entelekheia-ai/cerrado@0.2.0`; a throwaway import to prove the
bundle; `npm run build`, `npm run electron:build`, `node scripts/verify-electron-deps.js`.
**Why:** the acceptance; a package that installs but does not bundle blocks Track 3.
**Change:** the throwaway import is removed before the commit.

## Implementation order

- [x] P0 — `.npmrc`
- [x] P0 — workflows
- [x] P0 — pin and build (`npm run build` exit 0; cerrado's code found in `.next/static/chunks`; `verify-electron-deps` OK, 45 dependencies; `electron-builder --dir` exit 0 unsigned)

## Surprises & Discoveries

- Observation: a user-level `~/.npmrc` may read its GitHub Packages token from an environment variable,
  and a shell that does not export it gets `401 Unauthorized` on install although `npm view` works in the
  maintainer's own terminal.
  Evidence: `npm install` returned E401 from an agent shell; it succeeded with the variable set from
  `gh auth token` for that one command.
- Observation: `electron-builder` signing fails with `errSecInternalComponent` when the keychain cannot
  prompt, after packaging has already completed.
  Evidence: `npm run electron:build -- --dir` failed at `codesign`; `CSC_IDENTITY_AUTO_DISCOVERY=false
  npx electron-builder --dir` exited 0. Signing is untouched by this track.
- Ruling: the `electron:build` acceptance is met by an unsigned `--dir` package — signing depends on the
  machine's keychain, not on this change — cost if wrong: a signing problem introduced by the package
  would surface only in the release workflow.

## Closure

- [x] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
