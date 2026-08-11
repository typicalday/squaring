---
apiVersion: squaring/v0
kind: Square
id: graph-loader
name: Graph Loader & Validator
archetype: capability
partOf: squaring
purpose: >
  Read squares/*.square.md and squares/changes/*.change.md from a repository
  into an in-memory Square Graph, and check referential integrity across the
  whole graph (SPEC §11).
nonGoals:
  - Watching the filesystem or caching between calls — every load is fresh
  - Fixing or rewriting files
contracts:
  provides:
    - id: graph
      statement: >
        A loaded Square Graph (squares, changes, diagnostics) plus
        validateGraph() producing the full §11 error/warning list.
  consumes:
    - id: schemas
      from: square://resource-model
      statement: Frontmatter is interpreted exclusively through the resource-model schemas.
commitments:
  - id: load-never-writes
    kind: boundary
    strength: must-not
    statement: Loading and validating never write to the filesystem.
  - id: all-diagnostics
    kind: invariant
    strength: must
    statement: >
      Validation reports every diagnostic it can find in one pass — never
      just the first error — and errors sort before warnings.
    evidenceClass: test
relationships:
  - type: dependsOn
    target: square://resource-model
    through: schemas
  - type: usesExternal
    target: external://yaml
authority:
  owns: [integrity-rules]
  delegates: [traversal-order]
bindings:
  - src/load.ts
  - src/validate.ts
---

Errors block (`squaring validate` exits 1); warnings inform. The rules are
`docs/SPEC.md` §11.
