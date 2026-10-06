import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfidenceChip, DocLink, MethodBadge, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { GL_BY_ID, LINES_BY_DOC, LINES_BY_PO, PARTY_BY_ID, PERSON_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { useItemDrawer } from "@/state/drawer";
import { useReview, useItemRow } from "@/state/ReviewContext";
import type { ItemRow } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { DecisionApproval, FollowUpBody, History, Section } from "@/components/review/drawerParts";
import { RecItemBody } from "@/components/recon/RecItemDrawer";
import { parseRecItemKey } from "@/engine/recs";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { MATERIALITY_POLICY, APPROVAL_BANDS } from "@/config/policies";
import { RULE_PRIORITY } from "@/engine/recommend";
import { draftFollowUp } from "@/engine/followup";
import { BUCKETS } from "@/engine/review";
import { FIELD_MAP } from "@/lib/fieldMap";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtINRCompact } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ActionKind } from "@/types";

const DECISION_ACTIONS: ActionKind[] = ["Clear", "Reclassify", "Write off", "Write back", "Provide", "Retain"];
const MODULE = "balance-sheet-review";

// ---------------------------------------------------------------------------
function Recommendation({ row }: { row: ItemRow }) {
  const rec = row.rec;
  if (!rec) return null;
  const rule = row.hits.find((h) => h.ruleId === rec.primaryRuleId);
  return (
    <Section title="Recommendation" aside={<MethodBadge method="judgement" showConfidence={false} />}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">{rec.action}</span>
        <ConfidenceChip score={rec.confidence} size="sm" />
        {rec.requiresTaxReview && <span className="rounded-md bg-warn-subtle px-1.5 py-0.5 text-2xs font-medium text-warn-foreground">Tax review required</span>}
        <span className="text-2xs text-muted-foreground">Approval band {rec.approvalBandId}</span>
      </div>
      <p className="mt-2 text-sm">{rec.rationale}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Next: <span className="text-foreground">{rec.nextStep}</span>
        {rule && <span> · driven by {rule.ruleId}</span>}
      </p>
      <ul className="mt-3 space-y-1 rounded-md border border-border bg-background p-3">
        {rec.factors.map((f) => (
          <li key={f.label} className="flex items-center gap-2 text-xs">
            {f.met ? <Check className="h-3.5 w-3.5 shrink-0 text-ok" /> : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
            <span className={cn("flex-1", !f.met && "text-muted-foreground")}>{f.label}</span>
            <span className={cn("tnum", f.met ? "text-foreground" : "text-muted-foreground/60")}>{f.met ? `+${f.weight.toFixed(2)}` : f.weight.toFixed(2)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between border-t border-border pt-1.5 text-xs font-semibold">
          <span>Confidence</span>
          <span className="tnum">{rec.confidence.toFixed(2)}</span>
        </li>
      </ul>
    </Section>
  );
}

function Findings({ row }: { row: ItemRow }) {
  const review = useReview();
  if (!row.hits.length) return null;
  const rules = new Map(review.run.rules.map((r) => [r.id, r]));
  const sorted = [...row.hits].sort((a, b) => RULE_PRIORITY.indexOf(a.ruleId) - RULE_PRIORITY.indexOf(b.ruleId));
  return (
    <Section title="Rule findings" aside={<MethodBadge method="deterministic" />}>
      <ul className="space-y-2">
        {sorted.map((h) => (
          <li key={h.ruleId} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs text-muted-foreground">{h.ruleId}</span>
              <span className="font-medium">{rules.get(h.ruleId)?.name}</span>
            </div>
            <div className="text-xs text-muted-foreground">{h.reason}</div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
function Decision({ row }: { row: ItemRow }) {
  const review = useReview();
  const role = useRoleStore((s) => s.role);
  const { proposeDecision } = useWorkflow.getState();
  const d = row.decision;
  const rec = row.rec;
  const [action, setAction] = useState<ActionKind>(rec && rec.action !== "Follow up" ? rec.action : "Retain");
  const [justification, setJustification] = useState("");
  const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));
  const amount = Math.abs(row.item.amount);
  const needsJustification = amount >= MATERIALITY_POLICY.documentedActionAmount;

  const proposeForm = (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[8rem_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Action</span>
        <Select value={action} onValueChange={(v) => setAction(v as ActionKind)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DECISION_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
                {rec?.action === a ? " (recommended)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[8rem_1fr] items-start gap-2">
        <span className="pt-2 text-xs text-muted-foreground">Justification{needsJustification ? " *" : ""}</span>
        <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder={needsJustification ? `Required from ${fmtINR(MATERIALITY_POLICY.documentedActionAmount)}` : "Optional"} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xs text-muted-foreground">
          {fmtINR(amount)} · band {(APPROVAL_BANDS.find((b) => b.upTo === null || amount <= b.upTo) ?? APPROVAL_BANDS[0]).id}
        </span>
        <Button
          size="sm"
          disabled={!can(role, "propose")}
          title={can(role, "propose") ? undefined : `${ROLES[role].label} cannot propose decisions`}
          onClick={() => {
            const r = proposeDecision({ itemKey: row.key, module: MODULE, action, amount: row.item.amount, justification, recommendation: rec, hits: row.hits, rulesVersion: review.run.version });
            run(r, `${action} proposed`);
            if (r.ok) setJustification("");
          }}
        >
          Propose {action.toLowerCase()}
        </Button>
      </div>
    </div>
  );

  if (!row.flagged && !d) return null;

  if (!d || d.status === "rejected") {
    return (
      <Section title="Decision">
        {d?.status === "rejected" && (
          <div className="mb-3 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground">
            {d.action} rejected{d.rejection ? ` by ${PERSON_BY_ID.get(d.rejection.personId)?.name} - ${d.rejection.reason}` : ""}
          </div>
        )}
        {rec?.action === "Follow up" && !d ? (
          <details>
            <summary className="cursor-pointer text-xs text-primary">Propose an action instead of following up</summary>
            <div className="mt-3">{proposeForm}</div>
          </details>
        ) : (
          proposeForm
        )}
      </Section>
    );
  }

  return (
    <Section title="Decision" aside={<StatusChip status={row.status} />}>
      <DecisionApproval d={d} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
function FollowUp({ row }: { row: ItemRow }) {
  const review = useReview();
  const fu = row.followUp;

  if (!row.flagged && !fu) return null;
  // once a decision is in flight or done, a new follow-up request is moot
  if (!fu && row.decision && ["proposed", "approved", "exported", "closed-in-erp"].includes(row.decision.status)) return null;

  return (
    <Section title="Follow-up" aside={fu ? <StatusChip status={fu.status === "open" ? "in-follow-up" : fu.status === "responded" ? "approved" : "not-started"} label={fu.status === "open" ? "Open" : fu.status === "responded" ? "Responded" : "Closed"} /> : undefined}>
      <FollowUpBody itemKey={row.key} module={MODULE} draft={draftFollowUp(row.item, row.rec, row.hits)} followUp={fu} asOf={review.asOf} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
function Related({ row }: { row: ItemRow }) {
  const item = row.item;
  const party = item.partner ? PARTY_BY_ID.get(item.partner.id) : undefined;
  const project = item.wbs ? PROJECT_BY_WBS.get(item.wbs) : undefined;
  const po = item.po ? WORLD.purchaseOrders.find((p) => p.po === item.po!.number && p.item === item.po!.item) : undefined;
  const poLines = item.po ? (LINES_BY_PO.get(item.po.number) ?? []).filter((l) => GL_BY_ID.get(l.gl)?.category === "grir" || l.docType === "WE" || l.docType === "RE" || l.docType === "KZ").slice(0, 8) : [];
  const facts = Object.assign({}, ...row.hits.map((h) => h.facts)) as Record<string, string | number | boolean>;
  const bg = facts.bgNo ? WORLD.bankGuarantees.find((b) => b.bgNo === facts.bgNo) : undefined;
  const counter = facts.counterKey ? String(facts.counterKey) : undefined;
  const docLines = LINES_BY_DOC.get(`${item.fiscalYear}-${item.docNo}`) ?? [];

  const rows: [string, React.ReactNode][] = [];
  if (party) rows.push(["Business partner", `${party.name} · ${party.type}${party.msme ? ` · ${party.msme} enterprise` : ""}${party.governmentOrPsu ? " · Government / PSU" : ""} · ${party.status}`]);
  if (project) rows.push(["Project", `${project.wbs} · ${project.name} · ${project.stage}${project.dlpEnd ? ` · DLP ends ${fmtDate(project.dlpEnd)}` : ""}`]);
  if (po) rows.push(["Purchase order", `${po.po} / ${po.item} · ${po.status} · last GR ${po.lastGrDate ? fmtDate(po.lastGrDate) : "none"} · last invoice ${po.lastInvoiceDate ? fmtDate(po.lastInvoiceDate) : "none"}`]);
  if (counter) rows.push(["Counter-item", <DocLink key="c" itemKey={counter}>{counter.split("-")[2]}</DocLink>]);
  // a receipt waiting in incoming-payments clearing is applied in Cash Application
  if (item.gl === "171200" && item.amount < 0 && row.isOpen) {
    rows.push([
      "Cash Application",
      <Link key="cash" to={`/cash-application/${item.key}`} onClick={() => useItemDrawer.getState().close()} className="font-medium text-primary hover:underline">
        Open the match for this receipt
      </Link>,
    ]);
  }
  if (bg) rows.push(["Bank guarantee", `${bg.bgNo} · ${bg.type} · ${fmtINRCompact(bg.amount)} · valid to ${fmtDate(bg.validTo)}${bg.claimExpiry ? `, claim period to ${fmtDate(bg.claimExpiry)}` : ""} · ${bg.status}`]);
  if (facts.quarter) rows.push(["Tax credit statement", `${facts.quarter} · ${facts.creditStatus}${Number(facts.credited) ? ` · credited ${fmtINR(Number(facts.credited))}` : ""}`]);

  return (
    <Section title="Related records">
      {rows.length > 0 && <Fields rows={rows} />}
      {poLines.length > 1 && (
        <div className="mt-2">
          <div className="mb-1 text-2xs text-muted-foreground">Documents on PO {item.po!.number}</div>
          <ul className="space-y-0.5">
            {poLines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 text-xs">
                <DocLink itemKey={l.key}>{l.docNo}</DocLink>
                <span className="w-8 text-muted-foreground">{l.docType}</span>
                <span className="w-24 tnum text-muted-foreground">{fmtDate(l.postingDate)}</span>
                <span className="ml-auto tnum">{fmtDrCr(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-primary">Document postings ({docLines.length} lines)</summary>
        <ul className="mt-2 space-y-0.5">
          {docLines.map((l) => (
            <li key={l.key} className={cn("flex items-center gap-3 text-xs", l.key === row.key && "font-medium")}>
              <span className="w-6 text-muted-foreground">{l.lineItem}</span>
              <span className="w-14 font-mono">{l.gl}</span>
              <span className="flex-1 truncate text-muted-foreground">{GL_BY_ID.get(l.gl)?.description}</span>
              <span className="tnum">{fmtDrCr(l.amount)}</span>
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

// ---------------------------------------------------------------------------
function Body({ row }: { row: ItemRow }) {
  const gl = GL_BY_ID.get(row.item.gl)!;
  const bucket = BUCKETS.find((b) => b.id === row.bucket)!;
  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="flex items-baseline gap-2 text-base font-semibold">
          <span className="font-mono">{row.item.docNo}</span>
          <span className="text-xs font-normal text-muted-foreground">{row.item.docType} · line {row.item.lineItem}</span>
        </SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          {row.item.gl} · {gl.description} · {CATEGORY_LABELS[gl.category]}
        </SheetDescription>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="tnum text-2xl font-semibold tracking-tight">{fmtDrCr(row.item.amount)}</div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <StatusChip status={row.status} />
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">
              {row.age} days · {bucket.label}
            </span>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">{row.item.sourceSystem}</span>
            {row.item.manual && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">Manual entry</span>}
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Posted {fmtDate(row.item.postingDate)}
          {row.item.text ? ` · “${row.item.text}”` : ""}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <Recommendation row={row} />
        <Findings row={row} />
        <Decision key={`d-${row.key}-${row.decision?.id ?? "none"}`} row={row} />
        <FollowUp key={`f-${row.key}-${row.followUp?.id ?? "none"}-${row.followUp?.status ?? ""}`} row={row} />
        <Related row={row} />
        <Section title="Document fields">
          <Fields rows={FIELD_MAP.map((f) => [f.field, <span key={f.field}><span className="mr-2 font-mono text-2xs text-muted-foreground">{f.sap}</span>{f.value(row.item)}</span>])} />
        </Section>
        <History itemKey={row.key} />
      </div>
    </div>
  );
}

/** The item drawer: one place for an item's facts, findings, recommendation, decision and history. */
export function ItemDrawer() {
  const itemKey = useItemDrawer((s) => s.itemKey);
  const close = useItemDrawer((s) => s.close);
  const row = useItemRow(itemKey);
  const recItem = itemKey ? parseRecItemKey(itemKey) : undefined;
  return (
    <Sheet open={!!itemKey} onOpenChange={(o) => !o && close()}>
      <SheetContent>{recItem ? <RecItemBody recId={recItem.recId} itemId={recItem.itemId} /> : row && <Body row={row} />}</SheetContent>
    </Sheet>
  );
}
