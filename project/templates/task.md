<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

<!--
 TASK TEMPLATE — copy to tasks/<topic>.md and fill in.
 A task describes WHAT to build, for work already decided (see tasks/AGENTS.md).
 If the design is still open, write an RFC first. Tasks are removed/archived once done.
 Delete these comments before committing.
-->

# Task: Title

| Field | Value |
|---|---|
| Status | Planned |
| Created | YYYY-MM-DD |
| Author | Your Name |
| Sources | <!-- links to the RFC, ADR, or status doc that motivates this work --> |

<!-- Status lifecycle: Planned → In Progress → Done → (file removed or archived) -->

---

## Context

<!-- Why this work exists and how the items below were identified. Note which items cross
     a frozen package boundary (flag them, e.g. 🧊 needs unfreeze decision). -->

## Priority overview

<!-- One row per work item. Priority gates ordering; effort sets expectations (XS/S/M/L). -->

| # | Priority | Item | Package(s) | Effort |
|---|---|---|---|---|
| 1 | P0 | … | … | S |

---

## Work items

### 1. Item title — P0

**What:** <!-- the concrete change, verified against source -->

**Why:** <!-- the consequence of not doing it -->

**Change:** <!-- the specific edit / approach -->

<!-- Repeat per item. -->

---

## Implementation order

<!-- The sequence, noting what can be parallel, what must batch (e.g. share one unfreeze
     window), and what gates a release. -->

```
P0:  …
P1:  …
P2:  …
```
