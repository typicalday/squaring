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
  concepts:
    - id: order
      name: Order
      statement: >
        A customer's purchase request, from placement through fulfillment.
      sources:
        - glob: src/orders*
          expect: annotated
    - id: line-item
      name: Line item
      statement: >
        One product and quantity inside an order — the unit a partial refund
        would have to target.
  state: [orders collection]
contracts:
  provides:
    - id: order-status
      statement: Report the current status of an order by id.
      concepts: [order]
  consumes:
    - id: charge
      from: square://payments
      statement: Charge the customer for an order total.
      concepts: [order]
commitments:
  - id: no-unpaid-fulfillment
    kind: invariant
    strength: must
    statement: An order is fulfilled only after its charge succeeds.
    evidenceClass: test
    concepts: [order]
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
    concepts: [order]
scenarios:
  - id: happy-path
    given: a cart with one item
    when: the customer places the order
    then:
      - the order is created in state pending
      - the charge contract is invoked
    concepts: [order, line-item]
unresolved:
  - id: partial-refunds
    question: Do we support partial refunds per line item?
    affects: [square://payments]
    concepts: [line-item]
authority:
  owns: [invariants, boundaries]
  delegates: [algorithms, file-structure]
---

The orders capability coordinates with [[payments]] for money movement.
