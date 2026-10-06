// The agent roster (docs/FRD.md §4.3). In this prototype agents are
// deterministic engines plus template drafting; they propose, never approve.

import type { MethodKind } from "@/types";

export interface AgentDef {
  id: string;
  name: string;
  module: string;
  does: string;
  method: MethodKind;
}

export const AGENTS: AgentDef[] = [
  { id: "agent:scrutiny", name: "Scrutiny agent", module: "balance-sheet-review", does: "Ages open items, runs the rule library, recommends actions", method: "judgement" },
  { id: "agent:reconciler", name: "Reconciler", module: "reconciliations", does: "Prepares reconciliations and classifies reconciling items", method: "judgement" },
  { id: "agent:matcher", name: "Matcher", module: "cash-application", does: "Matches receipts to invoices and explains deductions", method: "judgement" },
  { id: "agent:tax-matcher", name: "Tax matcher", module: "withholding-tax", does: "Matches deductions to the tax credit statement", method: "deterministic" },
  { id: "agent:close", name: "Close orchestrator", module: "close", does: "Tracks dependencies and the critical path", method: "deterministic" },
  { id: "agent:journal-reviewer", name: "Journal reviewer", module: "journals", does: "Checks journals before and after posting", method: "deterministic" },
  { id: "agent:narrator", name: "Narrator", module: "variance-analysis", does: "Drafts commentary and variance explanations from facts", method: "judgement" },
  { id: "agent:follow-up", name: "Follow-up agent", module: "my-work", does: "Drafts chasers to owners, customers and vendors", method: "judgement" },
];

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));
