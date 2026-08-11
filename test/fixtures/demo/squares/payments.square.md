---
apiVersion: squaring/v0
kind: Square
id: payments
name: Payments
archetype: capability
purpose: >
  Move money for orders through the payment provider.
nonGoals:
  - Order lifecycle management
contracts:
  provides:
    - id: charge
      statement: Charge a customer a given amount; returns success or a typed failure.
      schemaRef: src/payments/charge.schema.json
commitments:
  - id: idempotent-charge
    kind: invariant
    strength: must
    statement: Charging the same order twice moves money at most once.
    evidenceClass: test
authority:
  owns: [invariants]
  delegates: [provider-choice]
---

Payments is the only square allowed to talk to the provider.
