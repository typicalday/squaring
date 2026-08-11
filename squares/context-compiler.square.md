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
contracts:
  provides:
    - id: packs
      statement: >
        compileContext(graph, idOrUri) returning the full pack for a Square
        or Change; abbreviated per-target packs embedded in Change packs.
  consumes:
    - id: graph
      from: square://graph-loader
      statement: Packs are compiled from a freshly loaded graph, never from cached state.
commitments:
  - id: deterministic-output
    kind: invariant
    strength: must
    statement: >
      Identical graph and arguments produce byte-identical output — no
      timestamps, no randomness, no environment leakage.
    evidenceClass: test
  - id: edges-first
    kind: invariant
    strength: must
    statement: >
      Non-goals, boundaries, and policy commitments render before anything
      an LLM could plausibly regenerate on its own.
    evidenceClass: test
  - id: packs-not-truth
    kind: boundary
    strength: must-not
    statement: >
      A pack is never an input to validation or loading — packs are
      projections, and hand-edited packs have no effect on the graph.
relationships:
  - type: dependsOn
    target: square://graph-loader
    through: graph
authority:
  owns: [pack-ordering, pack-content]
  delegates: [markdown-styling]
bindings:
  - src/context.ts
---

Section order is normative — see `docs/SPEC.md` §12. Policy commitments from
[[agent-protocol]] (and any other policy Square) are injected into section 2
of every applicable pack.
