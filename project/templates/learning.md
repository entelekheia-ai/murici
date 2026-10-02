---
vibe-ops-template: learning@1
name: <slug — identical to the filename, without .md>
description: <one line, standing alone: the fact, stated so it is useful without the body below>
scope: <what this fact is true OF — a language, a tool, a library, or "how the maintainer prefers to
        work". Never a path inside one repository; that admission belongs to project/log/ instead>
attempted: YYYY-MM-DD
source: <the commit, task or plan this came from>
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

<!--
 LEARNING TEMPLATE — copy to project/learnings/<slug>.md.

 A learning is a fact true in ANY repository — about a language, a tool, or how the maintainer prefers
 to work — never a trap addressed by a path inside this one. That is the whole test the promotion policy
 applies (`vibe-ops records norm --type log --facet policy --name lifecycle --print`, question 4's last
 branch): if the fact is scoped to a path in THIS repository, it is a log entry
 (project/log/<slug>.md), not this.

 THE FRONTMATTER IS FIRST, which is why the licence and these instructions sit below it.

 NOT NUMBERED, for the same reason `log` is not: a fact is addressed by what it is about, never by a
 position in a sequence.

 `scope:` IS THE ADMISSION TEST. If what you are about to write only recurs at a path inside this
 repository, it belongs in project/log/ instead — filing it here does not make it travel further, it
 only moves it out of the place someone would actually meet it again.

 THIS TYPE IS OPT-IN AND NOT ACTIVATED BY DEFAULT. A repository binds `types.learning` only once it
 has learnings of its own to keep; most repositories, this one included, have none.

 Delete these comments before committing. The `vibe-ops-template` key in the frontmatter at the top of
 this file STAYS: /vibe-ops:migrate reads it to find artifacts written against an older template.
-->

# <the fact, as one sentence someone would recognise before needing it>

> **Not current truth.** This records what was learned on <date>. Check it against the present state
> before acting on it.

## The fact

<!-- Stated once, plainly — what is true, not the story of finding out. -->

## The evidence

<!-- What proves it: the measurement, the failing command, the source read. A fact with no evidence is
     an opinion, and the next reader cannot tell the difference without this section. -->

## Where it applies

<!-- Every place this fact changes what someone does — a tool, a library version, a class of task.
     Broader than `scope:`'s one line when the frontmatter alone would undersell it. -->
