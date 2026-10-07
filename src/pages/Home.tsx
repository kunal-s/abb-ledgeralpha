import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { ActivityRow, KpiTile, MethodBadge, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { PhaseGantt } from "@/components/close/PhaseGantt";
import { StatusMatrix } from "@/components/close/StatusMatrix";
import { OverviewTab as AuditOverview } from "@/pages/audit/OverviewTab";
import { AGENT_BY_ID } from "@/engine/agents";
import { CORPORATE } from "@/engine/attribution";
import type { CloseArea } from "@/engine/close";
import { ATTENTION_LABEL, closeDay, homeViewOf, type AttentionItem } from "@/state/homeModel";
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

function LeaderHome() {
  const { kpis, attention, close } = useHome();
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
