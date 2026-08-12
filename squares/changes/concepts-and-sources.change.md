---
apiVersion: squaring/v0
kind: Change
id: concepts-and-sources
name: Concepts and source anchors
type: evolution
intent: >
  Close the zoom gap between a Square and its claims with a topical grouping
  layer (Concepts, promoted from owns.concepts), and replace the bindings
  field with a source-mapping model — sources selectors in the graph plus
  self-declaring @sq anchors in the realization — so that the file paths
  realizing any Square, concept, or claim are computed deterministically at
  scan time and never stored.
targets:
  - square://squaring
  - square://resource-model
  - square://graph-loader
  - square://context-compiler
  - square://cli
  - square://mcp-server
base:
  codeRevision: git:5327c33
semanticDiff:
  - "owns.concepts entries are promoted from bare display strings to addressable objects {id, name?, statement, sources?}, each with a URI square://<square-id>#concept/<concept-id> (SPEC §5, §6, new §14)"
  - "Every claim (commitment, contract, decision, scenario, unresolved) gains an optional concepts list naming concept ids of its own Square; a claim may belong to several concepts; proposedDecisions on Changes may carry the same list, validated at promotion (SPEC §14)"
  - "The bindings field is removed and replaced by sources selector lists ({glob, expect?, note?}) at Square level and per concept; in-code anchors are self-declaring and are never re-declared under sources (SPEC §6, new §15)"
  - "An in-source anchor grammar — @sq <target> [-- <note>] — binds files to Squares, concepts, and claims; the scanner is line-based and comment-syntax-oblivious; the scan universe is defined and .squaring.json gains an optional scanIgnore key (SPEC §4, new §15)"
  - "Source resolution is a plain union — selector glob matches ∪ files anchored to the target ∪ the full resolution of everything the target contains (contained concepts contribute their selectors and anchors, contained claims their anchors); no scoped or filtered lookup forms exist (new §15)"
  - "A new squaring index command (one-shot, --watch, --file reverse lookup, --json) and MCP index tool expose the computed source map; the map is derived, disposable output in the same sense as a Context Pack (SPEC §13, new §15)"
  - "Context Packs gain a Concept map section, claim lines carry their concept tags, the Source bindings section becomes Sources (selectors plus anchor sites), squaring context additionally accepts a concept URI and compiles a concept-scoped pack, empty pack sections render one uniform placeholder (the Body section is instead omitted when empty), and pack determinism is restated over graph + scan-universe file set and contents + arguments (SPEC §12)"
  - "Validation gains errors for duplicate/undeclared concept ids, dangling anchors, ambiguous bare anchors, expect: annotated coverage failures, and the removed bindings field (migration message), plus a warning for inert concepts (SPEC §11)"
phase: active
status:
  done:
    - "Design agreed in the 2026-08-12 chat session: grouping layer = promoted concepts (no new noun); anchors self-declare; union resolution; expect: annotated is coverage enforcement, not an anchor filter; line numbers appear only in derived output."
    - docs/SPEC.md amended (§2, §4, §5, §6, §7, §11, §12, §13; new §14 Concepts and §15 Source anchors; former §14/§15 renumbered §16/§17).
    - "Adversarial audit, two rounds (2026-08-12): round 1 found 2 blockers, 8 significant, 7 minor — all 17 fixed; verification round confirmed every fix with 0 blocker / 0 significant / 3 minor findings, each explicitly judged insignificant by the auditor."
  next:
    - Implement the schema promotion and new validation rules (square://resource-model, square://graph-loader).
    - Implement the anchor scanner, resolution, and squaring index CLI/MCP surface (square://cli, square://mcp-server).
    - Extend the Context Pack compiler per amended §12 (square://context-compiler).
    - Migrate this repository's own Squares from bindings to sources, declare concepts, anchor src/, and add scanIgnore for docs/ (SPEC.md now contains literal @sq examples).
proposedDecisions:
  - id: concepts-not-aspects
    choice: >
      The topical grouping layer between a Square and its claims is
      owns.concepts promoted to addressable objects — no new "aspect" noun
      enters the model.
    rationale: >
      Squaring's power budget is its small vocabulary (Square, claim,
      Change). A separate aspect field would overlap owns.concepts almost
      entirely and spend that budget on a synonym.
  - id: anchors-self-declare
    choice: >
      In-code anchors are discovered by scanning and are never re-declared
      under sources; the sources list carries only globs.
    rationale: >
      Requiring declaration in both the file and the graph would create two
      copies of the mapping that drift apart — the disease the model exists
      to cure.
  - id: union-resolution-only
    choice: >
      Source resolution is a plain union of glob matches and anchor matches
      (direct or transitive through concept tags); no glob-scoped anchor
      filtering exists.
    rationale: >
      A filter variant complicates the resolution rule without a named
      failure it prevents; an exclude mechanism can be added later if a real
      need appears.
  - id: derived-locations-only
    choice: >
      File paths and line numbers appear only in derived output (the index,
      Context Packs) and never in stored graph files.
    rationale: >
      A stored line number is owned by nobody and rots on every edit; an
      anchor is owned by the file it sits in and moves with the code.
---

Approval record (rule A5): the non-empty semanticDiff above was approved by
the repository owner in the 2026-08-12 design chat ("yes lets proceed"),
after the full design discussion that fixed the grouping layer, the anchor
grammar, the selector shapes, and the union resolution rule. This Change
lands the specification first; the realization follows under this same
Change, phase by phase, per status.next.

The spec is realization here: square://squaring binds docs/SPEC.md, so
editing SPEC.md is a realization edit under A2/A5, authorized by this
Change.
