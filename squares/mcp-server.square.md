---
apiVersion: squaring/v0
kind: Square
id: mcp-server
name: MCP Server
archetype: boundary
partOf: squaring
purpose: >
  The agent face of Squaring: an MCP server on stdio (`squaring mcp`)
  exposing list_squares, get_square, get_change, get_graph, validate,
  context_pack, scaffold_square, scaffold_change, and get_protocol.
nonGoals:
  - A write API for Squares/Changes — agents edit the files directly and re-validate
  - Transports other than stdio in v0.1
contracts:
  consumes:
    - id: graph
      from: square://graph-loader
      statement: Every tool call reloads the graph from the process working directory.
    - id: packs
      from: square://context-compiler
      statement: context_pack returns the compiled pack verbatim.
commitments:
  - id: stdout-is-protocol
    kind: boundary
    strength: must-not
    statement: >
      Nothing but MCP protocol bytes is ever written to stdout; logs go to
      stderr.
  - id: fresh-load-per-call
    kind: invariant
    strength: must
    statement: >
      Every tool call operates on a freshly loaded graph — the server holds
      no cached graph state between calls.
  - id: errors-as-results
    kind: invariant
    strength: must
    statement: >
      Handled failures return isError results with the message, so the agent
      sees what went wrong instead of a dropped connection.
relationships:
  - type: dependsOn
    target: square://graph-loader
    through: graph
  - type: dependsOn
    target: square://context-compiler
    through: packs
  - type: usesExternal
    target: external://mcp-sdk
authority:
  owns: [tool-surface]
  delegates: [tool-description-wording]
bindings:
  - src/mcp.ts
---

Registered in a repository's `.mcp.json` by `squaring init`. Tool table:
`docs/SPEC.md` §13.
