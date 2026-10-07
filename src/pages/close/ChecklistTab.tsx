import { useMemo } from "react";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERSON_BY_ID } from "@/data";
import type { CloseModel } from "@/state/closeModel";
import { useQueryParams } from "@/lib/useQueryParams";
import { downloadCsv } from "@/lib/exportCsv";
import { dateOfWd, wdLabel } from "@/lib/workdays";
import { statusLabel } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { key: "open", label: "Not complete" },
  { key: "not-started", label: "Not started" },
  { key: "in-progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "late", label: "Late" },
  { key: "soon", label: "Due in two days" },
  { key: "complete", label: "Complete" },
];

export function ChecklistTab({ model }: { model: CloseModel }) {
  const [params, setParams] = useQueryParams();
  const phase = params.get("cphase") ?? "all";
  const status = params.get("cstatus") ?? "all";
  const owner = params.get("cowner") ?? "all";
  const q = params.get("cq") ?? "";
  const selected = params.get("task");
  const wd = model.currentWd;

  const owners = useMemo(() => [...new Set(model.evaluation.states.map((s) => s.ownerId))].map((id) => PERSON_BY_ID.get(id)!).filter(Boolean), [model]);
  const shown = useMemo(
    () =>
      model.evaluation.states.filter(
        (s) =>
          (phase === "all" || s.task.phase === phase) &&
          (owner === "all" || s.ownerId === owner) &&
          (status === "all" ||
            (status === "open" ? s.status !== "complete" : status === "late" ? s.late : status === "soon" ? s.status !== "complete" && !s.late && s.task.dueWd <= wd + 1 : s.status === status)) &&
          (!q || s.task.name.toLowerCase().includes(q.toLowerCase()) || s.task.id.toLowerCase() === q.toLowerCase())
      ),
    [model, phase, status, owner, q, wd]
  );

  return (
    <Panel title="Close checklist" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={phase} onValueChange={(v) => setParams({ cphase: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All phases</SelectItem>
            {model.phases.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.id} {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setParams({ cstatus: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={(v) => setParams({ cowner: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ cq: e.target.value || null })} placeholder="Task or number" className="h-8 w-44" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} tasks</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "close-checklist.csv",
              ["Task", "Name", "Phase", "Owner", "Planned from", "Due", "Due date", "Projected finish", "Progress", "Status", "Late by (days)"],
              shown.map((s) => [
                s.task.id, s.task.name, model.phases.find((p) => p.id === s.task.phase)?.name ?? "", PERSON_BY_ID.get(s.ownerId)?.name ?? "", wdLabel(s.task.startWd), wdLabel(s.task.dueWd),
                fmtDate(dateOfWd(model.periodEnd, s.task.dueWd)), wdLabel(s.projectedFinish), s.label, statusLabel(s.status), s.lateBy,
              ])
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((s) => (
            <TableRow key={s.task.id} className="cursor-pointer" data-state={s.task.id === selected ? "selected" : undefined} onClick={() => setParams({ task: s.task.id })}>
              <TableCell className="max-w-96 py-2">
                <div className="truncate text-sm">{s.task.name}</div>
                <div className="text-2xs text-muted-foreground">
                  <span className="font-mono">{s.task.id}</span> · {model.phases.find((p) => p.id === s.task.phase)?.name}
                  {s.critical ? " · critical path" : ""}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap py-2 text-sm">{PERSON_BY_ID.get(s.ownerId)?.name}</TableCell>
              <TableCell className={cn("whitespace-nowrap py-2 text-xs tnum", s.late && "text-danger-foreground")}>
                {wdLabel(s.task.dueWd)}
                <div className="text-2xs text-muted-foreground">{fmtDate(dateOfWd(model.periodEnd, s.task.dueWd))}</div>
              </TableCell>
              <TableCell className="py-2">
                <div className="w-52">
                  <div className="truncate text-xs">{s.label}</div>
                  <Progress value={s.fraction * 100} className="mt-1 h-1" indicatorClassName={s.status === "complete" ? "bg-ok" : "bg-info"} />
                </div>
              </TableCell>
              <TableCell className="py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <StatusChip status={s.status} />
                  {s.late && <StatusChip status="late" />}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                No tasks match
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
