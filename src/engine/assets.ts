// The fixed asset register as a reviewer reads it (docs/FRD.md D-70): each asset's
// cost and accumulated depreciation from the start of the period to its end, its
// net book value, and the checks that set its risk for review. Deterministic; the
// register ties to the cost and accumulated depreciation accounts.

import type { FixedAsset, IsoDate } from "@/types";
import { WORLD } from "@/data";
import { daysBetween, fmtDate } from "@/lib/dates";

export type AssetRisk = "High" | "Medium" | "Low";

export const ASSET_POLICY = {
  /** physical verification is expected at least this often */
  verifyWithinDays: 730,
  /** an asset idle longer than this is an impairment indicator */
  idleDays: 365,
} as const;

export interface AssetCheck {
  id: string;
  severity: AssetRisk;
  text: string;
  /** the standard or requirement behind the check */
  basis: string;
}

export interface AssetRow {
  asset: FixedAsset;
  closingCost: number;
  closingAccDep: number;
  nbv: number;
  checks: AssetCheck[];
  risk: AssetRisk;
}

const RANK: Record<AssetRisk, number> = { High: 3, Medium: 2, Low: 1 };

export function assetChecks(a: FixedAsset, asOf: IsoDate): AssetCheck[] {
  const out: AssetCheck[] = [];
  const cost = a.openingCost + a.additions;
  const nbv = cost - a.openingAccDep - a.depreciation;
  if (a.title === "Not in company name") out.push({ id: "title", severity: "High", text: "Title deed not in the company's name", basis: "Disclosed in the notes (Schedule III) and reported by the auditor (CARO 3(i)(c))" });
  if (a.title === "Charge registered") out.push({ id: "charge", severity: "Low", text: "Charged to the banks as security", basis: "Disclose the charge in the notes" });
  if (a.usage === "Partly let out") out.push({ id: "let-out", severity: "High", text: `Part let out since ${a.usageSince ? fmtDate(a.usageSince) : "the period"}: assess whether that part is investment property`, basis: "Ind AS 40" });
  if (a.usage === "Idle" && a.usageSince && daysBetween(a.usageSince, asOf) > ASSET_POLICY.idleDays) out.push({ id: "idle", severity: "High", text: `Idle since ${fmtDate(a.usageSince)}: an impairment indicator`, basis: "Ind AS 36" });
  if (daysBetween(a.lastVerified, asOf) > ASSET_POLICY.verifyWithinDays) out.push({ id: "verify", severity: "Medium", text: `Not physically verified since ${fmtDate(a.lastVerified)}`, basis: "Physical verification at reasonable intervals (CARO 3(i)(b))" });
  if (a.accDepGl && cost > 0 && nbv <= 0 && a.usage === "In use") out.push({ id: "useful-life", severity: "Medium", text: "Fully depreciated and still in use: review the remaining useful life", basis: "Ind AS 16 (useful life reviewed at least at each year end)" });
  if (a.additions > 0) out.push({ id: "capitalised", severity: "Low", text: `Capitalised from work in progress on ${fmtDate(a.acquired)}`, basis: "Put to use" });
  return out.sort((x, y) => RANK[y.severity] - RANK[x.severity]);
}

/** The assets behind a cost account or an accumulated depreciation account, highest risk first, then largest. */
export function assetRows(gl: string, asOf: IsoDate = WORLD.asOf, assets: FixedAsset[] = WORLD.assets): AssetRow[] {
  return assets
    .filter((a) => a.gl === gl || a.accDepGl === gl)
    .map((asset) => {
      const closingCost = asset.openingCost + asset.additions;
      const closingAccDep = asset.openingAccDep + asset.depreciation;
      const checks = assetChecks(asset, asOf);
      const risk = checks.reduce<AssetRisk>((r, c) => (c.severity !== "Low" && RANK[c.severity] > RANK[r] ? c.severity : r), "Low");
      return { asset, closingCost, closingAccDep, nbv: closingCost - closingAccDep, checks, risk };
    })
    .sort((a, b) => RANK[b.risk] - RANK[a.risk] || b.closingCost - a.closingCost);
}

export interface RegisterTotals {
  count: number;
  openingCost: number;
  additions: number;
  closingCost: number;
  openingAccDep: number;
  depreciation: number;
  closingAccDep: number;
  nbv: number;
  byRisk: Record<AssetRisk, number>;
}

export function registerTotals(rows: AssetRow[]): RegisterTotals {
  const t: RegisterTotals = { count: rows.length, openingCost: 0, additions: 0, closingCost: 0, openingAccDep: 0, depreciation: 0, closingAccDep: 0, nbv: 0, byRisk: { High: 0, Medium: 0, Low: 0 } };
  for (const r of rows) {
    t.openingCost += r.asset.openingCost;
    t.additions += r.asset.additions;
    t.closingCost += r.closingCost;
    t.openingAccDep += r.asset.openingAccDep;
    t.depreciation += r.asset.depreciation;
    t.closingAccDep += r.closingAccDep;
    t.nbv += r.nbv;
    t.byRisk[r.risk] += 1;
  }
  return t;
}
