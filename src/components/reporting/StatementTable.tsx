import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { StatementGroup, StatementLine } from "@/engine/statements";
import { fmtINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const money = (n: number) => (n === 0 ? "-" : fmtINRCompact(n));
const change = (now: number, before: number) => {
  if (now === before) return "-";
  if (!before) return "";
  const d = ((now - before) / Math.abs(before)) * 100;
  return `${d >= 0 ? "+" : "-"}${Math.abs(d).toFixed(1)}%`;
};

interface Props {
  columns: [string, string];
  groups?: StatementGroup[];
  /** lines outside a group, such as the profit and loss */
  lines?: { line: StatementLine; kind: "line" | "total" | "grand" }[];
  linkAccounts?: boolean;
}

function LineRow({ line, kind, linkAccounts }: { line: StatementLine; kind: "line" | "total" | "grand"; linkAccounts?: boolean }) {
  const [open, setOpen] = useState(false);
  const expandable = line.accounts.length > 0;
  const heavy = kind !== "line";
  return (
    <>
      <tr className={cn("border-b border-border/70", kind === "total" && "border-t border-border", kind === "grand" && "border-y-2 border-border", expandable && "cursor-pointer hover:bg-accent/40")} onClick={() => expandable && setOpen(!open)}>
        <td className={cn("py-2 pl-4 pr-3 text-sm", heavy && "font-semibold")}>
          <span className="inline-flex items-center gap-1.5">
            {expandable ? <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")} /> : <span className="w-3.5" />}
            {line.label}
          </span>
        </td>
        <td className={cn("whitespace-nowrap px-3 py-2 text-right text-sm tnum", heavy && "font-semibold")}>{money(line.amount)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-sm tnum text-muted-foreground">{money(line.comparative)}</td>
        <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right text-xs tnum text-muted-foreground">{change(line.amount, line.comparative)}</td>
      </tr>
      {open &&
        line.accounts.map((a) => (
          <tr key={`${a.gl}-${a.description}`} className="border-b border-border/40 bg-secondary/40">
            <td className="py-1.5 pl-12 pr-3 text-xs text-muted-foreground">
              {a.gl && linkAccounts ? (
                <Link to={`/balance-sheet-review/${a.gl}`} className="hover:text-primary hover:underline">
                  <span className="mr-2 font-mono">{a.gl}</span>
                  {a.description}
                </Link>
              ) : (
                <>
                  {a.gl && <span className="mr-2 font-mono">{a.gl}</span>}
                  {a.description}
                </>
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tnum">{money(a.amount)}</td>
            <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tnum text-muted-foreground">{money(a.comparative)}</td>
            <td />
          </tr>
        ))}
    </>
  );
}

/** A statement laid out as printed: ruled lines, two columns and the change, with each line opening to its accounts. */
export function StatementTable({ columns, groups, lines, linkAccounts }: Props) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-border">
          <th className="py-2 pl-4 text-left text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground" />
          <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{columns[0]}</th>
          <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{columns[1]}</th>
          <th className="py-2 pl-3 pr-4 text-right text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Change</th>
        </tr>
      </thead>
      <tbody>
        {groups?.map((g) => (
          <Fragment key={g.label}>
            <tr>
              <td colSpan={4} className="bg-secondary/60 py-1.5 pl-4 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{g.label}</td>
            </tr>
            {g.lines.map((l) => (
              <LineRow key={l.label} line={l} kind="line" linkAccounts={linkAccounts} />
            ))}
            <LineRow line={{ label: `Total ${g.label.toLowerCase()}`, amount: g.total, comparative: g.comparativeTotal, accounts: [] }} kind="total" />
          </Fragment>
        ))}
        {lines?.map(({ line, kind }) => (
          <LineRow key={line.label} line={line} kind={kind} linkAccounts={linkAccounts} />
        ))}
      </tbody>
    </table>
  );
}
