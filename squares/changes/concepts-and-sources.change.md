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
phase: done
status:
  done:
    - "Design agreed in the 2026-08-12 chat session: grouping layer = promoted concepts (no new noun); anchors self-declare; union resolution; expect: annotated is coverage enforcement, not an anchor filter; line numbers appear only in derived output."
    - docs/SPEC.md amended (§2, §4, §5, §6, §7, §11, §12, §13; new §14 Concepts and §15 Source anchors; former §14/§15 renumbered §16/§17).
    - "Adversarial audit, two rounds (2026-08-12): round 1 found 2 blockers, 8 significant, 7 minor — all 17 fixed; verification round confirmed every fix with 0 blocker / 0 significant / 3 minor findings, each explicitly judged insignificant by the auditor."
    - "Phase 1 (square://resource-model, square://graph-loader): owns.concepts promoted to objects, concepts tag lists on every claim kind and on proposedDecisions, sources selectors at Square and concept level, bindings removed, concept URIs in src/ids.ts, §11 errors 3/8/9/10/11/12 and warnings 3/6 in src/validate.ts, scanIgnore in .squaring.json. Suspensions deliberately still accept claim URIs only — the regex was not widened."
    - "Phase 2 (square://graph-loader, square://cli, square://mcp-server): src/scan.ts implements the §15.2 anchor grammar and the §15.4 scan universe; src/sources.ts implements §15.5 union resolution and the expect: annotated coverage check; src/indexing.ts implements the §15.6 index; squaring index (with --file, --json, --watch) and the index MCP tool ship together."
    - "Phase 3 (square://context-compiler): amended §12 — twelve sections, concept map at 2, Sources at 11, claim tag suffixes in sections 3–9, the (none declared) empty-section rule, concept-scoped packs, determinism restated over graph + scan universe + contents + arguments."
    - "Phase 4 (square://squaring): this repository migrated itself — every Square declares concepts and sources selectors, src/ carries @sq anchors, .squaring.json ignores docs/**, test/**, README.md and CHANGELOG.md; README rewritten; CHANGELOG.md created; version 0.2.0 → 0.3.0."
    - "Scanner hazard found and fixed during phase 2: src/sources.ts built its dedup key with a literal NUL byte, which made §15.4 step 4 sniff the file binary — the module's own anchors were dropped and its own expect: annotated selector was silently satisfied. The key now uses the escape sequence, a regression test covers both sides of the 8192-byte sniff window, and every src/*.ts comment writes the token with a backtick immediately after it so no comment scans as an anchor."
    - "Realization audit, two rounds by one independent read-only auditor (2026-08-12). Round 1: 1 blocker, 3 significant, 6 minor. The blocker was resolveSquaresDir returning the raw .squaring.json string, so a non-canonical dir (./squares, squares/.) failed the §15.4 step 2 prefix test and let every .square.md back into the scan universe as its own realization. All 4 blocker/significant findings and 4 of 6 minors were fixed. Round 2 confirmed every fix empirically and returned 0 blocker, 0 significant, 5 minor — the audit exit condition."
    - "Under rule A7, two round-2 minors were recorded rather than implemented, because both would add a diagnostic to the closed finding list of §11 (see the notes below): an unreadable file losing its anchors silently when no expect: annotated selector covers it, and dir: \".\" emptying the scan universe without saying so."
  next:
    - "Publish 0.3.0 to npm — requires the owner's OTP, so the implementing agent stops at the tagged commit."
proposedDecisions: []
---

Approval record (rule A5): the non-empty semanticDiff above was approved by
the repository owner in the 2026-08-12 design chat ("yes lets proceed"),
after the full design discussion that fixed the grouping layer, the anchor
grammar, the selector shapes, and the union resolution rule. This Change
lands the specification first; the realization follows under this same
Change, phase by phase, per status.next.

The spec is realization here: editing docs/SPEC.md is a realization edit
under A2/A5, authorized by this Change.

One consequence of this Change is worth stating plainly, because it removes a
mapping that existed before it: `docs/**` now sits in `.squaring.json`
`scanIgnore`, because SPEC.md quotes literal anchor syntax as examples and an
unignored SPEC.md would inject dozens of fictional anchors into the real scan.
The cost is that docs/SPEC.md is no longer in the scan universe, so no
selector can match it and no Square maps it — the normative document is
outside the map it defines. The alternative (scanning SPEC.md and finding its
examples) is worse; a future `@sq`-in-fenced-code exemption would let the
ignore be dropped.

## Recorded under rule A7 — three gaps in the amended spec, implemented as written

Rule A7 forbids silently implementing something other than what the spec says.
The three items below are places where the realization audit found behavior
that a reader would plausibly want changed, and where changing it would mean
adding to the spec rather than transcribing it. Each is implemented as §11 and
§15 are written; each is a candidate for a later Change carrying the matching
`semanticDiff`.

**1. §11's finding list has no diagnostic for a file whose bytes cannot be
read.** §15.4 step 4 sniffs each universe file and §15.3 exempts only *binary*
files from `expect: annotated`. The implementation therefore classifies an
unreadable file (a permission error, a file deleted between the scan universe
and the read) apart from a binary one and fails its coverage check — that part
is required, because treating "anchors unknown" as "anchors satisfied" would
let a chmod turn a coverage error into a pass. But when *no* `expect: annotated`
selector covers an unreadable file, that file's anchors silently vanish from
the index with no finding at all, because §11 enumerates twelve errors and six
warnings and none of them fits. Reporting it needs a new §11 warning, which is
a spec amendment.

> **Closed by `change://scan-diagnostics`** (2026-08-12): §11 warning 8 now
> reports every unreadable scan-universe file, independently of error 11.

**2. `dir: "."` empties the scan universe with no diagnostic.** §4 permits
`.squaring.json` to move the squares directory and shows it as a subdirectory
of the repository root; it does not say whether the root itself is a legal
value. §15.4 step 2 removes the squares directory from the universe by path
prefix, so `dir: "."` mechanically removes every file: no selector matches, no
anchor is visible, and `validate` reports nothing because there is nothing left
to find. This is the literal reading of §15.4 step 2 and is what the
implementation does. Rejecting `dir: "."` as a configuration error, or warning
when the universe is empty, would add a rule §4 and §11 do not contain.

> **Closed by `change://scan-diagnostics`** (2026-08-12): §11 warning 7 now
> reports an empty scan universe. The repository owner chose the second of the
> two options named above — warn on the empty result, do not special-case
> `dir: "."` — because the warning then also catches a `scanIgnore` that
> removes every file. `dir: "."` remains a legal configuration.

**3. §15.3 has no repository-level "every file is claimed" check, and
`expect: annotated` cannot express one for a parent Square.** §15.3 requires an
anchor resolving into the *declaring* Square — the Square itself, one of its
concepts, or one of its claims. There is no `partOf`-transitive clause, so an
anchor into a child Square does not satisfy a parent's expectation. In this
repository every file under `src/` anchors into a sub-Square (`graph-loader`,
`cli`, `mcp-server`, `context-compiler`, `resource-model`), which makes a broad
`src/**` with `expect: annotated` on `square://squaring` fail on essentially
every file. The honest shape is therefore the per-file enumerations this
repository declares. The residual gap is real: a newly added `src/foo.ts` that
no selector matches produces no finding. Closing it needs either a per-Square
directory layout or a new repo-level coverage feature in §15.

> **Left open deliberately** (2026-08-12): when items 1 and 2 were closed by
> `change://scan-diagnostics`, the repository owner ruled this one out of
> scope — the per-file enumerations are the honest shape today, and adding a
> transitive or repo-level coverage feature before a real need appears would
> contradict the `union-resolution-only` decision on `square://graph-loader`.
