import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { ActivityRow, KpiTile, MethodBadge, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { AgeingStack } from "@/components/charts/AgeingStack";
import { PhaseGantt } from "@/components/close/PhaseGantt";
import { StatusMatrix } from "@/components/close/StatusMatrix";
import { OverviewTab as AuditOverview } from "@/pages/audit/OverviewTab";
import { AGENT_BY_ID } from "@/engine/agents";
import { CORPORATE } from "@/engine/attribution";
import type { CloseArea } from "@/engine/close";
import { ATTENTION_LABEL, closeDay, homeViewOf, type AttentionItem, type BalanceRisk, type RecHealth } from "@/state/homeModel";
import { BUCKETS } from "@/engine/review";
import { useHome } from "@/state/homeHooks";
import { useWork } from "@/state/workHooks";
import { useActivity } from "@/state/hooks";
import { useItemDrawer } from "@/state/drawer";
import { personForRole } from "@/state/workflow";
import { useRoleStore, useScopeStore } from "@/lib/stores";
import { ROLES } from "@/config/roles";
import { areaLink } from "@/lib/closeLinks";
import { WORK_KIND_LABEL, valueText, type WorkItem } from "@/state/workModel";
import { wdLabel } from "@/lib/workdays";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";

function AgentActivity() {
  const activity = useActivity();
  // the latest run of each agent, and how many times it has run in the period
  const recent = useMemo(() => {
    const byAgent = new Map<string, { latest: (typeof activity)[number]; count: number }>();
    for (const e of activity) {
      if (e.actorKind !== "Agent") continue;
      const cur = byAgent.get(e.actorId);
      if (cur) cur.count += 1;
      else byAgent.set(e.actorId, { latest: e, count: 1 });
    }
    return [...byAgent.values()].slice(0, 6);
  }, [activity]);
  return (
    <Panel title="Agent activity" bodyClassName="p-0">
      {recent.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No agent has run yet</div>
      ) : (
        recent.map(({ latest: e, count }) => {
          const agent = AGENT_BY_ID.get(e.actorId);
          return (
            <ActivityRow
              key={e.id}
              icon={<Bot className="h-4 w-4" />}
              title={`${agent?.name ?? e.actorId}: ${e.action}`}
              meta={`${e.after ?? e.object.label ?? ""} · ${fmtInt(count)} ${count === 1 ? "run" : "runs"} this cycle`}
              time={fmtDate(e.at.slice(0, 10))}
              right={agent ? <MethodBadge method={agent.method} showConfidence={false} /> : undefined}
            />
          );
        })
      )}
    </Panel>
  );
}

function Attention({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();
  const open = useItemDrawer((s) => s.open);
  return (
    <Panel title="Needs attention" bodyClassName="p-0">
      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing needs attention</div>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => (a.itemKey ? open(a.itemKey) : navigate(a.link!))} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{a.title}</span>
                  {a.value ? <span className="shrink-0 text-xs tnum">{fmtINRCompact(a.value)}</span> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {ATTENTION_LABEL[a.kind]} · {a.detail}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function BalanceAtRisk({ risk }: { risk: BalanceRisk }) {
  const navigate = useNavigate();
  const slices = BUCKETS.map((b) => ({ id: b.id, label: b.label, amount: risk.byBucket[b.id].amount, count: risk.byBucket[b.id].count }));
  return (
    <Panel
      title="Balance sheet at risk"
      actions={<span className="text-xs text-muted-foreground tnum">{fmtINRCompact(risk.flaggedValue)} across {fmtInt(risk.flaggedCount)} flagged items</span>}
    >
      <AgeingStack slices={slices} onSelect={() => navigate("/balance-sheet-review?tab=exceptions")} />
      <div className="mt-5 border-t border-border pt-3">
        <div className="mb-1 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Oldest balances, over 365 days</div>
        {risk.stale.length === 0 ? (
          <div className="py-3 text-sm text-muted-foreground">No flagged balance is older than a year</div>
        ) : (
          <ul className="divide-y divide-border">
            {risk.stale.slice(0, 4).map((a) => (
              <li key={a.gl}>
                <Link to={`/balance-sheet-review/${a.gl}`} className="flex items-center justify-between gap-3 py-1.5 text-sm hover:text-primary">
                  <span className="min-w-0 truncate">{a.name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs tnum text-muted-foreground">
                    <span>{a.oldest} days</span>
                    {a.action && <span>{a.action}</span>}
                    <span className="w-16 text-right text-foreground">{fmtINRCompact(a.amount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ReconHealth({ rows }: { rows: RecHealth[] }) {
  const navigate = useNavigate();
  const max = Math.max(1, ...rows.map((r) => r.unexplained));
  return (
    <Panel title="Reconciliation health" bodyClassName="p-0">
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={r.type}>
            <button type="button" onClick={() => navigate(`/reconciliations?tab=register&type=${encodeURIComponent(r.type)}`)} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{r.type}</span>
                <span className="shrink-0 text-xs tnum text-muted-foreground">{r.signed}/{r.total} certified</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-secondary">
                  <div className="anim-grow-x h-full rounded-full bg-warn" style={{ width: `${(r.unexplained / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
                </div>
                <span className="w-28 shrink-0 whitespace-nowrap text-right text-xs tnum">{r.unexplained ? `${fmtINRCompact(r.unexplained)} open` : "within tolerance"}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LeaderHome() {
  const { kpis, attention, close, risk, recHealth } = useHome();
  const navigate = useNavigate();
  const setBusinessUnit = useScopeStore((s) => s.setBusinessUnit);
  const ev = close.evaluation;
  const slip = ev.projectedClose - close.targetWd;
  const drill = (areaId: CloseArea["id"], buId: string) => {
    setBusinessUnit(buId === CORPORATE ? "all" : buId);
    navigate(areaLink(areaId).to);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Home" badge={<StatusChip status={ev.onTrack ? "on-track" : "behind"} label={`${wdLabel(close.realWd)} · ${ev.onTrack ? "close on track" : `close ${slip} ${slip === 1 ? "day" : "days"} behind`}`} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Close progress" value={`${Math.round(kpis.closeProgress * 100)}%`} sublabel={closeDay(close)} accent={ev.onTrack ? "ok" : "warn"} onClick={() => navigate("/close")} />
        <KpiTile label="Accounts signed off" value={`${fmtInt(kpis.accountsSigned)}/${fmtInt(kpis.accountsTotal)}`} sublabel="reviewer signed" accent="info" onClick={() => navigate("/balance-sheet-review?tab=accounts&astatus=signed")} />
        <KpiTile label="Reconciliations certified" value={`${fmtInt(kpis.recsSigned)}/${fmtInt(kpis.recsTotal)}`} sublabel="reviewer signed" accent="info" onClick={() => navigate("/reconciliations?tab=register&rstatus=signed")} />
        <KpiTile label="Exceptions open" value={fmtInt(kpis.exceptions)} sublabel={`${fmtINRCompact(kpis.exceptionsValue)} without an action`} accent={kpis.exceptions ? "warn" : "ok"} onClick={() => navigate("/balance-sheet-review?tab=exceptions")} />
        <KpiTile label="Approvals waiting" value={fmtInt(kpis.approvals)} sublabel={`${fmtInt(kpis.approvalsForRole)} for this role`} accent={kpis.approvalsForRole ? "warn" : "none"} onClick={() => navigate("/my-work?wtype=approval")} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <div className="xl:col-span-3"><BalanceAtRisk risk={risk} /></div>
        <div className="xl:col-span-2"><ReconHealth rows={recHealth} /></div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Status by business unit and close area" className="xl:col-span-2" bodyClassName="p-3">
          <StatusMatrix matrix={close.matrix} wd={close.currentWd} onSelect={drill} />
        </Panel>
        <Attention items={attention} />
      </div>

      <AgentActivity />
    </div>
  );
}

function OperatorHome() {
  const { items, close } = useWork();
  const role = useRoleStore((s) => s.role);
  const navigate = useNavigate();
  const open = useItemDrawer((s) => s.open);
  const person = personForRole(role);
  const preview = items.slice(0, 8);
  const overdue = items.filter((i) => i.overdue).length;
  const tasks = items.filter((i) => i.kind === "close-task").length;
  const waiting = items.filter((i) => i.kind === "approval" || i.kind === "sign-off" || i.kind === "tax-review").length;
  const go = (i: WorkItem) => (i.itemKey ? open(i.itemKey) : navigate(i.link!));

  return (
    <div className="space-y-4">
      <PageHeader title="Home" badge={<span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{ROLES[role].label}, {person.name}</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="In your queue" value={fmtInt(items.length)} sublabel="across modules" accent="info" onClick={() => navigate("/my-work")} />
        <KpiTile label="Overdue" value={fmtInt(overdue)} sublabel="past the date" accent={overdue ? "danger" : "ok"} onClick={() => navigate("/my-work?wdue=overdue")} />
        <KpiTile label="Close tasks" value={fmtInt(tasks)} sublabel={`${wdLabel(close.currentWd)} of ${wdLabel(close.targetWd)}`} onClick={() => navigate("/my-work?wtype=close-task")} />
        <KpiTile label="Approvals and sign-offs" value={fmtInt(waiting)} sublabel="waiting for this role" accent={waiting ? "warn" : "none"} onClick={() => navigate("/my-work")} />
      </div>
      <Panel title="Close calendar" bodyClassName="p-0">
        <PhaseGantt summaries={close.summaries} currentWd={close.currentWd} targetWd={close.targetWd} onSelect={(id) => navigate(`/close?tab=checklist&cphase=${id}`)} />
      </Panel>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Your queue" bodyClassName="p-0" actions={<Link to="/my-work" className="text-xs font-medium text-primary hover:underline">Open My Work</Link>}>
          {preview.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing is waiting for {ROLES[role].label}</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {preview.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => go(i)} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{i.title}</span>
                      <span className="shrink-0 text-xs tnum">{valueText(i)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {WORK_KIND_LABEL[i.kind]}{i.due ? ` · due ${fmtDate(i.due)}` : ""}{i.overdue ? " · overdue" : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <AgentActivity />
      </div>
    </div>
  );
}

function AuditorHome() {
  return (
    <div className="space-y-4">
      <PageHeader title="Home" />
      <AuditOverview />
    </div>
  );
}

export function Home() {
  const role = useRoleStore((s) => s.role);
  const view = homeViewOf(role);
  return view === "leader" ? <LeaderHome /> : view === "operator" ? <OperatorHome /> : <AuditorHome />;
}
