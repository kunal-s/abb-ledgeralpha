// Workspace history before the session: monthly data loads, the scrutiny
// agent's run after each load, and configuration changes the workspace made.
// Counts are real — each run is evaluated as at its own month end with the
// rules as configured at that time.

import type { ActivityEvent } from "@/types";
import { WORLD, DATASETS, QUALITY } from "@/data";
import { addDays, fmtDate, monthEnd } from "@/lib/dates";
import { previousQuarterEnd } from "@/engine/context";
import { effectiveRules, runRules, type RuleOverrides } from "@/engine/run";
import { SEEDED_RULE_CHANGES } from "@/data/workspace/activity";
import { fmtINRCompact } from "@/lib/format";

let cached: ActivityEvent[] | null = null;

function overridesAt(at: string): RuleOverrides {
  const out: RuleOverrides = {};
  for (const c of SEEDED_RULE_CHANGES) {
    if (c.at > at) continue;
    out[c.ruleId] = { ...out[c.ruleId], params: { ...(out[c.ruleId]?.params ?? {}), [c.paramKey]: c.to } };
  }
  return out;
}

export function seededHistory(): ActivityEvent[] {
  if (cached) return cached;
  const events: ActivityEvent[] = [];
  let n = 0;
  const id = () => `HX-${String(++n).padStart(4, "0")}`;

  // review cycle: from the last completed quarter end to the current period
  const from = previousQuarterEnd(WORLD.asOf);
  const monthEnds: string[] = [];
  for (let m = from; m <= WORLD.asOf; m = monthEnd(addDays(m, 1))) monthEnds.push(m);

  for (const m of monthEnds) {
    const loadDay = addDays(m, 1);
    for (const d of DATASETS) {
      const records = d.id === "acdoca" ? WORLD.lines.filter((l) => l.sourceSystem === d.sourceSystem && l.postingDate <= m).length : d.records;
      events.push({
        id: id(), at: `${loadDay}T06:15`, actorId: "system", actorKind: "System", module: "data-sources",
        object: { type: "dataset", id: d.id, label: d.name }, action: "Dataset loaded",
        after: `${records.toLocaleString("en-IN")} records`, details: { sourceSystem: d.sourceSystem, asOf: m },
      });
    }
    events.push({
      id: id(), at: `${loadDay}T06:16`, actorId: "system", actorKind: "System", module: "data-sources",
      object: { type: "load", id: `LOAD-${m.replace(/-/g, "")}`, label: `Load as at ${fmtDate(m)}` }, action: "Load checks passed",
      after: `${QUALITY.length}/${QUALITY.length} checks`,
    });
    const run = runRules(m, effectiveRules(overridesAt(`${loadDay}T06:20`)));
    events.push({
      id: id(), at: `${loadDay}T06:20`, actorId: "agent:scrutiny", actorKind: "Agent", module: "balance-sheet-review",
      object: { type: "rule-library", id: "BSR", label: "Balance sheet review rules" }, action: "Rule library evaluated",
      after: `${run.items.size.toLocaleString("en-IN")} items flagged · ${fmtINRCompact(run.flaggedValue)}`,
      details: { asOf: m, itemsFlagged: run.items.size, rulesVersion: run.version, durationMs: Math.round(run.durationMs) },
    });
  }

  for (const c of SEEDED_RULE_CHANGES) {
    const asOf = monthEnd(addDays(c.at.slice(0, 10), -32));
    const before = runRules(asOf, effectiveRules(overridesAt(addDays(c.at.slice(0, 10), -1) + "T00:00"))).byRule.get(c.ruleId)!;
    const after = runRules(asOf, effectiveRules(overridesAt(c.at))).byRule.get(c.ruleId)!;
    events.push({
      id: id(), at: c.at, actorId: c.personId, actorKind: "Person", module: "rules-policies",
      object: { type: "rule", id: c.ruleId }, action: "Rule changed",
      before: `${c.paramKey === "ageDays" ? "Older than" : c.paramKey} ${c.from} days`, after: `${c.paramKey === "ageDays" ? "Older than" : c.paramKey} ${c.to} days`,
      reason: c.reason, details: { itemsBefore: before.count, itemsAfter: after.count, valueBefore: before.value, valueAfter: after.value },
    });
  }

  cached = events.sort((a, b) => a.at.localeCompare(b.at));
  return cached;
}
