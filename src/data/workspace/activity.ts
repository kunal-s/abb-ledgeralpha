// Demo workspace configuration history: rule changes the workspace made
// before the demo session. Workspace data only.

import type { RuleOverrides } from "@/engine/run";

export interface SeededRuleChange {
  at: string; // local ISO date-time
  personId: string;
  ruleId: string;
  paramKey: string;
  from: number;
  to: number;
  reason: string;
}

export const SEEDED_RULE_CHANGES: SeededRuleChange[] = [
  {
    at: "2026-08-14T11:42",
    personId: "P01",
    ruleId: "BSR-10",
    paramKey: "ageDays",
    from: 45,
    to: 30,
    reason: "Tighter ageing on suspense and clearing after the Q2 audit observation on unidentified receipts",
  },
];

/** The workspace's rule overrides as at the start of the demo session. */
export const SEEDED_RULE_OVERRIDES: RuleOverrides = SEEDED_RULE_CHANGES.reduce<RuleOverrides>((acc, c) => {
  acc[c.ruleId] = { ...acc[c.ruleId], params: { ...(acc[c.ruleId]?.params ?? {}), [c.paramKey]: c.to } };
  return acc;
}, {});
