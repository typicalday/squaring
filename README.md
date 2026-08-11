# squaring

A semantic control plane for agent-built software.

Squaring represents what a codebase is *supposed to mean* as a versioned graph
of bounded commitments — **Squares** — kept in plain Markdown/YAML files inside
the repository. Work that changes meaning goes through an explicit **Change**.
Agents read a compiled **Context Pack** (intent, non-goals, commitments,
contracts, open questions) before they read code, and follow a small
conformance protocol (rules A1–A9) that stops the two classic failure modes of
vibe coding: silently answering open questions, and silently rewriting intent
to match whatever the code happens to do.

The full specification is [docs/SPEC.md](docs/SPEC.md). This repository is
itself squared — see [squares/](squares/).

## Concepts in one minute

- **Square** (`squares/<id>.square.md`) — a bounded semantic commitment: purpose,
  non-goals, commitments (invariants/boundaries with strengths), contracts
  (provides/consumes), decisions (append-only), unresolved questions, and an
  authority block saying what the Square pins down vs. delegates to the code.
- **Change** (`squares/changes/<id>.change.md`) — work in motion: intent,
  targeted Squares, a `semanticDiff` naming every meaning change (empty =
  refactor/repair), phase, honest status, and any temporary suspensions of
  commitments.
- **Context Pack** — a deterministic, read-optimized compilation of a Square or
  Change: edges (non-goals, boundaries, cross-cutting policies) first, then
  commitments, contracts with counterparties, decisions, unresolved questions,
  and active Changes.
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
squaring validate                     # schema + referential integrity; exit 1 on errors
squaring context your-project         # the compiled Context Pack
```

Then tell your agent (CLAUDE.md / AGENTS.md):

```markdown
This repository is squared. Read squares/PROTOCOL.md and follow it.
Before working on an area, run the `context_pack` MCP tool (or `squaring
context <id>`) for the relevant Square. Run `validate` after editing any
.square.md or .change.md file.
```

The natural authoring flow is conversational: talk to the agent about the
system, have the agent draft Squares (`scaffold_square` + ordinary file
edits), and approve them. For an existing codebase, have the agent propose
Squares from the code as an `adoption` Change — they become accepted intent
only when you approve (rule A4).

## The two faces

One core library, two interfaces (same operations):

- **CLI** — `squaring init | validate | list | show | graph | context |
  protocol | new square | new change | mcp`.
- **MCP server** — `squaring mcp` (stdio), registered in `.mcp.json` by
  `squaring init`. Tools: `list_squares`, `get_square`, `get_change`,
  `get_graph`, `validate`, `context_pack`, `scaffold_square`,
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

## Roadmap: v0.2 — observed truth via owenloop

v0.1 is normative + transitional truth only (Squares + Changes). v0.2 adds
`SquareStatus`/`Evidence`: commitments carry an `evidenceClass`
(`static-analysis | schema | test | runtime | model-judgment`) today precisely
so that owenloop workflow runs — judged, accepted artifacts pinned to
definition snapshots and input fingerprints — can attest claims by claim URI
later. The rot audit (re-verify every evidenced claim, flag stale prose) is
planned as an owenloop workflow, not a Squaring core feature.
