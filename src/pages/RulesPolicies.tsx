import { useQueryParams } from "@/lib/useQueryParams";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Lock, RotateCcw } from "lucide-react";
import { KpiTile, PageHeader, Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { StudioTab } from "@/pages/rules/StudioTab";
import { PolicyPanels } from "@/components/settings/PolicyPanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRuleRun, useActivity } from "@/state/hooks";
import { useWorkflow, type RuleChangeDelta } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { PRODUCT_RULES } from "@/engine/run";
import { PARTY_BY_ID, PERSON_BY_ID } from "@/data";
import { daysBetween, fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { EffectiveRule, RuleParam } from "@/types";

function unitSuffix(p: RuleParam): string {
  return { days: "days", amount: "₹", "%": "%", count: "", years: "years" }[p.unit];
}

// ---------------------------------------------------------------------------
function HitsByRule({ rules, selected, onSelect }: { rules: { rule: EffectiveRule; count: number; value: number }[]; selected: string; onSelect: (id: string) => void }) {
  const max = Math.max(1, ...rules.map((r) => r.count));
  return (
    <ul className="space-y-0.5">
      {rules.map(({ rule, count, value }) => (
        <li key={rule.id}>
          <button
            type="button"
            onClick={() => onSelect(rule.id)}
            className={cn(
              "grid w-full grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.1fr)_5.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              selected === rule.id ? "bg-primary/10" : "hover:bg-accent"
            )}
          >
            <span className="font-mono text-2xs text-muted-foreground">{rule.id}</span>
            <span className={cn("truncate", !rule.enabled && "text-muted-foreground")}>
              {rule.name}
              {rule.custom ? <span className="ml-1.5 text-2xs text-info-foreground">· workspace rule</span> : rule.changed && <span className="ml-1.5 text-2xs text-info-foreground">· changed</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 flex-1 rounded-sm bg-muted">
                {rule.enabled && <span className="block h-2 rounded-sm bg-primary" style={{ width: `${Math.max(count ? 1.5 : 0, (count / max) * 100)}%` }} />}
              </span>
              <span className="w-12 text-right tnum text-xs">{rule.enabled ? fmtInt(count) : "Off"}</span>
            </span>
            <span className="text-right tnum text-xs text-muted-foreground">{rule.enabled ? fmtINRCompact(value) : "-"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
function RuleDetail({ rule, lastDelta, onApplied }: { rule: EffectiveRule; lastDelta?: RuleChangeDelta; onApplied: (d: RuleChangeDelta) => void }) {
  const run = useRuleRun();
  const role = useRoleStore((s) => s.role);
  const setRuleOverride = useWorkflow((s) => s.setRuleOverride);
  const editable = can(role, "edit-rules");
  const product = PRODUCT_RULES.find((r) => r.id === rule.id)!;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    setDraft(Object.fromEntries(rule.params.map((p) => [p.key, p.value])));
    setReason("");
  }, [rule]);

  const dirty = rule.params.some((p) => draft[p.key] !== p.value);
  const stat = run.byRule.get(rule.id) ?? { count: 0, value: 0 };
  const hits = useMemo(
    () =>
      run.hits
        .filter((h) => h.ruleId === rule.id)
        .map((h) => ({ hit: h, item: run.items.get(h.itemKey)! }))
        .sort((a, b) => Math.abs(b.item.amount) - Math.abs(a.item.amount)),
    [run, rule.id]
  );

  const apply = (override: Parameters<typeof setRuleOverride>[1], why?: string) => {
    const r = setRuleOverride(rule.id, override, why);
    if (!r.ok) {
      toast(r.error, { tone: "danger" });
      return;
    }
    onApplied(r.delta);
    toast(`${rule.id} re-evaluated`, { description: `${fmtInt(r.delta.before.count)} → ${fmtInt(r.delta.after.count)} items`, tone: "ok" });
  };

  return (
    <Panel
      title={`${rule.id} · ${rule.name}`}
      actions={<Switch checked={rule.enabled} disabled={!editable} label={rule.enabled ? "Disable rule" : "Enable rule"} onCheckedChange={(v) => apply({ enabled: v })} />}
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <StatusChip status={rule.custom || rule.changed ? "in-review" : "not-started"} label={rule.custom ? "Added in Rule Studio" : rule.changed ? "Changed for this workspace" : "Product default"} />
        <SeverityBadge severity={rule.severity} />
        <span className="text-2xs text-muted-foreground">
          {fmtInt(stat.count)} items · {fmtINRCompact(stat.value)}
        </span>
      </div>
      <Fields
        rows={[
          ["Looks at", rule.scope],
          ["Condition", rule.logic],
          ["Suggests", rule.candidateAction],
          ...(rule.basis ? ([["Basis", rule.basis]] as [string, string][]) : []),
        ]}
      />

      <div className="border-t border-border/70 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parameters</span>
          {!editable && (
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Read-only for {ROLES[role].label}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {rule.params.map((p) => {
            const def = product.params.find((x) => x.key === p.key)!.value;
            return (
              <label key={p.key} className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 text-sm">
                <span>
                  {p.label}
                  {draft[p.key] !== def && <span className="ml-1.5 text-2xs text-muted-foreground">default {p.unit === "amount" ? fmtINR(def) : `${def} ${unitSuffix(p)}`}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  {p.unit === "amount" && <span className="text-xs text-muted-foreground">₹</span>}
                  <Input
                    type="number"
                    value={draft[p.key] ?? ""}
                    disabled={!editable || !rule.enabled}
                    step={p.unit === "%" ? 0.1 : p.unit === "amount" ? 1000 : 1}
                    min={0}
                    onChange={(e) => setDraft((d) => ({ ...d, [p.key]: Number(e.target.value) }))}
                    className="h-8 text-right tnum"
                  />
                  {p.unit !== "amount" && <span className="w-8 text-xs text-muted-foreground">{unitSuffix(p)}</span>}
                </span>
              </label>
            );
          })}
        </div>
        {editable && rule.enabled && (
          <div className="mt-3 flex items-center gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change" className="h-8 flex-1" />
            <Button size="sm" className="h-8" disabled={!dirty} onClick={() => apply({ params: draft }, reason || undefined)}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1"
              disabled={!rule.changed}
              onClick={() => apply({ enabled: product.enabledByDefault, params: Object.fromEntries(product.params.map((x) => [x.key, x.value])) }, "Reset to product default")}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Default
            </Button>
          </div>
        )}
        {lastDelta && lastDelta.ruleId === rule.id && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-info-subtle px-3 py-2 text-xs text-info-foreground tnum">
            <span className="font-medium">Last change</span>
            <span>{fmtInt(lastDelta.before.count)} items</span>
            <ArrowRight className="h-3 w-3" />
            <span className="font-semibold">{fmtInt(lastDelta.after.count)} items</span>
            <span className="text-info-foreground/70">·</span>
            <span>{fmtINRCompact(lastDelta.before.value)}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="font-semibold">{fmtINRCompact(lastDelta.after.value)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border/70">
        <div className="flex items-center justify-between px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Flagged items</span>
          <span className="font-normal normal-case">{hits.length > 8 ? `Largest 8 of ${fmtInt(hits.length)}` : `${hits.length} items`}</span>
        </div>
        {hits.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">{rule.enabled ? "No items flagged" : "Rule is off"}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hits.slice(0, 8).map(({ hit, item }) => (
                <TableRow key={hit.itemKey}>
                  <TableCell className="align-top">
                    <div className="font-mono text-xs">{item.docNo}</div>
                    <div className="text-2xs text-muted-foreground">
                      {item.gl} · {daysBetween(item.postingDate, run.asOf)} days
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {hit.reason}
                    {item.partner && <div className="text-2xs text-muted-foreground">{PARTY_BY_ID.get(item.partner.id)?.name}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top tnum text-xs">{fmtDrCr(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
function ChangeLog() {
  const events = useActivity().filter((e) => e.module === "rules-policies" && e.actorKind === "Person");
  return (
    <Panel title="Change log" bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Changed by</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Change</TableHead>
            <TableHead className="text-right">Items flagged</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap tnum text-xs">{fmtDateTime(e.at)}</TableCell>
              <TableCell className="whitespace-nowrap">{PERSON_BY_ID.get(e.actorId)?.name ?? e.actorId}</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-mono text-2xs text-muted-foreground">{e.object.id}</span> {e.object.label ?? ""}
              </TableCell>
              <TableCell className="text-xs">
                {e.action}
                {e.before && (
                  <div className="text-2xs text-muted-foreground">
                    {e.before} → {e.after}
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tnum text-xs">
                {e.details?.itemsBefore !== undefined ? `${fmtInt(Number(e.details.itemsBefore))} → ${fmtInt(Number(e.details.itemsAfter))}` : "-"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{e.reason ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
export function RulesPolicies() {
  const run = useRuleRun();
  const role = useRoleStore((s) => s.role);
  const resetRules = useWorkflow((s) => s.resetRules);
  const [params, setParams] = useQueryParams();
  const selected = params.get("rule") ?? "BSR-05";
  const setSelected = (id: string) => setParams({ rule: id });
  const [lastDelta, setLastDelta] = useState<RuleChangeDelta>();
  const rows = run.rules.map((rule) => ({ rule, ...(run.byRule.get(rule.id) ?? { count: 0, value: 0 }) }));
  const enabled = run.rules.filter((r) => r.enabled).length;
  const changed = run.rules.filter((r) => r.changed).length;
  const rule = run.rules.find((r) => r.id === selected)!;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rules & Policies"
        actions={
          can(role, "edit-rules") && changed > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                const r = resetRules();
                if (!r.ok) toast(r.error, { tone: "danger" });
                else toast("Rules reset to product defaults", { tone: "ok" });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset all to product defaults
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Rules on" value={`${enabled}/${run.rules.length}`} sublabel="balance sheet review" />
        <KpiTile label="Items flagged" value={fmtInt(run.items.size)} sublabel={`of ${fmtInt(run.ctx.open.length)} open items`} />
        <KpiTile label="Value flagged" value={fmtINRCompact(run.flaggedValue)} sublabel="absolute amount" />
        <KpiTile label="Evaluation" value={`${Math.max(1, Math.round(run.durationMs))} ms`} sublabel={`as at ${fmtDate(run.asOf)}`} />
        <KpiTile label="Workspace changes" value={changed} sublabel={changed === 1 ? "rule differs from default" : "rules differ from default"} accent={changed ? "info" : "none"} />
      </div>

      <Tabs value={params.get("rtab") ?? "rules"} onValueChange={(v) => setParams({ rtab: v === "rules" ? null : v })}>
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="studio">Rule Studio</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="log">Change log</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Hits by rule" actions={<span className="text-2xs text-muted-foreground">items · value</span>}>
              <HitsByRule rules={rows} selected={selected} onSelect={setSelected} />
            </Panel>
            <RuleDetail rule={rule} lastDelta={lastDelta} onApplied={setLastDelta} />
          </div>
        </TabsContent>
        <TabsContent value="studio">
          <StudioTab />
        </TabsContent>
        <TabsContent value="policies">
          <PolicyPanels />
        </TabsContent>
        <TabsContent value="log">
          <ChangeLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

