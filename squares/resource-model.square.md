---
apiVersion: squaring/v0
kind: Square
id: resource-model
name: Resource Model
archetype: domain
partOf: squaring
purpose: >
  Define what a Square and a Change are: the identity grammar (ids, square://
  and change:// URIs, claim URIs, [[wiki]] links) and the strict frontmatter
  schemas both file kinds must satisfy.
nonGoals:
  - Referential integrity across documents (graph-loader's job)
  - Rendering or compilation of any kind
owns:
  concepts:
    - id: uri-grammar
      name: URI grammar
      statement: >
        How anything in the graph is named: flat kebab ids, square:// and
        change:// URIs, claim URIs (square://<id>#<facet>/<claim>), concept
        URIs (square://<id>#concept/<concept>), and [[wiki]] body links.
      sources:
        - glob: src/ids.ts
          expect: annotated
    - id: frontmatter-shape
      name: Frontmatter shape
      statement: >
        The strict Zod shape a .square.md or .change.md frontmatter must
        satisfy — including owns.concepts, per-claim concept tags, and
        sources selectors — and the `extensions` escape hatch.
      sources:
        - glob: src/schema.ts
          expect: annotated
contracts:
  provides:
    - id: schemas
      statement: >
        Zod schemas (SquareSchema, ChangeSchema) and URI parse/build helpers
        that every other component uses to interpret documents.
      concepts: [uri-grammar, frontmatter-shape]
commitments:
  - id: strict-unknown-fields
    kind: invariant
    strength: must
    statement: >
      Unknown fields anywhere outside `extensions` are schema errors, and
      extension keys must be reverse-DNS namespaced.
    evidenceClass: test
    concepts: [frontmatter-shape]
  - id: flat-kebab-ids
    kind: invariant
    strength: must
    statement: >
      Ids are flat lowercase kebab ([a-z0-9][a-z0-9-]*); hierarchy is
      expressed only through partOf, never encoded into ids.
    evidenceClass: test
    concepts: [uri-grammar]
  - id: schema-not-semantics
    kind: boundary
    strength: must-not
    statement: >
      Schemas never enforce cross-document rules (target existence,
      semanticDiff emptiness per type) — those belong to validation.
    concepts: [frontmatter-shape]
decisions:
  - id: concepts-not-aspects
    date: 2026-08-12
    choice: >
      The topical grouping layer between a Square and its claims is
      owns.concepts promoted to addressable objects — no new "aspect" noun
      enters the model.
    rationale: >
      Squaring's power budget is its small vocabulary (Square, claim,
      Change). A separate aspect field would overlap owns.concepts almost
      entirely and spend that budget on a synonym.
    from: change://concepts-and-sources
    concepts: [uri-grammar, frontmatter-shape]
  - id: anchors-self-declare
    date: 2026-08-12
    choice: >
      In-code anchors are discovered by scanning and are never re-declared
      under sources; the sources list carries only globs.
    rationale: >
      Requiring declaration in both the file and the graph would create two
      copies of the mapping that drift apart — the disease the model exists
      to cure.
    from: change://concepts-and-sources
    concepts: [frontmatter-shape]
  - id: derived-locations-only
    date: 2026-08-12
    choice: >
      File paths and line numbers appear only in derived output (the index,
      Context Packs) and never in stored graph files.
    rationale: >
      A stored line number is owned by nobody and rots on every edit; an
      anchor is owned by the file it sits in and moves with the code.
    from: change://concepts-and-sources
    concepts: [frontmatter-shape]
relationships:
  - type: usesExternal
    target: external://zod
authority:
  owns: [frontmatter-shape, uri-grammar]
  delegates: [validation-messages]
---

Defined by `docs/SPEC.md` §5–§7 and §9.
