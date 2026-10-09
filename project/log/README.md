# Log

Traps and debts, each addressed by the path where someone meets it again. One entry per trap; an entry that retires is deleted.

## `(repository root)`

- [`running-tsc-in-a-fresh-worktree-fails-on-png-imports.md`](running-tsc-in-a-fresh-worktree-fails-on-png-imports.md) —
  `tsc --noEmit` in a freshly created worktree fails with 'Cannot find module @/public/providers/*.png' on
  the imports in components/models/model-icon.tsx, because the git-ignored next-env.d.ts that declares the
  image modules does not exist there until `next dev` has run; the errors are not about the change being
  checked
