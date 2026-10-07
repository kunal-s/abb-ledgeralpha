import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PERSON_BY_ID, WORLD } from "@/data";
import type { CloseModel } from "@/state/closeModel";
import { useItemHistory } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { taskLink } from "@/lib/closeLinks";
import { dateOfWd, wdLabel } from "@/lib/workdays";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));
const FINANCE_TEAM = WORLD.people.filter((p) => p.roleId !== "external-auditor");

/** One close task: where it stands, what it waits on, and what its owner can do. */
export function TaskBody({ model, taskId, onOpen }: { model: CloseModel; taskId: string; onOpen: (id: string) => void }) {
  const s = model.evaluation.byId.get(taskId)!;
  const role = useRoleStore((r) => r.role);
  const { completeCloseTask, reopenCloseTask, reassignCloseTask, flagCloseBlocker, clearCloseBlocker } = useWorkflow.getState();
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [blocker, setBlocker] = useState("");
  const history = useItemHistory(taskId);
  const link = taskLink(s.task);
  const phase = model.phases.find((p) => p.id === s.task.phase);
  const mayWork = can(role, "close-task");
  const mayManage = can(role, "close-manage");
  const owner = PERSON_BY_ID.get(s.ownerId);
  const ownsIt = owner?.roleId === role || mayManage;
  const pct = s.derived && s.total > 0 ? Math.round((s.done / s.total) * 100) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="text-base font-semibold">{s.task.name}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{s.task.id}</span> · {phase?.name}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusChip status={s.status} />
          {s.late && <StatusChip status="late" label={`Late by ${s.lateBy} ${s.lateBy === 1 ? "day" : "days"}`} />}
          {s.critical && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">On the critical path</span>}
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        <Fields
          compact
          rows={[
            ["Owner", owner?.name ?? s.ownerId],
            ["Planned", `${wdLabel(s.task.startWd)} to ${wdLabel(s.task.dueWd)} · due ${fmtDate(dateOfWd(model.periodEnd, s.task.dueWd))}`],
            ["Projected finish", `${wdLabel(s.projectedFinish)}${s.slipping ? " (after the due day)" : ""}`],
            ["Progress", s.label],
            ...(s.completed ? ([["Completed", `${PERSON_BY_ID.get(s.completed.personId)?.name}, ${fmtDateTime(s.completed.at)}. ${s.completed.evidence}`]] as [string, string][]) : []),
          ]}
        />

        {pct !== undefined && (
          <div className="rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{s.label}</span>
              {link && (
                <Link to={link.to} className="text-xs font-medium text-primary hover:underline">
                  {link.label}
                </Link>
              )}
            </div>
            <Progress value={pct} className="mt-2" indicatorClassName={pct === 100 ? "bg-ok" : "bg-info"} />
          </div>
        )}

        {s.task.after.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follows</h3>
            <ul className="divide-y divide-border/70 rounded-md border border-border">
              {s.task.after.map((id) => {
                const p = model.evaluation.byId.get(id);
                if (!p) return null;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onOpen(id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/50">
                      <span className="min-w-0 truncate text-sm">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{id}</span>
                        {p.task.name}
                      </span>
                      <StatusChip status={p.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!s.derived && s.status !== "complete" && (
          <div className="space-y-2">
            <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Reference of what was done, and where it is filed" className="min-h-[3.5rem]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-muted-foreground">{ownsIt ? "Completed by hand, with a reference" : `Only ${owner?.name ?? "the owner"} or a controller completes this`}</span>
              <Button
                size="sm"
                disabled={!mayWork || !ownsIt}
                title={!mayWork ? `${ROLES[role].label} cannot work on close tasks` : undefined}
                onClick={() => {
                  const r = completeCloseTask(taskId, evidence);
                  run(r, "Task completed");
                  if (r.ok) setEvidence("");
                }}
              >
                Complete task
              </Button>
            </div>
          </div>
        )}
        {s.derived && s.status !== "complete" && link && pct === undefined && (
          <Link to={link.to} className="text-sm font-medium text-primary hover:underline">
            {link.label}
          </Link>
        )}

        {!s.derived && s.status === "complete" && mayManage && (
          <div className="flex items-center gap-2 border-t border-border/70 pt-3">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to reopen" className="h-8" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const r = reopenCloseTask(taskId, reason);
                run(r, "Task reopened");
                if (r.ok) setReason("");
              }}
            >
              Reopen
            </Button>
          </div>
        )}

        {s.status !== "complete" && (
          <div className="space-y-2 border-t border-border/70 pt-3">
            {s.blocker ? (
              <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-foreground">
                <div className="text-2xs">
                  Blocked by {PERSON_BY_ID.get(s.blocker.personId)?.name}, {fmtDateTime(s.blocker.at)}
                </div>
                {s.blocker.reason}
                <div className="mt-2">
                  <Button size="sm" variant="outline" disabled={!mayWork} onClick={() => run(clearCloseBlocker(taskId), "Blocker cleared")}>
                    Clear blocker
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="What is in the way" className="h-8" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!mayWork}
                  onClick={() => {
                    const r = flagCloseBlocker(taskId, blocker);
                    run(r, "Blocker flagged");
                    if (r.ok) setBlocker("");
                  }}
                >
                  Flag blocker
                </Button>
              </div>
            )}
            {mayManage && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Owner</span>
                <Select value={s.ownerId} onValueChange={(v) => run(reassignCloseTask(taskId, v), "Task reassigned")}>
                  <SelectTrigger className="h-8 w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCE_TEAM.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
            <ol className="space-y-2">
              {history.slice(0, 8).map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="tnum text-muted-foreground">{fmtDateTime(e.at)}</span>
                    <span className="font-medium">{e.action}</span>
                  </div>
                  {(e.before || e.after) && <div className="text-muted-foreground">{e.before ? `${e.before} → ` : ""}{e.after}</div>}
                  {e.reason && <div className="text-muted-foreground">“{e.reason}”</div>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
