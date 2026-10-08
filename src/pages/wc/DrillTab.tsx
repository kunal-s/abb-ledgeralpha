import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { DocLink, KpiTile, Panel } from "@/components/vocab";
import { InfoTip } from "@/components/vocab/InfoTip";
import { AgeingBar, AgeingLegend } from "@/components/reporting/AgeingBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID, PC_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { AGEING_POLICY } from "@/config/policies";
import { ROLES, can } from "@/config/roles";
import { CORPORATE } from "@/engine/attribution";
import { STEP_ORDER, behaviourOf, followUpFor, type StepId } from "@/engine/collections";
import { BUCKETS, ageOf, type BucketId } from "@/engine/review";
import { agedGrade, balanceOf, drill, type DrillPath, type DrillRow, type Side } from "@/engine/workingCapital";
import { useFollowUpsByItem } from "@/state/hooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const LEVEL_NAME = { bu: "Business unit", pc: "Profit centre", project: "Project", party: "", document: "Document" } as const;
const SHOWN = 200;
type Sort = "urgent" | "oldest" | "largest";
const SORTS: { key: Sort; label: string }[] = [
  { key: "urgent", label: "Most pressing first" },
  { key: "oldest", label: "Oldest first" },
  { key: "largest", label: "Largest first" },
];
const PAYABLE_STEPS = new Set<StepId>(["pay", "apply-credit", "not-due"]);
const AGED_TINT = { ok: "", watch: "warn", act: "danger" } as const;

export function DrillTab({ side }: { side: Side }) {
  const pfx = side === "receivables" ? "r" : "p";
  const [params, setParams] = useQueryParams();
  const role = useRoleStore((s) => s.role);
  const followUps = useFollowUpsByItem();
  const { requestFollowUps } = useWorkflow.getState();
  const read = (k: string) => params.get(`${pfx}${k}`) ?? undefined;
  const band = BUCKETS.some((b) => b.id === read("band")) ? (read("band") as BucketId) : undefined;
  const stepFilter = STEP_ORDER.some((s) => s.id === read("step")) ? (read("step") as StepId) : undefined;
  const path: DrillPath = { bu: read("bu"), pc: read("pc"), project: read("prj"), party: read("pty"), band, step: stepFilter };
  const sort: Sort = SORTS.some((s) => s.key === read("sort")) ? (read("sort") as Sort) : "urgent";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pathKey = JSON.stringify(path);
  const d = useMemo(() => drill(side, path, WORLD.asOf, true), [side, pathKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const everything = useMemo(() => drill(side, {}).total, [side]);
  const documents = d.level === "document" || read("view") === "docs";
  const partyLabel = side === "receivables" ? "Customer" : "Supplier";
  const today = nowLocal().slice(0, 10);
  const total = d.total;
  const agedShare = total.amount ? total.aged / total.amount : 0;
  const pastDueShare = total.amount ? total.pastDue / total.amount : 0;
  const isOpen = (key: string) => {
    const f = followUps.get(key);
    return !!f && f.status !== "closed";
  };

  const sorted = useMemo(() => {
    const urgency = (key: string) => d.steps.get(key)?.urgency ?? 0;
    const items = [...d.items];
    if (sort === "oldest") items.sort((a, b) => a.postingDate.localeCompare(b.postingDate));
    else if (sort === "largest") items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    else items.sort((a, b) => urgency(b.key) - urgency(a.key) || Math.abs(b.amount) - Math.abs(a.amount));
    return items;
  }, [d, sort]);
  const shown = sorted.slice(0, SHOWN);
  const openCount = d.items.filter((l) => isOpen(l.key)).length;
  const answered = d.items.filter((l) => followUps.get(l.key)?.status === "responded").length;

  const crumbs: { label: string; set: Record<string, string | null> }[] = [
    { label: side === "receivables" ? "All receivables" : "All payables", set: { bu: null, pc: null, prj: null, pty: null } },
    ...(path.bu ? [{ label: path.bu === CORPORATE ? "Corporate" : WORLD.businessUnits.find((b) => b.id === path.bu)?.name ?? path.bu, set: { pc: null, prj: null, pty: null } }] : []),
    ...(path.pc ? [{ label: PC_BY_ID.get(path.pc)?.name ?? path.pc, set: { prj: null, pty: null } }] : []),
    ...(path.project ? [{ label: path.project === "none" ? "No project" : PROJECT_BY_WBS.get(path.project)?.name ?? path.project, set: { pty: null } }] : []),
    ...(path.party ? [{ label: PARTY_BY_ID.get(path.party)?.name ?? path.party, set: {} }] : []),
  ];
  const go = (patch: Record<string, string | null>, replace = false) => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) out[`${pfx}${k}`] = v;
    setParams(out, { replace });
    setSelected(new Set());
  };
  const open = (r: DrillRow) => {
    if (d.level === "bu") go({ bu: r.key });
    else if (d.level === "pc") go({ pc: r.key });
    else if (d.level === "project") go({ prj: r.key });
    else go({ pty: r.key });
  };

  const request = (keys: string[]) => {
    const inputs = keys.flatMap((k) => {
      const l = d.items.find((x) => x.key === k);
      const s = d.steps.get(k);
      return l && s && s.action && !isOpen(k) ? [followUpFor(side, l, s, today)] : [];
    });
    if (!inputs.length) return;
    const r = requestFollowUps(inputs);
    if (r.ok) {
      toast(`${r.created} follow-up${r.created === 1 ? "" : "s"} requested`, { tone: "ok" });
      setSelected(new Set());
    } else toast(r.error, { tone: "danger" });
  };
  const chosen = shown.filter((l) => selected.has(l.key) && d.steps.get(l.key)?.action && !isOpen(l.key));
  const needing = shown.filter((l) => d.steps.get(l.key)?.action && !isOpen(l.key));
  const mayAsk = can(role, "follow-up");
  const behaviour = path.party ? behaviourOf(path.party) : undefined;

  const stepOptions = STEP_ORDER.filter((s) => side === "receivables" || PAYABLE_STEPS.has(s.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          label={side === "receivables" ? "Receivables in this view" : "Payables in this view"}
          info={side === "receivables" ? "Open items on the receivable accounts, retention included, at the period end. They agree to the receivables column of the overview" : "Open items on the payable accounts at the period end. They agree to the payables column of the overview"}
          value={fmtINRCompact(total.amount)}
          sublabel={`${fmtInt(total.count)} items${everything.amount && total.amount !== everything.amount ? `, ${((total.amount / everything.amount) * 100).toFixed(0)}% of all` : ""}`}
          accent="info"
        />
        <KpiTile label="Past due" info="Open items whose due date has passed" value={fmtINRCompact(total.pastDue)} sublabel={total.amount ? `${(pastDueShare * 100).toFixed(0)}% of the view` : undefined} accent={pastDueShare >= 0.5 ? "warn" : "none"} />
        <KpiTile
          label={`Older than ${AGEING_POLICY.reviewThresholdDays} days`}
          info="Open items past the review threshold of the Balance Sheet Review"
          value={fmtINRCompact(total.aged)}
          sublabel={total.amount ? `${(agedShare * 100).toFixed(1)}% of the view` : undefined}
          accent={agedGrade(agedShare) === "act" ? "danger" : agedGrade(agedShare) === "watch" ? "warn" : "none"}
        />
        <KpiTile label="Need a step" info="Open items whose next step is more than waiting: the step follows from how far past due the item is, its age and, for retention, the project" value={fmtInt(total.toAct)} sublabel={total.toAct ? fmtINRCompact(Math.abs(total.toActAmount)) : "nothing to do"} accent={total.toAct ? "warn" : "ok"} />
        <KpiTile label="Follow-ups open" info="Follow-ups asked for items in this view and not yet closed" value={fmtInt(openCount)} sublabel={answered ? `${answered} answered` : "awaiting an answer"} />
      </div>

      <Panel
        title={documents ? "Documents" : `By ${(LEVEL_NAME[d.level] || partyLabel).toLowerCase()}`}
        bodyClassName="p-0"
        actions={
          documents ? (
            <>
              <Button size="sm" variant="outline" className="h-7" disabled={!needing.length} onClick={() => setSelected(new Set(needing.map((l) => l.key)))}>
                Select what needs a step ({needing.length})
              </Button>
              {chosen.length > 0 && (
                <Button size="sm" className="h-7" disabled={!mayAsk} title={mayAsk ? undefined : `${ROLES[role].label} cannot request follow-ups`} onClick={() => request(chosen.map((l) => l.key))}>
                  Request follow-up for {chosen.length}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 px-4 py-2.5">
          <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {i < crumbs.length - 1 ? (
                  <button type="button" onClick={() => go(c.set)} className="text-primary hover:underline">
                    {c.label}
                  </button>
                ) : (
                  <span className="font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={band ?? "all"} onValueChange={(v) => go({ band: v }, true)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ages</SelectItem>
                {BUCKETS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stepFilter ?? "all"} onValueChange={(v) => go({ step: v }, true)}>
              <SelectTrigger className="h-8 w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every next step</SelectItem>
                {stepOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {documents && (
              <Select value={sort} onValueChange={(v) => go({ sort: v }, true)}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {d.level !== "document" && (
              <div className="flex overflow-hidden rounded-md border border-border">
                <button type="button" onClick={() => go({ view: null }, true)} className={cn("h-8 px-3 text-xs", !documents ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-muted/50")}>
                  By {(LEVEL_NAME[d.level] || partyLabel).toLowerCase()}
                </button>
                <button type="button" onClick={() => go({ view: "docs" }, true)} className={cn("h-8 border-l border-border px-3 text-xs", documents ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-muted/50")}>
                  Documents
                </button>
              </div>
            )}
          </div>
        </div>
        {behaviour && (
          <div className="border-b border-border/70 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            {PARTY_BY_ID.get(path.party!)?.name} settles an invoice in {Math.round(behaviour.averageDays)} days on average, from {fmtInt(behaviour.invoices)} invoices
          </div>
        )}
        {!documents && (
          <div className="border-b border-border/70 px-4 py-2">
            <AgeingLegend />
          </div>
        )}

        {documents ? (
          <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pr-0">
                  <input type="checkbox" aria-label="Select all documents shown" checked={needing.length > 0 && needing.every((l) => selected.has(l.key))} onChange={(e) => setSelected(e.target.checked ? new Set(needing.map((l) => l.key)) : new Set())} />
                </TableHead>
                <TableHead>Document</TableHead>
                {!path.party && <TableHead>{partyLabel}</TableHead>}
                <TableHead>Posted</TableHead>
                <TableHead className="text-right">Age</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Next step <InfoTip text="Proposed from how far past due the item is, its age and, for retention, the stage of the project. Hover a step for the facts it rests on" />
                  </span>
                </TableHead>
                <TableHead>Follow-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((l) => {
                const s = d.steps.get(l.key)!;
                const f = followUps.get(l.key);
                const live = !!f && f.status !== "closed";
                const age = ageOf(l, WORLD.asOf);
                const late = l.dueDate && l.dueDate < WORLD.asOf ? daysBetween(l.dueDate, WORLD.asOf) : 0;
                const party = l.partner ? PARTY_BY_ID.get(l.partner.id) : undefined;
                return (
                  <TableRow key={l.key} data-state={selected.has(l.key) ? "selected" : undefined}>
                    <TableCell className="w-8 pr-0">
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.docNo}`}
                        disabled={!s.action || live}
                        checked={selected.has(l.key)}
                        onChange={() =>
                          setSelected((cur) => {
                            const n = new Set(cur);
                            if (n.has(l.key)) n.delete(l.key);
                            else n.add(l.key);
                            return n;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-48 py-2">
                      <DocLink itemKey={l.key}>{l.reference ?? l.docNo}</DocLink>
                      <div className="truncate text-2xs text-muted-foreground">{l.text ?? ""}</div>
                    </TableCell>
                    {!path.party && (
                      <TableCell className="max-w-40 py-2">
                        <div className="truncate text-sm">{party?.name ?? "-"}</div>
                        {party?.msme && <div className="text-2xs text-muted-foreground">{party.msme} enterprise</div>}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap py-2 text-xs tnum">
                      {fmtDate(l.postingDate)}
                      <div className="text-2xs text-muted-foreground">{l.dueDate ? `due ${fmtDate(l.dueDate)}` : "no due date"}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum">
                      <div className={cn("text-sm", age > 365 ? "font-medium text-danger-foreground" : age > 180 ? "text-warn-foreground" : "")}>{age} days</div>
                      {late > 0 && <div className="text-2xs text-muted-foreground">{late} past due</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(balanceOf(side, l))}</TableCell>
                    <TableCell className="max-w-56 py-2">
                      <span className="flex items-center gap-1">
                        <span className={cn("truncate text-sm", s.action ? "" : "text-muted-foreground")}>{s.label}</span>
                        <InfoTip text={s.basis.join(". ")} />
                      </span>
                      {s.action && <div className="truncate text-2xs text-muted-foreground">Ask {s.owner}</div>}
                    </TableCell>
                    <TableCell className="py-2">
                      {live ? (
                        <Badge variant={f!.status === "responded" ? "ok" : "info"}>{f!.status === "responded" ? "Answered" : `Asked, due ${fmtDate(f!.dueDate)}`}</Badge>
                      ) : s.action ? (
                        <Button size="sm" variant="outline" className="h-7" disabled={!mayAsk} title={mayAsk ? undefined : `${ROLES[role].label} cannot request follow-ups`} onClick={() => request([l.key])}>
                          Request
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Nothing matches these filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        ) : (
          <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
            <TableHeader>
              <TableRow>
                <TableHead>{LEVEL_NAME[d.level] || partyLabel}</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Ageing</TableHead>
                <TableHead className="text-right">Past due</TableHead>
                <TableHead className="text-right">Older than {AGEING_POLICY.reviewThresholdDays} days</TableHead>
                <TableHead className="text-right">Need a step</TableHead>
                <TableHead className="text-right">Oldest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.slice(0, SHOWN).map((r) => {
                const share = r.amount ? r.aged / r.amount : 0;
                const grade = agedGrade(share);
                return (
                  <TableRow key={r.key} className="cursor-pointer" onClick={() => open(r)}>
                    <TableCell className="max-w-72 py-2">
                      <div className="truncate text-sm">{r.label}</div>
                      {r.sublabel && <div className="truncate text-2xs text-muted-foreground">{r.sublabel}</div>}
                    </TableCell>
                    <TableCell className="py-2 text-right tnum text-sm">{fmtInt(r.count)}</TableCell>
                    <TableCell className="w-40 whitespace-nowrap py-2 text-right tnum text-sm">
                      {fmtINRCompact(r.amount)}
                      <div className="ml-auto mt-1 h-1 w-full rounded-full bg-muted">
                        <div className="ml-auto h-full rounded-full bg-primary/45" style={{ width: `${total.amount > 0 ? Math.max(2, Math.min(100, (r.amount / total.amount) * 100)) : 0}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <AgeingBar bands={r.bands} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.pastDue ? fmtINRCompact(r.pastDue) : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {r.aged ? fmtINRCompact(r.aged) : "-"}
                        {r.aged > 0 && <Badge variant={grade === "ok" ? "default" : AGED_TINT[grade]}>{(share * 100).toFixed(0)}%</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.toAct ? `${fmtInt(r.toAct)}, ${fmtINRCompact(Math.abs(r.toActAmount))}` : "-"}</TableCell>
                    <TableCell className="py-2 text-right tnum text-sm">{r.oldest} days</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                <TableCell className="py-2 text-sm font-medium">Total</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{fmtInt(total.count)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{fmtINRCompact(total.amount)}</TableCell>
                <TableCell className="py-2">
                  <AgeingBar bands={total.bands} />
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{total.pastDue ? fmtINRCompact(total.pastDue) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{total.aged ? fmtINRCompact(total.aged) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{total.toAct ? `${fmtInt(total.toAct)}, ${fmtINRCompact(Math.abs(total.toActAmount))}` : "-"}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{total.oldest} days</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        {documents && sorted.length > SHOWN && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the first {SHOWN} of {fmtInt(sorted.length)} documents. Narrow the view with the filters or the breadcrumb</div>}
      </Panel>
    </div>
  );
}
