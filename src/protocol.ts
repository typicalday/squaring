// The agent conformance rules — SPEC §10 — installed into repositories as
// squares/PROTOCOL.md by `squaring init` and served by the MCP get_protocol
// tool. Written for an agent audience.
// @sq agent-protocol#concept/conformance-rules -- A1–A9 and the Change lifecycle, verbatim

export const PROTOCOL_MD = `# Squaring agent protocol

This repository carries a Square Graph: \`*.square.md\` files describe what the
software is supposed to mean (Squares); \`changes/*.change.md\` files describe
work in motion (Changes). If you are an agent working in this repository, you
are expected to follow the rules below. Tooling: the \`squaring\` CLI, or the
\`squaring\` MCP server (tools: \`list_squares\`, \`get_square\`, \`get_change\`,
\`get_graph\`, \`validate\`, \`context_pack\`, \`index\`, \`scaffold_square\`,
\`scaffold_change\`, \`get_protocol\`).

## Before you start

1. Run \`context_pack\` (or \`squaring context <id>\`) for the Square or Change
   you are working on. Read it before reading code.
2. Run \`index\` with a \`file\` (or \`squaring index --file <path>\`) before
   editing a file you did not map yourself: it names every Square, concept and
   claim that governs the file, which is what A2 and A7 need.
3. Run \`validate\` after any edit to a \`.square.md\` or \`.change.md\` file.

## The rules

- **A1 — Accepted Squares are never silently rewritten.** Squares change only
  through a Change whose \`semanticDiff\` names the modification. Exceptions:
  appending a promoted decision when a Change completes, and typo fixes that
  alter no meaning.
- **A2 — Work starts with a Change.** Before editing the realization, create
  or resume a Change whose \`targets\` cover the Squares whose owned aspects
  the work touches. Exception: an edit that touches no owned aspect of any
  Square needs no Change.
- **A3 — Unresolved questions are never silently answered.** If work requires
  an answer to an \`unresolved\` item: ask the human, or record a
  \`proposedDecision\` on the Change and surface it prominently in your final
  report. Implementing the statistically likely answer without recording it is
  the defining violation of this protocol.
- **A4 — Inference is not adoption.** Squares proposed from existing code
  (Change type \`adoption\`) become accepted only when a human approves the
  Change. Observed code never redefines accepted intent by itself.
- **A5 — Fast path.** A Change whose \`semanticDiff\` is empty (\`refactor\`,
  \`repair\`) may proceed without prior human approval, under all other rules.
  A non-empty \`semanticDiff\` requires human approval before the realization
  is edited.
- **A6 — Scope expansion re-plans.** If work grows beyond the approved
  \`targets\`, stop, amend the Change (targets and semanticDiff), and re-obtain
  approval if A5 requires it.
- **A7 — Violations are reported, not absorbed.** A suspected violation of any
  commitment is recorded on the active Change (\`status.blocked\`) or in your
  final report — never silently worked around. Deliberate temporary violation
  requires a \`suspensions\` entry on the Change.
- **A8 — Overrides are labeled.** A human instruction that contradicts a
  commitment is recorded on the Change as an override with the human's stated
  reason; do not restate the override as your own conclusion.
- **A9 — Context Packs are inputs, not truth.** Act on the graph and the
  repository; a stale pack is regenerated, never hand-edited. The \`index\`
  output is derived the same way and has the same standing.

## Change lifecycle

\`draft → active → (blocked ⇄ active) → done | abandoned\`

When a Change reaches \`done\`: promote each durable \`proposedDecision\` into
the owning Square's \`decisions\` list (this is the only routine way task work
writes into a Square), resolve any answered \`unresolved\` items with a
decision recording the answer, empty the Change's \`proposedDecisions\`, and
keep the Change file as history.
`;
