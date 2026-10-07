// Workspace history before the session: monthly data loads, the scrutiny
// agent's run after each load, and configuration changes the workspace made.
// Counts are real - each run is evaluated as at its own month end with the
// rules as configured at that time.

import type { ActivityEvent } from "@/types";
import { WORLD, DATASETS, QUALITY, GL_BY_ID, REC_BY_ID } from "@/data";
import { addDays, fmtDate, monthEnd } from "@/lib/dates";
import { previousQuarterEnd } from "@/engine/context";
import { effectiveRules, runRules, type RuleOverrides } from "@/engine/run";
import { SEEDED_RULE_CHANGES, seededJournalReviews, seededSignOffs } from "@/data/workspace/activity";
import { PBC_AUDITOR_ID, PBC_REQUESTS } from "@/data/workspace/pbc";
import { CLOSE_PHASES, CLOSE_TASKS, CLOSE_WD_RANGE, SEEDED_CLOSE_WORK, SEEDED_UNTIL_WD } from "@/data/workspace/close";
import { isQuarterEnd } from "@/engine/close";
import { dateOfWd, wdLabel } from "@/lib/workdays";
import { docByKey, journalDocs, reviewJournals } from "@/engine/journalReview";
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
    const docs = journalDocs(monthEnd(addDays(m, -32)), m);
    const manual = docs.filter((d) => d.manual).length;
    const flagged = reviewJournals(docs, m).size;
    events.push({
      id: id(), at: `${loadDay}T06:25`, actorId: "agent:journal-reviewer", actorKind: "Agent", module: "journals",
      object: { type: "journal-run", id: `JNLRUN-${m.replace(/-/g, "")}`, label: `Journals to ${fmtDate(m)}` }, action: "Journals reviewed",
      after: `${manual.toLocaleString("en-IN")} manual journals checked · ${flagged} flagged`, details: { asOf: m, journals: docs.length, manual, flagged },
    });
  }

  // reconciliations: prepared by the reconciler agent, confirmations sent and answered
  for (const r of WORLD.reconciliations) {
    const object = { type: "reconciliation", id: r.id, label: r.name };
    const base = { module: "reconciliations", object } as const;
    if (r.confirmation?.sentAt) {
      events.push({ id: id(), at: r.confirmation.sentAt, actorId: r.preparerId, actorKind: "Person", ...base, action: "Confirmation requested", after: r.confirmation.contact, details: { period: WORLD.asOf } });
    }
    if (r.seedPrepared) {
      events.push({
        id: id(), at: `${addDays(WORLD.asOf, 1)}T07:05`, actorId: "agent:reconciler", actorKind: "Agent", ...base, action: "Reconciliation prepared",
        after: `${r.items.length} reconciling item${r.items.length === 1 ? "" : "s"}`, details: { period: WORLD.asOf },
      });
    }
    if (r.confirmation?.repliedAt) {
      events.push({ id: id(), at: r.confirmation.repliedAt, actorId: "system", actorKind: "System", ...base, action: "Reply received", after: r.confirmation.contact, details: { period: WORLD.asOf } });
    }
  }

  // sign-offs completed before the session (balance-only accounts)
  for (const so of Object.values(seededSignOffs())) {
    const rec = REC_BY_ID.get(so.gl);
    const module = rec ? "reconciliations" : "balance-sheet-review";
    const object = rec ? { type: "reconciliation", id: rec.id, label: rec.name } : { type: "account", id: so.gl, label: GL_BY_ID.get(so.gl)?.description };
    if (so.preparer) events.push({ id: id(), at: so.preparer.at, actorId: so.preparer.personId, actorKind: "Person", module, object, action: "Signed off as preparer", after: "Preparer signed", details: { period: so.periodEnd } });
    if (so.reviewer) events.push({ id: id(), at: so.reviewer.at, actorId: so.reviewer.personId, actorKind: "Person", module, object, action: "Signed off as reviewer", before: "Preparer signed", after: "Signed off", details: { period: so.periodEnd } });
  }

  // journals the reviewer concluded on before the session
  for (const jr of Object.values(seededJournalReviews())) {
    const doc = docByKey(jr.docKey);
    events.push({
      id: id(), at: jr.at, actorId: jr.personId, actorKind: "Person", module: "journals",
      object: { type: "journal", id: jr.docKey, label: doc?.docNo }, itemKeys: doc?.lines.map((l) => l.key),
      action: "Journal accepted", before: "Flagged", after: "Accepted", reason: jr.note, details: { journal: doc?.docNo ?? jr.docKey, amount: doc?.amount ?? 0 },
    });
  }

  // the statutory auditor's requests, and those already answered
  for (const q of PBC_REQUESTS) {
    const object = { type: "pbc-request", id: q.id, label: q.title };
    events.push({ id: id(), at: `${q.requestedOn}T10:00`, actorId: PBC_AUDITOR_ID, actorKind: "Person", module: "audit-readiness", object, action: "Request raised", after: `Due ${fmtDate(q.due)}`, details: { owner: q.ownerId } });
    if (q.seedStatus === "provided") {
      events.push({ id: id(), at: `${addDays(q.requestedOn, 2)}T15:30`, actorId: q.ownerId, actorKind: "Person", module: "audit-readiness", object, action: "Request provided", before: "In preparation", after: "Provided", details: { evidence: q.seedEvidence ?? "" } });
    }
  }

  // the close plan: the orchestrator's evaluation each working day, and the tasks done by hand
  const planned = CLOSE_TASKS.filter((t) => isQuarterEnd(WORLD.asOf) || !CLOSE_PHASES.find((p) => p.id === t.phase)?.quarterOnly);
  for (let wd = CLOSE_WD_RANGE.min; wd <= SEEDED_UNTIL_WD; wd += 1) {
    events.push({
      id: id(), at: `${dateOfWd(WORLD.asOf, wd)}T06:30`, actorId: "agent:close", actorKind: "Agent", module: "close",
      object: { type: "close-plan", id: `CLOSE-${WORLD.asOf}`, label: `Close of ${fmtDate(WORLD.asOf)}` }, action: "Close plan evaluated",
      after: `${planned.filter((t) => t.dueWd <= wd).length} of ${planned.length} tasks due by ${wdLabel(wd)}`, details: { wd },
    });
  }
  for (const [taskId, w] of Object.entries(SEEDED_CLOSE_WORK)) {
    const task = CLOSE_TASKS.find((t) => t.id === taskId)!;
    if (w.completed) {
      events.push({
        id: id(), at: w.completed.at, actorId: w.completed.personId, actorKind: "Person", module: "close", object: { type: "close-task", id: taskId, label: task.name },
        action: "Close task completed", before: "Open", after: "Complete", details: { evidence: w.completed.evidence },
      });
    }
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
