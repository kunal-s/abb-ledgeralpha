# Demo routes: three flows

Start: `npm run dev`, open http://localhost:5180. Before each run: Settings > Reset demo.
Role switcher is top right. Sidebar paths are in bold.

## Flow 1: Customer says we owe less (Kalinda Metro Rail, ₹24,01,890)
Role: Receivables Specialist.

| # | Go to | Do | Land on |
|---|---|---|---|
| 1 | **Reconciliations** > Customer statement, or `/reconciliations/REC-CUS-CUST-0143` | Open Kalinda Metro Rail | Books ₹17,77,21,073 vs reply ₹17,53,19,183 |
| 2 | Same page | Click **Apply reply and diagnose** | Statement shows one item, difference explained |
| 3 | Reconciling items | Click the row | Receipt arithmetic: invoices, less TDS, less bank charges |
| 4 | Row link **Apply in Cash Application** | Open | `/cash-application/IN01-2026-1400004449-2`, proposed entry |
| 5 | Same page | Click **Confirm match** | Entry proposed, nothing posted |
| 6 | Role: Financial Controller, **Journals** > Proposed | Expand the row, Approve | Entry and approval chain |

## Flow 2: Vendor advance with no delivery (Jayant Logistics, ₹36,80,000)
Roles: GL Accountant, then Financial Controller.

| # | Go to | Do | Land on |
|---|---|---|---|
| 1 | **Balance Sheet Review** > Exceptions, or `/balance-sheet-review?tab=exceptions&category=vendor-adv&show=all` | Find Jayant Logistics, 512 d | Rule BSR-05, Provide |
| 2 | Click the row, or `/balance-sheet-review/item/IN01-2025-1500000020-1` | Read Advance exposure | Paid, received, invoiced, guarantee, exposure |
| 3 | Contrast: `/balance-sheet-review/item/IN01-2025-1500000019-1` | Lumex Steel | Covered by a guarantee to 31-Dec-2026 |
| 4 | Item screen, Decision | Review the drafted justification, **Propose provide** | Waiting on Financial Controller |
| 5 | Role: Financial Controller, **Journals** > Proposed | Expand the row, Approve | Dr 531400, Cr 149100 |
| 6 | **Audit Readiness** > Schedules, or `/audit-readiness?tab=schedules&sched=151100` | Open 151100 | Schedule for the auditor |

Shortcut: Walkthrough button (top bar) > "The stale vendor advance".

## Flow 3: Tax deducted but not credited (Kalinda Ports Trust, ₹8,51,135)
Roles: Financial Controller, then Tax Specialist or GL Accountant.

| # | Go to | Do | Land on |
|---|---|---|---|
| 1 | **Tax** > TDS, or `/tax/withholding` | Read the KPI row | ₹10.12 cr deducted, ₹83.6 lakh at risk |
| 2 | Same page, scroll | Quarter table, age table | Q1 FY2026-27 has the most short and missing |
| 3 | Customers with the most at risk | Click Kalinda Ports Trust | `/tax/withholding?tab=receivable&tstatus=at-risk&tq=Kalinda%20Ports` |
| 4 | Click document 1400000849 | Open | `/balance-sheet-review/item/IN01-2026-1400000849-2` |
| 5 | Tax credit position | Read it | Deducted ₹16,70,136, credited ₹8,19,001, short ₹8,51,135 |
| 6 | Same page, Evidence | **Request follow-up** | Customer asked for the certificate |
| 7 | **Journals** > Proposed | Only after a provision or write-off is proposed | Entry and approval |

## Notes
- Nothing is posted from the platform. Approved entries are exported as a proposal file.
- Not yet clicked through: flow 1 steps 2, 5 and 6, flow 2 Approve, flow 3 steps 6 and 7. Run them once before presenting.
