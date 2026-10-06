// Product roles and permissions (docs/FRD.md §2). The role switcher stands in
// for authentication; every workflow action checks `can()` and the acting
// person (the role's primary person in the workspace roster).

import type { RoleId } from "@/types";

export const ROLES: Record<RoleId, { label: string }> = {
  cfo: { label: "Chief Financial Officer" },
  "head-of-finance": { label: "Head of Finance" },
  controller: { label: "Financial Controller" },
  "gl-accountant": { label: "GL Accountant" },
  "ar-specialist": { label: "Receivables Specialist" },
  "treasury-analyst": { label: "Treasury Analyst" },
  "tax-specialist": { label: "Tax Specialist" },
  "reporting-analyst": { label: "Reporting Analyst" },
  "controls-lead": { label: "Internal Controls Lead" },
  "external-auditor": { label: "External Auditor" },
};

export type Permission =
  | "propose" // propose a decision on an item
  | "follow-up" // request / record follow-ups
  | "tax-review" // clear or object to tax-relevant decisions
  | "sign-preparer"
  | "sign-reviewer"
  | "edit-rules"
  | "export";

const PREPARERS: RoleId[] = ["gl-accountant", "ar-specialist", "treasury-analyst", "tax-specialist"];

const GRANTS: Record<Permission, RoleId[]> = {
  propose: PREPARERS,
  "follow-up": [...PREPARERS, "controller"],
  "tax-review": ["tax-specialist"],
  "sign-preparer": PREPARERS,
  "sign-reviewer": ["controller", "head-of-finance"],
  "edit-rules": ["controller", "head-of-finance"],
  export: ["gl-accountant", "controller"],
};

export function can(role: RoleId, permission: Permission): boolean {
  return GRANTS[permission].includes(role);
}
