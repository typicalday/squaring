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
- **Commitment** — a claim about what must / must not / should be true of the realization.
- **Change** — a versioned unit of proposed evolution: what is being changed, why, against which Squares, and its current working state.
- **Context Pack** — a deterministic, disposable read model compiled from the graph for one agent operation. Context Packs are never a source of truth.
- **Realization** — the code, tests, schemas, and configuration that implement the graph.
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

- The directory defaults to `squares/` at the repository root. A repository may override it with `.squaring.json` at the root: `{ "dir": "docs/squares" }`. No other configuration exists in v0.1.
- A Square file is Markdown with a YAML frontmatter block. The frontmatter carries the machine-readable model defined in §6–§7. The Markdown body is free-form human prose (rationale, diagrams, examples) and is carried into Context Packs verbatim but is never parsed for meaning.
- Filename and `id` must match: `payments.square.md` must declare `id: payments`. This is a validation error otherwise (§11). Identity lives in the `id`, not the path; the filename rule exists only so humans can find files.
- Squares and Changes are committed to git and human-reviewed. Their history is their version history; v0.1 defines no separate generation counter.

---

## 5. Identity and links

- **ID grammar:** `[a-z0-9][a-z0-9-]*`, unique per resource kind within the repository. IDs are flat — hierarchy is expressed by the `partOf` field, never by the ID, so moving a Square in the hierarchy never breaks a link.
- **Square URI:** `square://<id>` (example: `square://payments`).
- **Claim URI:** `square://<id>#<facet>/<claim-id>` where `<facet>` is one of `commitment`, `contract`, `decision`, `scenario`, `unresolved` (example: `square://payments#commitment/event-idempotency`).
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
  concepts: [Payment, Refund, PaymentState]
  state:
    - processed provider-event identifiers
contracts:                    # optional
  provides:
    - id: create-checkout
      statement: Create a checkout session for a payable order.
      schemaRef: ./contracts/payments.openapi.yaml#/createCheckout   # optional
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
    supersededBy: null        # or a later decision id
scenarios:                    # optional
  - id: duplicate-event
    given: A verified event has already been processed.
    when: The same provider event is delivered again.
    then:
      - No additional Payment transition occurs.
unresolved:                   # optional
  - id: partial-refunds
    question: Are partial refunds supported?
    affects: [Refund model, refund contract]
authority:                    # required at S1; optional at S0
  owns: [contracts, invariants, boundaries, decisions]
  constrains: [dependency-direction]
  delegates: [algorithms, file-structure]
bindings:                     # optional: S0 source mapping, repo-relative globs
  - src/payments/**
extensions: {}                # optional, namespaced keys only, ignored by core
```

**Strictness.** Unknown fields anywhere outside `extensions` are a validation **error**, so a typo cannot become an inert architectural declaration. Keys inside `extensions` must be reverse-DNS-style namespaced (`com.example.security`) and are carried through untouched.

**Prose surface discipline.** Everything current-tense and unverifiable (purpose, owns, authority) is deliberately kept small. `decisions` is append-only history: a decision is never edited or deleted, only superseded by a new decision whose `supersededBy` back-pointer is set on the old one. This is the rot-resistance rule: the current surface stays small, the history only grows.

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
| nonGoal | Responsibility explicitly outside | Never implement inside this Square |
| unresolved | No accepted answer exists | **Never silently answer** — see §10 rule A3 |

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

**Lifecycle.** `draft` → `active` → (`blocked` ⇄ `active`) → `done` | `abandoned`. On `done`: every `proposedDecision` that proved durable is appended to the owning Square's `decisions` (this is the only routine way task work writes into a Square), any resolved `unresolved` items are removed from the Square with a decision recording the answer, and the Change file is kept as history.

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

`squaring validate` (and the MCP `validate` tool) reports, with file/line where possible:

**Errors** (graph is invalid):
1. Frontmatter fails the schema, or an unknown field appears outside `extensions`.
2. `id` ≠ filename stem; duplicate Square/Change ids; duplicate claim ids within a facet.
3. Broken references: `partOf`, `relationships[].target`, `contracts[].consumes[].from`, `Change.targets`, `suspensions[].claim`, `appliesTo` entries, or any `[[link]]` / `square://` URI in a body that names a nonexistent Square or claim.
4. `partOf` cycle, or a `contains` relationship expressed anywhere except `partOf`.
5. A `refactor`/`repair` Change with a non-empty `semanticDiff`; an `evolution` Change with an empty one; a `done` Change with unpromoted `proposedDecisions`.
6. An edited (rather than superseded) decision — detected structurally where possible: a decision whose `supersededBy` points at a nonexistent decision.

**Warnings** (valid but suspect):
1. A Square with no `nonGoals` and no `commitments` (pure description — likely rot bait).
2. `authority` missing on a Square that declares commitments (S1 requires authority).
3. `bindings` globs matching zero files.
4. A `blocked` Change untouched by git for a long period (reported informationally).

---

## 12. Context Packs

`squaring context <square-id | change-id>` compiles a deterministic Markdown pack. Determinism: identical graph + identical arguments ⇒ byte-identical output (ordering is defined; no timestamps).

**Normative section order** — edges first, because sharp edges are what agents round away; generic descriptions are recoverable, edges are not:

1. **Target identity** — name, purpose, `partOf` chain.
2. **Non-goals and boundaries** — the target's `nonGoals` and boundary/`must-not` commitments, plus applicable policy-Square commitments (`appliesTo` matches).
3. **Commitments** — remaining commitments with kind, strength, `evidenceClass`, and any active suspensions flagged inline.
4. **Contracts** — provided (with each consumer Square named), consumed (with each provider named). One hop of counterparties: for each counterparty Square, its name, purpose, and the shared contract only.
5. **Ownership and dependency directions** — `owns`, `authority`, `relationships`.
6. **Decisions** — non-superseded decisions with rationale; superseded ones listed by title only.
7. **Unresolved questions** — verbatim, prefixed with the A3 rule reminder.
8. **Active Changes** — every non-`done` Change targeting the Square: intent, phase, `semanticDiff`, status, suspensions.
9. **Source bindings** — the target's `bindings`, with matched file lists (top level only).
10. **Body** — the Square's Markdown body verbatim.

For a Change id, the pack is the union of the packs of every targeted Square (each abbreviated to sections 1–7), preceded by the full Change and followed by shared-neighbor deduplication. Packs end with a one-line generation stamp: graph file count and git revision when available.

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
| `squaring context <id>` | `context_pack` | §12 |
| `squaring protocol` | `get_protocol` | print the agent conformance rules (§10, same content as `squares/PROTOCOL.md`) |
| `squaring new square <id>` | `scaffold_square` | template with required fields |
| `squaring new change <id>` | `scaffold_change` | template with required fields |
| `squaring mcp` | — | serve the MCP tools over stdio |

Authoring is deliberately *not* an MCP write-API in v0.1: agents author `.square.md` files with ordinary file edits (transparent, git-reviewable), then `validate`. The scaffold tools exist only to eliminate blank-page schema errors.

---

## 14. Versioning and compatibility

- `apiVersion: squaring/v0` — pre-1.0; breaking schema changes bump nothing but are recorded in CHANGELOG. From `squaring/v1`, unknown-version files are an error and migrations ship with the tool.
- The strict-fields rule (§6) is per-version: tools reject fields their version doesn't know rather than guessing. Forward compatibility is handled by version bumps, not by silent field tolerance.

## 15. v0.2 direction (informative)

SquareStatus + Evidence, rolled out by `evidenceClass` stratum in order of assurance: `static-analysis` (import/dependency rules — deterministic, cheap, first), then `schema`, then `test`, then `model-judgment` explicitly labeled as such. Owenloop is the intended first evidence provider: a workflow run whose judged, accepted artifact attests a claim, pinned to the definition snapshot and input fingerprints under which it ran, becomes an Evidence record referenced by claim URI. The rot audit — periodically re-verifying every claim with an evidenceClass and flagging stale prose — is an owenloop workflow, not a Squaring core feature.
