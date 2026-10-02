---
description: "TODO: one line — what invariant(s) this repo depends on that aren't obvious from the code."
trigger: always_on
---

## Repo guardrails

<!--
  Seed file — replace this comment block and the example below, or delete the file if the repo has no
  standing invariant yet.

  This is for the kind of rule that's cheap to state and expensive to rediscover: something a contributor
  (human or agent) would only learn by breaking it. If it's here, it must be always-on — a guardrail that
  only loads on demand can arrive after the mistake already happened. If the guidance is really "how to do
  X" rather than "never do Z", it belongs in a skill instead (see `authoring-agents-md`'s skill-vs-rule
  distinction), not here.

  Example of the kind of thing that belongs here (delete before committing):

  - **Never move `internal-log` to `dependencies`.** It's an unpublished package inlined via `devDependency`
    + bundler; promoting it to a real dependency would leak a reference to a package that doesn't exist on
    the registry into every consumer's install. CI greps for this — see `.github/workflows/ci.yml`.
-->
