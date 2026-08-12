---
apiVersion: squaring/v0
kind: Square
id: context-compiler
name: Context Pack Compiler
archetype: capability
partOf: squaring
purpose: >
  Compile a Square or Change into a Context Pack — the read-optimized brief
  an agent loads before touching code (SPEC §12): edges first, then
  commitments, contracts, decisions, unresolved questions, active Changes.
nonGoals:
  - Persisting packs (they are compiled on demand and disposable)
  - Summarizing or paraphrasing — packs quote the graph verbatim
owns:
  concepts:
    - id: pack-ordering
      name: Pack ordering
      statement: >
        The normative twelve-section order of SPEC §12, the uniform
        "(none declared)" placeholder that keeps section numbers from
        shifting, and the byte-identical determinism the order enables.
    - id: pack-content
      name: Pack content
      statement: >
        What each section carries verbatim from the graph: the concept map,
        the concept tags on claim lines, the injected policy commitments,
        and the Sources section (selectors with matched files, then anchor
        sites as path:line).
    - id: pack-scoping
      name: Pack scoping
      statement: >
        Which pack an argument compiles to: a full Square pack, a Change pack
        with an abbreviated pack per target, or a concept-scoped pack that
        keeps only the claims tagged with that concept.
contracts:
  provides:
    - id: packs
      statement: >
        compileContext(graph, idOrUri) returning the full pack for a Square,
        a Change, or one concept of a Square; abbreviated per-target packs
        embedded in Change packs.
      concepts: [pack-content, pack-scoping]
  consumes:
    - id: graph
      from: square://graph-loader
      statement: Packs are compiled from a freshly loaded graph, never from cached state.
commitments:
  - id: deterministic-output
    kind: invariant
    strength: must
    statement: >
      An identical graph, an identical scan universe with identical file
      contents, and identical arguments produce byte-identical output above
      the generation stamp — no randomness, no environment leakage.
    evidenceClass: test
    concepts: [pack-ordering]
  - id: edges-first
    kind: invariant
    strength: must
    statement: >
      Non-goals, boundaries, and policy commitments render before anything
      an LLM could plausibly regenerate on its own.
    evidenceClass: test
    concepts: [pack-ordering]
  - id: packs-not-truth
    kind: boundary
    strength: must-not
    statement: >
      A pack is never an input to validation or loading — packs are
      projections, and hand-edited packs have no effect on the graph.
    concepts: [pack-content]
relationships:
  - type: dependsOn
    target: square://graph-loader
    through: graph
authority:
  owns: [pack-ordering, pack-content]
  delegates: [markdown-styling]
sources:
  - glob: src/context.ts
    expect: annotated
---

Section order is normative — see `docs/SPEC.md` §12. Policy commitments from
[[agent-protocol]] (and any other policy Square) are injected into section 3
(Non-goals and boundaries) of every applicable pack.
