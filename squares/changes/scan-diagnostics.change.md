---
apiVersion: squaring/v0
kind: Change
id: scan-diagnostics
name: Scan diagnostics — empty universe and unreadable file
type: evolution
intent: >
  Close the two silent-failure gaps the concepts-and-sources realization audit
  recorded under rule A7 but could not fix, because both need a diagnostic that
  the closed §11 finding list does not contain: a scan universe that ends up
  empty (source mapping is off, yet validate reports success) and a
  scan-universe file whose bytes cannot be read (its anchors vanish from the
  index with nothing said). Adds §11 warnings 7 and 8, and the §15 text that
  gives each warning a defined subject.
targets:
  - square://graph-loader
  - square://squaring
base:
  codeRevision: git:05cd7e3
semanticDiff:
  - "SPEC §11 gains warning 7: the scan universe (§15.4) is empty — no file is visible to the anchor scanner or to any sources glob — reported once, naming the squares directory and the scanIgnore patterns in force"
  - "SPEC §11 gains warning 8: a scan-universe file whose bytes could not be read, reported once per file, independently of error 11 — the error says a coverage expectation is unmet, the warning says the bytes were never examined"
  - "SPEC §15.4 step 4 names `unreadable` as a third file class beside text and binary — anchors unknown rather than absent — and §15.3's `expect` row states that an unreadable file is never exempt (the binary exemption is not extended to it); §15.4 states that an empty universe is legal but raises warning 7"
phase: done
status:
  done:
    - "docs/SPEC.md amended: §11 warnings 7 and 8, the scan-pass note above the warning list, §15.3's `expect` row (unreadable is not exempt), and §15.4 step 4 (unreadable named as a third file class) plus the empty-universe paragraph."
    - "Implemented in src/sources.ts, in the same single pass over the scan universe that already produces §11 errors 8, 10, 11 and warning 3 — no second scan."
    - "Covered by four tests: warning 8 with no expecting selector (the gap itself), warning 8 alongside error 11 on the same file, warning 7 from both `dir: \".\"` and an all-removing `scanIgnore` plus a healthy-repo negative, and warning 7 end-to-end through validateGraph."
    - "One pre-existing test fixture (test/validate.test.ts, the inert-concept case) was a squares-only repository and so tripped warning 7 truthfully. It gained a realization file, matching its two sibling fixtures, rather than the warning being narrowed to accommodate it."
    - "Decision `empty-universe-warns` promoted onto square://graph-loader under concepts scan-universe and integrity-rules."
    - "Version 0.3.0 → 0.4.0 with a CHANGELOG entry; the A7 write-up on change://concepts-and-sources was annotated in place to record that its items 1 and 2 are closed and its item 3 is deferred by instruction."
  next:
    - "Publish 0.4.0 to npm — requires the owner's OTP, so the implementing agent stops at the merged commit. This supersedes the pending 0.3.0 publish."
proposedDecisions: []
---

Approval record (rule A5): the non-empty `semanticDiff` above was approved by
the repository owner in the 2026-08-12 review chat, on the shape the owner
specified rather than the one first proposed. Their words on the empty-universe
warning, which this Change follows exactly:

> The better shape is a warning on an empty scan universe rather than a
> special-case rejection of `dir: "."` — an empty-universe warning also catches
> an over-broad `scanIgnore`, which produces the identical silent failure.

Scope is fixed by the same message and is deliberately narrow: two warnings and
their implementation. The third gap recorded under rule A7 on
`change://concepts-and-sources` — that `expect: annotated` has no `partOf`-transitive
form and §15.3 has no repository-level "every file is claimed" check — is
**out of scope by instruction**, not by oversight. The owner's reason, recorded
here because A8 requires a human's stated reason to stay attributed to the
human: the per-file enumerations are the honest shape today, and adding a
transitive or repo-level coverage feature before a real need appears would
contradict the `union-resolution-only` decision already promoted onto
`square://graph-loader`.

## What each warning is, and what it is not

**Warning 7 fires on the symptom, not on a named cause.** The check is
`universe.length === 0` after all four steps of §15.4. It does not know or care
whether the cause was `dir`, `scanIgnore`, or an empty git index — it reports
the squares directory and the `scanIgnore` patterns in force so the reader can
see which one it was. That is the whole content of the `empty-universe-warns`
decision above.

**Warning 8 is not a softened error 11.** The two coexist on purpose. When an
`expect: annotated` selector covers an unreadable file, `validate` reports both:
error 11 says the declaring Square's coverage expectation is unmet, warning 8
says the file's bytes were never examined. Suppressing the warning when the
error fires would make the rule conditional on an unrelated declaration, and
would hide the read failure in exactly the repository that took coverage
seriously enough to declare `expect: annotated`.

An unreadable file stays **non-exempt** from `expect: annotated`. §15.3 exempts
binary files because a binary provably cannot carry an anchor; an unreadable
file's anchors are *unknown*, and treating unknown as satisfied would let a
`chmod 000` turn a coverage error into a pass. This Change states that
distinction in §15.3 and §15.4 rather than changing it — the realization
already behaves this way.

## Recorded under rule A7 — what warning 7 does not catch

Found while implementing, and worth stating rather than leaving for the next
audit to rediscover: warning 7 is literally "the universe is empty", so a
`scanIgnore` that removes *almost* everything does not reach it. Two facts
combine. A glob does not match a leading-dot name — `path.matchesGlob(
'.squaring.json', '**')` is false — so `.squaring.json` survives any
`scanIgnore` that does not name it outright, and a repository configured with
`scanIgnore: ["src/**"]` still has a one-file universe.

In that repository the existing §11 warning 3 does the work: every `sources`
glob now matches zero files and each one says so. The residual hole is a
repository that declares **no selectors at all** and relies purely on anchors —
no selector means no warning 3, a surviving `.squaring.json` means no warning 7,
and every anchor is invisible with nothing said.

That hole is the same shape as item 3 of the A7 record on
`change://concepts-and-sources`: it needs a repository-level coverage rule
("this many universe files, this many claimed"), which the owner ruled out of
scope for the same reason recorded there. It is not closed by this Change, and
this paragraph is the record that it was seen and left.
