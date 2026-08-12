# squaring

A semantic control plane for agent-built software.

Squaring represents what a codebase is *supposed to mean* as a versioned graph
of bounded commitments — **Squares** — kept in plain Markdown/YAML files inside
the repository. Work that changes meaning goes through an explicit **Change**.
Agents read a compiled **Context Pack** (purpose, non-goals, commitments,
contracts, open questions) before they read code, and follow a small
conformance protocol (rules A1–A9) that stops the two classic failure modes of
vibe coding: silently answering open questions, and silently rewriting intent
to match whatever the code happens to do.

The full specification is [docs/SPEC.md](docs/SPEC.md). This repository is
itself squared — see [squares/](squares/).

## The model in one minute

- **Square** (`squares/<id>.square.md`) — a bounded semantic commitment: purpose,
  non-goals, commitments (invariants/boundaries with strengths), contracts
  (provides/consumes), decisions (append-only), unresolved questions, and an
  authority block saying what the Square pins down vs. delegates to the code.
- **Concept** (`owns.concepts`) — one topic inside a Square, addressable as
  `square://<id>#concept/<concept-id>`: an id, a one-sentence statement, and
  optionally its own source globs. Claims of any facet carry a `concepts: [...]`
  tag list, so "which claims are about refunds?" cuts across commitments,
  contracts, decisions, scenarios and unresolved questions at once. A concept is
  a *label*, not a claim — it has no strength, no evidence class, and cannot be
  suspended.
- **Change** (`squares/changes/<id>.change.md`) — work in motion: intent,
  targeted Squares, a `semanticDiff` naming every meaning change (empty =
  refactor/repair), phase, honest status, and any temporary suspensions of
  commitments.
- **Sources** — how meaning reaches files, in two directions. A Square or
  concept declares `sources: [{glob, expect?, note?}]` (globs only, never
  paths); a source file declares itself with a one-line `@sq <target>` comment
  anchor. `expect: annotated` on a selector demands that every file it matches
  carry an anchor into the declaring Square. Paths and line numbers are computed
  at scan time and stored nowhere.
- **Context Pack** — a deterministic, read-optimized compilation of a Square, a
  concept of a Square, or a Change: edges (non-goals, boundaries, cross-cutting
  policies) first, then commitments, contracts with counterparties, decisions,
  unresolved questions, active Changes, and the resolved source map.
- **Protocol** (`squares/PROTOCOL.md`) — the nine rules an agent follows in a
  squared repository. Highlights: A2 (work starts with a Change), A3 (never
  silently answer an unresolved question), A5 (empty-semanticDiff Changes may
  proceed without approval; meaning changes need a human yes).

## Quickstart on one of your repos

```bash
npm install -g squaring
```

```bash
cd ~/code/your-project/wt/some-branch
squaring init                         # squares/, squares/PROTOCOL.md, .mcp.json
squaring new square your-project      # scaffold the root Square, fill in the TODOs
squaring validate                     # schema + referential integrity + anchor scan; exit 1 on errors
squaring context your-project         # the compiled Context Pack
squaring index                        # the source map: Square → concept → claim → files
squaring index --file src/app.ts      # the reverse: what governs this file
```

Then tell your agent (CLAUDE.md / AGENTS.md):

```markdown
This repository is squared. Read squares/PROTOCOL.md and follow it.
Before working on an area, run the `context_pack` MCP tool (or `squaring
context <id>`) for the relevant Square. Before editing a file you did not
map yourself, run the `index` tool with that path to see which Squares,
concepts and claims govern it. Run `validate` after editing any .square.md
or .change.md file.
```

The natural authoring flow is conversational: talk to the agent about the
system, have the agent draft Squares (`scaffold_square` + ordinary file
edits), and approve them. For an existing codebase, have the agent propose
Squares from the code as an `adoption` Change — they become accepted intent
only when you approve (rule A4).

## Meaning ↔ files, in two directions

The graph never stores a file path. A Square (or one of its concepts) declares
*selectors* — globs with an optional expectation — and a source file declares
*itself* with a one-line comment anchor. `squaring index` joins the two and
prints the result; nothing is written back.

```yaml
# squares/orders.square.md
owns:
  concepts:
    - id: refund
      name: Refund
      statement: Returning money for an order after the charge settled.
      sources:
        - glob: src/orders/refund/**
          expect: annotated       # every matched file must anchor into square://orders
sources:
  - glob: src/orders/**
    note: the whole capability
commitments:
  - id: no-refund-past-window
    kind: invariant
    strength: must
    statement: A refund is issued only inside the refund window.
    concepts: [refund]            # tags cut across every claim facet
```

```ts
// src/orders/refund/window.ts
// @sq orders#commitment/no-refund-past-window -- the window check itself
```

An anchor binds its **file**, not its line — the line number appears in
`index` output only, as found at that scan. The target is a Square id, a
concept URI, or a claim URI; the note after ` -- ` is free text. One anchor per
line, any comment syntax, any language (the scanner reads bytes, not syntax).

```bash
squaring index orders                       # forward: Square → concepts → claims → files
squaring index orders#concept/refund        # one topic's files
squaring index --file src/orders/refund/window.ts   # reverse: what governs this file
squaring index --json                       # byte-stable entry list for tooling
squaring context orders#concept/refund      # a pack scoped to one topic
```

`expect: annotated` is the enforcement knob: it turns "these files ought to be
mapped" into a `validate` error when one of them carries no anchor. Binary
files are exempt (they cannot carry a comment) but still match globs.

## The two faces

One core library, two interfaces (same operations):

- **CLI** — `squaring init | validate | list | show | graph | context | index |
  protocol | new square | new change | mcp`.
- **MCP server** — `squaring mcp` (stdio), registered in `.mcp.json` by
  `squaring init`. Tools: `list_squares`, `get_square`, `get_change`,
  `get_graph`, `validate`, `context_pack`, `index`, `scaffold_square`,
  `scaffold_change`, `get_protocol`. Every tool call reloads the graph from
  disk — no daemon state, files stay the source of truth.

Authoring is deliberately **not** a write-API: agents edit the `.square.md`
files directly (transparent, git-reviewable) and re-validate. Scaffolding
exists only to eliminate blank-page schema errors.

## Development

```bash
npm run check        # typecheck + lint + build + tests
npm test             # node --test over test/*.test.ts (runs TS directly, Node >= 22)
```

The test suite includes a self-check: this repository's own Square Graph must
validate with zero errors and zero warnings.

## Roadmap: observed truth via owenloop

Today Squaring carries normative + transitional truth only (Squares + Changes,
now mapped to files by §15 sources). The next layer adds
`SquareStatus`/`Evidence`: commitments carry an `evidenceClass`
(`static-analysis | schema | test | runtime | model-judgment`) today precisely
so that owenloop workflow runs — judged, accepted artifacts pinned to
definition snapshots and input fingerprints — can attest claims by claim URI
later. The rot audit (re-verify every evidenced claim, flag stale prose) is
planned as an owenloop workflow, not a Squaring core feature.
