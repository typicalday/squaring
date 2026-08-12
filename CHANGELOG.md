# Changelog

All notable changes to `squaring` are recorded here. `apiVersion: squaring/v0`
is pre-1.0: breaking schema changes bump no apiVersion, so this file is the
record (SPEC §16).

## 0.4.0 — scan diagnostics

Implements `change://scan-diagnostics` — two additions to the SPEC §11 finding
list, closing the two silent-failure gaps the 0.3.0 realization audit recorded
under rule A7 but could not fix without amending the spec.

### Added

- **§11 warning 7 — the scan universe is empty.** `validate` now says so when
  §15.4 leaves no file for a selector to match or the scanner to read an anchor
  from. Previously this reported `OK` while the whole sources feature was off.
  The warning fires on the empty result, never on a named cause, so a `dir`
  covering the repository root, a `scanIgnore` that removes every file, and a
  repository with nothing staged in git all reach it alike. The message names
  the squares directory and the `scanIgnore` patterns in force, and is
  attributed to `.squaring.json` when the configuration could have caused it.

  A `scanIgnore` that empties the universe only *partly* is deliberately not
  this warning — that surfaces as the existing warning 3 on each selector left
  matching nothing.

- **§11 warning 8 — a scan-universe file could not be read.** A permission
  error, or a file removed between the universe computation and the read, means
  the file's anchors are unknown and therefore missing from the index and from
  Context Pack section 11. Reported once per file, and independently of error
  11: a file covered by an `expect: annotated` selector produces both, and the
  two say different things — the error says a coverage expectation is unmet,
  the warning says the bytes were never examined.

### Changed (specification wording, no behavior change)

- §15.4 step 4 now names **unreadable** as a third file class beside text and
  binary, with anchors *unknown* rather than *absent*. §15.3's `expect` row
  states outright that an unreadable file is not exempt — the binary exemption
  is not extended to it. Both sentences describe what 0.3.0 already did; they
  were missing from the spec, which is why warning 8 had no defined subject.

### Upgrading

No action required. Both additions are warnings: `validate` exit codes are
unchanged, and a repository that was clean on 0.3.0 stays clean on 0.4.0 unless
its scan universe is genuinely empty or a file genuinely cannot be read.

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
