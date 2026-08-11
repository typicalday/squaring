---
apiVersion: squaring/v0
kind: Change
id: add-refunds
name: Add Refunds
type: evolution
intent: >
  Add refund support to orders and payments.
targets:
  - square://orders
  - square://payments
semanticDiff:
  - "orders: refund becomes a first-class order state"
  - "payments: new refund contract"
constraints:
  - Keep the charge contract backward compatible
proposedDecisions:
  - id: refund-window
    choice: Refunds allowed within 30 days.
    rationale: Matches provider policy.
phase: active
status:
  done:
    - refund state modeled
  inProgress:
    - refund contract draft
  next:
    - wire orders to the refund contract
suspensions:
  - claim: square://orders#commitment/no-unpaid-fulfillment
    reason: >
      Refund testing in the provider sandbox requires marking orders
      fulfilled before the charge settles — a deliberate, sandbox-only
      violation of no-unpaid-fulfillment while the refund flow is built.
    until: refund contract lands (this Change reaches done)
---

Working notes: see provider sandbox quirks. Partial refunds stay out of
scope: square://orders#unresolved/partial-refunds has no accepted answer,
so this Change ships full refunds only (rule A3 — recorded, not answered).
