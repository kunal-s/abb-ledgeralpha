import { useMemo, useState } from "react";
import { Bot, Download, Server, User } from "lucide-react";
import { KpiTile, MethodBadge, PageHeader, Panel, ConfidenceChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityChart, FAMILIES, type FamilyKey, type WeekRow } from "@/components/activity/ActivityChart";
import { useActivity } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { PERSON_BY_ID, WORLD } from "@/data";
import { AGENT_BY_ID } from "@/engine/agents";
import { MODULES } from "@/lib/modules";
import { previousQuarterEnd } from "@/engine/context";
import { addDays, fmtDate, fmtDateTime, parseIsoDate, toIsoDate } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";
import { downloadCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/types";

const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;

const DETAIL_LABELS: Record<string, string> = {
  itemsBefore: "Items flagged before",
  itemsAfter: "Items flagged after",
  valueBefore: "Value flagged before",
  valueAfter: "Value flagged after",
  itemsFlagged: "Items flagged",
  asOf: "As at",
  period: "Period",
  sourceSystem: "Source system",
  rulesVersion: "Rule configuration",
  durationMs: "Evaluation time",
  decision: "Decision",
  decisions: "Decisions",
  followUp: "Follow-up",
  batch: "Proposal batch",
};

function detailValue(key: string, v: string | number | boolean): string {
  if (typeof v === "number" && key.startsWith("value")) return fmtINR(v);
  if (typeof v === "number" && key === "durationMs") return `${v} ms`;
  if (typeof v === "number") return fmtInt(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  return String(v);
}

function actorName(e: ActivityEvent): string {
  if (e.actorKind === "Person") return PERSON_BY_ID.get(e.actorId)?.name ?? e.actorId;
  if (e.actorKind === "Agent") return AGENT_BY_ID.get(e.actorId)?.name ?? e.actorId;
  return "System";
}

function family(e: ActivityEvent): FamilyKey {
  const a = e.action.toLowerCase();
  if (a.includes("follow-up")) return "followups";
  if (a.includes("signed off") || a.includes("reopened") || a.includes("exported") || a.includes("posted")) return "signoffs";
  if (a.includes("proposed") || a.includes("approved") || a.includes("rejected") || a.includes("withdrawn") || a.includes("tax review")) return "decisions";
  return "data";
}

/** Monday of the week containing `iso`. */
function weekStart(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

function weekly(events: ActivityEvent[], from: string): WeekRow[] {
  const today = toIsoDate(new Date());
  const last = weekStart(events.reduce((m, e) => (e.at.slice(0, 10) > m ? e.at.slice(0, 10) : m), today));
  const rows: WeekRow[] = [];
  for (let w = weekStart(from); w <= last; w = addDays(w, 7)) {
    rows.push({ week: fmtDate(w).slice(0, 6), label: `Week of ${fmtDate(w)}`, data: 0, followups: 0, decisions: 0, signoffs: 0 });
  }
  const index = new Map(rows.map((r, i) => [r.label, i]));
  for (const e of events) {
    const i = index.get(`Week of ${fmtDate(weekStart(e.at.slice(0, 10)))}`);
    if (i !== undefined) rows[i][family(e)] += 1;
  }
  return rows;
}

function ActorIcon({ kind }: { kind: ActivityEvent["actorKind"] }) {
  const Icon = kind === "Person" ? User : kind === "Agent" ? Bot : Server;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
function EventDetail({ event, onClose }: { event?: ActivityEvent; onClose: () => void }) {
  const decisions = useWorkflow((s) => s.decisions);
  const decision = event?.details?.decision ? decisions[String(event.details.decision)] : undefined;
  const rec = decision?.snapshot.recommendation;
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
        {event && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>{event.action}</DialogTitle>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(event.at)} · {actorName(event)} · {moduleLabel(event.module)}
              </div>
            </DialogHeader>
            <Fields
              rows={[
                ["Object", `${event.object.label ? `${event.object.label} · ` : ""}${event.object.id}`],
                ["Actor", `${actorName(event)} (${event.actorKind.toLowerCase()})`],
                ...(event.before !== undefined ? ([["Before", event.before]] as [string, string][]) : []),
                ...(event.after !== undefined ? ([["After", event.after]] as [string, string][]) : []),
                ...(event.reason ? ([["Reason", event.reason]] as [string, string][]) : []),
                ...Object.entries(event.details ?? {}).map(([k, v]) => [DETAIL_LABELS[k] ?? k, detailValue(k, v)] as [string, string]),
              ]}
            />
            {decision && (
              <div className="border-t border-border">
                <div className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision reconstruction</div>
                <Fields
                  rows={[
                    ["Decision", `${decision.id} · ${decision.action} · ${fmtINR(Math.abs(decision.amount))}`],
                    ["Status", decision.status],
                    ["Proposed", `${PERSON_BY_ID.get(decision.proposedBy)?.name} · ${fmtDateTime(decision.proposedAt)}`],
                    ["Justification", decision.justification || "—"],
                    ["Approval band", `${decision.approvalBandId} · ${decision.chain.length} approver${decision.chain.length > 1 ? "s" : ""}${decision.taxReviewRequired ? " + tax review" : ""}`],
                    ["Approvals", decision.approvals.length ? decision.approvals.map((a) => `${PERSON_BY_ID.get(a.personId)?.name} (${fmtDateTime(a.at)})`).join("; ") : "—"],
                    ["Tax review", decision.taxReview ? `${decision.taxReview.outcome} by ${PERSON_BY_ID.get(decision.taxReview.personId)?.name}` : decision.taxReviewRequired ? "Pending" : "Not required"],
                    ["Rule configuration", decision.snapshot.rulesVersion],
                  ]}
                />
                {decision.snapshot.hits.length > 0 && (
                  <div className="space-y-1 px-5 pb-3">
                    {decision.snapshot.hits.map((h) => (
                      <div key={h.ruleId} className="flex items-start gap-2 text-xs">
                        <MethodBadge method="deterministic" />
                        <span className="font-mono text-2xs text-muted-foreground">{h.ruleId}</span>
                        <span>{h.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                {rec && (
                  <div className="space-y-2 border-t border-border px-5 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <MethodBadge method="judgement" showConfidence={false} />
                      <span className="font-medium">Recommended: {rec.action}</span>
                      <ConfidenceChip score={rec.confidence} />
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.rationale}</p>
                    <ul className="space-y-0.5">
                      {rec.factors.map((f) => (
                        <li key={f.label} className={cn("flex justify-between text-2xs", f.met ? "text-foreground" : "text-muted-foreground line-through")}>
                          <span>{f.label}</span>
                          <span className="tnum">{f.met ? `+${f.weight.toFixed(2)}` : f.weight.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
export function ActivityLog() {
  const all = useActivity();
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState<"all" | ActivityEvent["actorKind"]>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ActivityEvent>();

  const cycleStart = addDays(previousQuarterEnd(WORLD.asOf), 1);
  const inCycle = all.filter((e) => e.at.slice(0, 10) >= cycleStart);
  const chart = useMemo(() => weekly(inCycle, cycleStart), [inCycle, cycleStart]);
  const modules = [...new Set(all.map((e) => e.module))];

  const visible = all.filter(
    (e) =>
      (moduleFilter === "all" || e.module === moduleFilter) &&
      (actorFilter === "all" || e.actorKind === actorFilter) &&
      (!query || `${e.action} ${e.object.id} ${e.object.label ?? ""} ${actorName(e)} ${e.reason ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  );
  const count = (k: ActivityEvent["actorKind"]) => inCycle.filter((e) => e.actorKind === k).length;
  const decisions = inCycle.filter((e) => family(e) === "decisions").length;

  const exportRows = () =>
    downloadCsv(
      "activity-log.csv",
      ["When", "Actor", "Actor type", "Module", "Action", "Object", "Before", "After", "Reason"],
      visible.map((e) => [fmtDateTime(e.at), actorName(e), e.actorKind, moduleLabel(e.module), e.action, `${e.object.label ?? ""} ${e.object.id}`.trim(), e.before ?? "", e.after ?? "", e.reason ?? ""])
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Log"
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportRows}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Events this cycle" value={fmtInt(inCycle.length)} sublabel={`since ${fmtDate(cycleStart)}`} />
        <KpiTile label="By people" value={fmtInt(count("Person"))} />
        <KpiTile label="By agents" value={fmtInt(count("Agent"))} />
        <KpiTile label="By system" value={fmtInt(count("System"))} />
        <KpiTile label="Decision events" value={fmtInt(decisions)} sublabel="proposals, approvals, tax reviews" />
      </div>

      <Panel title="Activity by week">
        <ActivityChart data={chart} />
      </Panel>

      <Panel title="Log" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {moduleLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={(v) => setActorFilter(v as typeof actorFilter)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="Person">People</SelectItem>
              <SelectItem value="Agent">Agents</SelectItem>
              <SelectItem value="System">System</SelectItem>
            </SelectContent>
          </Select>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Action, object, person" className="h-8 w-56" />
          <span className="text-xs text-muted-foreground">{fmtInt(visible.length)} events</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Object</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, 200).map((e) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => setOpen(e)}>
                <TableCell className="whitespace-nowrap tnum text-xs">{fmtDateTime(e.at)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                    <ActorIcon kind={e.actorKind} />
                    {actorName(e)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{moduleLabel(e.module)}</TableCell>
                <TableCell className="text-sm">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: FAMILIES.find((f) => f.key === family(e))!.color }} />
                  {e.action}
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs">
                  {e.object.label ? `${e.object.label} · ` : ""}
                  <span className="font-mono text-muted-foreground">{e.object.id}</span>
                </TableCell>
                <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                  {e.before !== undefined ? `${e.before} → ${e.after ?? ""}` : e.after ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the latest 200 of {fmtInt(visible.length)} — export for the full log</div>}
      </Panel>

      <EventDetail event={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}
