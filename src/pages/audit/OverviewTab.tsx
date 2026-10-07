import { useMemo } from "react";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { PERSON_BY_ID } from "@/data";
import { usePbc, useSchedules } from "@/state/auditHooks";
import { useJournals } from "@/state/journalHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";

const GROUPS: BarGroup[] = [
  { key: "open", label: "Open", cls: "bg-muted-foreground/25" },
  { key: "in-preparation", label: "In preparation", cls: "bg-info" },
  { key: "provided", label: "Provided", cls: "bg-ok/55" },
  { key: "closed", label: "Closed", cls: "bg-ok" },
];

export function OverviewTab() {
  const { states, today } = usePbc();
  const schedules = useSchedules();
  const { flagged } = useJournals();
  const [, setParams] = useQueryParams();

  const stats = useMemo(() => {
    const done = states.filter((s) => s.status === "provided" || s.status === "closed").length;
    const overdue = states.filter((s) => s.overdue);
    const soon = states.filter((s) => (s.status === "open" || s.status === "in-preparation") && !s.overdue && s.req.due <= addDays(today, 7));
    const blocked = states.filter((s) => s.blocker);
    const ready = schedules.filter((s) => s.readiness === "ready").length;
    const accepted = flagged.filter((r) => r.status === "accepted").length;
    return { done, overdue, soon, blocked, ready, accepted };
  }, [states, schedules, flagged, today]);

  const areas = useMemo(() => [...new Set(states.map((s) => s.req.area))], [states]);
  const chart = useMemo(() => {
    const data: Record<string, Record<string, number>> = Object.fromEntries(areas.map((a) => [a, {}]));
    for (const s of states) data[s.req.area][s.status] = (data[s.req.area][s.status] ?? 0) + 1;
    return data;
  }, [states, areas]);

  const needs = useMemo(
    () =>
      states
        .filter((s) => s.status === "open" || s.status === "in-preparation")
        .map((s) => ({ s, score: (s.overdue ? 100 : 0) + (s.blocker ? 0 : 20) + (s.status === "open" ? 10 : 0) - daysBetween(today, s.req.due) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 9),
    [states, today]
  );

  const owners = useMemo(() => {
    const m = new Map<string, { id: string; total: number; provided: number; prep: number; overdue: number }>();
    for (const s of states) {
      const e = m.get(s.ownerId) ?? { id: s.ownerId, total: 0, provided: 0, prep: 0, overdue: 0 };
      e.total += 1;
      if (s.status === "provided" || s.status === "closed") e.provided += 1;
      else if (s.status === "in-preparation") e.prep += 1;
      if (s.overdue) e.overdue += 1;
      m.set(s.ownerId, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [states]);

  const to = (tab: string, extra: Record<string, string | null> = {}) => setParams({ tab, ...extra }, { replace: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Requests provided" value={`${stats.done}/${states.length}`} sublabel="provided or closed" accent="ok" onClick={() => to("requests", { pstatus: "provided" })} />
        <KpiTile label="Overdue" value={fmtInt(stats.overdue.length)} sublabel="past the date asked" accent={stats.overdue.length ? "danger" : "none"} onClick={() => to("requests", { pstatus: "overdue" })} />
        <KpiTile label="Due in 7 days" value={fmtInt(stats.soon.length)} sublabel="not yet provided" accent={stats.soon.length ? "warn" : "none"} onClick={() => to("requests", { pstatus: "soon" })} />
        <KpiTile label="Waiting on review work" value={fmtInt(stats.blocked.length)} sublabel="sign-offs still to come" accent={stats.blocked.length ? "info" : "none"} onClick={() => to("requests", { pstatus: "blocked" })} />
        <KpiTile label="Schedules ready" value={`${stats.ready}/${schedules.length}`} sublabel="accounts signed off" accent="ok" onClick={() => to("schedules")} />
        <KpiTile label="Journals reviewed" value={`${stats.accepted}/${flagged.length}`} sublabel="flagged journals accepted" onClick={() => to("requests", { parea: "Journals and controls" })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Requests by area and status" className="xl:col-span-2">
          <StatusBars data={chart} rows={areas.map((a) => ({ key: a, label: a }))} groups={GROUPS} unit="requests" labelWidth="11rem" onSelect={(area, status) => to("requests", { parea: area, pstatus: status })} />
        </Panel>

        <Panel title="Needs attention" bodyClassName="p-0">
          {needs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Every request is provided</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {needs.map(({ s }) => (
                <li key={s.req.id}>
                  <button type="button" onClick={() => to("requests", { req: s.req.id })} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{s.req.title}</span>
                      {s.overdue ? <StatusChip status="overdue" /> : <StatusChip status={s.status} />}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {PERSON_BY_ID.get(s.ownerId)?.name} · due {fmtDate(s.req.due)}
                      {s.blocker ? ` · ${s.blocker}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Requests by owner" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">In preparation</TableHead>
              <TableHead className="text-right">Provided</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => to("requests", { powner: o.id })}>
                <TableCell className="py-2">
                  <div className="text-sm">{PERSON_BY_ID.get(o.id)?.name}</div>
                  <div className="text-2xs text-muted-foreground">{PERSON_BY_ID.get(o.id)?.title}</div>
                </TableCell>
                <TableCell className="py-2 text-right tnum">{fmtInt(o.total)}</TableCell>
                <TableCell className="py-2 text-right tnum">{o.prep ? fmtInt(o.prep) : "-"}</TableCell>
                <TableCell className="py-2 text-right tnum">{o.provided ? fmtInt(o.provided) : "-"}</TableCell>
                <TableCell className="py-2 text-right tnum">{o.overdue ? <span className="text-danger-foreground">{fmtInt(o.overdue)}</span> : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
