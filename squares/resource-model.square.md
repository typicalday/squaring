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
contracts:
  provides:
    - id: schemas
      statement: >
        Zod schemas (SquareSchema, ChangeSchema) and URI parse/build helpers
        that every other component uses to interpret documents.
commitments:
  - id: strict-unknown-fields
    kind: invariant
    strength: must
    statement: >
      Unknown fields anywhere outside `extensions` are schema errors, and
      extension keys must be reverse-DNS namespaced.
    evidenceClass: test
  - id: flat-kebab-ids
    kind: invariant
    strength: must
    statement: >
      Ids are flat lowercase kebab ([a-z0-9][a-z0-9-]*); hierarchy is
      expressed only through partOf, never encoded into ids.
    evidenceClass: test
  - id: schema-not-semantics
    kind: boundary
    strength: must-not
    statement: >
      Schemas never enforce cross-document rules (target existence,
      semanticDiff emptiness per type) — those belong to validation.
relationships:
  - type: usesExternal
    target: external://zod
authority:
  owns: [frontmatter-shape, uri-grammar]
  delegates: [validation-messages]
bindings:
  - src/schema.ts
  - src/ids.ts
---

Defined by `docs/SPEC.md` §5–§7 and §9.
