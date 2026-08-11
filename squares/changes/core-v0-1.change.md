---
apiVersion: squaring/v0
kind: Change
id: core-v0-1
name: Core v0.1 build
type: evolution
intent: >
  Stand up Squaring itself: the resource model, graph loader/validator,
  Context Pack compiler, CLI, MCP server, and agent protocol — and square
  this repository with them.
targets:
  - square://squaring
semanticDiff:
  - Squares and Changes exist as strict-schema Markdown/YAML files (squares/*.square.md, squares/changes/*.change.md)
  - Referential integrity is validated across the whole graph (SPEC §11)
  - Context Packs compile deterministically with edges-first ordering (SPEC §12)
  - Agents get an MCP server and a protocol (A1–A9) governing how they work in squared repositories
phase: done
status:
  done:
    - resource model (schemas, URI grammar)
    - graph loader + validator
    - context pack compiler
    - CLI (init, validate, list, show, graph, context, protocol, new, mcp)
    - MCP server (9 tools)
    - test suite incl. self-validation of this repository
---

The durable decisions from this build were promoted into
square://squaring#decision/typescript-esm,
square://squaring#decision/one-core-two-faces,
square://squaring#decision/plain-file-authoring, and
square://squaring#decision/v0-scope-cut. Open questions stayed in the root
Square's `unresolved` list. v0.2 (SquareStatus/Evidence via owenloop) will be
its own Change.
