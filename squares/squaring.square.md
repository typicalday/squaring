---
apiVersion: squaring/v0
kind: Square
id: squaring
name: Squaring
archetype: capability
purpose: >
  A semantic control plane for software: represent what a codebase is
  supposed to mean as a versioned graph of bounded commitments (Squares),
  route all meaning changes through explicit Changes, and compile
  deterministic Context Packs so agents read intent before code.
nonGoals:
  - Being a runtime, framework, or code generator — Squaring never executes the software it describes
  - Observed truth (SquareStatus/Evidence) in v0.1 — deferred to v0.2, where owenloop supplies proofs
  - Replacing code review, tests, or CI
commitments:
  - id: normative-not-generated
    kind: invariant
    strength: must
    statement: >
      Squares state intent (normative truth). The tool never rewrites a
      Square from observed code without a human-approved adoption Change.
  - id: plain-files
    kind: invariant
    strength: must
    statement: >
      The entire graph lives in plain Markdown/YAML files inside the
      repository — no database, no daemon, no hidden state.
decisions:
  - id: typescript-esm
    date: 2026-08-11
    choice: TypeScript ESM package on Node >= 22, native node:test, tsc build.
    rationale: Matches the owenloop toolchain; zero test-runner dependencies.
  - id: one-core-two-faces
    date: 2026-08-11
    choice: One core library exposed two ways — the `squaring` CLI and an MCP server (`squaring mcp`).
    rationale: Same behavior for humans in a shell and agents over MCP; no drift between faces.
  - id: plain-file-authoring
    date: 2026-08-11
    choice: >
      Agents author .square.md / .change.md files directly with ordinary
      edits; the tool only validates, compiles, and scaffolds.
    rationale: No write API to babysit; git remains the change log and review surface.
  - id: v0-scope-cut
    date: 2026-08-11
    choice: >
      v0.1 ships Square + Change + Context Packs + protocol only.
      SquareStatus and Evidence are deferred to v0.2, keeping hooks
      (claim URIs, evidenceClass) so owenloop can attach proofs later.
    rationale: Verification without a proof engine would be theater; owenloop is the intended engine.
unresolved:
  - id: first-target-repo
    question: Which existing repo gets squared first as the calibration case?
  - id: npm-publish
    question: Publish @typicalday/squaring to npm, or run it via npx from the git repo?
  - id: square-bin-collision
    question: >
      The `square` bin alias collides with Block's Square CLI — keep the
      alias or drop it and stay `squaring`-only?
authority:
  owns: [resource-model, agent-protocol, pack-format]
  delegates: [implementation-details]
bindings:
  - package.json
  - src/index.ts
---

The root Square. The moving parts are [[resource-model]], [[graph-loader]],
[[context-compiler]], the [[cli]], and the [[mcp-server]]; the rules agents
must follow live in [[agent-protocol]]. The full specification is
`docs/SPEC.md`.
