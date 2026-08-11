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
    reason: Refund flow temporarily marks orders fulfilled before charge settles in the sandbox.
    until: refund contract lands (this Change reaches done)
---

Working notes: see provider sandbox quirks.
