---
apiVersion: squaring/v0
kind: Square
id: graph-loader
name: Graph Loader & Validator
archetype: capability
partOf: squaring
purpose: >
  Read squares/*.square.md and squares/changes/*.change.md from a repository
  into an in-memory Square Graph, resolve that graph against the realization
  by scanning for `@sq` anchors and matching `sources` selectors, and check
  referential integrity across the whole result (SPEC §11, §15).
nonGoals:
  - Watching the filesystem or caching between calls — every load is fresh
  - Fixing or rewriting files
owns:
  concepts:
    - id: integrity-rules
      name: Integrity rules
      statement: >
        The SPEC §11 error and warning set: what makes a graph internally
        consistent, reported in one pass with errors before warnings.
      sources:
        - glob: src/validate.ts
          expect: annotated
    - id: scan-universe
      name: Scan universe
      statement: >
        The realization file set Squaring considers (SPEC §15.4): git-index
        semantics or a plain walk, minus symlinks, the squares directory and
        `scanIgnore`, with binaries selectable but never anchor-read.
      sources:
        - glob: src/scan.ts
          expect: annotated
    - id: anchor
      name: Anchor
      statement: >
        The `@sq <target> [-- <note>]` marker a realization file carries to
        declare which Square, concept or claim it realizes — read by a
        line-based, host-language-oblivious scanner (SPEC §15.2).
    - id: source-resolution
      name: Source resolution
      statement: >
        The plain union of SPEC §15.5 that turns selectors and anchors into
        files(square) ⊇ files(concept) ⊇ files(claim), and its transpose,
        the reverse map from one file to everything claiming it.
      sources:
        - glob: src/sources.ts
          expect: annotated
        - glob: src/indexing.ts
          expect: annotated
contracts:
  provides:
    - id: graph
      statement: >
        A loaded Square Graph (squares, changes, diagnostics) plus
        validateGraph() producing the full §11 error/warning list.
      concepts: [integrity-rules]
  consumes:
    - id: schemas
      from: square://resource-model
      statement: Frontmatter is interpreted exclusively through the resource-model schemas.
      concepts: [integrity-rules]
commitments:
  - id: load-never-writes
    kind: boundary
    strength: must-not
    statement: Loading, scanning and validating never write to the filesystem.
  - id: all-diagnostics
    kind: invariant
    strength: must
    statement: >
      Validation reports every diagnostic it can find in one pass — never
      just the first error — and errors sort before warnings.
    evidenceClass: test
    concepts: [integrity-rules]
decisions:
  - id: union-resolution-only
    date: 2026-08-12
    choice: >
      Source resolution is a plain union of glob matches and anchor matches
      (direct or transitive through concept tags); no glob-scoped anchor
      filtering exists.
    rationale: >
      A filter variant complicates the resolution rule without a named
      failure it prevents; an exclude mechanism can be added later if a real
      need appears.
    from: change://concepts-and-sources
    concepts: [source-resolution]
  - id: empty-universe-warns
    date: 2026-08-12
    choice: >
      An empty scan universe is SPEC §11 warning 7, not a configuration error,
      and `dir: "."` is not rejected as a special case.
    rationale: >
      The observable failure is "source mapping is silently off", and several
      distinct configurations produce it — a `dir` covering the repository
      root, a `scanIgnore` broad enough to remove everything, an unstaged
      repository. Rejecting one named cause leaves the others silent; warning
      on the shared symptom catches all of them with one rule.
    from: change://scan-diagnostics
    concepts: [scan-universe, integrity-rules]
relationships:
  - type: dependsOn
    target: square://resource-model
    through: schemas
  - type: usesExternal
    target: external://yaml
authority:
  owns: [integrity-rules, scan-universe, source-resolution]
  delegates: [traversal-order]
sources:
  - glob: src/load.ts
    expect: annotated
---

Errors block (`squaring validate` exits 1); warnings inform. The rules are
`docs/SPEC.md` §11; the scan universe, the anchor grammar and the resolution
union are `docs/SPEC.md` §15.
