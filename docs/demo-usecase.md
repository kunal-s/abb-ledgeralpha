# Demo use case: the customer says we owe less than our books show

Audience: finance (controller, AR, GL). No new screens or logic; every step uses the existing UI.
Customer: Kalinda Metro Rail Corporation. Books at 30-Sep-2026: ₹17,77,21,073 Dr.

## The story in one line
The customer's statement is ₹24,01,890 lower than our books. The cause is one receipt of ₹23,60,000
sitting in clearing since 03-Mar-2026 that was never applied to two invoices. Apply it, and the difference is nil.

## Steps (about 5 minutes)

| # | Screen (role) | Say | Show |
|---|---|---|---|
| 1 | Reconciliations > Customer statement REC-CUS-CUST-0143 (AR specialist) | "Customer replied: their balance is ₹17,53,19,183. Ours is ₹17,77,21,073. We are ₹24,01,890 apart." | Balance per books, balance per reply, difference |
| 2 | Same page, **Apply reply and diagnose** | "The reconciler looks for an exact set of items that explains the gap. It does not guess." | It finds the two invoices MO/2026/01633 and MO/2026/01634 |
| 3 | Balance Sheet Review > Exceptions > Suspense and clearing (open item 1400004449) | "Same cause seen from the balance sheet: a ₹23,60,000 receipt parked in Incoming payments clearing for 211 days, flagged by BSR-10." | Flag reason, age, amount |
| 4 | Cash Application > receipt UTR614208 | "The receipt is less than the two invoices. The gap is TDS at 2% and a bank charge." | Receipt allocation and the line-by-line table below |
| 5 | Same page, arithmetic | "Invoices ₹24,01,890, less TDS ₹40,710, less bank charges ₹1,180, equals ₹23,60,000. Difference nil." | Confidence 80.0% with each factor listed; method badge Deterministic |
| 6 | Same page, **Proposed entry** | "Dr clearing ₹23,60,000, Dr TDS receivable ₹40,710, Dr bank charges ₹1,180; Cr trade receivables ₹24,01,890. A proposal; nothing is posted." | The journal and "clears 3 open items" |
| 7 | **Confirm match** (AR specialist) | "I decide, not the platform." | Status changes to confirmed |
| 8 | Journals > Proposed (controller) | "A different person approves. Self-approval is blocked." | Entry waiting for approval |
| 9 | Tax > Withholding > Expected credits | "The ₹40,710 deducted must show in the customer's tax statement. We now track it." | Expected TDS credit |
| 10 | Back to the customer statement | "Difference moves from unexplained to explained." | Unexplained at nil, sign-off unblocked |
| 11 | Reporting > Working capital | "Receivable days and unapplied cash improve." | Unapplied cash by business unit |
| 12 | Activity | "Who did what, when, and why, all logged." | Events for steps 7 and 8 |

## Points to land
- Root cause in one click from the difference, not a spreadsheet hunt.
- Every figure ties: ₹24,01,890 difference = invoices on the receipt.
- The platform proposes; the accountant confirms; the controller approves.
- The tax credit and the audit trail follow from the same action.

## Before the demo
- Settings > Reset demo, so the receipt is unapplied and the reply is not yet applied.
- Open `/story` threads menu: the same path exists as "The unapplied receipt".
- Direct links: `/reconciliations/REC-CUS-CUST-0143`, `/cash-application/IN01-2026-1400004449-2`.

## Not verified
Steps 2, 7, 8 and 10 (clicking through the actions) were not run in this check; steps 1, 3 to 6 figures were read from the live app.
