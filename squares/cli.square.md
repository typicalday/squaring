---
apiVersion: squaring/v0
kind: Square
id: cli
name: CLI
archetype: boundary
partOf: squaring
purpose: >
  The human face of Squaring: the `squaring` command (init, validate, list,
  show, graph, context, index, protocol, new, mcp) run from anywhere inside a
  squared repository — read commands discover the repository root.
nonGoals:
  - Business logic — every command is a thin wrapper over the library
  - Interactive prompts or TUI
owns:
  concepts:
    - id: command-surface
      name: Command surface
      statement: >
        The command table of SPEC §13: which commands exist, what arguments
        and options each takes, and which of them discover the repository
        root instead of acting on the current working directory.
    - id: exit-codes
      name: Exit codes
      statement: >
        What the process exit status means, and which diagnostics change it.
contracts:
  consumes:
    - id: graph
      from: square://graph-loader
      statement: >
        Read commands load the graph fresh from the discovered repository
        root (walking up from the current working directory); init and new
        act on the current working directory exactly.
      concepts: [command-surface]
    - id: packs
      from: square://context-compiler
      statement: "`squaring context <id>` prints the compiled pack verbatim."
      concepts: [command-surface]
commitments:
  - id: exit-code-contract
    kind: invariant
    strength: must
    statement: >
      `squaring validate` exits 1 when the graph has errors and 0 otherwise;
      warnings never change the exit code.
    concepts: [exit-codes]
  - id: no-hidden-writes
    kind: boundary
    strength: must-not
    statement: >
      Only `init` and `new` write files, and both refuse to overwrite
      existing content (except the tool-owned PROTOCOL.md).
    concepts: [command-surface]
relationships:
  - type: dependsOn
    target: square://graph-loader
    through: graph
  - type: dependsOn
    target: square://context-compiler
    through: packs
  - type: usesExternal
    target: external://commander
authority:
  owns: [command-surface, exit-codes]
  delegates: [help-text-wording]
sources:
  - glob: src/cli.ts
    expect: annotated
  - glob: src/init.ts
    expect: annotated
  - glob: src/scaffold.ts
    expect: annotated
  - glob: bin/squaring.mjs
    note: the published bin — a shebang and one import of dist/cli.js, deliberately too thin to annotate
---

Command table: `docs/SPEC.md` §13.
