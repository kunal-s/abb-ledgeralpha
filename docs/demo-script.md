# Demo script: three use cases across the record-to-report cycle

Workspace: ABB India demo, period 30-Sep-2026. About 30 minutes: opening (2), three use cases (about 8 each), close (3), questions.
Every step uses the existing screens. The story threads menu (`/story`) holds the same paths as a fallback.

## Before you start
- Settings > Reset demo, so every item is open and nothing is decided.
- Window at 1366 x 768. Start on Home as the **controller**.
- Role switcher: controller, GL accountant, AR specialist. Each hand-off below says which one to be.
- Figures marked (check) were not read from the live app for this script. Open the screen once and confirm before presenting.

## Opening (2 minutes), Home as controller
**Say:** "Month-end is a chain: close tasks, reconciliations, review, tax, reporting, audit. Today each lives in a different tool and a spreadsheet. LedgerAlpha sits above the ERP, reads one ledger, and every module is a lens on it. Agents propose. People decide. I will show three situations a finance team meets every close."
**Show:** Home KPIs and the close status. Point out that every number drills to a document.
**Land:** One ledger, many lenses. Nothing is typed in; every figure is computed.

---

## Use case 1: The stale vendor advance
*From a flagged balance to a provision, approval and the auditor schedule. Roles: controller, GL accountant, controller.*

| # | Screen | Say | Show |
|---|---|---|---|
| 1 | Balance Sheet Review (controller) | "Before the close, the question is which balances need attention. The platform ranks flagged balances by age and value, so we start with the worst, not the first." | KPI row, flagged balances, heatmap. Seven areas take most manual effort |
| 2 | Exceptions > Vendor advances, oldest first | "Each flagged item carries the rule that flagged it. Rule results are deterministic: same data, same flag." | `Deterministic` badge, rule ID, age |
| 3 | Open the 438-day advance, ₹1,24,36,500 | "Four things in one view: no purchase order activity, the vendor is blocked, 438 days old. And a guarantee is held." | Roll-forward, process rail, audit trail |
| 4 | Bank Guarantees | "This is why it matters. The advance payment guarantee expires on 31-Dec-2026. After that, the cover is gone. Treasury and the balance sheet see the same fact." | Guarantee HDFC/BG/2025/00731, expiry |
| 5 | Back to review, open the 512-day advance, ₹36,80,000, no guarantee. Switch to **GL accountant** | "This one has no cover, the PO is closed and the vendor is inactive. The recommendation is a provision. It is a judgement, so it is labelled that way, and the confidence shows how it was built." | `Judgement` badge, confidence with each factor |
| 6 | Propose provision | "I am the account owner. I propose the provision and write the justification. It is recorded with the decision." | Decision form, justification, proposed journal |
| 7 | Try to approve as the same person | "Self-approval is blocked. This is the four-eyes rule from the workflow, not a convention." | The blocked action |
| 8 | Switch to **controller**, Journals > Proposed | "A different person reviews and approves. The entry is a proposal until approved." | Entry waiting, approval band |
| 9 | Approve | "Approved. The status changes everywhere." | Status chip on the item and in the review |
| 10 | Audit Readiness > Schedules for the advance account | "The auditor schedule already reflects the decision. No one rebuilt it for the audit." | Schedule figure equals the review figure |

**Land:** the flag, the cover, the decision, the approval and the audit evidence are one chain on one ledger.

---

## Use case 2: The unapplied receipt and the customer who says we are wrong
*From a customer statement gap to the root cause, a proposed entry and the tax credit. Roles: AR specialist, controller. Full detail in `docs/demo-usecase.md`.*

| # | Screen | Say | Show |
|---|---|---|---|
| 1 | Reconciliations > Customer statement REC-CUS-CUST-0143 (AR specialist) | "The customer replied: their balance is ₹17,53,19,183. Ours is ₹17,77,21,073. We are ₹24,01,890 apart." | Books balance, reply balance, difference |
| 2 | Apply reply and diagnose | "The reconciler looks for an exact set of items that explains the gap. It never guesses." | Two invoices found: MO/2026/01633 and MO/2026/01634 |
| 3 | Balance Sheet Review > Exceptions > Suspense and clearing | "Same cause from the balance sheet side: a ₹23,60,000 receipt in incoming payments clearing for 211 days." | Flag reason, age, amount |
| 4 | Cash Application, receipt UTR614208 | "The receipt is less than the two invoices. The gap is withholding tax at 2% and a bank charge." | Allocation table |
| 5 | Same page, arithmetic | "Invoices ₹24,01,890, less TDS ₹40,710, less bank charges ₹1,180, equals ₹23,60,000. Unexplained is nil." | Confidence 80.0% with factors, `Deterministic` |
| 6 | Proposed entry | "Dr clearing ₹23,60,000, Dr TDS receivable ₹40,710, Dr bank charges ₹1,180; Cr trade receivables ₹24,01,890. A proposal. Nothing is posted." | Journal, "clears 3 open items" |
| 7 | Confirm match | "I decide, not the platform." | Status becomes confirmed |
| 8 | Journals > Proposed (controller) | "A different person approves." | Entry waiting |
| 9 | Tax > Withholding > Expected credits | "The ₹40,710 withheld by the customer must appear in their tax statement. We now track it, so it is claimed and not forgotten." | Expected credit |
| 10 | Back to the customer statement | "The difference moved from unexplained to explained. Sign-off is no longer blocked." | Unexplained nil |
| 11 | Reporting > Working Capital | "Receivable days and unapplied cash improve, by business unit." | Unapplied cash |
| 12 | Activity Log | "Who did what, when, and why." | Events for steps 7 and 8 |

**Land:** one click from the difference to the root cause; every figure ties; the tax credit and audit trail follow from the same action.

---

## Use case 3: Quarter close, end to end
*From the close plan to reconciliations, sign-off, statements and the auditor. Roles: GL accountant, controller.*

| # | Screen | Say | Show |
|---|---|---|---|
| 1 | Close Cockpit (controller) | "The close plan is live. Tasks complete from the work itself: a sign-off or a reconciliation, not a tick box." | Critical path, late tasks, projected finish |
| 2 | Reconciliations overview (GL accountant) | "Difference by reconciliation type, in rupees: what is explained and what is still open." | Overview, exceptions |
| 3 | Control account against the sub-ledger, REC-SUB-140100 | "Manual postings with no business partner explain the difference. These are exactly what an auditor asks about." | Reconciling items by class |
| 4 | Bank, REC-BNK-181100 | "Deposits in transit, unpresented payments, and one unidentified receipt." | Items, tolerance |
| 5 | Try to sign off with an unexplained item | "Sign-off is blocked while anything is unexplained or undocumented. The control is in the product." | The blocked state and why |
| 6 | Document the item, follow up, then sign off. Switch to controller for review | "Preparer first, then a different reviewer." | Sign-off chain |
| 7 | Balance Sheet Review > Accounts | "Account status rolls up from sign-offs. Readiness is computed." | Readiness, account status |
| 8 | Close Cockpit again | "The task completed itself. The projected finish moved." | Updated plan |
| 9 | Financial Statements | "Balance sheet and P&L, from the same ledger, with the statutory ageing note." | Schedule III layout, ageing note |
| 10 | Audit Readiness > Requests | "Auditor requests are answered from schedules and sign-offs. A request cannot be marked provided until the work behind it is signed off." | Request list, progress |
| 11 | Controls and Agents | "Review evidence is collected from the work. Agents show proposals and overrides: how often people disagreed." | Blocked self-approvals, override rate |

**Land:** the close is not a checklist maintained by hand. It is the outcome of the work.

---

## Closing (3 minutes)
**Say:** "Three situations: a stale balance, a customer dispute, and the close itself. In each, the platform found the cause, showed the arithmetic, proposed the entry, and a different person approved. Nothing posted by itself. Everything is traceable. And none of this was configured in code: the rules, thresholds, roles and calendar are the workspace configuration, so the next customer is data, not a build."
**Optional:** Rules & Policies > Studio. Describe a rule in words, backtest it on the real ledger, add it, and see it flag in the review.

## Words to use and avoid
- Use: "proposes", "recommends", "you decide", "a different person approves".
- Avoid: "autonomous", "auto-posted", "posted to SAP". Journals are proposals.
- Do not quote Income-tax Act section numbers. Say "withholding on contractor payments".
- Confidence is always the sum of met factors; open the factor list if asked.

## Likely questions
- **Is anything written back to the ERP?** Not in this prototype. Journals are proposals.
- **Is the AI guessing?** Rule results and matching are deterministic. Recommendations and drafts are labelled `Judgement`, with their derivation.
- **Whose data is this?** A synthetic world; no real people or customer data.
- **How do we add our own checks?** Rule Studio: describe, backtest, add.

## Not verified
Steps in use cases 1 and 3 were composed from the story threads and the FRD, and were not click-tested. Rehearse once end to end after a reset. Use case 2 is as verified in `docs/demo-usecase.md`.
