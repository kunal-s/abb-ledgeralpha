// Display labels for domain codes. Country-specific wording comes from the
// localisation pack so modules stay country-neutral.

import type { AccountCategory } from "@/types";
import { LOCALISATION } from "@/config/localisation";

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  grir: "GR/IR clearing",
  "vendor-adv": "Vendor advances",
  "customer-adv": "Customer advances",
  unbilled: "Unbilled revenue",
  retention: "Retention receivable",
  "tds-recv": `${LOCALISATION.taxes.withholding.label} receivable`,
  gst: `${LOCALISATION.taxes.indirect.label} input and output`,
  suspense: "Suspense and clearing",
  provisions: "Accruals and provisions",
  deposits: "Deposits",
  "statutory-dues": "Statutory dues",
  "employee-adv": "Employee advances",
  prepaid: "Prepaid expenses",
  "other-payables": "Other payables",
  cwip: "Capital work in progress",
  "fixed-assets": "Fixed assets",
  inventory: "Inventories",
  bank: "Cash and bank",
  "trade-recv": "Trade receivables",
  "trade-pay": "Trade payables",
  intercompany: "Intercompany",
  equity: "Equity",
  pl: "Profit and loss",
};

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
