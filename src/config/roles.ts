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
  | "export"
  | "pbc-provide" // prepare and provide what an auditor request asks for
  | "pbc-manage" // assign, close and reopen auditor requests
  | "pbc-raise" // log a new request: the auditor asks, the team records what it was asked
  | "close-task" // complete a close task you own, flag or clear a blocker
  | "close-manage"; // complete or reopen any close task, reassign tasks

const PREPARERS: RoleId[] = ["gl-accountant", "ar-specialist", "treasury-analyst", "tax-specialist"];
/** everyone inside the company; the external auditor reads and asks, and does not prepare */
const INTERNAL: RoleId[] = ["cfo", "head-of-finance", "controller", ...PREPARERS, "reporting-analyst", "controls-lead"];

const GRANTS: Record<Permission, RoleId[]> = {
  propose: PREPARERS,
  "follow-up": [...PREPARERS, "controller"],
  "tax-review": ["tax-specialist"],
  "sign-preparer": PREPARERS,
  "sign-reviewer": ["controller", "head-of-finance"],
  "edit-rules": ["controller", "head-of-finance"],
  export: ["gl-accountant", "controller"],
  "pbc-provide": INTERNAL,
  "pbc-manage": ["controller", "head-of-finance", "controls-lead"],
  "pbc-raise": ["external-auditor", "controller", "head-of-finance", "controls-lead"],
  "close-task": INTERNAL,
  "close-manage": ["controller", "head-of-finance"],
};

export function can(role: RoleId, permission: Permission): boolean {
  return GRANTS[permission].includes(role);
}
