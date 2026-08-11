---
apiVersion: squaring/v0
kind: Square
id: agent-protocol
name: Agent Protocol
archetype: policy
partOf: squaring
purpose: >
  The conformance rules (A1–A9) any agent must follow when working in a
  squared repository, published as squares/PROTOCOL.md and served by the
  get_protocol MCP tool.
nonGoals:
  - Enforcement by machinery — v0.1 relies on the agent following the rules;
    v0.2 pairs commitments with owenloop proofs
commitments:
  - id: work-through-changes
    kind: constraint
    strength: must
    statement: >
      Agents route every edit that touches a Square's owned aspects through
      a Change (rule A2), and never silently rewrite an accepted Square
      (rule A1).
    appliesTo: "*"
  - id: no-silent-answers
    kind: constraint
    strength: must
    statement: >
      Agents never silently answer an unresolved question (rule A3) — ask
      the human, or record a proposedDecision on the Change and surface it.
    appliesTo: "*"
  - id: validate-after-edit
    kind: constraint
    strength: must
    statement: >
      After any edit to a .square.md or .change.md file, agents run validate
      before moving on.
    appliesTo: "*"
authority:
  owns: [conformance-rules]
bindings:
  - src/protocol.ts
---

The full rule text lives in `src/protocol.ts` (PROTOCOL_MD) and is installed
into repositories by `squaring init`. These policy commitments are injected
into section 2 of every Square's Context Pack, so every agent sees them
regardless of which Square it is working on. Defined by `docs/SPEC.md` §10.
