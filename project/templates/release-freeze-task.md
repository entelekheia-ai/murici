<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

<!--
 RELEASE / FREEZE TASK TEMPLATE — copy to tasks/<ID>-release-<package>.md and fill in.
 Use this template to document the context and manual pre-checks required before 
 running the automated release script.
 Delete these comments before committing.
-->

# Task: Release and Freeze <Package Name(s)>

| Field | Value |
|---|---|
| Status | Planned |
| Created | YYYY-MM-DD |
| Author | Your Name |
| Sources | <!-- Links to the RFC/ADR that motivated the unfreeze/release --> |
| Depends on | <!-- Prerequisites that must be complete before release --> |

---

## Context

<!-- Describe which packages are being released, the version increment logic (e.g., 0.+1 minor bump), and the rationale for closing the unfreeze window. -->

## Pre-Release Checklist (Manual Housekeeping)

Before executing the automated release script, ensure the following repository governance tasks are complete:

- [ ] **Documentation & Examples:** Verify that `docs/` and `dsl/` are updated. Re-validate canonical `examples/` against any new syntax or parsing logic.
- [ ] **RFC/DA & ADR Status:** Transition associated RFCs to `Implemented` status. Generate any permanent Architecture Decision Records (ADR) from the Design Logs if necessary.
- [ ] **Task Cleanup:** Delete all completed implementation task files related to this macro-task in `project/tasks/` and commit the deletions. *This release task should be the only file remaining for the macro-task.*
- [ ] **Workspace & Submodules:** Ensure `git status` is clean, all submodule changes are committed inside their repos, the superproject points to the correct hashes, and `Cargo.lock` / `package-lock.json` are synced.

---

## Release Execution (Automated)

The version bumping (Cargo & NPM), test validation, release builds, publish actions, task file deletion, and git tagging are orchestrated by the interactive script.

**Steps:**

1. From the repository root, run the script:
   ```bash
   node scripts/release.mjs
   ```
2. Follow the interactive prompts (inform the target packages, the new version, and the path to this ephemeral task file so it can be deleted prior to the release commit).
3. **Manual Follow-up:** Open `docs/explanation/architecture/implementation-status.md` and update the `Package freeze status` table to mark these packages as `🧊 Frozen` with their new versions.
