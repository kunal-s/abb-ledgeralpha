// Localisation pack — India (docs/FRD.md §7). Country-specific behaviour lives
// here so modules stay country-neutral: currency and number format, the
// statutory tax year, tax regimes, statutory statement format and the
// disclosure ageing bands.

export const LOCALISATION_IN = {
  country: "IN",
  currency: "INR",
  currencySymbol: "₹",
  numberLocale: "en-IN",
  /** income-tax year (TDS, Form 26AS) — April to March, regardless of the company's fiscal year */
  statutoryTaxYearStartMonth: 4,
  gaap: "Ind AS",
  financialStatementsFormat: "Schedule III, Division II",
  taxes: {
    indirect: { label: "GST", name: "Goods and Services Tax" },
    withholding: { label: "TDS", name: "Tax Deducted at Source" },
  },
  /** Schedule III ageing bands for disclosure notes (in months) */
  disclosureAgeing: {
    tradeReceivables: [
      { label: "Less than 6 months", maxMonths: 6 },
      { label: "6 months – 1 year", maxMonths: 12 },
      { label: "1–2 years", maxMonths: 24 },
      { label: "2–3 years", maxMonths: 36 },
      { label: "More than 3 years", maxMonths: null },
    ],
    tradePayablesAndCwip: [
      { label: "Less than 1 year", maxMonths: 12 },
      { label: "1–2 years", maxMonths: 24 },
      { label: "2–3 years", maxMonths: 36 },
      { label: "More than 3 years", maxMonths: null },
    ],
  },
} as const;

/** The active pack. One pack per workspace in this prototype. */
export const LOCALISATION = LOCALISATION_IN;
