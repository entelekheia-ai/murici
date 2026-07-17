---
description: Scaffold a new plan from the project template
disable-model-invocation: true
arguments: [topic]
effort: low
---

# /new-plan — Create a New Plan

Scaffolds `plans/<NNN>-<slug>.md` from `../templates/plan.md`.

Plans capture implementation strategy: scope, design, task breakdown, and success criteria in English.

**Usage:** `/new-plan <topic>` — e.g. `/new-plan implement agent registry`

If no topic is provided as an argument, ask the user before starting.

---

## Step 1 — Collect inputs

You need two values before proceeding:

1. **Topic** — a short phrase describing what the plan covers.
   - If the user provided a topic as a `/new-plan` argument, use it directly.
   - Otherwise ask: *"What should this plan cover? Give a short phrase."*

2. **Author name** — name to put in the plan's `Author` field.
   - Default: `Danilo Borges`. Use the default unless the user specifies otherwise.

Do not proceed until both values are known.

---

## Step 1b — Migrating from Another Format?

If you are converting an existing document (e.g., briefing, RFC, or old plan format) into this plan format:

- **Preserve all existing content** — Do not invent, simplify, or rewrite sections. Extract text as-is.
- **Reorganize by section** — Sort existing content into the appropriate plan sections (Summary, Goals, Scope, Design, Tracks, etc.).
- **Keep decisions and questions** — If the source document has open questions, closed decisions, or rationale, move them intact to the corresponding sections.
- **External references** — If linking to documents outside murici (e.g., in dot-agent-spec), use GitHub URLs (`https://github.com/daniloborges/entelekheia/blob/<branch>/path/to/doc.md`) rather than relative paths, to prevent link breakage. For docs within murici, use relative paths.

Do not proceed to Step 2 until the content review is complete.

---

## Step 2 — Determine the next plan number

Run this exact command from the repository root:

```bash
find plans -maxdepth 1 -name "[0-9][0-9][0-9]-*.md" | grep -oE '[0-9]{3}' | sort -n | tail -1
```

This scans active plans only (not archived subdirectories).

- If the command returns a number N, the new plan number is `N + 1`, zero-padded to 3 digits (e.g. `017`).
- If the command returns nothing or fails, start at `001`.

---

## Step 3 — Derive title and slug

From the topic:

- **Title** — convert to Title Case (e.g. "implement agent registry" → "Implement Agent Registry")
- **Slug** — lowercase, hyphen-separated (e.g. `implement-agent-registry`)
- **Filename** — `plans/<NNN>-<slug>.md`

---

## Step 4 — Read the template

Read `../templates/plan.md`.

**Do not reproduce the template structure from memory.** Use the file content as the single source of truth for section order, formatting, and wording.

---

## Step 5 — Build the plan file

Starting from the exact content of `../templates/plan.md`, apply these edits in order:

**a) License comment** — Keep the Apache 2.0 `<!-- Copyright … -->` block at the top unchanged.

**b) Template instructions block** — Delete the second `<!-- PLAN TEMPLATE … -->` block entirely (the one that begins with "PLAN TEMPLATE — copy to plans/…").

**c) Inline guidance comments** — Delete all remaining HTML comments inside the document body (e.g. `<!-- One paragraph… -->`, `<!-- What this plan covers… -->`).

**d) Heading** — Replace `# Plan-NNN: Title` with `# Plan-<number>: <Title>`.

**e) Metadata table** — Make these changes:

| Field | Action |
|---|---|
| `Status` | Set to `Backlog` |
| `Created` | Run `date +%Y-%m-%d` and use the output — **do not guess the date** |
| `Author` | Set to the author name from Step 1 |
| `Depends on` row | Delete unless there is a confirmed dependency |
| `Related` row | Delete unless there is a known related plan or ADR |

---

## Step 6 — Scaffold section bodies

Keep all section headers from the template unchanged. Under each section:

- **Summary** — Write one paragraph that paraphrases the plan topic in plain terms. Do not invent technical details yet; keep it high-level. If migrating from another format, preserve the existing summary text as-is; do not rewrite.
- **Goals** — Write 3–5 concrete outcomes. What does "done" look like? If migrating, extract existing goals without modification.
- **Scope → In Scope / Out of Scope** — Explicitly state what enters and exits this plan. If migrating and scope already exists, preserve it.
- **Design** — Leave empty for author to fill (may have subsections per feature). If migrating and design exists, preserve it intact.
- **Success Criteria** — Leave empty for author to fill (should be testable assertions). If migrating and criteria exist, preserve them.
- **Tracks** — Leave empty stub with one example track; author will break down work. If migrating and tracks/tasks exist, preserve them.
- **Dependencies** — Leave empty. If migrating and dependencies exist, preserve them.
- **Open Questions** — Leave empty. If migrating and open questions exist, preserve them without editing.
- **Related** — Leave empty. If migrating and related links exist, preserve them (converting external refs to GitHub URLs as needed).

**If a section has no corresponding content in the source document** (migration case), do not
invent content to fill it — including tasks, checklists, or "done" criteria that read as
resolved/certain. Leave it as the template's empty stub, or write a short italic note such as
*"Not yet defined — pending further exploration."* A section that looks filled-in but was
fabricated is worse than an honestly empty one: it misrepresents how settled the plan actually is.
This applies especially to **Success Criteria** and **Tracks**, which are the sections most likely
to invite invented specifics.

If the source document carries its own caveat about being incomplete or not yet actionable (e.g.
"this is a briefing, not an executable plan yet"), preserve that caveat — as a callout right after
the metadata table — rather than silently upgrading its status to look more finished than it is.

---

## Step 7 — Write the file

Write the complete plan to `plans/<NNN>-<slug>.md`.

Murici's `rfc/`, `adr/`, and `plans/` folders do not use an index file — each document is
discovered by browsing the folder or via `templates/README.md`. Do not create a `plans/INDEX.md`;
that pattern belongs to a different repo's convention and does not apply here.

---

## Checklist — verify before reporting done

- [ ] File exists at the correct path: `plans/<NNN>-<slug>.md`
- [ ] File starts with the Apache 2.0 license comment block
- [ ] Heading is exactly `# Plan-<NNN>: <Title>`
- [ ] Metadata table has `Status: Backlog`, correct `Created` date, correct `Author`
- [ ] `Depends on` and `Related` rows removed (unless populated)
- [ ] All section headers present: Summary, Goals, Scope, Design, Success Criteria, Tracks, Dependencies, Open Questions, Related
- [ ] No HTML guidance comments remain in the body
- [ ] No `plans/INDEX.md` was created (murici does not use an index file for these folders)
- [ ] If migrating from another format: all existing content is preserved as-is (no rewrites or inventions)
- [ ] If migrating: sections with no source content are left as honest stubs, not invented
- [ ] If migrating: external refs (to repos outside murici) use GitHub URLs; internal refs use relative paths
- [ ] If the source document had a caveat about being incomplete/non-actionable, it was preserved

All boxes must be checked before the task is complete.
