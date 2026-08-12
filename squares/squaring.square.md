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
owns:
  concepts:
    - id: product-scope
      name: Product scope
      statement: >
        What Squaring is and is not at this version: Squares, Changes,
        Context Packs, the source map, and the agent protocol — with
        SquareStatus and Evidence deferred to a later version.
    - id: graph-storage
      name: Graph storage
      statement: >
        The whole graph lives in plain Markdown/YAML files in the repository,
        authored with ordinary edits — no database, no daemon, no write API.
    - id: distribution
      name: Distribution
      statement: >
        How Squaring reaches a user: a public MIT-licensed GitHub repository,
        the unscoped `squaring` npm package, and a single `squaring` bin.
      sources:
        - glob: package.json
          note: the manifest carries name, version, bin, files and exports — JSON has no comment syntax, so it cannot carry an anchor
        - glob: src/version.ts
          expect: annotated
          note: the single place the published version is read, so both faces report the manifest's number
    - id: toolchain
      name: Toolchain
      statement: >
        The build and test shape: TypeScript ESM on Node >= 22 with native
        type stripping, node:test, and one core library behind two faces.
commitments:
  - id: normative-not-generated
    kind: invariant
    strength: must
    statement: >
      Squares state intent (normative truth). The tool never rewrites a
      Square from observed code without a human-approved adoption Change.
    concepts: [product-scope]
  - id: plain-files
    kind: invariant
    strength: must
    statement: >
      The entire graph lives in plain Markdown/YAML files inside the
      repository — no database, no daemon, no hidden state.
    concepts: [graph-storage]
decisions:
  - id: typescript-esm
    date: 2026-08-11
    choice: TypeScript ESM package on Node >= 22, native node:test, tsc build.
    rationale: Matches the owenloop toolchain; zero test-runner dependencies.
    from: change://core-v0-1
    concepts: [toolchain]
  - id: one-core-two-faces
    date: 2026-08-11
    choice: One core library exposed two ways — the `squaring` CLI and an MCP server (`squaring mcp`).
    rationale: Same behavior for humans in a shell and agents over MCP; no drift between faces.
    from: change://core-v0-1
    concepts: [toolchain]
  - id: plain-file-authoring
    date: 2026-08-11
    choice: >
      Agents author .square.md / .change.md files directly with ordinary
      edits; the tool only validates, compiles, and scaffolds.
    rationale: No write API to babysit; git remains the change log and review surface.
    from: change://core-v0-1
    concepts: [graph-storage]
  - id: v0-scope-cut
    date: 2026-08-11
    choice: >
      v0.1 ships Square + Change + Context Packs + protocol only.
      SquareStatus and Evidence are deferred to v0.2, keeping hooks
      (claim URIs, evidenceClass) so owenloop can attach proofs later.
    rationale: Verification without a proof engine would be theater; owenloop is the intended engine.
    from: change://core-v0-1
    concepts: [product-scope]
  - id: npm-public
    date: 2026-08-11
    choice: >
      Distribute publicly: the GitHub repository is public and the package
      ships to npm as @typicalday/squaring under the MIT license.
    rationale: Adopting Squaring in another repo should be a one-line install, not a git clone.
    from: change://publish-v0-1
    supersededBy: npm-unscoped
    concepts: [distribution]
  - id: squaring-only-bin
    date: 2026-08-11
    choice: Ship a single `squaring` bin; the `square` alias is dropped.
    rationale: The name `square` collides with Block's Square CLI; one unambiguous command.
    from: change://publish-v0-1
    concepts: [distribution]
  - id: first-target-dogfood
    date: 2026-08-11
    choice: The first squared repository is squaring itself.
    rationale: >
      The repository has carried its own Square Graph since v0.1;
      dogfooding calibrates the format before pointing at other codebases.
    from: change://publish-v0-1
    concepts: [product-scope]
  - id: npm-unscoped
    date: 2026-08-11
    choice: >
      The package ships to npm unscoped, as `squaring` 0.1.0 (MIT license,
      public GitHub repository).
    rationale: >
      The unscoped name was available and is what `npm install squaring`
      users will type; the @typicalday scope added nothing but friction.
    from: change://review-fixes
    concepts: [distribution]
authority:
  owns: [product-scope, distribution, toolchain]
  delegates: [implementation-details]
sources:
  - glob: src/index.ts
    expect: annotated
    note: the published library surface — every export the package promises
---

The root Square. The moving parts are [[resource-model]], [[graph-loader]],
[[context-compiler]], the [[cli]], and the [[mcp-server]]; the rules agents
must follow live in [[agent-protocol]]. The full specification is
`docs/SPEC.md`.

`docs/**` is listed under `scanIgnore` in `.squaring.json`, because
`docs/SPEC.md` quotes anchor syntax as prose (SPEC §15.2) and a
comment-syntax-oblivious scanner would read those quotations as real anchors.
The consequence is deliberate: the spec is outside the scan universe, so no
selector can map it and editing it is not a mapped realization edit. Rules A1
and A5 still govern it — the spec changes only through a Change whose
`semanticDiff` names the amendment.
