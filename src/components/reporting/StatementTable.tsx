// A statement in the statutory layout: lines with their amounts and
// comparatives, each line opening onto the accounts that make it up, and each
// account onto its postings (docs/FRD.md FR-FST-01).

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StatementRow } from "@/engine/financials";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StatementSection {
  title: string;
  rows: StatementRow[];
  totals?: { label: string; amount: number; comparative: number }[];
}

const money = (n: number) => (n === 0 ? "-" : fmtINR(n));

export function StatementTable({ sections, heads, onAccount }: { sections: StatementSection[]; heads: [string, string]; onAccount: (gl: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (line: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(line)) n.delete(line);
      else n.add(line);
      return n;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Particulars</TableHead>
          <TableHead className="text-right">{heads[0]}</TableHead>
          <TableHead className="text-right">{heads[1]}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((s) => (
          <SectionRows key={s.title} s={s} open={open} toggle={toggle} onAccount={onAccount} />
        ))}
      </TableBody>
    </Table>
  );
}

function SectionRows({ s, open, toggle, onAccount }: { s: StatementSection; open: Set<string>; toggle: (line: string) => void; onAccount: (gl: string) => void }) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={3} className="py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {s.title}
        </TableCell>
      </TableRow>
      {s.rows.map((r) => (
        <LineRows key={r.line} r={r} expanded={open.has(r.line)} toggle={() => toggle(r.line)} onAccount={onAccount} />
      ))}
      {s.totals?.map((t) => (
        <TableRow key={t.label} className="border-t bg-muted/20 hover:bg-muted/20">
          <TableCell className="py-2 text-sm font-semibold">{t.label}</TableCell>
          <TableCell className="py-2 text-right tnum text-sm font-semibold">{fmtINR(t.amount)}</TableCell>
          <TableCell className="py-2 text-right tnum text-sm font-semibold text-muted-foreground">{fmtINR(t.comparative)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

function LineRows({ r, expanded, toggle, onAccount }: { r: StatementRow; expanded: boolean; toggle: () => void; onAccount: (gl: string) => void }) {
  const has = r.accounts.length > 0;
  return (
    <>
      <TableRow className={cn(has && "cursor-pointer")} onClick={has ? toggle : undefined}>
        <TableCell className="py-2 text-sm">
          <span className="flex items-center gap-1.5">
            {has ? expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <span className="w-3.5" />}
            {r.line}
            {has && <span className="text-2xs text-muted-foreground">{r.accounts.length} {r.accounts.length === 1 ? "account" : "accounts"}</span>}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{money(r.amount)}</TableCell>
        <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm text-muted-foreground">{money(r.comparative)}</TableCell>
      </TableRow>
      {expanded &&
        r.accounts.map((a) => (
          <TableRow key={`${r.line}-${a.gl}-${a.description}`} className={cn(a.gl && "cursor-pointer")} onClick={a.gl ? () => onAccount(a.gl) : undefined}>
            <TableCell className="py-1.5 pl-10 text-xs">
              {a.gl ? <span className="mr-2 font-mono text-muted-foreground">{a.gl}</span> : null}
              {a.description}
            </TableCell>
            <TableCell className="whitespace-nowrap py-1.5 text-right tnum text-xs">{money(a.amount)}</TableCell>
            <TableCell className="whitespace-nowrap py-1.5 text-right tnum text-xs text-muted-foreground">{money(a.comparative)}</TableCell>
          </TableRow>
        ))}
    </>
  );
}
