---
apiVersion: squaring/v0
kind: Square
id: security
name: Security Policy
archetype: policy
purpose: >
  Cross-cutting security commitments that bind every square.
commitments:
  - id: no-secrets-in-logs
    kind: boundary
    strength: must-not
    statement: Secrets and credentials never appear in logs.
    appliesTo: "*"
  - id: pci-scope
    kind: constraint
    strength: must
    statement: Card data handling stays inside the payments square.
    appliesTo:
      - square://payments
authority:
  owns: [security-policy]
---
