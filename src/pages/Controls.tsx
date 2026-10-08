import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONTROL_REGISTER, type ControlProcess } from "@/data/workspace/controls";
import type { ControlStatus } from "@/engine/controls";
import { useControls } from "@/state/controlHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: BarGroup[] = [
  { key: "effective", label: "Effective", cls: "bg-ok" },
  { key: "in-progress", label: "In progress", cls: "bg-info" },
  { key: "deficient", label: "Deficient", cls: "bg-danger" },
  { key: "untested", label: "Not tested", cls: "bg-muted-foreground/25" },
];

const CHIP: Record<ControlStatus, { status: "approved" | "in-review" | "rejected" | "not-started"; label: string }> = {
  effective: { status: "approved", label: "Effective" },
  "in-progress": { status: "in-review", label: "In progress" },
  deficient: { status: "rejected", label: "Deficient" },
  untested: { status: "not-started", label: "Not tested" },
};

export function Controls() {
  const { controls, sod } = useControls();
  const [params, setParams] = useQueryParams();
  const selected = params.get("control") ?? controls.find((c) => c.status === "deficient")?.def.id ?? controls[0].def.id;
  const processFilter = params.get("process") ?? "all";
  const statusFilter = params.get("cstatus") ?? "all";
  const current = controls.find((c) => c.def.id === selected) ?? controls[0];

  const processes = [...new Set(CONTROL_REGISTER.map((c) => c.process))] as ControlProcess[];
  const chart = useMemo(() => {
    const d = Object.fromEntries(processes.map((p) => [p, {} as Record<string, number>])) as Record<ControlProcess, Record<string, number>>;
    for (const c of controls) d[c.def.process][c.status] = (d[c.def.process][c.status] ?? 0) + 1;
    return d;
  }, [controls, processes]);

  const count = (s: ControlStatus) => controls.filter((c) => c.status === s).length;
  const shown = controls.filter((c) => (processFilter === "all" || c.def.process === processFilter) && (statusFilter === "all" || c.status === statusFilter));
  const blocked = sod.filter((s) => s.kind === "Blocked").length;

  return (
    <div className="space-y-4">
      <PageHeader title="Controls" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Controls" value={fmtInt(controls.length)} sublabel={`across ${fmtInt(processes.length)} processes`} />
        <KpiTile label="Effective" value={fmtInt(count("effective"))} sublabel="tested with no exception" accent="ok" onClick={() => setParams({ cstatus: "effective" })} />
        <KpiTile label="In progress" value={fmtInt(count("in-progress"))} sublabel="work still inside its window" accent="info" onClick={() => setParams({ cstatus: "in-progress" })} />
        <KpiTile label="Deficient" value={fmtInt(count("deficient"))} sublabel={`${fmtInt(controls.reduce((s, c) => s + c.exceptions, 0))} exceptions found`} accent={count("deficient") ? "danger" : "ok"} onClick={() => setParams({ cstatus: "deficient" })} />
        <KpiTile label="Self-approvals blocked" hint="Times the workflow refused a proposer approving their own decision. A refusal is preventive evidence that the control works." value={fmtInt(blocked)} sublabel="by the workflow" accent={blocked ? "ok" : "none"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Effectiveness by process" className="xl:col-span-2">
          <StatusBars
            data={chart}
            rows={processes.map((p) => ({ key: p, label: p }))}
            groups={GROUPS}
            unit="controls"
            labelWidth="10rem"
            onSelect={(p, g) => setParams({ process: p, cstatus: g })}
          />
        </Panel>
        <Panel title="Segregation of duties" bodyClassName="p-0">
          {sod.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No conflict found and no refusal recorded</div>
          ) : (
            <ul className="divide-y divide-border">
              {sod.slice(0, 8).map((s, i) => (
                <li key={`${s.at}-${i}`} className="px-4 py-2.5">
                  <div className="flex items-start gap-2 text-sm">
                    <span className={cn("mt-0.5 rounded-sm px-1.5 py-0.5 text-2xs font-medium", s.kind === "Blocked" ? "bg-ok-subtle text-ok-foreground" : "bg-danger-subtle text-danger-foreground")}>{s.kind === "Blocked" ? "Blocked" : "Conflict"}</span>
                    <span className="min-w-0">
                      {s.link ? <Link to={s.link} className="hover:text-primary hover:underline">{s.text}</Link> : s.text}
                      <span className="block text-2xs text-muted-foreground tnum">{fmtDate(s.at.slice(0, 10))}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Control register" className="xl:col-span-2" bodyClassName="p-0" actions={processFilter !== "all" || statusFilter !== "all" ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setParams({ process: null, cstatus: null })}>Clear filters</button> : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Control</TableHead>
                <TableHead className="text-right">Tested</TableHead>
                <TableHead className="text-right">Exceptions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((c) => (
                <TableRow key={c.def.id} className={cn("cursor-pointer", current.def.id === c.def.id && "bg-accent/60")} onClick={() => setParams({ control: c.def.id })}>
                  <TableCell className="max-w-[26rem]">
                    <div className="truncate text-sm">{c.def.name}</div>
                    <div className="truncate text-2xs text-muted-foreground"><span className="font-mono">{c.def.id}</span> · {c.def.process} · {c.def.owner}</div>
                  </TableCell>
                  <TableCell className="text-right tnum">{fmtInt(c.tested)}</TableCell>
                  <TableCell className={cn("text-right tnum", c.exceptions > 0 && "font-medium text-danger-foreground")}>{c.exceptions ? fmtInt(c.exceptions) : "-"}</TableCell>
                  <TableCell><StatusChip status={CHIP[c.status].status} label={CHIP[c.status].label} /></TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No control matches</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Evidence" actions={<span className="font-mono text-2xs text-muted-foreground">{current.def.id}</span>} bodyClassName="p-0">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">{current.def.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">Risk: {current.def.risk}</div>
          </div>
          {current.evidence.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing has reached this control yet</div>
          ) : (
            <ul className="divide-y divide-border">
              {current.evidence.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-start gap-2.5 px-4 py-2.5">
                  {e.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />}
                  <div className="min-w-0 text-sm">
                    {e.link ? <Link to={e.link} className="hover:text-primary hover:underline">{e.text}</Link> : e.text}
                    <div className="text-2xs text-muted-foreground tnum">{fmtDate(e.at.slice(0, 10))}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
