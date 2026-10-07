import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEvidence, type EvidenceRow } from "@/state/auditHooks";
import { useWorkflow } from "@/state/workflow";
import { useQueryParams } from "@/lib/useQueryParams";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDateTime } from "@/lib/dates";
import { fmtInt } from "@/lib/format";

const TYPES: EvidenceRow["type"][] = ["Account sign-off", "Reconciliation sign-off", "Decision", "Journal review", "Request provided"];

/** What supports the schedules: sign-offs, decisions, journal reviews and the requests answered. */
export function EvidenceTab() {
  const rows = useEvidence();
  const recordExport = useWorkflow((w) => w.recordExport);
  const [params, setParams] = useQueryParams();
  const type = params.get("etype") ?? "all";
  const q = params.get("eq") ?? "";

  const counts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t, rows.filter((r) => r.type === t).length])), [rows]);
  const shown = useMemo(
    () => rows.filter((r) => (type === "all" || r.type === type) && (!q || r.reference.toLowerCase().includes(q.toLowerCase()) || r.description.toLowerCase().includes(q.toLowerCase()))),
    [rows, type, q]
  );

  return (
    <Panel title="Evidence index" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={type} onValueChange={(v) => setParams({ etype: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All evidence</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t} ({counts[t]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ eq: e.target.value || null })} placeholder="Reference or text" className="h-8 w-48" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} entries</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            downloadCsv("evidence-index.csv", ["Type", "Reference", "Description", "By", "When"], shown.map((r) => [r.type, r.reference, r.description, r.by, fmtDateTime(r.at)]));
            recordExport("Evidence index", { entries: shown.length });
          }}
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>By</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.slice(0, 200).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap py-2 text-xs">{r.type}</TableCell>
              <TableCell className="py-2 font-mono text-xs">
                {r.link ? (
                  <Link to={r.link} className="text-primary hover:underline">
                    {r.reference}
                  </Link>
                ) : (
                  r.reference
                )}
              </TableCell>
              <TableCell className="max-w-xl truncate py-2 text-sm">{r.description}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-sm">{r.by}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDateTime(r.at)}</TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                No evidence matches
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {shown.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the latest 200 of {fmtInt(shown.length)} entries. Export for the full index.</div>}
    </Panel>
  );
}
