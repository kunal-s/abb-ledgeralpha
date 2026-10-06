import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_GROUPS, statusGroupOf } from "@/components/review/StatusBars";
import { PERSON_BY_ID } from "@/data";
import { useRecRows } from "@/state/recHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { RECON_TYPES } from "@/engine/recClasses";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";

const SEVERITY = { High: "high", Medium: "medium", Low: "low" } as const;

export function RegisterTab() {
  const rows = useRecRows();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams();
  const type = params.get("type") ?? "all";
  const group = params.get("rstatus") ?? "all";
  const owner = params.get("rowner") ?? "all";
  const risk = params.get("rrisk") ?? "all";
  const q = params.get("rq") ?? "";

  const owners = useMemo(() => [...new Set(rows.map((r) => r.rec.preparerId))].map((id) => PERSON_BY_ID.get(id)!).filter(Boolean), [rows]);
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (type === "all" || r.rec.type === type) &&
          (group === "all" || statusGroupOf(r.status) === group) &&
          (owner === "all" || r.rec.preparerId === owner) &&
          (risk === "all" || r.rec.riskTier === risk) &&
          (!q || r.rec.name.toLowerCase().includes(q.toLowerCase()) || r.rec.id.toLowerCase().includes(q.toLowerCase()) || (r.rec.gl ?? "").includes(q))
      ),
    [rows, type, group, owner, risk, q]
  );

  return (
    <Panel title="Reconciliations" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={type} onValueChange={(v) => setParams({ type: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {RECON_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => setParams({ rstatus: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_GROUPS.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={(v) => setParams({ rowner: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All preparers</SelectItem>
            {owners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={(v) => setParams({ rrisk: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk tiers</SelectItem>
            {(["High", "Medium", "Low"] as const).map((r) => (
              <SelectItem key={r} value={r}>
                {r} risk
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ rq: e.target.value || null })} placeholder="Name or account" className="h-8 w-44" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} reconciliations</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "reconciliations.csv",
              ["ID", "Reconciliation", "Type", "Preparer", "Reviewer", "Risk", "Balance per books", "Balance per source", "Difference", "Unexplained", "Items", "Due", "Status"],
              shown.map((r) => [r.rec.id, r.rec.name, r.rec.type, PERSON_BY_ID.get(r.rec.preparerId)?.name ?? "", PERSON_BY_ID.get(r.rec.reviewerId)?.name ?? "", r.rec.riskTier, r.rec.booksBalance, r.view.sourceBalance ?? "", r.view.difference ?? "", r.view.unexplained ?? "", r.view.items.length, fmtDate(r.rec.dueDate), r.status])
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reconciliation</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Preparer</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead className="text-right">Per books</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            <TableHead className="text-right">Unexplained</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.rec.id} className="cursor-pointer" onClick={() => navigate(`/reconciliations/${r.rec.id}`)}>
              <TableCell className="max-w-64">
                <div className="truncate text-sm">{r.rec.name}</div>
                <div className="font-mono text-2xs text-muted-foreground">{r.rec.gl ?? r.rec.partyId}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">{r.rec.type}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{PERSON_BY_ID.get(r.rec.preparerId)?.name}</TableCell>
              <TableCell>
                <SeverityBadge severity={SEVERITY[r.rec.riskTier]} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">{fmtDrCr(r.rec.booksBalance, true)}</TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">{r.view.difference === null ? <span className="text-muted-foreground">Awaiting</span> : r.view.difference === 0 ? "-" : fmtDrCr(r.view.difference, true)}</TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">
                {r.view.unexplained === null || r.view.unexplained === 0 ? "-" : <span className={r.view.withinTolerance ? "" : "text-danger-foreground"}>{fmtDrCr(r.view.unexplained, true)}</span>}
              </TableCell>
              <TableCell className="text-right tnum">{r.view.items.length ? fmtInt(r.view.items.length) : "-"}</TableCell>
              <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(r.rec.dueDate)}</TableCell>
              <TableCell>
                <StatusChip status={r.status} />
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                No reconciliations match
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
