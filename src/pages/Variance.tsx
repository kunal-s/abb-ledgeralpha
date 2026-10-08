import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { DocLink, KpiTile, MethodBadge, PageHeader, Panel } from "@/components/vocab";
import { InfoTip } from "@/components/vocab/InfoTip";
import { Waterfall } from "@/components/reporting/Waterfall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PC_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { COMPARATORS, bridge, canCompare, draftCommentary, projectNameOf, type Comparator, type Driver } from "@/engine/variance";
import { COMPANY, parseScope, previousMonth, scopeKey, scopeLabel } from "@/engine/pl";
import { useFollowUpsByItem } from "@/state/hooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { usePeriodStore, useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { useQueryParams } from "@/lib/useQueryParams";
import { addDays, fmtDate, fmtDateTime, fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtPct } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`;

function Commentary({ noteKey, label, draft }: { noteKey: string; label: string; draft: string }) {
  const note = useWorkflow((s) => s.varianceNotes[noteKey]);
  const role = useRoleStore((s) => s.role);
  const { saveVarianceNote, discardVarianceNote } = useWorkflow.getState();
  const [text, setText] = useState(note?.text ?? draft);
  const [reason, setReason] = useState("");
  const may = can(role, "report-commentary");
  const changed = text.trim() !== (note?.text ?? draft).trim();
  const run = (r: { ok: boolean; error?: string }, ok: string) => toast(r.ok ? ok : r.error ?? "Not allowed", { tone: r.ok ? "ok" : "danger" });

  return (
    <Panel title="Commentary" actions={<MethodBadge method="judgement" showConfidence={false} />} bodyClassName="space-y-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[7rem] text-sm" disabled={!may} aria-label="Commentary on the variance" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!may || (!!note && !changed)} title={may ? undefined : `${ROLES[role].label} cannot save commentary`} onClick={() => run(saveVarianceNote(noteKey, label, text, text.trim() !== draft.trim()), "Commentary saved")}>
          {note ? "Update commentary" : "Save commentary"}
        </Button>
        {changed && (
          <Button size="sm" variant="ghost" onClick={() => setText(note?.text ?? draft)}>
            Revert
          </Button>
        )}
        {note && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-ok" /> Saved by {PERSON_BY_ID.get(note.personId)?.name}, {fmtDateTime(note.at)}
            {note.edited ? ", edited" : ", as drafted"}
          </span>
        )}
        <div className="flex-1" />
        {note && may && (
          <div className="flex items-center gap-1.5">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to discard" className="h-8 w-44" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const r = discardVarianceNote(noteKey, label, reason);
                run(r, "Commentary discarded");
                if (r.ok) {
                  setText(draft);
                  setReason("");
                }
              }}
            >
              Discard
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function Variance() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const role = useRoleStore((s) => s.role);
  const month = periodEnd.slice(0, 7);
  const scope = parseScope(params.get("vscope"));
  const requested = (params.get("vcmp") as Comparator | null) ?? "prior-month";
  const comparator: Comparator = canCompare(month, requested) ? requested : "prior-month";
  const followUps = useFollowUpsByItem();
  const { requestFollowUp } = useWorkflow.getState();

  const sk = scopeKey(scope);
  const r = useMemo(() => bridge(parseScope(sk), month, comparator), [sk, month, comparator]);
  const draft = useMemo(() => draftCommentary(r), [r]);
  const noteKey = `${sk}|${month}|${comparator}`;
  const label = `${scopeLabel(scope)}, ${fmtMonth(`${month}-01`)} against ${r.baseLabel}`;
  const largestDrag = [...r.components].filter((c) => c.effect < 0).sort((a, b) => a.effect - b.effect)[0];
  const revenueDelta = r.current.revenue - r.base.revenue;
  const marginDelta = r.marginCurrent !== undefined && r.marginBase !== undefined ? (r.marginCurrent - r.marginBase) * 100 : undefined;

  const ask = (d: Driver) => {
    const project = projectNameOf(d);
    const res = requestFollowUp({
      itemKey: d.lineKey, module: "variance-analysis", owner: project ? `Project manager, ${project}` : "Buyer, procurement", dueDate: addDays(nowLocal().slice(0, 10), 7),
      message: `Please explain ${d.title}. It moved the operating result of ${scopeLabel(scope)} by ${signed(d.effect)} in ${fmtMonth(`${month}-01`)} against ${r.baseLabel}.`,
    });
    toast(res.ok ? "Explanation requested" : res.error, { tone: res.ok ? "ok" : "danger" });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Variance Analysis"
        actions={
          <div className="flex items-center gap-2">
            <Select value={scopeKey(scope)} onValueChange={(v) => setParams({ vscope: v === "company" ? null : v })}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">{scopeLabel(COMPANY)}</SelectItem>
                <SelectGroup>
                  <SelectLabel>Business units</SelectLabel>
                  {WORLD.businessUnits.map((b) => (
                    <SelectItem key={b.id} value={`bu:${b.id}`}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Profit centres</SelectLabel>
                  {WORLD.profitCentres.map((p) => (
                    <SelectItem key={p.id} value={`pc:${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={comparator} onValueChange={(v) => setParams({ vcmp: v === "prior-month" ? null : v })}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPARATORS.map((c) => (
                  <SelectItem key={c.key} value={c.key} disabled={!canCompare(month, c.key)}>
                    Against {c.label.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile
          label="Operating result"
          info="Revenue plus exchange gains and one-off income, less materials, employee cost, depreciation, other expenses, exchange losses and one-off expenses. Interest and tax are below it."
          value={fmtINRCompact(r.resultCurrent)}
          sublabel={`${signed(r.delta)} against ${r.baseLabel}`}
          accent={r.delta < 0 ? "danger" : "ok"}
        />
        <KpiTile label="Margin" info="Operating result over revenue" value={r.marginCurrent === undefined ? "-" : fmtPct(r.marginCurrent)} sublabel={marginDelta === undefined ? undefined : `${marginDelta >= 0 ? "+" : "-"}${Math.abs(marginDelta).toFixed(1)} points`} accent={marginDelta !== undefined && marginDelta < 0 ? "warn" : "none"} />
        <KpiTile label="Revenue" value={fmtINRCompact(r.current.revenue)} sublabel={`${signed(revenueDelta)} against ${r.baseLabel}`} />
        <KpiTile
          label="Material price variance"
          info="Quantity received times the price invoiced less the standard price, on the receipts that carry a price reference. A positive figure is an extra cost."
          value={fmtINRCompact(r.ppv.current)}
          sublabel={`was ${fmtINRCompact(r.ppv.base)}`}
          accent={r.ppv.current > r.ppv.base ? "warn" : "none"}
        />
        <KpiTile label="Largest drag" value={largestDrag ? largestDrag.label : "None"} sublabel={largestDrag ? signed(largestDrag.effect) : undefined} accent={largestDrag ? "warn" : "ok"} />
        <KpiTile label="Bridge check" info="The components add up to the total change in the operating result" value="Adds up" sublabel={`difference ${fmtINRCompact(Math.abs(r.residual))}`} accent={Math.abs(r.residual) < 1 ? "ok" : "danger"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title={`Operating result: ${r.baseLabel === "budget" ? "budget" : r.baseLabel} to ${fmtMonth(`${month}-01`)}`} className="xl:col-span-2">
          <Waterfall start={r.resultBase} end={r.resultCurrent} startLabel={r.comparator === "budget" ? "Budget" : fmtMonth(`${previousMonth(month)}-01`)} endLabel={fmtMonth(`${month}-01`)} steps={r.components.map((c) => ({ id: c.id, label: c.label, effect: c.effect }))} />
        </Panel>
        <Panel title="Components" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Effect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.components.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="py-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {c.label}
                      <InfoTip text={c.definition} />
                    </span>
                  </TableCell>
                  <TableCell className={cn("py-2 text-right tnum text-sm", c.effect < 0 ? "text-danger-foreground" : c.effect > 0 ? "text-ok-foreground" : "")}>{c.effect === 0 ? "-" : signed(c.effect)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                <TableCell className="py-2 text-sm font-medium">Change in operating result</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{signed(r.delta)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Panel title="Largest transactions" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Profit centre</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="text-right">Effect on the result</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.drivers.map((d) => {
              const fu = followUps.get(d.lineKey);
              const project = projectNameOf(d);
              return (
                <TableRow key={d.id}>
                  <TableCell className="max-w-md py-2">
                    <div className="truncate text-sm">{d.title}</div>
                    <div className="truncate text-2xs text-muted-foreground">
                      {d.kind === "material-price" ? "Material price" : d.kind === "exchange" ? "Exchange difference" : "One-off"} · {fmtMonth(`${d.month}-01`)}
                      {project ? ` · ${project}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs">{PC_BY_ID.get(d.profitCentreId)?.name}</TableCell>
                  <TableCell className="py-2">
                    <DocLink itemKey={d.lineKey}>{d.docKey.split("-")[1]}</DocLink>
                    {d.po && <div className="font-mono text-2xs text-muted-foreground">PO {d.po}</div>}
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", d.effect < 0 ? "text-danger-foreground" : "text-ok-foreground")}>{signed(d.effect)}</TableCell>
                  <TableCell className="py-2 text-right">
                    {fu && fu.status !== "closed" ? (
                      <span className="text-xs text-muted-foreground">{fu.status === "responded" ? "Answered" : `Asked, due ${fmtDate(fu.dueDate)}`}</span>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7" disabled={!can(role, "follow-up")} title={can(role, "follow-up") ? undefined : `${ROLES[role].label} cannot request follow-ups`} onClick={() => ask(d)}>
                        Ask for an explanation
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {r.drivers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No identified transactions moved the result
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>

      <Commentary key={noteKey} noteKey={noteKey} label={label} draft={draft} />
    </div>
  );
}
