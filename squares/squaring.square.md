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
    from: change://core-v0-1
  - id: one-core-two-faces
    date: 2026-08-11
    choice: One core library exposed two ways — the `squaring` CLI and an MCP server (`squaring mcp`).
    rationale: Same behavior for humans in a shell and agents over MCP; no drift between faces.
    from: change://core-v0-1
  - id: plain-file-authoring
    date: 2026-08-11
    choice: >
      Agents author .square.md / .change.md files directly with ordinary
      edits; the tool only validates, compiles, and scaffolds.
    rationale: No write API to babysit; git remains the change log and review surface.
    from: change://core-v0-1
  - id: v0-scope-cut
    date: 2026-08-11
    choice: >
      v0.1 ships Square + Change + Context Packs + protocol only.
      SquareStatus and Evidence are deferred to v0.2, keeping hooks
      (claim URIs, evidenceClass) so owenloop can attach proofs later.
    rationale: Verification without a proof engine would be theater; owenloop is the intended engine.
    from: change://core-v0-1
  - id: npm-public
    date: 2026-08-11
    choice: >
      Distribute publicly: the GitHub repository is public and the package
      ships to npm as @typicalday/squaring under the MIT license.
    rationale: Adopting Squaring in another repo should be a one-line install, not a git clone.
    from: change://publish-v0-1
    supersededBy: npm-unscoped
  - id: squaring-only-bin
    date: 2026-08-11
    choice: Ship a single `squaring` bin; the `square` alias is dropped.
    rationale: The name `square` collides with Block's Square CLI; one unambiguous command.
    from: change://publish-v0-1
  - id: first-target-dogfood
    date: 2026-08-11
    choice: The first squared repository is squaring itself.
    rationale: >
      The repository has carried its own Square Graph since v0.1;
      dogfooding calibrates the format before pointing at other codebases.
    from: change://publish-v0-1
  - id: npm-unscoped
    date: 2026-08-11
    choice: >
      The package ships to npm unscoped, as `squaring` 0.1.0 (MIT license,
      public GitHub repository).
    rationale: >
      The unscoped name was available and is what `npm install squaring`
      users will type; the @typicalday scope added nothing but friction.
    from: change://review-fixes
authority:
  owns: [product-scope, distribution, toolchain]
  delegates: [implementation-details]
bindings:
  - package.json
  - src/index.ts
  - docs/SPEC.md
---

The root Square. The moving parts are [[resource-model]], [[graph-loader]],
[[context-compiler]], the [[cli]], and the [[mcp-server]]; the rules agents
must follow live in [[agent-protocol]]. The full specification is
`docs/SPEC.md`.
