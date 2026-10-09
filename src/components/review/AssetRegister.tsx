import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DocLink, Panel, SeverityBadge } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BALANCES, GL_BY_ID, WORLD } from "@/data";
import { assetRows, registerTotals, type AssetRisk, type AssetRow } from "@/engine/assets";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEVERITY: Record<AssetRisk, "high" | "medium" | "low"> = { High: "high", Medium: "medium", Low: "low" };
const money = (n: number) => (n ? fmtINRCompact(n) : "-");

function Detail({ r }: { r: AssetRow }) {
  const a = r.asset;
  const rows: [string, React.ReactNode][] = [
    ["Site", a.site],
    ["Acquired", `${fmtDate(a.acquired)}${a.usefulLifeYears ? ` · useful life ${a.usefulLifeYears} years` : " · not depreciated"}`],
  ];
  if (a.costParts) rows.push(["Cost made up of", <span key="c">{a.costParts.map((p) => `${p.label} ${fmtINR(p.amount)}`).join(" · ")}</span>]);
  if (a.capitalisationKey) rows.push(["Capitalisation", <DocLink key="d" itemKey={a.capitalisationKey}>{WORLD.lines.find((l) => l.key === a.capitalisationKey)?.docNo ?? a.capitalisationKey}</DocLink>]);
  if (a.title) rows.push(["Title", a.titleNote ? `${a.title}. ${a.titleNote}` : a.title]);
  rows.push(["Use", `${a.usage}${a.usageSince ? ` since ${fmtDate(a.usageSince)}` : ""}`]);
  rows.push(["Physically verified", fmtDate(a.lastVerified)]);
  rows.push(["Revaluation", "None: carried at cost (cost model)"]);
  return (
    <div className="grid gap-4 bg-secondary/30 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="-mx-4">
        <Fields compact rows={rows} />
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review checks</div>
        {r.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to raise</p>
        ) : (
          <ul className="space-y-2">
            {r.checks.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={SEVERITY[c.severity]} />
                  <span>{c.text}</span>
                </div>
                <div className="pl-1 text-xs text-muted-foreground">{c.basis}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The assets behind a fixed asset account: cost and accumulated depreciation from the start of the period
 * to its end, net book value, and the risk for review; each asset opens its facts and checks. The totals tie
 * to the accounts.
 */
export function AssetRegister({ gl, priorDate, asOf }: { gl: string; priorDate: string; asOf: string }) {
  const rows = useMemo(() => assetRows(gl, asOf), [gl, asOf]);
  const t = registerTotals(rows);
  const [open, setOpen] = useState<string>();
  const costGl = rows[0]?.asset.gl ?? gl;
  const depGl = rows[0]?.asset.accDepGl;
  const balanceOf = (g: string) => (BALANCES.byGl.get(g) ?? []).find((b) => b.periodEnd === asOf)?.closing ?? 0;
  const costTies = t.closingCost === balanceOf(costGl);
  const depTies = !depGl || t.closingAccDep === -balanceOf(depGl);
  if (!rows.length) return null;
  return (
    <Panel
      title={`Asset register · ${fmtInt(t.count)} assets · ${fmtDate(priorDate)} to ${fmtDate(asOf)}`}
      actions={
        <span className={cn("text-xs", costTies && depTies ? "text-ok-foreground" : "text-danger-foreground")}>
          {costTies && depTies ? `Ties to ${costGl}${depGl ? ` and ${depGl}` : ""}` : "Does not tie to the accounts"}
        </span>
      }
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Opening cost</TableHead>
            <TableHead className="text-right">Additions</TableHead>
            <TableHead className="text-right">Closing cost</TableHead>
            <TableHead className="text-right">Opening depr.</TableHead>
            <TableHead className="text-right">Charge</TableHead>
            <TableHead className="text-right">Closing depr.</TableHead>
            <TableHead className="text-right">Book value</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isOpen = open === r.asset.id;
            const land = !r.asset.accDepGl;
            return (
              <Fragment key={r.asset.id}>
                <TableRow className={cn("cursor-pointer", isOpen && "bg-primary/[0.05]")} onClick={() => setOpen(isOpen ? undefined : r.asset.id)}>
                  <TableCell className="max-w-72 py-2">
                    <div className="flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-sm">{r.asset.description}</span>
                    </div>
                    <div className="truncate pl-5 text-2xs text-muted-foreground">
                      {r.asset.id} · acquired {fmtDate(r.asset.acquired)}
                      {r.checks[0] && r.risk !== "Low" ? ` · ${r.checks[0].text}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{money(r.asset.openingCost)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{money(r.asset.additions)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{money(r.closingCost)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{land ? "-" : money(r.asset.openingAccDep)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{land ? "-" : money(r.asset.depreciation)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{land ? "-" : money(r.closingAccDep)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tnum">{fmtINRCompact(r.nbv)}</TableCell>
                  <TableCell>
                    <SeverityBadge severity={SEVERITY[r.risk]} />
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <Detail r={r} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          <TableRow className="border-t-2 border-border font-medium">
            <TableCell>
              Total
              <div className="text-2xs font-normal text-muted-foreground">
                {GL_BY_ID.get(costGl)?.description}
                {depGl ? ` · ${GL_BY_ID.get(depGl)?.description}` : ""}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(t.openingCost)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{money(t.additions)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum" title={fmtDrCr(t.closingCost)}>{fmtINRCompact(t.closingCost)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{depGl ? fmtINRCompact(t.openingAccDep) : "-"}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{depGl ? fmtINRCompact(t.depreciation) : "-"}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{depGl ? fmtINRCompact(t.closingAccDep) : "-"}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(t.nbv)}</TableCell>
            <TableCell className="whitespace-nowrap text-2xs text-muted-foreground">
              {t.byRisk.High ? `${t.byRisk.High} high` : ""}
              {t.byRisk.High && t.byRisk.Medium ? " · " : ""}
              {t.byRisk.Medium ? `${t.byRisk.Medium} medium` : ""}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}
