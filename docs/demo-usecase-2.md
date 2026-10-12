# Demo use case 2: a vendor advance with no delivery

Account 151100 Advances to suppliers - Domestic. Vendor: Jayant Logistics Pvt Ltd. Advance ₹36,80,000 paid 06-May-2025.

## The story in one line
An advance has sat for 512 days with no goods received, no invoice, the vendor inactive and no bank guarantee.
The full amount is exposed, so the account owner proposes a provision and a different person approves it.

## Steps (about 5 minutes)

| # | Screen (role) | Say | Show |
|---|---|---|---|
| 1 | Balance Sheet Review > Flagged balances by age | "Vendor advances is one of the areas that takes manual effort." | Vendor advances, rule BSR-05 |
| 2 | Account 151100 > Items (Flagged) | "21 flagged items, oldest first. Each carries the rule and the recommended action." | Jayant Logistics, 512 d, Provide, 100% |
| 3 | Item screen 1500000020 | "Advance exposure: paid ₹36,80,000, nothing received, nothing invoiced, no guarantee. All ₹36,80,000 is exposed." | Advance exposure table |
| 4 | Contrast: Lumex Steel advance 1500000019 (₹1,24,36,500, 438 d) | "Same age, but a guarantee valid to 31-Dec-2026 covers it. The guarantee date is the deadline." | Cover line, then Bank Guarantees |
| 5 | Item screen, Decision (GL accountant) | "The justification is drafted from the facts. I edit it and propose." | Propose provide |
| 6 | Journals > Proposed (Financial Controller) | "Open the row: the entry, the justification and the approval chain." | Dr 531400 / Cr 149100, Approve |
| 7 | Audit Readiness > Schedules > 151100 | "The schedule for the auditor reflects the decision." | Roll-forward and ageing sheet |

## Before the demo
Settings > Reset demo. Direct link for step 3: `/balance-sheet-review/item/IN01-2025-1500000020-1`.
