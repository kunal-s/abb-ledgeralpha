// Pricing data of the demo workspace: the material price reference (what the
// item master says a material costs, and what vendors invoiced month by month),
// and the sales price list actions. Workspace data only. A price linked to a
// commodity moves with it: the copper-linked purchase orders are the S-22
// scenario (docs/FRD.md §9.4).

export interface MaterialFamily {
  id: string;
  name: string;
  unit: string;
  /** price in the item master, INR per unit */
  standard: number;
  /** the vendors of this family are the ones whose name ends with this */
  vendorSuffix: string;
  /** the commodity the invoice price follows, where the purchase orders are linked to one */
  linkedTo?: string;
  /** invoice price per unit, January to September 2026 */
  prices: number[];
  /** share of a profit centre's material cost bought as this family */
  shares: Record<string, number>;
}

export const MATERIAL_FAMILIES: MaterialFamily[] = [
  {
    id: "CU", name: "Copper winding wire", unit: "kg-eq", standard: 780, vendorSuffix: "Copper Conductors Pvt Ltd", linkedTo: "Copper",
    prices: [758, 765, 771, 775, 779, 782, 783, 780, 890],
    shares: { "PC-MO-01": 0.12, "PC-MO-02": 0.24, "PC-MO-03": 0.14, "PC-EL-01": 0.1, "PC-EL-02": 0.12, "PC-PA-01": 0.06, "PC-RA-02": 0.05 },
  },
  {
    id: "ST", name: "Structural steel", unit: "kg", standard: 64.5, vendorSuffix: "Steel Fabricators Pvt Ltd",
    prices: [64.1, 64.4, 64.9, 65.2, 65, 64.8, 65.3, 65.6, 65.1],
    shares: { "PC-EL-02": 0.1, "PC-EL-03": 0.12, "PC-MO-03": 0.09, "PC-PA-01": 0.08, "PC-PA-02": 0.08, "PC-RA-01": 0.05 },
  },
  {
    id: "CA", name: "Aluminium castings", unit: "kg", standard: 248, vendorSuffix: "Castings Pvt Ltd",
    prices: [246.5, 247.2, 249.1, 250.4, 249.8, 248.6, 247.9, 249.3, 251.2],
    shares: { "PC-EL-01": 0.07, "PC-MO-01": 0.06, "PC-MO-02": 0.1, "PC-EL-03": 0.06 },
  },
  {
    id: "CB", name: "Power cable", unit: "m", standard: 188, vendorSuffix: "Cable Industries Ltd",
    prices: [187, 187.6, 188.4, 189.2, 188.8, 188.1, 187.7, 188.9, 190.4],
    shares: { "PC-EL-01": 0.08, "PC-EL-02": 0.07, "PC-PA-01": 0.06, "PC-PA-02": 0.06, "PC-MO-03": 0.05 },
  },
  {
    id: "EC", name: "Control electronics", unit: "set", standard: 41500, vendorSuffix: "Electronics Pvt Ltd",
    prices: [41200, 41350, 41600, 41800, 41700, 41450, 41300, 41650, 41900],
    shares: { "PC-MO-01": 0.1, "PC-PA-03": 0.14, "PC-RA-01": 0.12, "PC-RA-02": 0.1, "PC-PA-02": 0.05 },
  },
];

/** A change to the list price of a business unit's products, in percent from a date. */
export interface PriceAction {
  businessUnitId: string;
  effective: string;
  percent: number;
}

export const PRICE_ACTIONS: PriceAction[] = [
  { businessUnitId: "EL", effective: "2026-04-01", percent: 2.0 },
  { businessUnitId: "MO", effective: "2026-01-01", percent: 1.5 },
  { businessUnitId: "MO", effective: "2026-07-01", percent: 1.5 },
  { businessUnitId: "RA", effective: "2026-04-01", percent: 2.5 },
];

/** Revenue accounts the list price applies to: products and exports. Projects and services are not priced per unit. */
export const PRICED_REVENUE_GLS = ["410100", "410400"];
