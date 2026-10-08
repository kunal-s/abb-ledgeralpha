import { useMemo } from "react";
import { Check, Download } from "lucide-react";
import { KpiTile, Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BALANCES, WORLD, balanceAt } from "@/data";
import { STATEMENT_LINES } from "@/data/workspace/coa";
import { CATEGORY_LABELS } from "@/lib/labels";
import { downloadCsv } from "@/lib/exportCsv";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";

const LINES: string[] = [...STATEMENT_LINES.balanceSheet, ...STATEMENT_LINES.profitAndLoss];

export function MappingTab({ onAccount }: { onAccount: (gl: string) => void }) {
  const [params, setParams] = useQueryParams();
  const line = params.get("mline") ?? "all";
  const q = params.get("mq") ?? "";

  const rows = useMemo(
    () =>
      WORLD.glAccounts.map((g) => {
        const b = balanceAt(BALANCES, g.gl, WORLD.asOf);
        return { g, closing: b?.closing ?? 0, debits: b?.debits ?? 0, credits: b?.credits ?? 0 };
      }),
    []
  );
  const tb = useMemo(() => rows.reduce((s, r) => s + r.closing, 0), [rows]);
  const shown = rows.filter((r) => (line === "all" || r.g.statementLine === line) && (!q || r.g.description.toLowerCase().includes(q.toLowerCase()) || r.g.gl.includes(q)));
  const lineTotal = shown.reduce((s, r) => s + r.closing, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Accounts" value={fmtInt(rows.length)} sublabel={`${new Set(rows.map((r) => r.g.statementLine)).size} statement lines`} accent="info" />
        <KpiTile label="Trial balance" value={Math.abs(tb) < 1 ? "Nets to nil" : fmtINR(tb)} sublabel="all accounts at the period end" accent={Math.abs(tb) < 1 ? "ok" : "danger"} icon={Math.abs(tb) < 1 ? <Check className="h-4 w-4 text-ok" /> : undefined} />
        <KpiTile label="Unmapped accounts" value={fmtInt(rows.filter((r) => !LINES.includes(r.g.statementLine)).length)} sublabel="not on a statement line" accent="ok" />
        <KpiTile label="In this view" value={fmtDrCr(lineTotal, true)} sublabel={`${fmtInt(shown.length)} accounts`} />
      </div>
      <Panel
        title="Trial balance to statement lines"
        bodyClassName="p-0"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => downloadCsv("trial-balance-mapping.csv", ["Account", "Description", "Statement line", "Category", "Debits in the month", "Credits in the month", "Closing"], shown.map((r) => [r.g.gl, r.g.description, r.g.statementLine, CATEGORY_LABELS[r.g.category], r.debits, r.credits, r.closing]))}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={line} onValueChange={(v) => setParams({ mline: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statement lines</SelectItem>
              {LINES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={q} onChange={(e) => setParams({ mq: e.target.value || null })} placeholder="Account or description" className="h-8 w-52" />
          <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} accounts</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Statement line</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Debits in the month</TableHead>
              <TableHead className="text-right">Credits in the month</TableHead>
              <TableHead className="text-right">Closing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.g.gl} className="cursor-pointer" onClick={() => onAccount(r.g.gl)}>
                <TableCell className="max-w-72 py-2">
                  <div className="truncate text-sm">{r.g.description}</div>
                  <div className="font-mono text-2xs text-muted-foreground">{r.g.gl}</div>
                </TableCell>
                <TableCell className="max-w-48 truncate py-2 text-xs">{r.g.statementLine}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs">{CATEGORY_LABELS[r.g.category]}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.debits ? fmtINR(r.debits) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.credits ? fmtINR(-r.credits) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.closing ? fmtDrCr(r.closing) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
