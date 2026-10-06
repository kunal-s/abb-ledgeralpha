// Screen registry — the single source of truth for routes, sidebar order and the
// build plan. Mirrors docs/FRD.md §10 (screens) and §16 (increments). When a
// screen is built, flip its `status` to "built" and point `element` at the page
// in App.tsx; the sidebar and the build-plan card update from here.

import {
  ArrowLeftRight,
  BarChart3,
  Database,
  FileSearch,
  FileSpreadsheet,
  History,
  Inbox,
  LayoutDashboard,
  ListTree,
  Settings,
  SlidersHorizontal,
  Stamp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type IncrementId = "I0" | "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8" | "I9" | "I10";

export type BuildStatus = "built" | "planned" | "blocked";

export interface Increment {
  id: IncrementId;
  title: string;
  scope: string;
  status: BuildStatus;
  /** questionnaire answers the increment waits on */
  gatedBy?: string;
}

export const INCREMENTS: Increment[] = [
  { id: "I0", title: "Scaffold and FRD", scope: "Shell, design system, INR formats, types, screen registry, FRD", status: "built" },
  { id: "I1", title: "Data foundation", scope: "GL master, synthetic FBL3N-shaped open items, reference data, Data Sources", status: "planned", gatedBy: "A-S1, A-S2 (fields) — synthetic until then" },
  { id: "I2", title: "Ageing and rule engine", scope: "Ageing, rules R01–R18 (R17–R18 off by default), recommender with derived confidence, Rule Library, Settings", status: "planned", gatedBy: "A5, A7, A8 (defaults used until answered)" },
  { id: "I3", title: "Review Overview and GL register", scope: "V-A1 overview, GL Accounts register with owner and risk", status: "planned" },
  { id: "I4", title: "Account Scrutiny", scope: "V-A2 account detail, item drawer, evidence, recommendation", status: "planned" },
  { id: "I5", title: "Exceptions and approvals", scope: "V-A3 queue, V-A4 approvals, DoA routing, tax review, JV proposal export", status: "planned", gatedBy: "A6 / A-S6 (DoA)" },
  { id: "I6", title: "Sign-off and auditor pack", scope: "Commentary, preparer/reviewer sign-off, V-A5 auditor schedules (Excel)", status: "planned", gatedBy: "A10 / A-S5 (schedule layout)" },
  { id: "I7", title: "Ask LedgerAlpha and audit trail", scope: "Grounded copilot, Explain affordance, global search, audit trail", status: "planned" },
  { id: "I8", title: "Division reporting", scope: "V-C1 working capital, V-C4 what moved", status: "blocked", gatedBy: "Section 7 answers (C1–C9)" },
  { id: "I9", title: "Account reconciliation segment", scope: "Depends on S2: Recon-Alpha hand-off, or GL account recs here", status: "blocked", gatedBy: "S2" },
  { id: "I10", title: "ABB data swap-in and rehearsal", scope: "Load masked extract, re-calibrate rules, dry run", status: "planned", gatedBy: "D1 / data approval" },
];

export type NavGroup = "Balance sheet review" | "Account reconciliation" | "Division reporting" | "Data and governance";

export interface ScreenDef {
  id: string; // "SCR-01"
  path: string;
  title: string;
  navLabel?: string; // omitted = not in sidebar (drill-down route)
  icon: LucideIcon;
  /** null = pinned top; "bottom" = pinned bottom */
  group: NavGroup | null | "bottom";
  increment: IncrementId;
  status: BuildStatus;
  /** FRD section and functional-requirement module */
  frd: string;
  /** questionnaire view IDs this screen answers (V-A1 …) */
  views?: string[];
  purpose: string;
  leadVisual: string;
  blockedBy?: string;
}

export const SCREENS: ScreenDef[] = [
  {
    id: "SCR-01",
    path: "/",
    title: "Review Overview",
    navLabel: "Review Overview",
    icon: LayoutDashboard,
    group: null,
    increment: "I3",
    status: "planned",
    frd: "§10.1 · FR-OVW",
    views: ["V-A1"],
    purpose: "Where the balance sheet stands for the quarter: what is aged, what is flagged, what is decided and what is signed off.",
    leadVisual: "GL group × ageing bucket heatmap (amount / count), with movement since the last review.",
  },
  {
    id: "SCR-02",
    path: "/accounts",
    title: "GL Accounts",
    navLabel: "GL Accounts",
    icon: ListTree,
    group: "Balance sheet review",
    increment: "I3",
    status: "planned",
    frd: "§10.2 · FR-ACC",
    purpose: "Every balance sheet GL in scope with its owner, reviewer, risk tier and review status.",
    leadVisual: "Accounts by risk tier × review status (stacked), then the register.",
  },
  {
    id: "SCR-03",
    path: "/accounts/:gl",
    title: "Account Scrutiny",
    icon: FileSearch,
    group: "Balance sheet review",
    increment: "I4",
    status: "planned",
    frd: "§10.3 · FR-SCR",
    views: ["V-A2"],
    purpose: "One GL account: what the balance is made of, which items are flagged and why, and the suggested action for each.",
    leadVisual: "Balance broken down by ageing bucket and by suggested action, each segment expandable to its items.",
  },
  {
    id: "SCR-04",
    path: "/exceptions",
    title: "Exception Queue",
    navLabel: "Exception Queue",
    icon: Inbox,
    group: "Balance sheet review",
    increment: "I5",
    status: "planned",
    frd: "§10.4 · FR-EXC",
    views: ["V-A3"],
    purpose: "Every item flagged by a rule or outlier check, in plain language, with owner, comments and evidence in one place.",
    leadVisual: "Flagged → recommended → decided → approved pipeline (click to filter) and a breakdown by rule.",
  },
  {
    id: "SCR-05",
    path: "/actions",
    title: "Actions and Approvals",
    navLabel: "Actions & Approvals",
    icon: Stamp,
    group: "Balance sheet review",
    increment: "I5",
    status: "planned",
    frd: "§10.5 · FR-ACT",
    views: ["V-A4"],
    purpose: "Proposed write-offs, write-backs, provisions and reclasses by approver, status and amount band; the JV proposal export.",
    leadVisual: "Proposed actions by type × approval band, with what is waiting on whom.",
    blockedBy: "A6 / A-S6 for the real DoA (placeholder bands until then)",
  },
  {
    id: "SCR-06",
    path: "/auditor-schedules",
    title: "Auditor Schedules",
    navLabel: "Auditor Schedules",
    icon: FileSpreadsheet,
    group: "Balance sheet review",
    increment: "I6",
    status: "planned",
    frd: "§10.6 · FR-AUD",
    views: ["V-A5"],
    purpose: "Per-account schedule for the auditors: opening, movements, closing, ageing, items above threshold with support and sign-off.",
    leadVisual: "Schedule readiness by account (ready / pending sign-off / open items), then the schedule preview and Excel export.",
    blockedBy: "A10 / A-S5 for ABB's schedule layout",
  },
  {
    id: "SCR-07",
    path: "/rules",
    title: "Rule Library",
    navLabel: "Rule Library",
    icon: SlidersHorizontal,
    group: "Balance sheet review",
    increment: "I2",
    status: "planned",
    frd: "§7 · §10.7 · FR-RUL",
    purpose: "The configurable rules that surface exceptions and outliers. Change a threshold, re-run, and watch the counts move.",
    leadVisual: "Hits per rule with value at stake; each rule's parameters editable in place.",
  },
  {
    id: "SCR-08",
    path: "/reconciliation",
    title: "Account Reconciliation",
    navLabel: "Account Reconciliation",
    icon: ArrowLeftRight,
    group: "Account reconciliation",
    increment: "I9",
    status: "blocked",
    frd: "§10.8 · FR-REC",
    views: ["V-B1–V-B5"],
    purpose: "Workshop segment 2. Customer receipt matching and statements (Recon-Alpha), or GL account reconciliations (built here).",
    leadVisual: "Decided once ABB answers S2.",
    blockedBy: "S2 — what 'account reconciliation' means",
  },
  {
    id: "SCR-09",
    path: "/reporting/working-capital",
    title: "Working Capital",
    navLabel: "Working Capital",
    icon: Wallet,
    group: "Division reporting",
    increment: "I8",
    status: "blocked",
    frd: "§10.9 · FR-RPT",
    views: ["V-C1"],
    purpose: "Division DSO (including unbilled and retention), DPO and DIO, with trend and drill to customer, vendor or material.",
    leadVisual: "Days tied up by component, trended, with drill-down.",
    blockedBy: "C1–C3, C7 — current reports, measures, drill path",
  },
  {
    id: "SCR-10",
    path: "/reporting/what-moved",
    title: "What Moved",
    navLabel: "What Moved",
    icon: BarChart3,
    group: "Division reporting",
    increment: "I8",
    status: "blocked",
    frd: "§10.10 · FR-RPT",
    views: ["V-C4"],
    purpose: "Month-on-month explainer: the variance bridge and the ten transactions that drove most of it, each linked to its document.",
    leadVisual: "Variance bridge (waterfall) with the top-ten transaction list.",
    blockedBy: "C6 — baseline (last month / budget) and P&L lines",
  },
  {
    id: "SCR-11",
    path: "/data",
    title: "Data Sources",
    navLabel: "Data Sources",
    icon: Database,
    group: "Data and governance",
    increment: "I1",
    status: "planned",
    frd: "§6 · §10.11 · FR-DAT",
    purpose: "What data is loaded, from where, as at when — field mapping to the SAP line-item layout and control totals that tie to the trial balance.",
    leadVisual: "Source → validation → loaded, with record counts and control totals per GL group.",
  },
  {
    id: "SCR-12",
    path: "/audit-trail",
    title: "Audit Trail",
    navLabel: "Audit Trail",
    icon: History,
    group: "Data and governance",
    increment: "I7",
    status: "planned",
    frd: "§10.12 · FR-TRL",
    purpose: "Every rule run, recommendation, decision, approval and export: who, when, before → after, and why.",
    leadVisual: "Activity over the review cycle by event type, then the filterable log.",
  },
  {
    id: "SCR-13",
    path: "/settings",
    title: "Settings",
    navLabel: "Settings",
    icon: Settings,
    group: "bottom",
    increment: "I2",
    status: "planned",
    frd: "§10.13 · FR-SET",
    purpose: "Period, ageing basis and buckets, materiality, approval bands and roles — the values ABB's answers will change.",
    leadVisual: "Configuration summary with each value's source (ABB-confirmed or default awaiting confirmation).",
  },
];

export const NAV_GROUPS: NavGroup[] = [
  "Balance sheet review",
  "Account reconciliation",
  "Division reporting",
  "Data and governance",
];

/** Resolve the registry entry for a concrete pathname (handles :params). */
export function screenForPath(pathname: string): ScreenDef | undefined {
  return SCREENS.find((s) => {
    const pattern = new RegExp(`^${s.path.replace(/:[^/]+/g, "[^/]+")}$`);
    return pattern.test(pathname);
  });
}
