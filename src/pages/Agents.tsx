import { useMemo } from "react";
import { Bot } from "lucide-react";
import { ActivityRow, DocLink, KpiTile, MethodBadge, PageHeader, Panel } from "@/components/vocab";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAgents } from "@/state/agentHooks";
import { useActivity } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { overrides, type AgentStat } from "@/engine/agentStats";
import { LINE_BY_KEY } from "@/data";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const pctText = (r: number | null) => (r === null ? "No answers yet" : `${Math.round(r * 100)}% accepted`);

function Outcome({ s }: { s: AgentStat }) {
  const total = s.accepted + s.overridden + s.open;
  if (!s.rated) {
    return (
      <div className="text-xs text-muted-foreground tnum">
        {s.words.open ? `${fmtInt(s.open)} ${s.words.open}` : "Nothing to accept or override"}
      </div>
    );
  }
  const seg = (n: number, cls: string, label: string, i: number) =>
    n > 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("anim-grow-x h-full", cls)} style={{ width: `${(n / total) * 100}%`, animationDelay: `${i * 80}ms` }} />
        </TooltipTrigger>
        <TooltipContent>{fmtInt(n)} {label}</TooltipContent>
      </Tooltip>
    ) : null;
  return (
    <div>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-secondary">
        {total > 0 && (
          <>
            {seg(s.accepted, "bg-primary", s.words.accepted, 0)}
            {seg(s.overridden, "bg-warn", s.words.overridden, 1)}
            {seg(s.open, "bg-muted-foreground/30", s.words.open, 2)}
          </>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-2xs text-muted-foreground tnum">
        <span>{fmtInt(s.accepted)} {s.words.accepted}</span>
        {s.words.overridden && <span>{fmtInt(s.overridden)} {s.words.overridden}</span>}
        {s.words.open && <span>{fmtInt(s.open)} {s.words.open}</span>}
      </div>
    </div>
  );
}

export function Agents() {
  const stats = useAgents();
  const events = useActivity();
  const decisions = useWorkflow((s) => s.decisions);
  const [params, setParams] = useQueryParams();
  const selected = params.get("agent") ?? "agent:scrutiny";
  const current = stats.find((s) => s.agent.id === selected) ?? stats[0];

  const rated = stats.filter((s) => s.rated);
  const accepted = rated.reduce((s, a) => s + a.accepted, 0);
  const overridden = rated.reduce((s, a) => s + a.overridden, 0);
  const overridesList = useMemo(() => overrides(Object.values(decisions)), [decisions]);
  const runs = useMemo(() => events.filter((e) => e.actorId === current.agent.id).slice(0, 8), [events, current.agent.id]);

  return (
    <div className="space-y-4">
      <PageHeader title="Agents" badge={<span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">Propose only</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Agents" value={fmtInt(stats.length)} sublabel={`${fmtInt(stats.filter((s) => s.agent.method === "judgement").length)} judgement, ${fmtInt(stats.filter((s) => s.agent.method === "deterministic").length)} deterministic`} />
        <KpiTile label="Items looked at" value={fmtInt(stats.reduce((s, a) => s + a.touched, 0))} sublabel="across every module" />
        <KpiTile label="Answered by people" value={fmtInt(accepted + overridden)} sublabel="proposals accepted or overridden" accent="info" />
        <KpiTile label="Accepted" hint="Proposals a person answered the way the agent proposed, over all the proposals a person has answered. Counted from the recorded decisions." value={accepted + overridden ? `${Math.round((accepted / (accepted + overridden)) * 100)}%` : "None yet"} sublabel={`${fmtInt(accepted)} of ${fmtInt(accepted + overridden)}`} accent={accepted + overridden ? "ok" : "none"} />
        <KpiTile label="Overridden" value={fmtInt(overridden)} sublabel="a person decided differently" accent={overridden ? "warn" : "none"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Roster" className="xl:col-span-2" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {stats.map((s) => (
              <li key={s.agent.id}>
                <button type="button" onClick={() => setParams({ agent: s.agent.id })} className={cn("grid w-full grid-cols-[13rem_1fr_6.5rem] items-center gap-4 px-4 py-3 text-left hover:bg-accent/40", current.agent.id === s.agent.id && "bg-accent/60")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.agent.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <MethodBadge method={s.agent.method} showConfidence={false} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">{s.agent.does}</div>
                    <div className="mt-1.5">
                      <Outcome s={s} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tnum">{fmtInt(s.touched)}</div>
                    <div className="text-2xs text-muted-foreground">{s.touchedLabel}</div>
                    <div className="mt-0.5 text-2xs tnum text-muted-foreground">{s.rated ? pctText(s.rate) : ""}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-3">
          <Panel title={current.agent.name} actions={<MethodBadge method={current.agent.method} showConfidence={false} />}>
            <dl className="divide-y divide-border text-sm">
              <div className="flex justify-between py-1.5"><dt className="text-muted-foreground">Module</dt><dd>{current.agent.module.replace(/-/g, " ")}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-muted-foreground">Permissions</dt><dd>Propose only</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-muted-foreground">Runs recorded</dt><dd className="tnum">{fmtInt(current.runs)}</dd></div>
              {current.facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 py-1.5"><dt className="shrink-0 text-muted-foreground">{f.label}</dt><dd className="text-right tnum">{f.value}</dd></div>
              ))}
            </dl>
          </Panel>
          <Panel title="Recent runs" bodyClassName="p-0">
            {runs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No run recorded</div>
            ) : (
              runs.map((e) => <ActivityRow key={e.id} icon={<Bot className="h-4 w-4" />} title={e.action} meta={e.after ?? e.object.label ?? ""} time={fmtDate(e.at.slice(0, 10))} />)
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Decisions that differ from the recommendation" bodyClassName="p-0">
        {overridesList.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No person has decided differently from an agent yet</div>
        ) : (
          <ul className="divide-y divide-border">
            {overridesList.map((d) => (
              <li key={d.id} className="grid grid-cols-[8rem_1fr_14rem] items-center gap-4 px-4 py-2.5 text-sm">
                <DocLink itemKey={d.itemKey}>{LINE_BY_KEY.get(d.itemKey)?.docNo ?? d.itemKey}</DocLink>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{d.justification || "No reason given"}</span>
                <span className="text-right text-xs tnum">Recommended {d.snapshot.recommendation!.action.toLowerCase()}, decided {d.action.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
