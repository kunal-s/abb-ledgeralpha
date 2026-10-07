import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { PhaseGantt } from "@/components/close/PhaseGantt";
import { StatusMatrix } from "@/components/close/StatusMatrix";
import { PERSON_BY_ID } from "@/data";
import type { CloseModel } from "@/state/closeModel";
import { useScopeStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { CORPORATE } from "@/engine/attribution";
import type { CloseArea } from "@/engine/close";
import { areaLink, taskLink } from "@/lib/closeLinks";
import { dateOfWd, wdLabel } from "@/lib/workdays";
import { fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OverviewTab({ model }: { model: CloseModel }) {
  const [, setParams] = useQueryParams();
  const navigate = useNavigate();
  const setBusinessUnit = useScopeStore((s) => s.setBusinessUnit);
  const ev = model.evaluation;

  const stats = useMemo(() => {
    const open = ev.states.filter((s) => s.status !== "complete");
    return {
      complete: ev.states.length - open.length,
      late: open.filter((s) => s.late),
      blocked: open.filter((s) => s.status === "blocked"),
      soon: open.filter((s) => !s.late && s.task.dueWd <= model.currentWd + 1),
    };
  }, [ev, model.currentWd]);

  const trouble = useMemo(
    () =>
      ev.states
        .filter((s) => s.status === "blocked" || s.late)
        .sort((a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || b.lateBy - a.lateBy || Number(b.critical) - Number(a.critical))
        .slice(0, 8),
    [ev]
  );

  const slip = ev.projectedClose - model.targetWd;
  const toChecklist = (extra: Record<string, string | null>) => setParams({ tab: "checklist", ...extra }, { replace: false });
  const drill = (areaId: CloseArea["id"], buId: string) => {
    setBusinessUnit(buId === CORPORATE ? "all" : buId);
    navigate(areaLink(areaId).to);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Close progress" value={`${Math.round(ev.progress * 100)}%`} sublabel={`${stats.complete} of ${ev.states.length} tasks complete`} accent="info" onClick={() => toChecklist({})} />
        <KpiTile label="Working day" value={wdLabel(model.currentWd)} sublabel={`${fmtDate(dateOfWd(model.periodEnd, model.currentWd))} · target ${wdLabel(model.targetWd)}`} />
        <KpiTile
          label="Projected sign-off"
          value={ev.states.every((s) => s.status === "complete") ? "Done" : wdLabel(ev.projectedClose)}
          sublabel={slip > 0 ? `${slip} ${slip === 1 ? "day" : "days"} after the target` : "within the target"}
          accent={ev.onTrack ? "ok" : "warn"}
        />
        <KpiTile label="Late tasks" value={fmtInt(stats.late.length)} sublabel="past their due day" accent={stats.late.length ? "danger" : "ok"} onClick={() => toChecklist({ cstatus: "late" })} />
        <KpiTile label="Blocked" value={fmtInt(stats.blocked.length)} sublabel="a blocker is flagged" accent={stats.blocked.length ? "danger" : "none"} onClick={() => toChecklist({ cstatus: "blocked" })} />
        <KpiTile label="Due in two days" value={fmtInt(stats.soon.length)} sublabel="not yet complete" accent={stats.soon.length ? "warn" : "none"} onClick={() => toChecklist({ cstatus: "soon" })} />
      </div>

      <Panel title="Close calendar" bodyClassName="p-0">
        <PhaseGantt summaries={model.summaries} currentWd={model.currentWd} targetWd={model.targetWd} onSelect={(id) => toChecklist({ cphase: id, cstatus: null })} />
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Critical path" bodyClassName="p-3">
          {ev.criticalPath.length === 0 ? (
            <div className="px-1 py-6 text-center text-sm text-muted-foreground">Every task is complete</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {ev.criticalPath.map((id, i) => {
                const s = ev.byId.get(id)!;
                return (
                  <span key={id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setParams({ tab: "checklist", task: id }, { replace: false })}
                      className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent", s.late ? "border-danger/40 bg-danger-subtle text-danger-foreground" : "border-border bg-card")}
                    >
                      <span className="font-mono font-semibold">{id}</span>
                      <span className="max-w-44 truncate">{s.task.name}</span>
                      <span className="tnum text-muted-foreground">{wdLabel(s.projectedFinish)}</span>
                    </button>
                    {i < ev.criticalPath.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </span>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Blockers and late tasks" bodyClassName="p-0">
          {trouble.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing is late or blocked</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {trouble.map((s) => {
                const link = taskLink(s.task);
                return (
                  <li key={s.task.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-accent/50">
                    <button type="button" onClick={() => setParams({ tab: "checklist", task: s.task.id }, { replace: false })} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{s.task.name}</span>
                        {s.status === "blocked" ? <StatusChip status="blocked" /> : <StatusChip status="late" label={`Late by ${s.lateBy} ${s.lateBy === 1 ? "day" : "days"}`} />}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {PERSON_BY_ID.get(s.ownerId)?.name} · {s.blocker ? s.blocker.reason : s.label}
                      </div>
                    </button>
                    {link && (
                      <button type="button" onClick={() => navigate(link.to)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={link.label} title={link.label}>
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Progress by business unit" bodyClassName="p-3">
        <StatusMatrix matrix={model.matrix} wd={model.currentWd} onSelect={drill} />
      </Panel>
    </div>
  );
}
