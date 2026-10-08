// Module registry - the product's information architecture (docs/FRD.md §3).
// Drives routes and the sidebar. Which modules a workspace sees is tenant
// configuration (src/config/tenant.ts), never a code change.

import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Bot,
  CalendarCheck,
  Coins,
  Database,
  FileCheck2,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Network,
  Percent,
  Receipt,
  Scale,
  ScanSearch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LOCALISATION } from "@/config/localisation";
import { TENANT } from "@/config/tenant";

export type ModuleGroup =
  | "Close"
  | "Reconcile & review"
  | "Treasury"
  | "Tax"
  | "Reporting"
  | "Audit & controls"
  | "Automation & data";

export const NAV_GROUPS: ModuleGroup[] = [
  "Reconcile & review",
  "Close",
  "Treasury",
  "Tax",
  "Reporting",
  "Audit & controls",
  "Automation & data",
];

export type ModuleId =
  | "home"
  | "my-work"
  | "close"
  | "journals"
  | "intercompany"
  | "balance-sheet-review"
  | "reconciliations"
  | "cash-application"
  | "bank-guarantees"
  | "fx-exposure"
  | "indirect-tax"
  | "withholding-tax"
  | "financial-statements"
  | "management-reporting"
  | "variance-analysis"
  | "working-capital"
  | "audit-readiness"
  | "controls"
  | "agents"
  | "rules-policies"
  | "data-sources"
  | "activity-log"
  | "settings";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  path: string;
  icon: LucideIcon;
  /** null = pinned top; "bottom" = pinned bottom */
  group: ModuleGroup | null | "bottom";
}

export const MODULES: ModuleDef[] = [
  { id: "home", label: "Home", path: "/", icon: LayoutDashboard, group: null },
  { id: "my-work", label: "My Work", path: "/my-work", icon: Inbox, group: null },

  { id: "close", label: "Close Cockpit", path: "/close", icon: CalendarCheck, group: "Close" },
  { id: "journals", label: "Journals", path: "/journals", icon: BookOpen, group: "Close" },
  { id: "intercompany", label: "Intercompany", path: "/intercompany", icon: Network, group: "Close" },

  { id: "balance-sheet-review", label: "Balance Sheet Review", path: "/balance-sheet-review", icon: ScanSearch, group: "Reconcile & review" },
  { id: "reconciliations", label: "Reconciliations", path: "/reconciliations", icon: Scale, group: "Reconcile & review" },
  { id: "cash-application", label: "Cash Application", path: "/cash-application", icon: ArrowLeftRight, group: "Reconcile & review" },

  { id: "bank-guarantees", label: "Bank Guarantees", path: "/bank-guarantees", icon: ShieldCheck, group: "Treasury" },
  { id: "fx-exposure", label: "FX Exposure", path: "/fx-exposure", icon: Coins, group: "Treasury" },

  // Tax module labels come from the localisation pack (India: GST / TDS).
  { id: "indirect-tax", label: LOCALISATION.taxes.indirect.label, path: "/tax/indirect", icon: Receipt, group: "Tax" },
  { id: "withholding-tax", label: LOCALISATION.taxes.withholding.label, path: "/tax/withholding", icon: Percent, group: "Tax" },

  { id: "financial-statements", label: "Financial Statements", path: "/reporting/financial-statements", icon: FileText, group: "Reporting" },
  { id: "management-reporting", label: "Management Reporting", path: "/reporting/management", icon: BarChart3, group: "Reporting" },
  { id: "variance-analysis", label: "Variance Analysis", path: "/reporting/variance", icon: TrendingUp, group: "Reporting" },
  { id: "working-capital", label: "Working Capital", path: "/reporting/working-capital", icon: Wallet, group: "Reporting" },

  { id: "audit-readiness", label: "Audit Readiness", path: "/audit-readiness", icon: FileCheck2, group: "Audit & controls" },
  { id: "controls", label: "Controls", path: "/controls", icon: ListChecks, group: "Audit & controls" },

  { id: "agents", label: "Agents", path: "/agents", icon: Bot, group: "Automation & data" },
  { id: "rules-policies", label: "Rules & Policies", path: "/rules", icon: SlidersHorizontal, group: "Automation & data" },
  { id: "data-sources", label: "Data Sources", path: "/data", icon: Database, group: "Automation & data" },
  { id: "activity-log", label: "Activity Log", path: "/activity", icon: History, group: "Automation & data" },

  { id: "settings", label: "Settings", path: "/settings", icon: Settings, group: "bottom" },
];

/** Drill-down routes; each belongs to a module (sidebar highlights the parent). */
export interface DetailRouteDef {
  path: string;
  moduleId: ModuleId;
  title: string;
}

export const DETAIL_ROUTES: DetailRouteDef[] = [
  { path: "/balance-sheet-review/:gl", moduleId: "balance-sheet-review", title: "Account" },
  { path: "/reconciliations/:id", moduleId: "reconciliations", title: "Reconciliation" },
  { path: "/cash-application/:id", moduleId: "cash-application", title: "Receipt" },
  { path: "/journals/:id", moduleId: "journals", title: "Journal" },
  { path: "/bank-guarantees/:id", moduleId: "bank-guarantees", title: "Bank guarantee" },
];

export function isModuleEnabled(id: ModuleId): boolean {
  const enabled = TENANT.enabledModules;
  return enabled === "all" || enabled.includes(id);
}

export const ENABLED_MODULES = MODULES.filter((m) => isModuleEnabled(m.id));

export function moduleById(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id)!;
}

function matches(pattern: string, pathname: string): boolean {
  return new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`).test(pathname);
}

/** Resolve the page for a concrete pathname: a module root or one of its detail routes. */
export function resolvePath(
  pathname: string
): { module: ModuleDef; detail?: DetailRouteDef } | undefined {
  const root = MODULES.find((m) => matches(m.path, pathname));
  if (root) return { module: root };
  const detail = DETAIL_ROUTES.find((d) => matches(d.path, pathname));
  if (detail) return { module: moduleById(detail.moduleId), detail };
  return undefined;
}
