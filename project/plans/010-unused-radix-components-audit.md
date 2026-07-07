# Plan 010: Unused Radix/shadcn components audit

## Objective

Decide, component by component, whether each of the 16 shadcn/ui wrapper
files under `components/ui/` that currently have zero call sites in
application code should be deleted (along with their `@radix-ui/react-*`
dependency) or kept because a documented future plan/RFC actually needs
them. Produce a keep/remove decision table; do not delete anything as part
of this plan itself — deletion is a follow-up PR once the table is
reviewed.

## Motivation

A dependency-tree audit of `murici` (2026-07-06) found these wrapper files
are defined but never imported anywhere outside their own file:

`alert-dialog`, `aspect-ratio`, `avatar`, `checkbox`, `context-menu`,
`hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`,
`scroll-area`, `select`, `separator`, `slider`, `switch`, `toggle-group`.

(For reference: `@radix-ui/react-toast` was in the same state and has
already been removed directly — see the toast/sonner cleanup done
alongside this plan. That one was unambiguous because `sonner` fully
replaces it. These 16 are murkier: some may be intentionally pre-installed
for UI work already sketched in `project/plans/` or `project/rfc/`.)

Each unused package still gets installed, type-checked, and bundled by
Next.js on every build. Removing genuinely dead ones shrinks
`node_modules`, the lockfile, and `npm install` time. But removing one that
a near-term plan actually depends on just creates rework, so this needs a
real per-component check rather than a blanket deletion.

## Proposed Approach

1. **For each of the 16 components**, check three things:
   - Does `components/ui/<name>.tsx` get imported by anything under
     `app/`, `components/` (outside `components/ui/`), or `lib/`? (Re-verify
     at execution time — this audit's own grep already found zero, but
     confirm again since the codebase moves.)
   - Does any file under `project/plans/` or `project/rfc/` reference the
     *actual UI primitive* (not just the English word — a naive keyword
     grep for "select" or "switch" or "progress" mostly matches ordinary
     prose like "switch between models" or "select a file," not the Radix
     component). Read the surrounding paragraph, don't trust a keyword hit.
   - Is there an open `project/adr/` decision or in-progress branch/PR that
     depends on it?

2. **Decision rule**:
   - If nothing in (1) references it → mark **remove**.
   - If a specific plan/RFC section names the primitive as needed for
     upcoming work → mark **keep**, with a citation (file + section) so the
     reason is traceable later instead of re-litigated.
   - If genuinely ambiguous → mark **keep for now**, revisit next audit
     cycle instead of guessing.

3. **Output**: a table (below) filled in with the actual per-component
   finding, plus a short list of the components approved for removal.

4. **Follow-up (separate PR, not this plan)**: delete the approved wrapper
   files and their `@radix-ui/react-*` package entries in `package.json` in
   one commit, run `npm install`, `npm run type-check`, `npm run build`.

## Decision Table (to fill in during execution)

| Component | Radix package | Wrapper file | Referenced by a plan/RFC? | Decision |
|---|---|---|---|---|
| alert-dialog | @radix-ui/react-alert-dialog | components/ui/alert-dialog.tsx | | |
| aspect-ratio | @radix-ui/react-aspect-ratio | components/ui/aspect-ratio.tsx | | |
| avatar | @radix-ui/react-avatar | components/ui/avatar.tsx | | |
| checkbox | @radix-ui/react-checkbox | components/ui/checkbox.tsx | | |
| context-menu | @radix-ui/react-context-menu | components/ui/context-menu.tsx | | |
| hover-card | @radix-ui/react-hover-card | components/ui/hover-card.tsx | | |
| menubar | @radix-ui/react-menubar | components/ui/menubar.tsx | | |
| navigation-menu | @radix-ui/react-navigation-menu | components/ui/navigation-menu.tsx | | |
| progress | @radix-ui/react-progress | components/ui/progress.tsx | | |
| radio-group | @radix-ui/react-radio-group | components/ui/radio-group.tsx | | |
| scroll-area | @radix-ui/react-scroll-area | components/ui/scroll-area.tsx | | |
| select | @radix-ui/react-select | components/ui/select.tsx | | |
| separator | @radix-ui/react-separator | components/ui/separator.tsx | | |
| slider | @radix-ui/react-slider | components/ui/slider.tsx | | |
| switch | @radix-ui/react-switch | components/ui/switch.tsx | | |
| toggle-group | @radix-ui/react-toggle-group | components/ui/toggle-group.tsx | | |

## Out of scope (adiado)

- No code is deleted by this plan — it only produces the decision table.
- Radix packages that already have a confirmed call site (`dialog`, `label`,
  `popover`, `tabs`, `toggle`, `tooltip`, `accordion`, `collapsible`,
  `dropdown-menu`, `slot`) are not part of this audit — they're in active
  use.

## Open Questions

- Should the removal follow-up PR happen immediately after this table is
  approved, or batched with the next unrelated dependency cleanup?
- If a component is marked "keep for now" due to ambiguity, what's the
  revisit trigger — next full dependency audit, or when the referencing
  plan actually starts implementation?
