---
apiVersion: squaring/v0
kind: Change
id: review-fixes
name: Repo review fixes
type: evolution
intent: >
  Land the fixes from the 2026-08-11 full-repo review: repair the drift
  between the graph and reality (npm name, publish phase), close the
  spec/implementation gaps (decision provenance, scenarios in packs, wiki
  links, binding confinement, protocol staleness, root discovery), and
  harden the identified defects.
targets:
  - square://squaring
  - square://resource-model
  - square://graph-loader
  - square://context-compiler
  - square://cli
  - square://mcp-server
  - square://agent-protocol
semanticDiff:
  - The published npm package is the unscoped `squaring`, not @typicalday/squaring — recorded by superseding square://squaring#decision/npm-public with square://squaring#decision/npm-unscoped, and by moving change://publish-v0-1 to done (the publish happened)
  - "Decisions gain an optional `from: change://<id>` provenance field; validation errors when the named Change is missing or not done (SPEC §11 error 7)"
  - Scenarios gain an optional `evidenceClass`, and Context Packs gain a Scenarios section (new section 4 of 11, SPEC §12)
  - Pack rendering fixes as one meaning change — policy commitments render with their real kind/strength plus suspensions and evidence, Change packs show `base.codeRevision`, decisions show `from` provenance, Square bodies render with `[[wiki]]` links resolved to square:// URIs, and duplicate Change targets are listed once
  - Binding globs must be repo-relative without `..`; absolute or escaping globs are validation errors (SPEC §11 error 8) and are named-and-skipped in packs
  - A squares/PROTOCOL.md that differs from the protocol shipped with the running tool version is a validation warning (SPEC §11 warning 5)
  - CLI read commands and every MCP tool discover the repository root by walking up from the working directory; `init` and `new` (CLI) still act on the working directory exactly
  - The root Square's authority.owns names aspects (product-scope, distribution, toolchain) instead of child Square ids, and binds docs/SPEC.md
phase: done
status:
  done:
    - Scaffold templates quote user-supplied names (YAML injection fixed)
    - initRepo tolerates a valid-JSON .mcp.json of the wrong shape (left untouched with a note instead of a TypeError)
    - YAML parse errors carry a file line number in diagnostics
    - A decision whose supersededBy points at itself is an error
    - MCP server refactored to createMcpServer(options) and version single-sourced from package.json
    - SPEC §6/§7/§9/§11/§12 updated to match all of the above
---

The review that produced this Change ran against the repository at commit
4182385. The non-empty semanticDiff required human approval before
realization edits (rule A5); the approval is the repository owner's
"yes proceed to fix these" reply in the review chat session, 2026-08-11.

Hardening items in status.done change no meaning — they restore behavior the
Squares already claimed (see square://cli#commitment/no-hidden-writes and
square://graph-loader) — so they are recorded as status, not semanticDiff.
