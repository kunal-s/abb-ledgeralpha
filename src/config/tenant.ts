// Workspace (tenant) configuration - the only place a customer is described.
// Modules read from here; nothing in a page or component names a customer.
// The demo workspace is configured for the ABB India workshop (docs/FRD.md §8–§9).

import type { ModuleId } from "@/lib/modules";

export interface TenantConfig {
  workspace: string;
  legalEntities: { code: string; name: string; currency: string }[];
  businessUnits: { id: string; name: string }[];
  /** fiscal year start month (1 = January) and how the year is labelled */
  fiscalYear: { startMonth: number; prefix: string };
  /** the period the workspace is looking at, and the last completed review */
  currentPeriodEnd: string;
  priorReviewDate: string;
  sourceSystems: string[];
  dataMode: "demo" | "masked" | "live";
  enabledModules: "all" | ModuleId[];
}

export const TENANT: TenantConfig = {
  workspace: "ABB India Limited",
  legalEntities: [{ code: "IN01", name: "ABB India Limited", currency: "INR" }],
  businessUnits: [
    { id: "EL", name: "Electrification" },
    { id: "MO", name: "Motion" },
    { id: "PA", name: "Process Automation" },
    { id: "RA", name: "Robotics & Discrete Automation" },
  ],
  fiscalYear: { startMonth: 1, prefix: "CY" },
  currentPeriodEnd: "2026-09-30",
  priorReviewDate: "2026-06-30",
  sourceSystems: ["SAP Central Finance", "Legacy SAP", "Snowflake"],
  dataMode: "demo",
  enabledModules: "all",
};
