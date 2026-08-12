# Squaring Core v0.1 — Specification

Status: draft for implementation
apiVersion: `squaring/v0`

This document is normative. The implementation is a transcription of this document; where the implementation and this document disagree, this document wins and the implementation has a bug.

---

## 1. Purpose and scope

Squaring represents a program as a versioned graph of bounded semantic commitments — its concepts, boundaries, contracts, invariants, decisions, and unresolved questions — stored as reviewable files in the repository. Agents plan work against that graph instead of re-deriving (and eroding) the program's meaning from source code on every task.

**v0.1 ships two adoption levels:**

- **S0 — Mapped.** Squares describe concepts and map them to source paths. Code remains authoritative. Value: navigation and compiled context.
- **S1 — Normative.** Accepted boundaries, contracts, decisions, and invariants are authoritative for the aspects each Square explicitly `owns`. A conforming agent may not silently contradict them.

**v0.1 explicitly defers (to v0.2):**

- **SquareStatus** (machine-maintained observation of the realization) and **Evidence** (immutable records backing observations). The schema hooks that v0.2 needs — stable claim URIs, per-claim `evidenceClass`, revision pinning on Changes — are defined in v0.1 so that adding verification later is additive, not a breaking change.
- Projection protocols. v0.1 agents realize intent with ordinary code edits under the conformance rules in §10.

**Non-goals of the format** (these hold at every version): Squaring is not a task tracker, not an agent transcript, not generated API documentation, not a universal YAML programming language, and a Square generated from code never becomes authoritative without explicit human acceptance (§10, rule A4).

---

## 2. Definitions

- **Square** — a versioned, addressable unit of accepted semantic intent: one bounded concept of the program, its edges, and what must remain true for it to remain itself.
- **Square Graph** — all Squares in a repository plus their typed relationships.
- **Claim** — any individually addressable statement inside a Square: a commitment, a contract, a decision, a scenario, or an unresolved question. Every claim has a stable ID.
- **Concept** — an addressable topic a Square declares under `owns.concepts`: a named grain of meaning that groups claims and anchors source (§14). A concept is not a claim — it asserts nothing and carries no strength; it is a place where claims and code attach.
- **Commitment** — a claim about what must / must not / should be true of the realization.
- **Change** — a versioned unit of proposed evolution: what is being changed, why, against which Squares, and its current working state.
- **Context Pack** — a deterministic, disposable read model compiled from the graph for one agent operation. Context Packs are never a source of truth.
- **Realization** — the code, tests, schemas, and configuration that implement the graph.
- **Anchor** — an in-source marker (`@sq …`, §15) that binds the file containing it to exactly one Square, concept, or claim.
- **Selector** — one entry in a `sources` list (§15): a repo-relative glob, optionally carrying the `expect: annotated` coverage requirement.
- **Scan universe** — the exact file set the anchor scanner reads and selector globs match against (§15).
- **Adoption** — the deliberate act of accepting a proposed Square (often inferred from existing code) into the graph.
- **Conforming agent** — any agent (human-driven or autonomous) that follows the rules in §10 when working in a repository that contains a Square Graph.

---

## 3. The kinds of truth

| Layer | Question | v0.1 resource |
| --- | --- | --- |
| Normative | What should this program mean and preserve? | Square Graph |
| Transitional | What are we currently trying to change? | Change |
| Operational | What is actually implemented right now? | The repository itself |
| Observed | What do we have evidence is true of the realization? | *deferred to v0.2* |

Consequences:

1. A Square is not edited because work started, a blocker appeared, or a test failed. Those events belong to a Change (work state) or, in v0.2, to Status (observation).
2. The repository remains authoritative for every aspect the graph does not explicitly own (§8).

---

## 4. Files and layout

```
<repo>/
  squares/
    <id>.square.md          one file per Square
    changes/
      <id>.change.md        one file per Change
    PROTOCOL.md             agent conformance rules (installed by `squaring init`)
```

- The directory defaults to `squares/` at the repository root. A repository may override configuration with `.squaring.json` at the root: `{ "dir": "docs/squares", "scanIgnore": ["docs/**"] }`. `dir` moves the squares directory; `scanIgnore` (optional, repo-relative globs) removes files from the scan universe (§15) — for example files that must discuss anchor syntax without declaring anchors. No other configuration exists.
- A Square file is Markdown with a YAML frontmatter block. The frontmatter carries the machine-readable model defined in §6–§7. The Markdown body is free-form human prose (rationale, diagrams, examples) and is carried into Context Packs verbatim but is never parsed for meaning.
- Filename and `id` must match: `payments.square.md` must declare `id: payments`. This is a validation error otherwise (§11). Identity lives in the `id`, not the path; the filename rule exists only so humans can find files.
- Squares and Changes are committed to git and human-reviewed. Their history is their version history; v0.1 defines no separate generation counter.

---

## 5. Identity and links

- **ID grammar:** `[a-z0-9][a-z0-9-]*`, unique per resource kind within the repository. IDs are flat — hierarchy is expressed by the `partOf` field, never by the ID, so moving a Square in the hierarchy never breaks a link.
- **Square URI:** `square://<id>` (example: `square://payments`).
- **Claim URI:** `square://<id>#<facet>/<claim-id>` where `<facet>` is one of `commitment`, `contract`, `decision`, `scenario`, `unresolved` (example: `square://payments#commitment/event-idempotency`).
- **Concept URI:** `square://<id>#concept/<concept-id>` (example: `square://payments#concept/refund`). A concept URI is addressable wherever prose links and anchors (§15) accept a target, but it is not a claim URI: a suspension may not name it, and no `evidenceClass` attaches to it.
- **Change URI:** `change://<id>`.
- **External URI:** `external://<name>` names a system outside the repository (example: `external://stripe`). External names are declared implicitly by use; they are not resources.
- In Markdown bodies, `[[payments]]` is authoring sugar for `square://payments`. Tools must resolve it; the canonical form is the URI.

---

## 6. The Square resource

Frontmatter of `<id>.square.md`:

```yaml
apiVersion: squaring/v0
kind: Square
id: payments                  # required, matches filename
name: Payments                # required, human display name
archetype: capability         # optional: capability | domain | platform | boundary | policy
partOf: commerce              # optional: parent Square id; absence = root
purpose: >                    # required, 1–3 sentences
  Accept and account for customer payments.
nonGoals:                     # optional but strongly encouraged (§7 note)
  - customer identity
  - order fulfillment
owns:                         # optional
  concepts:                    # addressable topics (§14); ids unique within this Square
    - id: payment
      name: Payment            # optional display name; default derived from id (§14.2)
      statement: >             # required, one sentence
        One customer's attempt to pay for one order, from authorization
        through settlement.
    - id: refund
      name: Refund
      statement: Money returned against a settled payment, always as a compensating transaction.
      sources:                 # optional: selectors scoped to this concept (§15)
        - glob: src/payments/refunds/**
          expect: annotated    # every matched file must carry an anchor into this Square
        - glob: config/refund-rules.json
          note: PSP rule table — JSON cannot carry an anchor.
  state:
    - processed provider-event identifiers
contracts:                    # optional
  provides:
    - id: create-checkout
      statement: Create a checkout session for a payable order.
      schemaRef: ./contracts/payments.openapi.yaml#/createCheckout   # optional
      concepts: [payment]     # optional on every claim kind: concept ids of this Square (§14)
  consumes:
    - id: payable-order
      from: square://orders
      statement: An order whose payable amount has been finalized.
commitments:                  # optional
  - id: event-idempotency
    kind: invariant           # invariant | boundary | constraint | preference | assumption
    strength: must            # must | must-not | should | should-not
    statement: >
      Reprocessing the same provider event cannot produce an additional
      business effect.
    evidenceClass: test       # optional, see §7; default none
    concepts: [payment]       # optional (§14)
relationships:                # optional
  - type: dependsOn           # dependsOn | usesExternal
    target: square://orders
    through: payable-order    # optional — a contract id listed in the target's contracts.provides
decisions:                    # optional, append-only (§7)
  - id: payment-provider
    date: 2026-08-11
    choice: Stripe is the payment provider.
    rationale: >
      Stripe is the accepted provider for the current product.
    from: change://choose-provider   # optional: the Change that promoted this decision (§9)
    supersededBy: null        # or a later decision id
    concepts: [payment]       # optional (§14)
scenarios:                    # optional
  - id: duplicate-event
    given: A verified event has already been processed.
    when: The same provider event is delivered again.
    then:
      - No additional Payment transition occurs.
    evidenceClass: test       # optional, see §7; default none
    concepts: [payment]       # optional (§14)
unresolved:                   # optional
  - id: partial-refunds
    question: Are partial refunds supported?
    affects: [Refund model, refund contract]
    concepts: [refund]        # optional (§14)
authority:                    # required at S1; optional at S0
  owns: [contracts, invariants, boundaries, decisions]
  constrains: [dependency-direction]
  delegates: [algorithms, file-structure]
sources:                      # optional: Square-level selectors (§15)
  - glob: src/payments/**
    expect: annotated
extensions: {}                # optional, namespaced keys only, ignored by core
```

**Strictness.** Unknown fields anywhere outside `extensions` are a validation **error**, so a typo cannot become an inert architectural declaration. Keys inside `extensions` must be reverse-DNS-style namespaced (`com.example.security`) and are carried through untouched.

**Prose surface discipline.** Everything current-tense and unverifiable (purpose, owns, authority) is deliberately kept small. `decisions` is append-only history: a decision is never edited or deleted, only superseded by a new decision whose `supersededBy` back-pointer is set on the old one. This is the rot-resistance rule: the current surface stays small, the history only grows.

**Migration note.** The `bindings` field of earlier revisions is removed, replaced by `sources` (§15) — same globs, wrapped as `{glob: <glob>}` entries. `validate` reports a leftover `bindings` key with a targeted migration message instead of the generic unknown-field error (§11 error 12).

---

## 7. The claim model

Claim kinds and what a conforming agent does with each:

| Facet / kind | Meaning | Agent behavior |
| --- | --- | --- |
| commitment `invariant` | Must remain true of the realization | Never knowingly violate; flag suspected violations on the active Change |
| commitment `boundary` | Ownership rule (what this Square may / may not touch) | Never cross without an Evolution Change |
| commitment `constraint` | Required limitation on implementation | Obey during realization |
| commitment `preference` | Desired default | May override only with rationale recorded on the Change |
| commitment `assumption` | Premise currently believed true | May act on; flag if observed false |
| contract | Promise across a Square boundary | Changing one requires considering every consumer |
| decision | A deliberately chosen design | Never silently relitigate; supersede explicitly |
| scenario | Concrete observable behavior | Preserve; the natural seed for tests |
| nonGoal | Responsibility explicitly outside (an edge declaration, not an addressable claim — it has no URI) | Never implement inside this Square |
| unresolved | No accepted answer exists | **Never silently answer** — see §10 rule A3 |

**Concepts are not claims.** A concept (§14) groups claims across every facet of this table but appears nowhere in it: a concept asserts nothing, so no agent behavior attaches to it. Every claim kind in the table — commitments, contracts (provided and consumed), decisions, scenarios, unresolved questions — may carry an optional `concepts` list naming concept ids **of its own Square**; `nonGoals` may not (a non-goal is an edge declaration without a URI). A `proposedDecision` on a Change may carry the same list; the list becomes subject to ordinary tag validation once the decision is promoted into its Square (§9, §14.3).

**`evidenceClass`** (optional on commitments and scenarios) declares how the claim could be checked, in decreasing order of assurance:

`static-analysis` (dependency direction, import rules) → `schema` (OpenAPI/type conformance) → `test` (a test exercises it) → `runtime` (observed in traces/logs) → `model-judgment` (only an LLM can assess it) → `none` (default; undeclared).

v0.1 stores the field and reports it in Context Packs; nothing checks it yet. v0.2 uses it to route claims to verifiers — the design intent is that owenloop workflows become evidence providers: an owenloop workflow's accepted artifact, produced under a pinned definition and fingerprinted inputs, is exactly the shape of an Evidence record (immutable, provenance-carrying, revision-pinned) that a claim URI can reference.

**Cross-cutting claims.** A Square with `archetype: policy` may state commitments whose `appliesTo` field (list of Square URIs, or `"*"`) scopes them to other Squares' realizations. This is the v0.1 answer to "no PII in logs"-type claims: one policy Square owns the claim; the Context Pack compiler injects applicable policy commitments into every targeted Square's pack (§9).

```yaml
# in security.square.md (archetype: policy)
commitments:
  - id: no-pii-in-logs
    kind: invariant
    strength: must-not
    appliesTo: "*"
    statement: Log output must not contain personally identifying information.
```

---

## 8. Authority semantics

`authority` states, per Square, which aspects the graph governs:

- **owns** — the Square is authoritative. The realization must conform. An agent that believes an owned aspect is wrong proposes a Change; the agent does not "fix" the Square silently.
- **constrains** — the Square limits but does not determine the aspect. The realization chooses freely inside the limits.
- **delegates** — the realization is authoritative. The Square is silent and tools must not report drift against delegated aspects (relevant from v0.2).

Anything not listed under any of the three is implicitly delegated. This is the honesty mechanism: a Square never overclaims completeness, and the system can state precisely which layer is authoritative for which aspect.

---

## 9. The Change resource

Frontmatter of `changes/<id>.change.md`:

```yaml
apiVersion: squaring/v0
kind: Change
id: add-partial-refunds
name: Support partial refunds        # required
type: evolution                       # evolution | refactor | repair | adoption
intent: >                             # required
  Support partial refunds for settled payments.
targets:                              # required, ≥1 Square URI
  - square://payments
base:                                 # optional revision pinning
  codeRevision: git:7ad91c2
constraints:                          # optional, task-local constraints
  - Existing full-refund behavior must remain backward compatible.
proposedDecisions:                    # optional; promoted into Squares at completion
  - id: refund-balance-cap
    choice: Refund amount cannot exceed the unsettled refundable balance.
    rationale: Prevents over-refunding across partial refunds.
semanticDiff:                         # required; empty list = no meaning change
  - Add partial-refund contract to square://payments
phase: active                         # draft | active | blocked | done | abandoned
status:                               # working state; freely edited while active
  done:
    - Existing refund behavior mapped.
  inProgress:
    - Defining Refund lifecycle.
  blocked:
    - reason: Accounting treatment of partial refunds is undecided.
      affects: [square://payments#unresolved/partial-refunds]
  next:
    - Resolve accounting decision.
suspensions: []                       # optional, see below
extensions: {}
```

**Change types.** `evolution` changes meaning and realization. `refactor` changes realization only (`semanticDiff` must be empty). `repair` restores conformance to unchanged meaning. `adoption` proposes Squares inferred from existing code, possibly with no realization change. The type tells the agent whether it is allowed to change meaning at all.

**Lifecycle.** `draft` → `active` → (`blocked` ⇄ `active`) → `done` | `abandoned`. On `done`: every `proposedDecision` that proved durable is appended to the owning Square's `decisions` with `from: change://<id>` recording the promoting Change (this is the only routine way task work writes into a Square), any resolved `unresolved` items are removed from the Square with a decision recording the answer, and the Change file is kept as history. Because promotion happens only at completion, a decision whose `from` names a Change that is not `done` is a validation error (§11).

**Suspensions.** Legitimate work sometimes passes through states that violate an invariant (migrations). A Change may declare, per suspended claim:

```yaml
suspensions:
  - claim: square://payments#commitment/event-idempotency
    reason: Backfill replays historical events once, deliberately.
    until: Backfill completes and the replay flag is removed.
```

A suspension is loud, scoped to the Change, and visible in every Context Pack that includes the claim. Without this mechanism agents either refuse legitimate work or learn that violations are ignorable; both outcomes are worse than an explicit suspension.

**Lifetime rule.** The compaction-prompt fields live here, not in Squares: goal → `intent`; done/doing/blocked/next → `status`; task-local constraints → `constraints`; durable decisions → `proposedDecisions` until promotion. A new agent resumes from the Change plus a Context Pack — never from a compressed transcript.

---

## 10. Agent conformance rules

Installed into each repository as `squares/PROTOCOL.md` by `squaring init`; a conforming agent follows them whenever the repository contains a Square Graph.

- **A1 — Accepted Squares are never silently rewritten.** Squares change only through a Change whose `semanticDiff` names the modification, except: appending a promoted decision at Change completion, and fixing typos that alter no meaning.
- **A2 — Work starts with a Change.** Before editing the realization, create or resume a Change whose `targets` cover the Squares whose owned aspects the work touches. Trivial-fix exception: a realization edit that touches no owned aspect of any Square needs no Change.
- **A3 — Unresolved questions are never silently answered.** If work requires an answer to an `unresolved` item: ask the human, or record a `proposedDecision` on the Change and surface it prominently in the final report. Implementing the statistically-likely answer without recording it is the single defining violation of this protocol.
- **A4 — Inference is not adoption.** Squares proposed from code (type `adoption`) are marked proposed and become accepted only when a human approves the Change. Observed code never redefines accepted intent by itself.
- **A5 — Fast path.** A Change whose `semanticDiff` is empty (`refactor`, `repair`) may proceed without prior human approval, under all other rules. A non-empty `semanticDiff` requires human approval of the diff before the realization is edited.
- **A6 — Scope expansion re-plans.** If realization work grows beyond the approved `targets`, stop, amend the Change (targets + semanticDiff), and re-obtain approval if A5 requires it.
- **A7 — Violations are reported, not absorbed.** A suspected violation of any commitment is recorded on the active Change (`status.blocked` or the final report) — never silently worked around. Deliberate temporary violation requires a `suspension`.
- **A8 — Overrides are labeled.** A human instruction that contradicts a commitment is recorded on the Change as an override with the human's stated reason; the agent does not restate the override as its own conclusion.
- **A9 — Context Packs are inputs, not truth.** Agents act on the graph and repository; a stale pack is regenerated, never hand-patched.

---

## 11. Validation

`squaring validate` (and the MCP `validate` tool) reports each finding with its file, and with a line number where one is available (YAML parse errors; anchor-derived findings — see the note after the error list):

**Errors** (graph is invalid):
1. Frontmatter fails the schema, or an unknown field appears outside `extensions`.
2. `id` ≠ filename stem; duplicate Square/Change ids; duplicate claim ids within a facet.
3. Broken references: `partOf`, `relationships[].target`, `contracts[].consumes[].from`, `Change.targets`, `suspensions[].claim`, `appliesTo` entries, or any `[[link]]` / `square://` URI in a body that names a nonexistent Square, concept, or claim.
4. `partOf` cycle, or a `contains` relationship expressed anywhere except `partOf`.
5. A `refactor`/`repair` Change with a non-empty `semanticDiff`; an `evolution` Change with an empty one; a `done` Change with unpromoted `proposedDecisions`.
6. An edited (rather than superseded) decision — detected structurally where possible: a decision whose `supersededBy` points at a nonexistent decision, or at itself.
7. A decision whose `from` names a Change that does not exist, or whose phase is not `done` — decisions are promoted only when their Change completes (§9).
8. A `sources` glob — Square-level or concept-level — that is absolute or contains `..`: selectors are repo-relative and must stay inside the repository.
9. A duplicate concept id within one Square, or a `concepts` entry on any claim naming a concept its Square does not declare. Concept tags never resolve across Squares (§14). Tags on a `proposedDecision` are covered by this same rule the moment the promoted decision lands in its Square — no separate promotion-time check exists, because nothing on a proposedDecision names a destination Square before promotion (§14.3).
10. A malformed anchor — a line whose `@sq` token is followed by text failing the target grammar (§15.2), including an empty target — a dangling anchor — a well-formed target that resolves to no Square, concept, or claim — or an ambiguous bare anchor: a bare id that names more than one Square or concept in the graph. The ambiguity finding lists every candidate so the fix is mechanical (spell the URI).
11. An `expect: annotated` coverage failure: a scan-universe file that matches the expecting glob but carries no anchor resolving into the declaring Square — neither the Square itself, nor one of its concepts, nor one of its claims (§15).
12. A `bindings` key on any Square. The field is removed; the finding tells the author to move the globs under `sources` (§6 migration note) instead of reporting a generic unknown field.

Errors 10 and 11 — and warnings 7 and 8 below — require the anchor scan: `validate` runs the scan (§15) on every invocation, one pass over the scan universe. An error 10 finding reports the realization file and line of the offending anchor. An error 11 finding reports the uncovered realization file and names the declaring Square and the expecting selector.

**Warnings** (valid but suspect):
1. A Square with no `nonGoals` and no `commitments` (pure description — likely rot bait).
2. `authority` missing on a Square that declares commitments (S1 requires authority).
3. `sources` globs (Square-level or concept-level) matching zero files.
4. A `blocked` Change untouched by git for a long period (reported informationally).
5. `squares/PROTOCOL.md` differs from the protocol shipped with the running squaring version — the file is tool-owned; refresh with `squaring init`.
6. An inert concept: declared under `owns.concepts`, but no claim is tagged with it, no selector is scoped to it, and no anchor targets it. Harmless, but likely either leftover vocabulary or a missing mapping.
7. The scan universe (§15.4) is empty. Nothing remains for a selector to match or for the scanner to read an anchor from, so source mapping is off while every other check still passes. Reported once, naming the squares directory and the `scanIgnore` patterns in force, because those are the two configurable inputs of §15.4. The warning fires on the empty result and never on a named cause: a `dir` covering the repository root, a `scanIgnore` that removes every file, and a repository with nothing in its git index all reach it alike. A `scanIgnore` that empties the universe only *partly* is deliberately not this warning — it surfaces as warning 3 on each selector left matching nothing.
8. A scan-universe file whose bytes could not be read — a permission error, or a file removed between the universe computation and the read. Its anchors are unknown, so they are missing from the index (§15.6) and from Context Pack section 11 (§12). Reported once per file, and independently of error 11: a file covered by an `expect: annotated` selector produces both findings, which say different things — the error says the declaring Square's coverage expectation is unmet, the warning says the bytes were never examined.

---

## 12. Context Packs

`squaring context <square-id | change-id | concept-uri>` compiles a deterministic Markdown pack. Determinism: identical graph + identical scan universe with identical file contents + identical arguments ⇒ byte-identical output above the trailing generation stamp (ordering is defined; no timestamps; the stamp carries the git revision when one is available). The scan universe (§15) joins the precondition as both file *set* and file *contents*: packs list computed source matches and anchor sites at `path:line` (section 11), and an anchor's line lives in file contents, not in the file set.

**Normative section order** — edges first, because sharp edges are what agents round away; generic descriptions are recoverable, edges are not:

1. **Target identity** — name, purpose, `partOf` chain.
2. **Concept map** — each concept of the target Square: id, display name, statement, and the ids of every claim tagged with it, grouped by facet. A claim tagged with several concepts is listed under each of them. A Square with no concepts renders the heading with the empty-section placeholder (rule below).
3. **Non-goals and boundaries** — the target's `nonGoals` and boundary-like commitments (kind `boundary`, or strength `must-not` / `should-not`), plus applicable policy-Square commitments (`appliesTo` matches), each pointing back at the owning policy claim.
4. **Commitments** — remaining commitments with kind, strength, `evidenceClass`, and any active suspensions flagged inline.
5. **Scenarios** — given/when/then, with `evidenceClass` where declared.
6. **Contracts** — provided (with each consumer Square named), consumed (with each provider named). One hop of counterparties: for each counterparty Square, its name, purpose, and the shared contract only.
7. **Ownership and dependency directions** — `owns`, `authority`, `relationships`.
8. **Decisions** — non-superseded decisions with rationale and `from` provenance where declared; superseded ones listed by id only.
9. **Unresolved questions** — verbatim, prefixed with the A3 rule reminder.
10. **Active Changes** — every Change targeting the Square whose phase is neither `done` nor `abandoned`: intent, phase, `semanticDiff`, status, suspensions.
11. **Sources** — the target's selectors (Square-level and per concept) with matched file lists, followed by every anchor site resolving into the target (`path:line`, the line as found at this scan — locations exist only in this derived output, per §15); unconfined globs (§11 error 8) are named and skipped.
12. **Body** — the Square's Markdown body, with `[[wiki]]` links resolved to canonical `square://` URIs.

**Empty sections.** A section with no content renders its heading followed by the single placeholder line "(none declared)" — section numbers never shift. One exception: section 12 (Body) is omitted entirely, heading included, when the Square has no body text.

In sections 3–9, a tagged claim's line ends with its tags (`concepts: refund`) so an agent reading one claim sees its topics without returning to the map.

For a Change id, the pack is the full Change followed by the pack of every targeted Square (duplicates listed once, each abbreviated to sections 1–9). Packs end with a one-line generation stamp: graph file count and git revision when available.

**Concept-scoped packs.** For a concept URI (`squaring context payments#concept/refund` — short or full form), the pack is scoped: section 1 carries the Square's identity plus the concept's statement; sections 2 and 12 are omitted entirely (the remaining sections keep their numbers); sections 3–9 include only claims tagged with the concept, with policy injections kept when they apply to the Square; section 10 is unchanged (Changes target Squares, not concepts); section 11 lists only the concept's own selectors and the anchors resolving to the concept or to its tagged claims. Non-claim content is kept unfiltered: `nonGoals` in section 3 and all of section 7 (`owns`, `authority`, `relationships`) render exactly as in the full pack — boundary context is cheap to include and dangerous to lose. This is the "brief me on refunds, not all of payments" operation.

---

## 13. CLI and MCP surface

One core library, two faces. Commands and tools are the same operations.

| CLI | MCP tool | Operation |
| --- | --- | --- |
| `squaring init` | — | Create `squares/`, `PROTOCOL.md`, register the MCP server in `.mcp.json`, print next steps |
| `squaring validate` | `validate` | §11 |
| `squaring list` | `list_squares` | ids, names, archetypes, partOf tree, active-change markers |
| `squaring show <id>` | `get_square` / `get_change` | full parsed resource |
| `squaring graph` | `get_graph` | edge list: partOf, dependsOn, contracts, usesExternal |
| `squaring context <id>` | `context_pack` | §12; accepts a Square id, a Change id, or a concept URI |
| `squaring index [<target>] [--file <path>] [--json]` | `index` | §15; CLI additionally takes `--watch` |
| `squaring protocol` | `get_protocol` | print the agent conformance rules (§10, same content as `squares/PROTOCOL.md`) |
| `squaring new square <id>` | `scaffold_square` | template with required fields |
| `squaring new change <id>` | `scaffold_change` | template with required fields |
| `squaring mcp` | — | serve the MCP tools over stdio |

Authoring is deliberately *not* an MCP write-API in v0.1: agents author `.square.md` files with ordinary file edits (transparent, git-reviewable), then `validate`. The scaffold tools exist only to eliminate blank-page schema errors.

---

## 14. Concepts

### 14.1 Why this layer exists

The claim facets of §7 group by **form** — promise (commitment, contract), past choice (decision), expected behavior (scenario), open question (unresolved). Form-grouping serves the rules: A3 operates on `unresolved`, promotion operates on `decisions`, suspension operates on commitments. It does not serve navigation: when `square://payments` holds forty claims, "which of these are about refunds?" cuts across every facet.

Concepts add the missing **topic** axis without adding a new noun to the model — `owns.concepts` already existed as display strings; this section promotes those strings to addressable objects. The zoom ladder the model supports, top to bottom:

**Square** (intent) → **concept** (topic, one sentence) → **claim** (addressable meaning) → **anchor / selector** (§15) → **file path** (computed at scan time, never stored).

Form and topic are orthogonal: a claim keeps exactly one home (one facet entry, one URI) and may be reachable through any number of concepts.

### 14.2 Declaration

Concepts are declared under `owns.concepts`, one object per concept (example in §6):

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | ID grammar of §5; unique within the declaring Square (§11 error 9). Concept ids in *different* Squares may collide — the URI disambiguates; a bare anchor that hits the collision is §11 error 10. |
| `name` | no | Display name; when absent, tools derive one from the `id`: hyphens become spaces, each word capitalized (`payment-state` → `Payment State`). |
| `statement` | yes | One sentence defining the topic — the definition an agent reads before touching anything tagged with it. |
| `sources` | no | Selectors scoped to this concept (§15.3). |

**URI:** `square://<square-id>#concept/<concept-id>`. A concept is addressable (anchors, prose links, `squaring context`, `squaring index` all accept the URI) but is **not a claim** (§5, §7): it has no strength, no `evidenceClass`, and no suspension may name it. There is nothing to suspend — a concept asserts nothing.

### 14.3 Tagging claims

Every claim kind — commitments, provided contracts, consumed contracts, decisions, scenarios, unresolved questions — accepts an optional `concepts` list of concept ids **of its own Square**. Cross-Square tagging does not exist: a topical link that crosses a Square boundary is a relationship or a contract, never a tag (§11 error 9 enforces this by resolving tags only against the declaring Square's concepts).

A claim may carry several tags. The claim itself stays single — one facet entry, one URI; tags are additional routes to it, not copies of it. `squaring context payments#concept/refund` and `squaring context payments#concept/chargeback` may both surface `#decision/refund-window`; both show the same claim.

`proposedDecisions` on a Change accept the same list. A proposed decision has no owning Square until promotion (§9) — nothing on it names a destination — so its tags are not checked while the Change is open. They become checkable the moment the promoted decision lands in a Square, where the ordinary rule applies: a tag naming a concept the landing Square does not declare is §11 error 9, surfaced by the first `validate` after promotion. The agent performing a promotion therefore resolves the decision's tags as part of the promotion edit.

### 14.4 Rendering

Context Packs render a **Concept map** section and per-claim tags (§12). Packs stay facet-major — the §12 ordering rationale (edges first) is unchanged; the concept map is the topical table of contents on top of it. A concept URI compiles a concept-scoped pack (§12).

### 14.5 Graduation — a concept is the larval form of a child Square

When a concept accumulates enough claims to deserve its own boundary, split it out through an `evolution` Change:

1. The Change's `semanticDiff` declares the new child Square (`partOf` the current one) and moves the concept's tagged claims into it. `concepts` tags naming the removed concept — on the moved claims and on any claims staying in the parent — are removed or re-pointed in the same edit; a leftover tag is §11 error 9.
2. The concept entry is removed from the parent, and a decision on the parent records the split, with `from` naming the promoting Change.
3. Anchors targeting the removed concept are updated in the same Change — mechanically, old target → new Square's URI (or a claim/concept inside it) — otherwise they surface as dangling anchors (§11 error 10) on the next `validate`.

No mechanism is invented at the moment of splitting: the growth path from "one Square with topics" to "a Square of Squares" reuses `partOf`, `semanticDiff`, and decision promotion exactly as defined.

---

## 15. Source anchors and the index

### 15.1 Purpose and the storage rule

This section defines the bottom rungs of the §14.1 ladder: mapping meaning to source **without storing locations**. The storage rule, stated once and relied on everywhere:

> The graph stores *selectors* (globs it owns). The realization stores *anchors* (markers owned by the file they sit in). File paths and line numbers appear only in derived output — the index (§15.6) and Context Packs (§12) — never in a `.square.md` or `.change.md` file.

Rationale, recorded as decisions on `change://concepts-and-sources`: a stored path or line number is owned by nobody and rots on every edit; an anchor moves with the code it marks, and a normal code review sees every mapping change because the mapping *is* a code change.

### 15.2 Anchors

An anchor is a marker on one line of a realization file:

```
@sq <target> [ -- <note> ]
```

- **Token.** The literal `@sq` followed by whitespace, anywhere in a line — inside whatever comment syntax the host language uses. One anchor per line: the scanner reads the first `@sq` token of a line. The **target** is the maximal run of non-whitespace characters after that whitespace. The **note**, when present, is everything after a ` -- ` separator (space, two hyphens, space), running to end of line. Text between the target and the separator (or end of line, when no separator exists) is ignored — this is what lets an anchor close a block comment: in `/* @sq payments#concept/refund */` the trailing `*/` is ignored text. A mistyped separator therefore degrades silently into ignored text; a mistyped target never degrades silently (see the grammar bullet).
- **Scanner obliviousness.** The scanner does not parse the host language and does not know comment syntax — that is what makes it work identically for TypeScript, Python, Terraform, SQL, YAML, and shell. Consequence, accepted deliberately: an `@sq` token inside a string literal is an anchor too. A file that must *discuss* anchor syntax without declaring anchors (documentation, this spec, scanner tests) is excluded via `scanIgnore` (§4).
- **Target grammar** (`facet` as in §5):

  ```
  target    = full-uri | short-uri | bare-id
  full-uri  = "square://" square-id [ "#" ("concept" | facet) "/" item-id ]
  short-uri = square-id "#" ("concept" | facet) "/" item-id
  bare-id   = id
  ```

  A `full-uri` or `short-uri` resolves exactly (a nonexistent target is §11 error 10). A `bare-id` resolves against the union of all Square ids and all concept ids in the graph, and only when exactly one match exists; two or more matches are §11 error 10, listing every candidate. Claims can never be targeted bare — a claim target always spells its facet. This matches the CLI's existing bare-id convention (`squaring show`). A target that fails this grammar outright — empty, uppercase, a malformed scheme, or any scheme other than `square://` (`change://` is not an anchor target: Changes reference code; code never anchors to a Change) — is a malformed anchor, also §11 error 10. A typo'd anchor never silently vanishes.
- **Granularity.** An anchor binds its **file** to the target. The line the anchor sits on is carried into derived output as the "which part of the file" hint — never stored, recomputed on every scan. Practice: anchor a module or function header for topical mapping (`// @sq payments#concept/refund`); anchor a specific site only when one claim needs a precise home (`// @sq payments#commitment/event-idempotency -- replay guard; suspension on change://backfill`).
- **Note discipline.** The note is a human hint at the site, carried verbatim into the index and packs. The canonical record of any reasoning — why the code is wonky, what to revisit, when — lives in the graph as a decision, an unresolved question, or a suspension; the anchor's note points at that record, it does not replace it.
- **Self-declaration.** An anchor is discovered by scanning, never re-declared in the graph. Listing an anchored file under `sources` as well is not an error, but it is redundant — two copies of one fact, one of which will drift. Selectors are for what anchors cannot do (§15.3).

### 15.3 Selectors

A `sources` list — at Square top level or on a concept (§14.2) — holds selector entries:

| Field | Required | Meaning |
| --- | --- | --- |
| `glob` | yes | Repo-relative glob matched against the scan universe. Absolute, or containing `..` → §11 error 8. |
| `expect` | no | Only defined value: `annotated`. Coverage enforcement: every scan-universe file matching this glob must carry at least one anchor resolving into the declaring Square — the Square itself, any of its concepts, or any of its claims. A matching file with no such anchor is §11 error 11. Files sniffed binary (§15.4 step 4) are exempt — a binary can never carry an anchor, so the check skips it while the glob still maps it. A file that could not be read (§15.4 step 4) is **not** exempt: its anchors are unknown rather than absent, and treating unknown as satisfied would let a permission error turn a coverage failure into a pass. Such a file is error 11 here and warning 8 for the read failure itself. A file matched by expecting selectors of several Squares must satisfy each declaring Square independently. `expect` never filters resolution (§15.5) — it only adds the check. |
| `note` | no | Why this selector exists — for example, that the file has no comment syntax. |

Selectors exist for exactly three jobs: files that cannot carry an anchor (JSON, lockfiles, images — no comment syntax), coarse whole-directory mapping where per-file anchors would be noise, and — through `expect: annotated` — making agent-maintained anchor hygiene *checkable* rather than hoped-for.

### 15.4 Scan universe

The file set the anchor scanner reads and selector globs match against, computed as:

1. When the repository root is a git work tree: the files recorded in the git index (`git ls-files` semantics), dropping entries missing from the working tree. Stated consequence: a brand-new untracked file — anchors and all — is invisible to the scan until `git add` stages it. When the root is not a git work tree: every file under the root minus `.git/` and `node_modules/`. In both modes symbolic links are excluded, never followed — a link's destination may lie outside the repository, breaching the same confinement §11 error 8 enforces for globs.
2. Always remove the squares directory (§4): anchors belong in the realization; graph files mention anchor syntax only as prose.
3. Remove every file matching a `scanIgnore` glob from `.squaring.json` (§4).
4. Selector globs match against the resulting set. For anchor *reading*, each remaining file falls into one of three classes. **Text** is read for anchors. **Binary** — a NUL byte within the first 8192 bytes — is skipped: a glob may still select a binary file (an image can be a concept's source; it just cannot carry an anchor), and §15.3 exempts it from `expect: annotated` because a binary provably carries no anchor. **Unreadable** — the bytes could not be examined at all — is a distinct third class, not a kind of binary: its anchors are *unknown* rather than *absent*, so it is never exempt from `expect: annotated`, and the read failure is §11 warning 8.

An empty universe is legal — it is what a repository with nothing staged produces — but it is almost always a misconfiguration, because it silently turns source mapping off: every selector matches zero files and no anchor exists to be found. §11 warning 7 reports it.

The universe (the file set) is a function of the working tree, the git index (step 1), and `.squaring.json`. Index output and pack section 11 additionally depend on the *contents* of universe files, because anchors live in contents — §12 states the determinism precondition with both.

### 15.5 Resolution

For the loaded graph and the scan universe, resolution is a **plain union** — no scoped, filtered, or weighted variants exist (decision `union-resolution-only` on `change://concepts-and-sources`):

- **files(claim)** = files carrying an anchor targeting the claim.
- **files(concept)** = files matching the concept's selector globs ∪ files anchored to the concept ∪ files(claim) for every claim tagged with the concept.
- **files(square)** = files matching the Square-level selector globs ∪ files anchored to the Square ∪ files(concept) for every declared concept ∪ files(claim) for every claim of the Square.

Containment follows: files(square) ⊇ files(concept) ⊇ files(claim-tagged-with-that-concept). The reverse map is the transpose: for one file, every Square, concept, and claim whose resolution set contains it, each pairing labeled with the selector or anchor that produced it.

### 15.6 The index

`squaring index` (MCP: `index`) computes both directions of the map. The index is **derived, disposable output** with exactly the standing of a Context Pack (rule A9): never stored in the graph, never committed, regenerated instead of edited.

- `squaring index` — forward map for the whole graph: every Square → its concepts → their claims, each with matched files and anchor sites (`path:line`, line as found at this scan).
- `squaring index <target>` — forward map scoped to one Square id, concept URI, or claim URI; URIs are accepted in short or full form (§15.2), matching `context`. Combining `<target>` with `--file` is an error — the two select opposite directions of the map.
- `squaring index --file <path>` — reverse map for one file: every Square, concept, and claim claiming it, with the selector or anchor responsible. This is the lookup an agent runs before editing a file it did not map itself — it answers "which Squares govern this file?", serving A2 (choosing a Change's `targets`) and A7 (knowing which commitments are in play).
- `--json` — machine output: one entry per resolved pairing, carrying the target URI, the file path, `via` (`selector` | `anchor`), the glob text or anchor target text, `line` (anchors only), and the selector or anchor note when present. Entry order is defined (by target URI, then path, then `via` — selector before anchor — then glob or anchor target text, then line), so `--json` output is byte-stable for a given tree.
- `--watch` (CLI only) — re-scan on file change, reprinting; each re-scan is byte-identical to a fresh one-shot run over the same tree. Watch is a convenience loop around the one-shot scan, not a different mode with different output.

MCP tool `index` takes `{ target?, file? }` — at most one, like the CLI — and always returns the `--json` shape: MCP is a machine surface (§13).

### 15.7 Migration from `bindings`

`bindings: [<glob>, …]` becomes Square-level `sources: [{glob: <glob>}, …]` — the same globs under the same confinement rule (§11 error 8), with `expect` and `note` now available and per-concept scoping possible. A leftover `bindings` key is §11 error 12, and that finding states this exact rewrite.

---

## 16. Versioning and compatibility

- `apiVersion: squaring/v0` — pre-1.0; breaking schema changes bump nothing but are recorded in CHANGELOG. From `squaring/v1`, unknown-version files are an error and migrations ship with the tool.
- The strict-fields rule (§6) is per-version: tools reject fields their version doesn't know rather than guessing. Forward compatibility is handled by version bumps, not by silent field tolerance.

## 17. v0.2 direction (informative)

SquareStatus + Evidence, rolled out by `evidenceClass` stratum in order of assurance: `static-analysis` (import/dependency rules — deterministic, cheap, first), then `schema`, then `test`, then `model-judgment` explicitly labeled as such. Owenloop is the intended first evidence provider: a workflow run whose judged, accepted artifact attests a claim, pinned to the definition snapshot and input fingerprints under which it ran, becomes an Evidence record referenced by claim URI. The rot audit — periodically re-verifying every claim with an evidenceClass and flagging stale prose — is an owenloop workflow, not a Squaring core feature.
