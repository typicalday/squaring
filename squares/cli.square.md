---
apiVersion: squaring/v0
kind: Square
id: cli
name: CLI
archetype: boundary
partOf: squaring
purpose: >
  The human face of Squaring: the `squaring` command (init, validate, list,
  show, graph, context, protocol, new, mcp) run from anywhere inside a
  squared repository — read commands discover the repository root.
nonGoals:
  - Business logic — every command is a thin wrapper over the library
  - Interactive prompts or TUI
contracts:
  consumes:
    - id: graph
      from: square://graph-loader
      statement: >
        Read commands load the graph fresh from the discovered repository
        root (walking up from the current working directory); init and new
        act on the current working directory exactly.
    - id: packs
      from: square://context-compiler
      statement: "`squaring context <id>` prints the compiled pack verbatim."
commitments:
  - id: exit-code-contract
    kind: invariant
    strength: must
    statement: >
      `squaring validate` exits 1 when the graph has errors and 0 otherwise;
      warnings never change the exit code.
  - id: no-hidden-writes
    kind: boundary
    strength: must-not
    statement: >
      Only `init` and `new` write files, and both refuse to overwrite
      existing content (except the tool-owned PROTOCOL.md).
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
bindings:
  - src/cli.ts
  - src/init.ts
  - src/scaffold.ts
  - bin/squaring.mjs
---

Command table: `docs/SPEC.md` §13.
