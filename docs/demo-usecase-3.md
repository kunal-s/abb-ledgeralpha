# Demo use case 3: tax deducted by customers but not credited

TDS receivable (account 161100). Customer: Kalinda Ports Trust. Deduction ₹16,70,136 on 12-Apr-2026, credited ₹8,19,001.

## The story in one line
Customers deducted ₹10.12 cr of TDS from our receipts. ₹83.6 lakh across 88 deductions is short, missing or in the wrong quarter in the tax statement.
The largest customer exposure is Kalinda Ports Trust: three short credits, ₹8,51,135 not received on one deduction alone.

## Steps (about 5 minutes)

| # | Screen (role) | Say | Show |
|---|---|---|---|
| 1 | TDS > Overview (Financial Controller) | "₹10.12 cr deducted, ₹5.27 cr matched to the statement, ₹83.6 lakh at risk." | KPI row |
| 2 | Statement check by tax-year quarter | "Q1 FY2026-27 has 20 short credits and 17 missing. Q2 is not yet in the statement, so nothing is judged." | Quarter table |
| 3 | Credits at risk by age, customers with the most at risk | "Most is under six months, so it can still be claimed. One item is past the 3-year window." | Age table, customer table |
| 4 | TDS > Receivable, short, missing or wrong quarter, customer Kalinda | "Three deductions, all short." | Deducted against credited |
| 5 | Item screen 1400000849 | "Deducted ₹16,70,136, statement credits ₹8,19,001, credit not received ₹8,51,135. Claim window: 0 of 3 years used." | Tax credit position |
| 6 | Same screen, Evidence (preparer) | "Ask the customer for the deduction certificate or a corrected statement." | Follow-up draft, Request follow-up |
| 7 | Same screen, Decision | "If the customer does not respond, the credit is provided or written off; past the window this needs tax review." | Decision form, approval chain |
| 8 | Journals > Proposed (Financial Controller) | "The approver sees the entry and the justification." | Expanded row |

## Before the demo
Settings > Reset demo. Direct link for step 5: `/balance-sheet-review/item/IN01-2026-1400000849-2`.
