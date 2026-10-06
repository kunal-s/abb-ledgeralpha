// Demo workspace world specification — the parameters the generator turns
// into one coherent synthetic ledger (docs/FRD.md §9.2). Workspace data only;
// names of people and parties are fictional.

import type { Person } from "@/types";
import { TENANT } from "@/config/tenant";

export interface ProfitCentreSpec {
  id: string;
  name: string;
  businessUnitId: string;
  /** share of company revenue */
  weight: number;
  /** revenue account mix */
  revenue: { gl: string; share: number }[];
  /** material cost as a share of revenue */
  materialRatio: number;
  projectBusiness: boolean;
}

export const WORLD_SPEC = {
  seed: 20261006,
  companyCode: TENANT.legalEntities[0].code,
  asOf: TENANT.currentPeriodEnd,
  /** extracts were taken the morning after period end */
  extractedAt: "2026-10-01T06:15",
  /** Central Finance go-live: earlier documents remain in the legacy ERP */
  erpGoLive: "2024-01-01",
  /** opening balances migrated into the ledger on this date */
  migrationDate: "2021-12-31",
  /** monthly P&L activity is generated from this month */
  activityFrom: "2025-01-01",
  /** company revenue per month in the current year (₹1,100 cr) */
  monthlyRevenue2026: 1_100_00_00_000,
  /** year-on-year growth applied backwards to 2025 */
  growth: 0.12,

  people: [
    { id: "P01", name: "Meera Iyer", roleId: "controller", title: "Financial Controller", userId: "MIYER" },
    { id: "P02", name: "Rohan Deshpande", roleId: "gl-accountant", title: "Senior Accountant — Procurement and Inventory", userId: "RDESHPANDE" },
    { id: "P03", name: "Kavya Menon", roleId: "gl-accountant", title: "Accountant — Fixed Assets and Advances", userId: "KMENON" },
    { id: "P04", name: "Arjun Malhotra", roleId: "gl-accountant", title: "Accountant — Provisions and Intercompany", userId: "AMALHOTRA" },
    { id: "P05", name: "Sneha Kulkarni", roleId: "gl-accountant", title: "Accountant — Statutory and Deposits", userId: "SKULKARNI" },
    { id: "P06", name: "Vikram Nair", roleId: "ar-specialist", title: "Receivables Lead", userId: "VNAIR" },
    { id: "P07", name: "Pooja Bhatt", roleId: "ar-specialist", title: "Receivables Specialist — Projects", userId: "PBHATT" },
    { id: "P08", name: "Farhan Qureshi", roleId: "treasury-analyst", title: "Treasury Analyst", userId: "FQURESHI" },
    { id: "P09", name: "Lakshmi Subramanian", roleId: "tax-specialist", title: "Tax Manager", userId: "LSUBRAMANIAN" },
    { id: "P10", name: "Nikhil Agarwal", roleId: "reporting-analyst", title: "Business Finance Analyst", userId: "NAGARWAL" },
    { id: "P11", name: "Divya Sharma", roleId: "controls-lead", title: "Internal Controls Lead", userId: "DSHARMA" },
    { id: "P12", name: "Rahul Kapoor", roleId: "external-auditor", title: "Audit Manager, statutory auditor", userId: "EXT-RKAPOOR" },
    { id: "P13", name: "Sanjay Raghavan", roleId: "head-of-finance", title: "Head of Finance", userId: "SRAGHAVAN" },
    { id: "P14", name: "Radhika Joshi", roleId: "cfo", title: "Chief Financial Officer", userId: "RJOSHI" },
  ] satisfies Person[],

  /** system users that post interface documents (not manual) */
  systemUsers: {
    billing: "BATCH_SD",
    procurement: "BATCH_MM",
    projects: "BATCH_PS",
    payroll: "BATCH_HR",
    bank: "IF_BANK",
    travel: "IF_TRAVEL",
    assets: "BATCH_AA",
    migration: "MIGRATION",
  },

  profitCentres: [
    { id: "PC-EL-01", name: "Distribution products", businessUnitId: "EL", weight: 0.13, revenue: [{ gl: "410100", share: 0.9 }, { gl: "410400", share: 0.1 }], materialRatio: 0.6, projectBusiness: false },
    { id: "PC-EL-02", name: "Power systems", businessUnitId: "EL", weight: 0.1, revenue: [{ gl: "410200", share: 0.8 }, { gl: "410300", share: 0.2 }], materialRatio: 0.64, projectBusiness: true },
    { id: "PC-EL-03", name: "Building products", businessUnitId: "EL", weight: 0.07, revenue: [{ gl: "410100", share: 1 }], materialRatio: 0.58, projectBusiness: false },
    { id: "PC-MO-01", name: "Drives", businessUnitId: "MO", weight: 0.12, revenue: [{ gl: "410100", share: 0.75 }, { gl: "410400", share: 0.25 }], materialRatio: 0.61, projectBusiness: false },
    { id: "PC-MO-02", name: "Motors", businessUnitId: "MO", weight: 0.09, revenue: [{ gl: "410100", share: 0.85 }, { gl: "410400", share: 0.15 }], materialRatio: 0.66, projectBusiness: false },
    { id: "PC-MO-03", name: "Traction", businessUnitId: "MO", weight: 0.07, revenue: [{ gl: "410200", share: 0.9 }, { gl: "410300", share: 0.1 }], materialRatio: 0.63, projectBusiness: true },
    { id: "PC-PA-01", name: "Energy industries", businessUnitId: "PA", weight: 0.09, revenue: [{ gl: "410200", share: 0.85 }, { gl: "410300", share: 0.15 }], materialRatio: 0.6, projectBusiness: true },
    { id: "PC-PA-02", name: "Process industries", businessUnitId: "PA", weight: 0.08, revenue: [{ gl: "410200", share: 0.8 }, { gl: "410300", share: 0.2 }], materialRatio: 0.59, projectBusiness: true },
    { id: "PC-PA-03", name: "Measurement", businessUnitId: "PA", weight: 0.05, revenue: [{ gl: "410100", share: 0.8 }, { gl: "410300", share: 0.2 }], materialRatio: 0.55, projectBusiness: false },
    { id: "PC-RA-01", name: "Robotics", businessUnitId: "RA", weight: 0.08, revenue: [{ gl: "410100", share: 0.7 }, { gl: "410200", share: 0.3 }], materialRatio: 0.62, projectBusiness: true },
    { id: "PC-RA-02", name: "Machine automation", businessUnitId: "RA", weight: 0.07, revenue: [{ gl: "410100", share: 0.9 }, { gl: "410400", share: 0.1 }], materialRatio: 0.6, projectBusiness: false },
    { id: "PC-RA-03", name: "Field services", businessUnitId: "RA", weight: 0.05, revenue: [{ gl: "410300", share: 1 }], materialRatio: 0.35, projectBusiness: false },
  ] satisfies ProfitCentreSpec[],

  /** company-level items (treasury, tax, interest) */
  corporateProfitCentre: { id: "PC-CORP", name: "Corporate", businessUnitId: "CORP" },

  customers: {
    count: 110,
    /** customer legal entities that hold accounts with more than one business unit */
    sharedLegalEntities: 18,
    prefixes: ["Trivant", "Agneya", "Sumera", "Kalinda", "Ruvan", "Ishana", "Vayuna", "Corvant", "Meridan", "Prakar", "Tejas", "Aranya", "Nivara", "Saket", "Vihara", "Dhruvan", "Kesari", "Oranto", "Pelvar", "Shivant"],
    sectors: [
      { name: "Steel Ltd", govt: 0.1, project: "Hot strip mill drives" },
      { name: "Metro Rail Corporation", govt: 1, project: "Traction substations" },
      { name: "Refineries Ltd", govt: 0.5, project: "Crude unit electrical package" },
      { name: "Power Generation Co", govt: 0.6, project: "Unit control system upgrade" },
      { name: "Cement Ltd", govt: 0, project: "Kiln drive replacement" },
      { name: "Water Utilities Board", govt: 1, project: "Pumping station motors" },
      { name: "Data Centres Pvt Ltd", govt: 0, project: "Campus power distribution" },
      { name: "Pharmaceuticals Ltd", govt: 0, project: "Plant automation" },
      { name: "Automotive Ltd", govt: 0, project: "Body shop robotics line" },
      { name: "Airports Ltd", govt: 0.3, project: "Terminal baggage automation" },
      { name: "Ports Trust", govt: 1, project: "Crane electrification" },
      { name: "Chemicals Ltd", govt: 0, project: "Distributed control system" },
      { name: "Railways Zone", govt: 1, project: "Loco shed traction motors" },
      { name: "Smart City SPV", govt: 1, project: "City substation network" },
      { name: "Mining Ltd", govt: 0.4, project: "Conveyor drive system" },
    ],
  },

  vendors: {
    count: 240,
    prefixes: ["Navtek", "Orvia", "Kestrel", "Sunvex", "Arvan", "Brivo", "Cendra", "Dyneer", "Elvora", "Fortis", "Galvin", "Helion", "Indus", "Jayant", "Kovar", "Lumex", "Mavro", "Nexar", "Optra", "Praxa"],
    domesticProducts: [
      { name: "Castings Pvt Ltd", expenseGl: "510100" },
      { name: "Copper Conductors Pvt Ltd", expenseGl: "510100" },
      { name: "Cable Industries Ltd", expenseGl: "510100" },
      { name: "Steel Fabricators Pvt Ltd", expenseGl: "510100" },
      { name: "Electronics Pvt Ltd", expenseGl: "510100" },
      { name: "Insulation Products Pvt Ltd", expenseGl: "510100" },
      { name: "Precision Machining Pvt Ltd", expenseGl: "510100" },
      { name: "Switchgear Components Pvt Ltd", expenseGl: "510100" },
      { name: "Packaging Pvt Ltd", expenseGl: "510100" },
      { name: "Logistics Pvt Ltd", expenseGl: "530600" },
      { name: "Engineering Services Pvt Ltd", expenseGl: "530300" },
      { name: "IT Services Pvt Ltd", expenseGl: "530900" },
      { name: "Facility Services Pvt Ltd", expenseGl: "530300" },
      { name: "Consultants LLP", expenseGl: "530500" },
      { name: "Erection Contractors Pvt Ltd", expenseGl: "510100" },
    ],
    importSuffixes: [
      { suffix: "Components GmbH", country: "DE", currency: "EUR" },
      { suffix: "Electronics AG", country: "CH", currency: "CHF" },
      { suffix: "Semiconductors Inc", country: "US", currency: "USD" },
      { suffix: "Bearings AB", country: "SE", currency: "SEK" },
      { suffix: "Magnet Co Ltd", country: "CN", currency: "CNY" },
    ],
    importShare: 0.12,
    msmeShare: 0.26,
  },

  groupCompanies: [
    { id: "GC-CH01", name: "GC Switzerland AG", country: "CH", currency: "CHF" },
    { id: "GC-DE01", name: "GC Germany GmbH", country: "DE", currency: "EUR" },
    { id: "GC-SE01", name: "GC Sweden AB", country: "SE", currency: "SEK" },
    { id: "GC-FI01", name: "GC Finland Oy", country: "FI", currency: "EUR" },
    { id: "GC-CN01", name: "GC China Ltd", country: "CN", currency: "CNY" },
    { id: "GC-US01", name: "GC USA Inc", country: "US", currency: "USD" },
  ],

  banks: ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Citibank N.A.", "Deutsche Bank AG", "HSBC"],

  projects: { count: 190 },

  /** open-item population by account (count) */
  openItems: {
    arDomestic: 1450,
    arExport: 180,
    arGroup: 70,
    retention: 260,
    unbilled: 150,
    customerAdvances: 210,
    tdsReceivable: 1150,
    apDomestic: 1750,
    apImport: 220,
    apGroup: 90,
    grirCredits: 1280,
    grirDebits: 170,
    vendorAdvances: 320,
    employeeAdvances: 230,
    deposits: 110,
    incomingClearing: 90,
    suspense: 40,
    outgoingClearing: 30,
    bankChargesClearing: 25,
    icReceivable: 70,
    icPayable: 60,
    cwip: 60,
  },

  /** FX: month-end closing rates, INR per unit, Dec-2025 … Sep-2026 */
  fx: {
    USD: [83.21, 83.05, 83.12, 83.37, 83.48, 83.29, 83.56, 83.61, 83.4, 83.4],
    EUR: [92.84, 93.21, 93.66, 94.1, 94.52, 95.07, 95.48, 96.12, 96.88, 97.5],
    CHF: [99.12, 99.48, 100.06, 100.71, 101.2, 101.94, 102.48, 103.05, 103.6, 104.12],
    SEK: [8.42, 8.47, 8.51, 8.58, 8.6, 8.66, 8.71, 8.79, 8.84, 8.91],
    CNY: [11.48, 11.46, 11.5, 11.53, 11.55, 11.51, 11.56, 11.6, 11.58, 11.62],
  } as Record<string, number[]>,
} as const;
