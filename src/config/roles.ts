// Product roles (docs/FRD.md §2). Permissions are enforced per action as
// modules are built; the role switcher stands in for authentication.

import type { RoleId } from "@/types";

export const ROLES: Record<RoleId, { label: string }> = {
  controller: { label: "Financial Controller" },
  "gl-accountant": { label: "GL Accountant" },
  "ar-specialist": { label: "Receivables Specialist" },
  "treasury-analyst": { label: "Treasury Analyst" },
  "tax-specialist": { label: "Tax Specialist" },
  "reporting-analyst": { label: "Reporting Analyst" },
  "controls-lead": { label: "Internal Controls Lead" },
  "external-auditor": { label: "External Auditor" },
};
