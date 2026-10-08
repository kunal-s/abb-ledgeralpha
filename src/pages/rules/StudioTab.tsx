import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Sparkles, Trash2 } from "lucide-react";
import { AgeingStack } from "@/components/charts/AgeingStack";
import { DocLink, KpiTile, MethodBadge, Panel, SeverityBadge } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PARTY_BY_ID } from "@/data";
import { backtest, conditionText, parseRuleText, suggestRules, type Condition, type ParseResult } from "@/engine/ruleStudio";
import { BUCKETS, bucketOf, ageOf } from "@/engine/review";
import { useRuleRun } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { can } from "@/config/roles";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { ActionKind } from "@/types";

const EXAMPLES = [
  "Vendor advances older than 365 days with no PO activity, recommend provide",
  "GR/IR over 180 days where the PO is closed, write back",
  "Retention over 365 days above ₹25 lakh, recommend escalate",
  "Customer advances over a year where the customer is inactive, follow up",
];

const ACTIONS: ActionKind[] = ["Write back", "Write off", "Provide", "Clear", "Reclassify", "Escalate", "Follow up"];

function ConditionEditor({ c, onChange }: { c: Condition; onChange: (c: Condition) => void }) {
  const num = (v: number, set: (n: number) => Condition, step = 1) => (
    <Input type="number" min={0} step={step} value={v} onChange={(e) => onChange(set(Math.max(0, Number(e.target.value))))} className="h-7 w-28 text-right tnum" />
  );
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">
        {c.kind === "age-over" && "Older than"}
        {c.kind === "amount-over" && "Amount at least"}
        {c.kind === "no-po-activity" && "No purchase order activity for"}
        {(c.kind === "po-closed" || c.kind === "partner-status" || c.kind === "manual-entry") && conditionText(c).replace(/^./, (x) => x.toUpperCase())}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {c.kind === "age-over" && <>{num(c.days, (n) => ({ kind: "age-over", days: n }))} days</>}
        {c.kind === "amount-over" && <>₹ {num(c.amount, (n) => ({ kind: "amount-over", amount: n }), 100000)}</>}
        {c.kind === "no-po-activity" && <>{num(c.days, (n) => ({ kind: "no-po-activity", days: n }))} days</>}
      </span>
    </div>
  );
}

export function StudioTab() {
  const run = useRuleRun();
  const role = useRoleStore((s) => s.role);
  const addStudioRule = useWorkflow((s) => s.addStudioRule);
  const removeStudioRule = useWorkflow((s) => s.removeStudioRule);
  const studioRules = useWorkflow((s) => s.studioRules);
  const [, setParams] = useQueryParams();
  const editable = can(role, "edit-rules");

  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult>();
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [action, setAction] = useState<ActionKind>("Follow up");

  const draft = (t: string) => {
    const p = parseRuleText(t);
    setText(t);
    setParsed(p);
    setConditions(p.rule.conditions);
    setAction(p.rule.action);
  };

  const rule = useMemo(() => (parsed ? { id: "CUS-00", ...parsed.rule, conditions, action } : undefined), [parsed, conditions, action]);
  const bt = useMemo(() => (rule ? backtest(rule, run) : undefined), [rule, run]);
  const suggestions = useMemo(() => suggestRules(run), [run]);

  const slices = useMemo(() => {
    if (!bt) return [];
    return BUCKETS.map((b) => {
      const rs = bt.rows.filter((r) => bucketOf(ageOf(r.line, run.asOf)) === b.id);
      return { id: b.id, label: b.label, count: rs.length, amount: rs.reduce((s, r) => s + Math.abs(r.line.amount), 0) };
    });
  }, [bt, run.asOf]);

  const accept = () => {
    if (!rule) return;
    const r = addStudioRule({ name: rule.name, source: rule.source, categories: rule.categories, conditions: rule.conditions, action: rule.action, severity: rule.severity });
    if (!r.ok) {
      toast(r.error, { tone: "danger" });
      return;
    }
    toast(`${r.id} added to the rule library`, { description: `${fmtInt(r.count)} items flagged`, tone: "ok" });
    setParams({ rtab: "rules", rule: r.id });
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <div className="space-y-3 xl:col-span-2">
        <Panel title="Describe a rule in your own words">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) draft(text);
            }}
            placeholder="For example: vendor advances older than a year with no PO activity, recommend provide"
            className="min-h-[72px] text-sm"
          />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col items-start gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => draft(e)} className="rounded-full border border-border bg-card px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  {e}
                </button>
              ))}
            </div>
            <Button size="sm" disabled={!text.trim()} onClick={() => draft(text)} className="gap-1.5">
              Draft rule <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Panel>

        {rule && parsed && bt && (
          <>
            <Panel title={rule.name} actions={<><SeverityBadge severity={rule.severity} /><MethodBadge method="judgement" showConfidence={false} /></>} bodyClassName="p-0">
              <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
                <div className="border-b border-border px-4 py-3 md:border-b-0 md:border-r">
                  <div className="mb-1 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">What was understood</div>
                  <ul className="space-y-1 text-sm">
                    {parsed.understood.map((u) => (
                      <li key={u} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{u}</li>
                    ))}
                  </ul>
                  {parsed.warnings.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-warn-foreground">
                      {parsed.warnings.map((w) => (
                        <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="px-4 py-3">
                  <div className="mb-1 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Conditions, as the engine will run them</div>
                  <div className="divide-y divide-border">
                    {conditions.length === 0 && <div className="py-2 text-sm text-muted-foreground">No condition yet</div>}
                    {conditions.map((c, i) => (
                      <ConditionEditor key={`${c.kind}-${i}`} c={c} onChange={(n) => setConditions(conditions.map((x, j) => (j === i ? n : x)))} />
                    ))}
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-sm">Recommends</span>
                      <Select value={action} onValueChange={(v) => setAction(v as ActionKind)}>
                        <SelectTrigger className="h-7 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Would flag" value={fmtInt(bt.count)} sublabel={`${fmtINRCompact(bt.value)} across ${fmtInt(bt.byCategory.length)} areas`} />
              <KpiTile label="Nothing flags today" value={fmtInt(bt.fresh.count)} sublabel={fmtINRCompact(bt.fresh.value)} accent={bt.fresh.count ? "info" : "none"} />
              <KpiTile label="Already flagged" value={fmtInt(bt.count - bt.fresh.count)} sublabel={bt.overlap.length ? bt.overlap.slice(0, 3).map((o) => `${o.ruleId} ${fmtInt(o.count)}`).join(", ") : "by no other rule"} />
              <KpiTile label="Of open items" value={run.ctx.open.length ? `${((bt.count / run.ctx.open.length) * 100).toFixed(1)}%` : "-"} sublabel={`${fmtInt(run.ctx.open.length)} open items tested`} />
            </div>

            <Panel title="Backtest on the ledger" actions={<span className="text-xs text-muted-foreground">as at the review date, no data changed</span>}>
              {bt.count === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No open item meets these conditions</div>
              ) : (
                <>
                  <AgeingStack slices={slices} />
                  <div className="-mx-4 mt-4 border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document</TableHead>
                          <TableHead>Party and reason</TableHead>
                          <TableHead className="text-right">Age</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Flagged today by</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bt.rows.slice(0, 8).map((r) => (
                          <TableRow key={r.key}>
                            <TableCell><DocLink itemKey={r.key}>{r.line.docNo}</DocLink></TableCell>
                            <TableCell className="max-w-72">
                              <div className="truncate text-sm">{r.line.partner ? PARTY_BY_ID.get(r.line.partner.id)?.name : r.line.text ?? "-"}</div>
                              <div className="truncate text-2xs text-muted-foreground">{r.reason}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tnum">{fmtInt(ageOf(r.line, run.asOf))} d</TableCell>
                            <TableCell className="whitespace-nowrap text-right tnum">{fmtDrCr(r.line.amount, true)}</TableCell>
                            <TableCell className="font-mono text-2xs text-muted-foreground">{r.existing.length ? r.existing.slice(0, 3).join(", ") : "Not flagged"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {bt.count > 8 && <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground tnum">The largest 8 of {fmtInt(bt.count)} items</div>}
                  </div>
                </>
              )}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
                {!editable && <span className="text-xs text-muted-foreground">Only the controller and the head of finance can add rules</span>}
                <Button disabled={!editable || conditions.length === 0} onClick={accept}>Add to the rule library</Button>
              </div>
            </Panel>
          </>
        )}
      </div>

      <div className="space-y-3">
        <Panel title="Patterns no rule covers" actions={<MethodBadge method="judgement" showConfidence={false} />} bodyClassName="p-0">
          {suggestions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Every pattern checked is already covered</div>
          ) : (
            <ul className="divide-y divide-border">
              {suggestions.map((s) => (
                <li key={s.text} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-sm">{s.text.replace(/^./, (c) => c.toUpperCase())}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground tnum">{s.evidence}</div>
                      <button type="button" onClick={() => draft(s.text)} className="mt-1.5 text-xs font-medium text-primary hover:underline">Draft this rule</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Rules added in this workspace" bodyClassName="p-0">
          {studioRules.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">None yet</div>
          ) : (
            <ul className="divide-y divide-border">
              {studioRules.map((r) => {
                const stat = run.byRule.get(r.id);
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <button type="button" className="min-w-0 text-left" onClick={() => setParams({ rtab: "rules", rule: r.id })}>
                      <div className="truncate text-sm"><span className="mr-2 font-mono text-2xs text-muted-foreground">{r.id}</span>{r.name}</div>
                      <div className="text-xs text-muted-foreground tnum">{stat ? `${fmtInt(stat.count)} items, ${fmtINRCompact(stat.value)}` : "not evaluated"}</div>
                    </button>
                    {editable && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" aria-label={`Remove ${r.id}`} onClick={() => { const x = removeStudioRule(r.id); toast(x.ok ? `${r.id} removed` : x.error, { tone: x.ok ? "ok" : "danger" }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
