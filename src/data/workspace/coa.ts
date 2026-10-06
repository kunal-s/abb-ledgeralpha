// Demo workspace chart of accounts, mapped to Schedule III (Division II)
// statement lines. Workspace data, not product code: another workspace brings
// its own chart through the GL master load.

import type { AccountCategory, GlAccount, Nature, ReviewFrequency, RiskTier } from "@/types";

interface CategoryDefaults {
  statementLine: string;
  nature: Nature;
  normalBalance: "Dr" | "Cr";
  openItemManaged: boolean;
  reconAccount?: boolean;
  ownerId: string;
  riskTier: RiskTier;
  reviewFrequency: ReviewFrequency;
}

const D: Record<AccountCategory, CategoryDefaults> = {
  grir: { statementLine: "Trade payables", nature: "Liability", normalBalance: "Cr", openItemManaged: true, ownerId: "P02", riskTier: "High", reviewFrequency: "Quarterly" },
  "vendor-adv": { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P03", riskTier: "High", reviewFrequency: "Quarterly" },
  "customer-adv": { statementLine: "Other current liabilities", nature: "Liability", normalBalance: "Cr", openItemManaged: true, ownerId: "P06", riskTier: "High", reviewFrequency: "Quarterly" },
  unbilled: { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P07", riskTier: "High", reviewFrequency: "Quarterly" },
  retention: { statementLine: "Trade receivables", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P07", riskTier: "High", reviewFrequency: "Quarterly" },
  "tds-recv": { statementLine: "Current tax assets (net)", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P07", riskTier: "High", reviewFrequency: "Quarterly" },
  gst: { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: false, ownerId: "P05", riskTier: "Medium", reviewFrequency: "Monthly" },
  suspense: { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P08", riskTier: "High", reviewFrequency: "Monthly" },
  provisions: { statementLine: "Provisions", nature: "Liability", normalBalance: "Cr", openItemManaged: false, ownerId: "P04", riskTier: "Medium", reviewFrequency: "Quarterly" },
  deposits: { statementLine: "Other financial assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P05", riskTier: "Medium", reviewFrequency: "Quarterly" },
  "statutory-dues": { statementLine: "Other current liabilities", nature: "Liability", normalBalance: "Cr", openItemManaged: true, ownerId: "P05", riskTier: "Medium", reviewFrequency: "Monthly" },
  "employee-adv": { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P05", riskTier: "Low", reviewFrequency: "Quarterly" },
  prepaid: { statementLine: "Other current assets", nature: "Asset", normalBalance: "Dr", openItemManaged: false, ownerId: "P05", riskTier: "Low", reviewFrequency: "Quarterly" },
  "other-payables": { statementLine: "Other financial liabilities", nature: "Liability", normalBalance: "Cr", openItemManaged: true, ownerId: "P03", riskTier: "Medium", reviewFrequency: "Quarterly" },
  cwip: { statementLine: "Capital work-in-progress", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P03", riskTier: "Medium", reviewFrequency: "Quarterly" },
  "fixed-assets": { statementLine: "Property, plant and equipment", nature: "Asset", normalBalance: "Dr", openItemManaged: false, ownerId: "P03", riskTier: "Low", reviewFrequency: "Annual" },
  inventory: { statementLine: "Inventories", nature: "Asset", normalBalance: "Dr", openItemManaged: false, ownerId: "P02", riskTier: "Medium", reviewFrequency: "Monthly" },
  bank: { statementLine: "Cash and cash equivalents", nature: "Asset", normalBalance: "Dr", openItemManaged: false, ownerId: "P08", riskTier: "Medium", reviewFrequency: "Monthly" },
  "trade-recv": { statementLine: "Trade receivables", nature: "Asset", normalBalance: "Dr", openItemManaged: true, reconAccount: true, ownerId: "P06", riskTier: "Medium", reviewFrequency: "Monthly" },
  "trade-pay": { statementLine: "Trade payables", nature: "Liability", normalBalance: "Cr", openItemManaged: true, reconAccount: true, ownerId: "P02", riskTier: "Medium", reviewFrequency: "Monthly" },
  intercompany: { statementLine: "Other financial assets", nature: "Asset", normalBalance: "Dr", openItemManaged: true, ownerId: "P04", riskTier: "Medium", reviewFrequency: "Quarterly" },
  equity: { statementLine: "Other equity", nature: "Equity", normalBalance: "Cr", openItemManaged: false, ownerId: "P01", riskTier: "Low", reviewFrequency: "Annual" },
  pl: { statementLine: "Other expenses", nature: "Expense", normalBalance: "Dr", openItemManaged: false, ownerId: "P04", riskTier: "Low", reviewFrequency: "Monthly" },
};

type Row = [gl: string, description: string, category: AccountCategory, overrides?: Partial<CategoryDefaults>];

const INCOME = (statementLine: string): Partial<CategoryDefaults> => ({ statementLine, nature: "Income", normalBalance: "Cr", ownerId: "P10" });
const EXPENSE = (statementLine: string): Partial<CategoryDefaults> => ({ statementLine, nature: "Expense", normalBalance: "Dr" });
const CONTRA: Partial<CategoryDefaults> = { normalBalance: "Cr" };

const ROWS: Row[] = [
  // Property, plant and equipment
  ["110100", "Land", "fixed-assets"],
  ["110200", "Buildings", "fixed-assets"],
  ["110300", "Plant and machinery", "fixed-assets"],
  ["110400", "Furniture and fixtures", "fixed-assets"],
  ["110500", "Vehicles", "fixed-assets"],
  ["110600", "Computers and IT equipment", "fixed-assets"],
  ["119200", "Accumulated depreciation - Buildings", "fixed-assets", CONTRA],
  ["119300", "Accumulated depreciation - Plant and machinery", "fixed-assets", CONTRA],
  ["119600", "Accumulated depreciation - IT equipment", "fixed-assets", CONTRA],
  ["120100", "Capital work in progress - Buildings", "cwip"],
  ["120200", "Capital work in progress - Plant and machinery", "cwip"],
  ["125100", "Software", "fixed-assets", { statementLine: "Other intangible assets" }],
  // Inventories
  ["130100", "Raw materials and components", "inventory"],
  ["130200", "Work in progress", "inventory"],
  ["130300", "Finished goods", "inventory"],
  ["130400", "Stores and spares", "inventory"],
  ["130500", "Goods in transit", "inventory"],
  // Receivables
  ["140100", "Trade receivables - Domestic", "trade-recv"],
  ["140200", "Trade receivables - Export", "trade-recv"],
  ["140300", "Trade receivables - Group companies", "trade-recv"],
  ["149100", "Allowance for expected credit loss", "trade-recv", { normalBalance: "Cr", openItemManaged: false, reconAccount: false }],
  ["141100", "Unbilled revenue - Projects", "unbilled"],
  ["141200", "Unbilled revenue - Service contracts", "unbilled"],
  ["142100", "Retention money receivable", "retention"],
  // Advances and other assets
  ["151100", "Advances to suppliers - Domestic", "vendor-adv"],
  ["151200", "Advances to suppliers - Import", "vendor-adv"],
  ["151300", "Capital advances", "vendor-adv", { statementLine: "Other non-current assets" }],
  ["152100", "Employee advances - Travel", "employee-adv"],
  ["152200", "Employee advances - Salary", "employee-adv"],
  ["153100", "Security deposits - Premises", "deposits"],
  ["153200", "Earnest money and tender deposits", "deposits"],
  ["153300", "Deposits with government authorities", "deposits"],
  ["161100", "TDS receivable - Customer deductions", "tds-recv"],
  ["161200", "TDS receivable - Bank interest", "tds-recv"],
  ["162100", "GST input - CGST", "gst"],
  ["162200", "GST input - SGST", "gst"],
  ["162300", "GST input - IGST", "gst"],
  ["162400", "GST TDS receivable", "gst", { openItemManaged: true }],
  ["163100", "Prepaid expenses", "prepaid"],
  ["164100", "Receivable from group companies", "intercompany"],
  // Suspense and clearing
  ["171100", "Suspense - Unidentified postings", "suspense"],
  ["171200", "Incoming payments clearing", "suspense"],
  ["171300", "Outgoing payments clearing", "suspense", { nature: "Liability", normalBalance: "Cr" }],
  ["171400", "Bank charges clearing", "suspense"],
  ["171500", "Inter-bank transfers clearing", "suspense"],
  // Cash and bank
  ["181100", "HDFC Bank - Collections", "bank"],
  ["181200", "ICICI Bank - Payments", "bank"],
  ["181300", "State Bank of India - Current", "bank"],
  ["181400", "Citibank - EEFC USD", "bank"],
  ["182100", "Cash on hand", "bank"],
  // Payables and liabilities
  ["210100", "Trade payables - Domestic", "trade-pay"],
  ["210200", "Trade payables - Import", "trade-pay"],
  ["210300", "Trade payables - Group companies", "trade-pay"],
  ["211300", "GR/IR clearing - Materials", "grir"],
  ["211400", "GR/IR clearing - Services", "grir"],
  ["211500", "GR/IR clearing - Capital goods", "grir"],
  ["221100", "Advances from customers - Projects", "customer-adv"],
  ["221200", "Advances from customers - Products", "customer-adv"],
  ["222100", "Billing in excess of revenue", "customer-adv"],
  ["231100", "Provision for warranty", "provisions"],
  ["231200", "Provision for liquidated damages", "provisions"],
  ["231300", "Provision for onerous contracts", "provisions"],
  ["231400", "Provision for gratuity", "provisions"],
  ["231500", "Provision for leave encashment", "provisions"],
  ["232100", "Accrued expenses - Services", "provisions", { statementLine: "Other financial liabilities" }],
  ["232200", "Accrued freight", "provisions", { statementLine: "Other financial liabilities" }],
  ["241100", "TDS payable - Contracts", "statutory-dues"],
  ["241200", "TDS payable - Professional fees", "statutory-dues"],
  ["241300", "TDS payable - Salaries", "statutory-dues"],
  ["241400", "GST output - CGST", "gst", { statementLine: "Other current liabilities", nature: "Liability", normalBalance: "Cr" }],
  ["241500", "GST output - SGST", "gst", { statementLine: "Other current liabilities", nature: "Liability", normalBalance: "Cr" }],
  ["241600", "GST output - IGST", "gst", { statementLine: "Other current liabilities", nature: "Liability", normalBalance: "Cr" }],
  ["241700", "Provident fund and ESI payable", "statutory-dues"],
  ["241900", "Provision for income tax (net)", "provisions", { statementLine: "Current tax liabilities (net)" }],
  ["251100", "Payable to group companies", "intercompany", { statementLine: "Other financial liabilities", nature: "Liability", normalBalance: "Cr" }],
  ["261100", "Salaries payable", "other-payables", { openItemManaged: false }],
  ["261200", "Capital creditors", "other-payables"],
  // Equity
  ["310100", "Equity share capital", "equity", { statementLine: "Equity share capital" }],
  ["320100", "Retained earnings", "equity"],
  ["320200", "General reserve", "equity"],
  // Income
  ["410100", "Revenue - Products", "pl", INCOME("Revenue from operations")],
  ["410200", "Revenue - Projects", "pl", INCOME("Revenue from operations")],
  ["410300", "Revenue - Services", "pl", INCOME("Revenue from operations")],
  ["410400", "Revenue - Exports", "pl", INCOME("Revenue from operations")],
  ["450100", "Scrap sales", "pl", INCOME("Revenue from operations")],
  ["461100", "Interest income", "pl", INCOME("Other income")],
  ["461500", "Liabilities no longer required written back", "pl", INCOME("Other income")],
  ["462100", "Exchange gain (net)", "pl", INCOME("Other income")],
  // Expenses
  ["510100", "Cost of materials consumed", "pl", EXPENSE("Cost of materials consumed")],
  ["510200", "Purchases of traded goods", "pl", EXPENSE("Purchases of stock-in-trade")],
  ["510400", "Changes in inventories", "pl", EXPENSE("Changes in inventories")],
  ["520100", "Salaries and wages", "pl", EXPENSE("Employee benefits expense")],
  ["520200", "Contribution to provident fund", "pl", EXPENSE("Employee benefits expense")],
  ["520300", "Gratuity and leave encashment", "pl", EXPENSE("Employee benefits expense")],
  ["520400", "Staff welfare", "pl", EXPENSE("Employee benefits expense")],
  ["530100", "Power and fuel", "pl", EXPENSE("Other expenses")],
  ["530200", "Rent", "pl", EXPENSE("Other expenses")],
  ["530300", "Repairs and maintenance", "pl", EXPENSE("Other expenses")],
  ["530400", "Travel and conveyance", "pl", EXPENSE("Other expenses")],
  ["530500", "Legal and professional fees", "pl", EXPENSE("Other expenses")],
  ["530600", "Freight outward", "pl", EXPENSE("Other expenses")],
  ["530700", "Commission on sales", "pl", EXPENSE("Other expenses")],
  ["530800", "Royalty and trademark fees", "pl", EXPENSE("Other expenses")],
  ["530900", "IT and support services", "pl", EXPENSE("Other expenses")],
  ["531000", "Insurance", "pl", EXPENSE("Other expenses")],
  ["531100", "Bank charges", "pl", EXPENSE("Other expenses")],
  ["531200", "Warranty expense", "pl", EXPENSE("Other expenses")],
  ["531300", "Liquidated damages", "pl", EXPENSE("Other expenses")],
  ["531400", "Provision for expected credit loss", "pl", EXPENSE("Other expenses")],
  ["531500", "Bad debts written off", "pl", EXPENSE("Other expenses")],
  ["531600", "CSR expenditure", "pl", EXPENSE("Other expenses")],
  ["531700", "Exchange loss (net)", "pl", EXPENSE("Other expenses")],
  ["531900", "Miscellaneous expenses", "pl", EXPENSE("Other expenses")],
  ["540100", "Depreciation and amortisation", "pl", EXPENSE("Depreciation and amortisation expense")],
  ["550100", "Current tax", "pl", EXPENSE("Tax expense")],
];

/** Every BS account is reviewed by the controller; P&L accounts by the reporting analyst's lead. */
export function buildChartOfAccounts(): GlAccount[] {
  return ROWS.map(([gl, description, category, o]) => {
    const d = { ...D[category], ...o };
    return {
      gl,
      description,
      category,
      statementLine: d.statementLine,
      nature: d.nature,
      normalBalance: d.normalBalance,
      openItemManaged: d.openItemManaged,
      reconAccount: d.reconAccount ?? false,
      ownerId: d.ownerId,
      // the controller's own accounts are reviewed by the Head of Finance (four-eyes)
      reviewerId: d.ownerId === "P01" ? "P13" : "P01",
      riskTier: d.riskTier,
      reviewFrequency: d.reviewFrequency,
    };
  });
}

/** Statement lines in presentation order (Schedule III, Division II). */
export const STATEMENT_LINES = {
  balanceSheet: [
    "Property, plant and equipment",
    "Capital work-in-progress",
    "Other intangible assets",
    "Other non-current assets",
    "Inventories",
    "Trade receivables",
    "Cash and cash equivalents",
    "Other financial assets",
    "Current tax assets (net)",
    "Other current assets",
    "Equity share capital",
    "Other equity",
    "Trade payables",
    "Other financial liabilities",
    "Other current liabilities",
    "Provisions",
    "Current tax liabilities (net)",
  ],
  profitAndLoss: [
    "Revenue from operations",
    "Other income",
    "Cost of materials consumed",
    "Purchases of stock-in-trade",
    "Changes in inventories",
    "Employee benefits expense",
    "Depreciation and amortisation expense",
    "Other expenses",
    "Tax expense",
  ],
} as const;
