// SPDX-License-Identifier: Apache-2.0
// vibeops.config.mjs — what is true of THIS repository, for every caller of the gate.

export default {
  settings: {
    // Empty on purpose: it re-arms `file-path`, which the workspace root disables for itself ("this
    // repository IS the private layer") and this repository would otherwise inherit. Murici has a
    // GitHub remote, so machine paths in its tracked files are an exposure here.
    exposure: { disabled: {} },
    governance: {
      ignore: {
        // `project/adr/AGENTS.md` and its `CLAUDE.md` import are the folder's instructions for agents,
        // not decision records: they carry no Status/Date/Deciders and declare no template version.
        "record-header-adr": ["project/adr/AGENTS.md", "project/adr/CLAUDE.md"],
        "template-version-undeclared": ["project/adr/AGENTS.md", "project/adr/CLAUDE.md"],
        "template-version-adr": ["project/adr/AGENTS.md", "project/adr/CLAUDE.md"],
      },
    },
  },
}
