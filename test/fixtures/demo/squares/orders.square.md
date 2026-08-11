---
apiVersion: squaring/v0
kind: Square
id: orders
name: Orders
archetype: capability
purpose: >
  Accept and track customer orders from placement to fulfillment.
nonGoals:
  - Payment processing (delegated to payments)
owns:
  concepts: [order, line item]
  state: [orders collection]
contracts:
  provides:
    - id: order-status
      statement: Report the current status of an order by id.
  consumes:
    - id: charge
      from: square://payments
      statement: Charge the customer for an order total.
commitments:
  - id: no-unpaid-fulfillment
    kind: invariant
    strength: must
    statement: An order is fulfilled only after its charge succeeds.
    evidenceClass: test
  - id: no-direct-card-data
    kind: boundary
    strength: must-not
    statement: Orders never stores or logs raw card data.
relationships:
  - type: dependsOn
    target: square://payments
    through: charge
decisions:
  - id: single-currency
    date: 2026-01-15
    choice: All order totals are USD.
    rationale: Only market served at launch.
scenarios:
  - id: happy-path
    given: a cart with one item
    when: the customer places the order
    then:
      - the order is created in state pending
      - the charge contract is invoked
unresolved:
  - id: partial-refunds
    question: Do we support partial refunds per line item?
    affects: [square://payments]
authority:
  owns: [invariants, boundaries]
  delegates: [algorithms, file-structure]
bindings:
  - src/orders*
---

The orders capability coordinates with [[payments]] for money movement.
