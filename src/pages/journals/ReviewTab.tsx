import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlagChips } from "@/components/journals/FlagChips";
import { useJournals } from "@/state/journalHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { JOURNAL_CHECKS, userName } from "@/engine/journalReview";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate, fmtTime } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";

const STATUSES = [
  { key: "flagged", label: "Awaiting review" },
  { key: "support-requested", label: "Support requested" },
  { key: "accepted", label: "Accepted" },
];
const RANK = { high: 3, medium: 2, low: 1 } as const;

export function ReviewTab() {
  const { flagged } = useJournals();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams();
  const status = params.get("jstatus") ?? "all";
  const check = params.get("jcheck") ?? "all";
  const severity = params.get("jsev") ?? "all";
  const by = params.get("jrev") ?? "all";
  const q = params.get("jq") ?? "";

  const users = useMemo(() => [...new Set(flagged.map((r) => r.doc.enteredBy))].sort(), [flagged]);
  const shown = useMemo(
    () =>
      flagged
        .filter(
          (r) =>
            (status === "all" || r.status === status) &&
            (check === "all" || r.flags.some((f) => f.checkId === check)) &&
            (severity === "all" || r.severity === severity) &&
            (by === "all" || r.doc.enteredBy === by) &&
            (!q || r.doc.docNo.includes(q) || (r.doc.text ?? "").toLowerCase().includes(q.toLowerCase()))
        )
        .sort((a, b) => RANK[b.severity!] - RANK[a.severity!] || b.doc.amount - a.doc.amount),
    [flagged, status, check, severity, by, q]
  );

  return (
    <Panel title="Flagged journals" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={status} onValueChange={(v) => setParams({ jstatus: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={check} onValueChange={(v) => setParams({ jcheck: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All checks</SelectItem>
            {JOURNAL_CHECKS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.id} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => setParams({ jsev: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {(["high", "medium", "low"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={by} onValueChange={(v) => setParams({ jrev: v === "all" ? null : v })}>
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
        <Input value={q} onChange={(e) => setParams({ jq: e.target.value || null })} placeholder="Document or text" className="h-8 w-44" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} journals</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "flagged-journals.csv",
              ["Document", "Posting date", "Entered by", "Entry date", "Entry time", "Amount", "Text", "Checks", "Severity", "Status", "Conclusion"],
              shown.map((r) => [r.doc.docNo, fmtDate(r.doc.postingDate), userName(r.doc.enteredBy), fmtDate(r.doc.entryDate), r.doc.entryTime ?? "", r.doc.amount, r.doc.text ?? "", r.flags.map((f) => f.checkId).join(" "), r.severity ?? "", r.status, r.review?.note ?? ""])
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
            <TableHead>Posted</TableHead>
            <TableHead>Entered by</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Checks</TableHead>
            <TableHead>Severity</TableHead>
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
              <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(r.doc.postingDate)}</TableCell>
              <TableCell className="whitespace-nowrap py-2">
                <div className="text-sm">{userName(r.doc.enteredBy)}</div>
                <div className="text-2xs text-muted-foreground tnum">
                  {fmtDate(r.doc.entryDate)}
                  {r.doc.entryTime ? `, ${fmtTime(r.doc.entryTime)}` : ""}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(r.doc.amount)}</TableCell>
              <TableCell className="py-2">
                <FlagChips flags={r.flags} />
              </TableCell>
              <TableCell className="py-2">{r.severity && <SeverityBadge severity={r.severity} />}</TableCell>
              <TableCell className="py-2">
                <StatusChip status={r.status} />
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No journals match
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {shown.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the first 200 of {fmtInt(shown.length)} journals</div>}
    </Panel>
  );
}
