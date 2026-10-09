---
vibe-ops-template: log@2
name: running-tsc-in-a-fresh-worktree-fails-on-png-imports
description: "`tsc --noEmit` in a freshly created worktree fails with 'Cannot find module @/public/providers/*.png' on the imports in components/models/model-icon.tsx, because the git-ignored next-env.d.ts that declares the image modules does not exist there until `next dev` has run; the errors are not about the change being checked"
kind: trap
path:
  - "next-env.d.ts"
attempted: 2026-10-09
source: the Plan-020 closure, run in a fresh worktree after `npm ci`
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# A fresh worktree type-checks red on PNG imports, whatever the change was

> **Not current truth.** This records what was attempted on 2026-10-09 and what happened then. Check it
> against the present state before acting on it.

## What was attempted

Type-check a change in a worktree created for it (the repository's rule is to work in one): `git worktree
add`, `npm ci`, then `npx tsc --noEmit`.

## What happened

`tsc` exited non-zero with errors that have nothing to do with the change, all of one kind:

```text
components/models/model-icon.tsx(8,21): error TS2307: Cannot find module '@/public/providers/mistral.png' or its corresponding type declarations.
components/models/model-icon.tsx(9,18): error TS2307: Cannot find module '@/public/providers/groq.png' ...
components/models/model-icon.tsx(10,24): error TS2307: Cannot find module '@/public/providers/perplexity.png' ...
```

Those three were the only errors. In the checkout where `next dev` had been run, the same command was clean.
Nothing in the message points at `next-env.d.ts`, so the natural reading is that an asset is missing or the
change broke an import.

## The mechanism

`next-env.d.ts` is listed in `.gitignore` and so is absent from every new worktree. `tsconfig.json`
includes it, and it carries `/// <reference types="next/image-types/global" />`, the file that declares
`*.png` and the other image modules (checked in `node_modules/next/image-types/global.d.ts`). Without the
reference, a PNG import has no type.

## What to do instead

Do not chase the three errors. Run `npm run dev` once in the worktree (the file is written on start; it
existed in the checkout where `next dev` had run and was missing in the one created fresh), or look for the
file first when `tsc` fails only on image imports. Whether `next build` or `next typegen` also writes it was
not established: `next typegen` was tried in a worktree whose `node_modules` was a link to another
checkout and did not complete, so that run says nothing about it.
