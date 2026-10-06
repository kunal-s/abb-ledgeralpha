// Shared workflow state (docs/FRD.md §4.4–§4.5): rule overrides, decisions with
// approval routing, follow-ups, account sign-offs, and the session's activity.
// Every action checks the acting role, enforces four-eyes, and writes an
// activity event. Persisted in the browser for rehearsal continuity; "Reset
// demo" returns to the seeded workspace state.

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AccountSignOff, ActionKind, ActivityEvent, Decision, FollowUp, IsoDate, Person, Recommendation, RoleId, RuleHit } from "@/types";
import { WORLD } from "@/data";
import { useRoleStore, usePeriodStore } from "@/lib/stores";
import { ROLES, can, type Permission } from "@/config/roles";
import { MATERIALITY_POLICY, bandFor } from "@/config/policies";
import { fmtINR } from "@/lib/format";
import { effectiveRules, runRules, type RuleOverride, type RuleOverrides } from "@/engine/run";
import { SEEDED_RULE_OVERRIDES } from "@/data/workspace/activity";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface RuleChangeDelta {
  ruleId: string;
  before: { count: number; value: number };
  after: { count: number; value: number };
}

interface WorkflowData {
  ruleOverrides: RuleOverrides;
  decisions: Record<string, Decision>;
  followUps: Record<string, FollowUp>;
  signOffs: Record<string, AccountSignOff>;
  events: ActivityEvent[];
  seq: number;
}

interface WorkflowActions {
  setRuleOverride: (ruleId: string, override: RuleOverride, reason?: string) => Result<{ delta: RuleChangeDelta }>;
  resetRules: () => Result;
  proposeDecision: (input: {
    itemKey: string;
    module: string;
    action: ActionKind;
    amount: number;
    justification: string;
    recommendation?: Recommendation;
    hits: RuleHit[];
    rulesVersion: string;
  }) => Result<{ id: string }>;
  approveDecision: (id: string, note?: string) => Result;
  rejectDecision: (id: string, reason: string) => Result;
  taxReview: (id: string, outcome: "cleared" | "objected", note?: string) => Result;
  withdrawDecision: (id: string) => Result;
  exportDecisions: (ids: string[]) => Result<{ batchId: string }>;
  markPosted: (batchId: string) => Result;
  requestFollowUp: (input: { itemKey: string; module: string; owner: string; dueDate: IsoDate; message: string }) => Result<{ id: string }>;
  respondFollowUp: (id: string, text: string) => Result;
  closeFollowUp: (id: string) => Result;
  signOff: (gl: string, periodEnd: IsoDate, as: "preparer" | "reviewer", commentary?: string) => Result;
  reopen: (gl: string, periodEnd: IsoDate, reason: string) => Result;
  resetDemo: () => void;
}

export type WorkflowState = WorkflowData & WorkflowActions;

const INITIAL: WorkflowData = {
  ruleOverrides: SEEDED_RULE_OVERRIDES,
  decisions: {},
  followUps: {},
  signOffs: {},
  events: [],
  seq: 0,
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
/** Local date-time "2026-10-06T14:07" — the session clock. */
export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The person acting in a role: the role's first person in the roster. */
export function personForRole(role: RoleId): Person {
  return WORLD.people.find((p) => p.roleId === role)!;
}

function actor(): { role: RoleId; person: Person } {
  const role = useRoleStore.getState().role;
  return { role, person: personForRole(role) };
}

const fail = (error: string) => ({ ok: false as const, error });

function denied(permission: Permission, role: RoleId): string {
  const verbs: Record<Permission, string> = {
    propose: "propose decisions",
    "follow-up": "request follow-ups",
    "tax-review": "complete tax review",
    "sign-preparer": "sign off as preparer",
    "sign-reviewer": "sign off as reviewer",
    "edit-rules": "change rules",
    export: "export journal proposals",
  };
  return `${ROLES[role].label} cannot ${verbs[permission]}`;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: state stays in memory */
    }
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const signKey = (gl: string, periodEnd: IsoDate) => `${gl}|${periodEnd}`;

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------
export const useWorkflow = create<WorkflowState>()(
  persist(
    (set, get) => {
      const log = (e: Omit<ActivityEvent, "id" | "at"> & { at?: string }) => {
        const seq = get().seq + 1;
        const event: ActivityEvent = { id: `EV-${String(seq).padStart(5, "0")}`, at: e.at ?? nowLocal(), ...e };
        set((s) => ({ seq, events: [...s.events, event] }));
        return event;
      };
      const personEvent = (person: Person, e: Omit<ActivityEvent, "id" | "at" | "actorId" | "actorKind">) =>
        log({ ...e, actorId: person.id, actorKind: "Person" });

      const nextId = (prefix: string) => {
        const seq = get().seq + 1;
        set({ seq });
        return `${prefix}-${String(seq).padStart(5, "0")}`;
      };

      return {
        ...INITIAL,

        setRuleOverride: (ruleId, override, reason) => {
          const { role, person } = actor();
          if (!can(role, "edit-rules")) return fail(denied("edit-rules", role));
          const asOf = usePeriodStore.getState().periodEnd;
          const beforeRules = effectiveRules(get().ruleOverrides);
          const merged: RuleOverrides = {
            ...get().ruleOverrides,
            [ruleId]: {
              enabled: override.enabled ?? get().ruleOverrides[ruleId]?.enabled,
              params: { ...(get().ruleOverrides[ruleId]?.params ?? {}), ...(override.params ?? {}) },
            },
          };
          const afterRules = effectiveRules(merged);
          const before = runRules(asOf, beforeRules).byRule.get(ruleId)!;
          const after = runRules(asOf, afterRules).byRule.get(ruleId)!;
          const rb = beforeRules.find((r) => r.id === ruleId)!;
          const ra = afterRules.find((r) => r.id === ruleId)!;
          const describe = (r: typeof rb) => (r.enabled ? r.params.map((p) => `${p.label} ${p.unit === "amount" ? fmtINR(p.value) : `${p.value}${p.unit === "%" ? "%" : p.unit === "days" ? " days" : p.unit === "years" ? " years" : ""}`}`).join("; ") : "Disabled");
          set({ ruleOverrides: merged });
          personEvent(person, {
            module: "rules-policies",
            object: { type: "rule", id: ruleId, label: ra.name },
            action: rb.enabled !== ra.enabled ? (ra.enabled ? "Rule enabled" : "Rule disabled") : "Rule changed",
            before: describe(rb),
            after: describe(ra),
            reason,
            details: { itemsBefore: before.count, itemsAfter: after.count, valueBefore: before.value, valueAfter: after.value },
          });
          log({
            actorId: "agent:scrutiny",
            actorKind: "Agent",
            module: "rules-policies",
            object: { type: "rule", id: ruleId, label: ra.name },
            action: "Rule re-evaluated",
            before: `${before.count} items`,
            after: `${after.count} items`,
            details: { asOf },
          });
          return { ok: true, delta: { ruleId, before, after } };
        },

        resetRules: () => {
          const { role, person } = actor();
          if (!can(role, "edit-rules")) return fail(denied("edit-rules", role));
          set({ ruleOverrides: {} });
          personEvent(person, { module: "rules-policies", object: { type: "rule-library", id: "all", label: "Rule library" }, action: "Rules reset to product defaults" });
          return { ok: true };
        },

        proposeDecision: (input) => {
          const { role, person } = actor();
          if (!can(role, "propose")) return fail(denied("propose", role));
          const active = Object.values(get().decisions).find(
            (d) => d.itemKey === input.itemKey && ["proposed", "approved", "exported"].includes(d.status)
          );
          if (active) return fail(`A decision is already ${active.status} for this item`);
          if (Math.abs(input.amount) >= MATERIALITY_POLICY.documentedActionAmount && !input.justification.trim()) {
            return fail(`A justification is required for amounts of ${fmtINR(MATERIALITY_POLICY.documentedActionAmount)} or more`);
          }
          const band = bandFor(input.amount);
          const id = nextId("DEC");
          const decision: Decision = {
            id,
            itemKey: input.itemKey,
            module: input.module,
            action: input.action,
            amount: input.amount,
            proposedBy: person.id,
            proposedAt: nowLocal(),
            justification: input.justification.trim(),
            approvalBandId: band.id,
            chain: [...band.chain],
            approvals: [],
            taxReviewRequired: input.recommendation?.requiresTaxReview ?? (input.action === "Write back"),
            status: "proposed",
            snapshot: { recommendation: input.recommendation, hits: input.hits, rulesVersion: input.rulesVersion },
          };
          set((s) => ({ decisions: { ...s.decisions, [id]: decision } }));
          personEvent(person, {
            module: input.module,
            object: { type: "item", id: input.itemKey },
            action: `${input.action} proposed`,
            after: `${fmtINR(Math.abs(input.amount))} · band ${band.id}`,
            reason: input.justification.trim() || undefined,
            details: { decision: id },
          });
          return { ok: true, id };
        },

        approveDecision: (id, note) => {
          const { role, person } = actor();
          const d = get().decisions[id];
          if (!d) return fail("Decision not found");
          if (d.status !== "proposed") return fail(`Decision is ${d.status}`);
          const next = d.chain[d.approvals.length];
          if (!next) return fail(d.taxReviewRequired && !d.taxReview ? "Waiting for tax review" : "All approvals recorded");
          if (role !== next) return fail(`Waiting for ${ROLES[next].label}`);
          if (person.id === d.proposedBy) return fail("The proposer cannot approve their own decision");
          if (d.approvals.some((a) => a.personId === person.id)) return fail("Already approved by this person");
          const approvals = [...d.approvals, { roleId: role, personId: person.id, at: nowLocal(), note }];
          const chainDone = approvals.length === d.chain.length;
          const taxDone = !d.taxReviewRequired || d.taxReview?.outcome === "cleared";
          const status = chainDone && taxDone ? "approved" : "proposed";
          set((s) => ({ decisions: { ...s.decisions, [id]: { ...d, approvals, status } } }));
          personEvent(person, {
            module: d.module,
            object: { type: "item", id: d.itemKey },
            action: status === "approved" ? `${d.action} approved` : `${d.action} approved by ${ROLES[role].label}`,
            before: "Proposed",
            after: status === "approved" ? "Approved" : `Waiting for ${d.chain[approvals.length] ? ROLES[d.chain[approvals.length]].label : "tax review"}`,
            reason: note,
            details: { decision: id },
          });
          return { ok: true };
        },

        rejectDecision: (id, reason) => {
          const { role, person } = actor();
          const d = get().decisions[id];
          if (!d) return fail("Decision not found");
          if (d.status !== "proposed") return fail(`Decision is ${d.status}`);
          const next = d.chain[d.approvals.length];
          const isApprover = role === next;
          const isTax = d.taxReviewRequired && can(role, "tax-review");
          if (!isApprover && !isTax) return fail(`${ROLES[role].label} is not an approver for this decision`);
          if (!reason.trim()) return fail("A reason is required to reject");
          set((s) => ({ decisions: { ...s.decisions, [id]: { ...d, status: "rejected", rejection: { personId: person.id, at: nowLocal(), reason: reason.trim() } } } }));
          personEvent(person, { module: d.module, object: { type: "item", id: d.itemKey }, action: `${d.action} rejected`, before: "Proposed", after: "Rejected", reason: reason.trim(), details: { decision: id } });
          return { ok: true };
        },

        taxReview: (id, outcome, note) => {
          const { role, person } = actor();
          if (!can(role, "tax-review")) return fail(denied("tax-review", role));
          const d = get().decisions[id];
          if (!d) return fail("Decision not found");
          if (!d.taxReviewRequired) return fail("This decision does not need tax review");
          if (d.status !== "proposed") return fail(`Decision is ${d.status}`);
          if (d.taxReview) return fail("Tax review already recorded");
          if (person.id === d.proposedBy) return fail("The proposer cannot review their own decision");
          if (outcome === "objected" && !note?.trim()) return fail("A note is required to object");
          const taxReview = { personId: person.id, outcome, at: nowLocal(), note };
          const status: Decision["status"] =
            outcome === "objected" ? "rejected" : d.approvals.length === d.chain.length ? "approved" : "proposed";
          set((s) => ({
            decisions: {
              ...s.decisions,
              [id]: { ...d, taxReview, status, rejection: outcome === "objected" ? { personId: person.id, at: taxReview.at, reason: note!.trim() } : d.rejection },
            },
          }));
          personEvent(person, { module: d.module, object: { type: "item", id: d.itemKey }, action: outcome === "cleared" ? "Tax review cleared" : "Tax review objected", reason: note, after: status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Waiting for approvals", details: { decision: id } });
          return { ok: true };
        },

        withdrawDecision: (id) => {
          const { person } = actor();
          const d = get().decisions[id];
          if (!d) return fail("Decision not found");
          if (d.status !== "proposed") return fail(`Decision is ${d.status}`);
          if (d.proposedBy !== person.id) return fail("Only the proposer can withdraw");
          set((s) => ({ decisions: { ...s.decisions, [id]: { ...d, status: "withdrawn" } } }));
          personEvent(person, { module: d.module, object: { type: "item", id: d.itemKey }, action: `${d.action} withdrawn`, before: "Proposed", after: "Withdrawn", details: { decision: id } });
          return { ok: true };
        },

        exportDecisions: (ids) => {
          const { role, person } = actor();
          if (!can(role, "export")) return fail(denied("export", role));
          const ready = ids.map((i) => get().decisions[i]).filter((d) => d?.status === "approved");
          if (!ready.length) return fail("No approved decisions to export");
          const batchId = nextId("JVP");
          set((s) => {
            const decisions = { ...s.decisions };
            for (const d of ready) decisions[d.id] = { ...d, status: "exported", exportBatchId: batchId };
            return { decisions };
          });
          personEvent(person, { module: "journals", object: { type: "proposal-batch", id: batchId }, action: "Journal proposals exported", after: `${ready.length} decisions`, details: { batch: batchId, decisions: ready.length } });
          return { ok: true, batchId };
        },

        markPosted: (batchId) => {
          const { person } = actor();
          const batch = Object.values(get().decisions).filter((d) => d.exportBatchId === batchId && d.status === "exported");
          if (!batch.length) return fail("Nothing to mark for this batch");
          set((s) => {
            const decisions = { ...s.decisions };
            for (const d of batch) decisions[d.id] = { ...d, status: "closed-in-erp" };
            return { decisions };
          });
          personEvent(person, { module: "journals", object: { type: "proposal-batch", id: batchId }, action: "Marked as posted in the ERP (simulated)", before: "Exported", after: "Closed in ERP" });
          return { ok: true };
        },

        requestFollowUp: (input) => {
          const { role, person } = actor();
          if (!can(role, "follow-up")) return fail(denied("follow-up", role));
          if (!input.message.trim()) return fail("A message is required");
          const id = nextId("FUP");
          const fu: FollowUp = { id, ...input, message: input.message.trim(), createdBy: person.id, createdAt: nowLocal(), status: "open" };
          set((s) => ({ followUps: { ...s.followUps, [id]: fu } }));
          personEvent(person, { module: input.module, object: { type: "item", id: input.itemKey }, action: "Follow-up requested", after: `${input.owner} · due ${input.dueDate}`, details: { followUp: id } });
          return { ok: true, id };
        },

        respondFollowUp: (id, text) => {
          const { person } = actor();
          const fu = get().followUps[id];
          if (!fu) return fail("Follow-up not found");
          if (fu.status !== "open") return fail(`Follow-up is ${fu.status}`);
          if (!text.trim()) return fail("A response is required");
          set((s) => ({ followUps: { ...s.followUps, [id]: { ...fu, status: "responded", response: { text: text.trim(), at: nowLocal(), by: person.id } } } }));
          personEvent(person, { module: fu.module, object: { type: "item", id: fu.itemKey }, action: "Follow-up response recorded", before: "Open", after: "Responded", reason: text.trim(), details: { followUp: id } });
          return { ok: true };
        },

        closeFollowUp: (id) => {
          const { person } = actor();
          const fu = get().followUps[id];
          if (!fu) return fail("Follow-up not found");
          set((s) => ({ followUps: { ...s.followUps, [id]: { ...fu, status: "closed" } } }));
          personEvent(person, { module: fu.module, object: { type: "item", id: fu.itemKey }, action: "Follow-up closed", before: fu.status === "open" ? "Open" : "Responded", after: "Closed", details: { followUp: id } });
          return { ok: true };
        },

        signOff: (gl, periodEnd, as, commentary) => {
          const { role, person } = actor();
          const k = signKey(gl, periodEnd);
          const cur = get().signOffs[k] ?? { gl, periodEnd };
          if (as === "preparer") {
            if (!can(role, "sign-preparer")) return fail(denied("sign-preparer", role));
            if (cur.preparer && !cur.reopened) return fail("Already signed by the preparer");
            const next: AccountSignOff = { gl, periodEnd, preparer: { personId: person.id, at: nowLocal() }, commentary: commentary ?? cur.commentary };
            set((s) => ({ signOffs: { ...s.signOffs, [k]: next } }));
            personEvent(person, { module: "balance-sheet-review", object: { type: "account", id: gl, label: WORLD.glAccounts.find((g) => g.gl === gl)?.description }, action: "Signed off as preparer", after: "Preparer signed", details: { period: periodEnd } });
            return { ok: true };
          }
          if (!can(role, "sign-reviewer")) return fail(denied("sign-reviewer", role));
          if (!cur.preparer) return fail("The preparer has not signed yet");
          if (cur.preparer.personId === person.id) return fail("The reviewer must be a different person from the preparer");
          if (cur.reviewer) return fail("Already signed off");
          set((s) => ({ signOffs: { ...s.signOffs, [k]: { ...cur, reviewer: { personId: person.id, at: nowLocal() } } } }));
          personEvent(person, { module: "balance-sheet-review", object: { type: "account", id: gl, label: WORLD.glAccounts.find((g) => g.gl === gl)?.description }, action: "Signed off as reviewer", before: "Preparer signed", after: "Signed off", details: { period: periodEnd } });
          return { ok: true };
        },

        reopen: (gl, periodEnd, reason) => {
          const { role, person } = actor();
          if (!can(role, "sign-reviewer")) return fail(denied("sign-reviewer", role));
          if (!reason.trim()) return fail("A reason is required to reopen");
          const k = signKey(gl, periodEnd);
          const cur = get().signOffs[k];
          if (!cur?.preparer) return fail("Nothing to reopen");
          set((s) => ({ signOffs: { ...s.signOffs, [k]: { gl, periodEnd, commentary: cur.commentary, reopened: { personId: person.id, at: nowLocal(), reason: reason.trim() } } } }));
          personEvent(person, { module: "balance-sheet-review", object: { type: "account", id: gl }, action: "Account reopened", before: cur.reviewer ? "Signed off" : "Preparer signed", after: "Reopened", reason: reason.trim() });
          return { ok: true };
        },

        resetDemo: () => {
          set({ ...INITIAL });
          safeStorage.removeItem("ledgeralpha-workflow");
        },
      };
    },
    {
      name: "ledgeralpha-workflow",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        ruleOverrides: s.ruleOverrides,
        decisions: s.decisions,
        followUps: s.followUps,
        signOffs: s.signOffs,
        events: s.events,
        seq: s.seq,
      }),
    }
  )
);
