import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlagChips } from "@/components/journals/FlagChips";
import { useJournals } from "@/state/journalHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { userName } from "@/engine/journalReview";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";

const DOC_TYPES: Record<string, string> = {
  SA: "General ledger journal", KR: "Vendor invoice", KZ: "Vendor payment", DR: "Customer invoice", DZ: "Customer receipt",
  AF: "Depreciation", PR: "Payroll", ZP: "Statutory payment", WE: "Goods receipt", RE: "Invoice receipt",
};

/** Every journal of the period, manual and system posted. */
export function RegisterTab() {
  const { rows } = useJournals();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams();
  const source = params.get("jsrc") ?? "all";
  const type = params.get("jtype") ?? "all";
  const by = params.get("jby") ?? "all";
  const q = params.get("jrq") ?? "";

  const types = useMemo(() => [...new Set(rows.map((r) => r.doc.docType))].sort(), [rows]);
  const users = useMemo(() => [...new Set(rows.filter((r) => r.doc.manual).map((r) => r.doc.enteredBy))].sort(), [rows]);
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (source === "all" || (source === "manual" ? r.doc.manual : source === "system" ? !r.doc.manual : r.flags.length > 0)) &&
          (type === "all" || r.doc.docType === type) &&
          (by === "all" || r.doc.enteredBy === by) &&
          (!q || r.doc.docNo.includes(q) || (r.doc.text ?? "").toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, source, type, by, q]
  );

  return (
    <Panel title="Journals" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={source} onValueChange={(v) => setParams({ jsrc: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Manual and system</SelectItem>
            <SelectItem value="manual">Manual only</SelectItem>
            <SelectItem value="system">System posted only</SelectItem>
            <SelectItem value="flagged">Flagged only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setParams({ jtype: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All document types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t} {DOC_TYPES[t] ? DOC_TYPES[t] : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={by} onValueChange={(v) => setParams({ jby: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All preparers</SelectItem>
            {users.map((u) => (
              <SelectItem key={u} value={u}>
                {userName(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ jrq: e.target.value || null })} placeholder="Document or text" className="h-8 w-44" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} journals</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "journals.csv",
              ["Document", "Type", "Posting date", "Entered by", "Entry date", "Entry time", "Source", "Amount", "Lines", "Text", "Checks", "Status"],
              shown.map((r) => [r.doc.docNo, r.doc.docType, fmtDate(r.doc.postingDate), r.doc.enteredBy, fmtDate(r.doc.entryDate), r.doc.entryTime ?? "", r.doc.manual ? "Manual" : "System", r.doc.amount, r.doc.lines.length, r.doc.text ?? "", r.flags.map((f) => f.checkId).join(" "), r.status])
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Journal</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Posted</TableHead>
            <TableHead>Entered by</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead>Checks</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.slice(0, 200).map((r) => (
            <TableRow key={r.doc.key} className="cursor-pointer" onClick={() => navigate(`/journals/${r.doc.key}`)}>
              <TableCell className="max-w-72 py-2">
                <div className="truncate text-sm">{r.doc.text ?? "No text"}</div>
                <div className="font-mono text-2xs text-muted-foreground">{r.doc.docNo}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap py-2 text-xs">{r.doc.docType}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(r.doc.postingDate)}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-sm">{r.doc.manual ? userName(r.doc.enteredBy) : <span className="text-muted-foreground">{r.doc.enteredBy}</span>}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(r.doc.amount)}</TableCell>
              <TableCell className="py-2 text-right tnum text-sm">{r.doc.lines.length}</TableCell>
              <TableCell className="py-2">
                <FlagChips flags={r.flags} />
              </TableCell>
              <TableCell className="py-2">
                <StatusChip status={r.status} />
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                No journals match
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {shown.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the first 200 of {fmtInt(shown.length)} journals. Narrow the filters or export the full list.</div>}
    </Panel>
  );
}
