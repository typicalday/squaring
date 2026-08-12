# Changelog

All notable changes to `squaring` are recorded here. `apiVersion: squaring/v0`
is pre-1.0: breaking schema changes bump no apiVersion, so this file is the
record (SPEC §16).

## 0.3.0 — concepts and source anchors

Implements `change://concepts-and-sources` — SPEC §14 (Concepts) and §15
(Sources), with the matching amendments to §6, §11, §12 and §13.

### Breaking

- **`bindings` is removed, replaced by `sources`.** A Square's `bindings:
  [<glob>, …]` becomes `sources: [{glob: <glob>}, …]` — the same globs under
  the same confinement rule, now with an optional `expect` and `note`, and now
  declarable per concept as well as per Square. `validate` reports a leftover
  `bindings` key with the exact rewrite (§11 error 12) rather than a generic
  unknown-field error, and the loader still parses the rest of the document so
  the migration message is the only finding you see.

  ```yaml
  # before
  bindings:
    - src/orders/**

  # after
  sources:
    - glob: src/orders/**
  ```

- **`owns.concepts` changes from a list of strings to a list of objects.** Each
  entry is `{id, name?, statement, sources?}`. A bare string is now a schema
  error.

- **Context Pack section numbers shifted.** The pack has twelve sections; the
  new section 2 is the concept map and the old "Source bindings" section is now
  section 11, "Sources". Anything parsing pack headings by number must be
  updated.

### Added

- **Concepts** (§14). A concept is one topic inside a Square, addressed as
  `square://<id>#concept/<concept-id>`. Every claim kind — commitments,
  contracts (provides and consumes), decisions, scenarios, unresolved
  questions — and every `proposedDecision` on a Change accepts a `concepts:
  [<id>, …]` tag list. Tags resolve only inside the declaring Square. A concept
  is not a claim: it has no strength, no `evidenceClass`, and cannot be
  suspended (`suspensions[].claim` still accepts claim URIs only).

- **Source anchors** (§15.2). A one-line `@sq <target> [ -- <note> ]` comment
  binds its **file** — not its line — to exactly one Square, concept, or claim.
  The target is a full URI, a `<square-id>#<facet>/<claim-id>` short URI, or a
  bare id resolving against Squares and concepts. The scanner reads bytes, not
  syntax, so any comment style in any language works.

- **Selectors with expectations** (§15.3). `sources` entries take an optional
  `expect: annotated`, which requires every scan-universe file the glob matches
  to carry an anchor resolving into the declaring Square — the Square itself,
  one of its concepts, or one of its claims. Binary files are exempt from the
  check and still match globs. Several Squares may expect the same file; each
  is satisfied independently.

- **`squaring index [<target>] [--file <path>] [--json] [--watch]`** and the
  matching `index` MCP tool (§15.6). Forward: Square → concept → claim → files.
  Reverse (`--file`): every Square, concept, and claim that governs one path,
  each pairing labeled with the selector or anchor that produced it. Entry
  order is defined, so `--json` is byte-stable for a given tree. Passing both
  `<target>` and `--file` is an error — they select opposite directions.

- **Concept-scoped Context Packs.** `squaring context <square>#concept/<id>`
  (short or full URI form) compiles a pack scoped to one topic: sections 2 and
  12 are omitted, the remaining numbers stay put, sections 3–9 keep only claims
  tagged with the concept, and section 11 lists only that concept's selectors
  and anchors. `nonGoals`, policy injections and all of section 7 stay
  unfiltered.

- **`.squaring.json` gains `scanIgnore`** — glob patterns removed from the scan
  universe. Use it for documentation that quotes anchor syntax as an example.

- **New validation findings** (§11): errors 9 (duplicate concept id, or a claim
  tag naming an undeclared concept), 10 (malformed, dangling or ambiguous
  anchor), 11 (`expect: annotated` coverage failure), 12 (leftover `bindings`);
  warning 6 (an inert concept — nothing tags it, scopes to it, or anchors to
  it). Error 8 and warning 3 now target `sources` globs. `validate` runs the
  anchor scan on every invocation.

### Changed

- Context Packs are deterministic over the graph **plus** the scan universe's
  file set and contents, plus the arguments — an anchor's line number lives in
  file contents, and section 11 prints it.
- A pack section with no content renders its heading and the single line
  `(none declared)`; section numbers never shift. Section 12 (Body) remains the
  one section omitted outright when empty.
- `squaring new square` scaffolds `sources` and `owns.concepts` in their new
  shapes.
- This repository migrated itself: every Square declares concepts and `sources`
  selectors, `src/` carries `@sq` anchors, and `.squaring.json` lists
  `scanIgnore` entries for the files that quote anchor syntax.

## 0.2.0

Full-repo review fixes: provenance, discovery, path confinement, and Context
Pack fidelity.

## 0.1.0

First release: the SPEC, the schema, the CLI, and the MCP server.
