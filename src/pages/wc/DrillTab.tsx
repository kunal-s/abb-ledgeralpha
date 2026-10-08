import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { DocLink, KpiTile, Panel } from "@/components/vocab";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID, PC_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { AGEING_POLICY } from "@/config/policies";
import { CORPORATE } from "@/engine/attribution";
import { balanceOf, drill, reviewAgeing, statutoryAgeing, type DrillPath, type DrillRow, type Side } from "@/engine/workingCapital";
import { ageOf } from "@/engine/review";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { useQueryParams } from "@/lib/useQueryParams";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";

const BAR_GROUPS: BarGroup[] = [
  { key: "0-90", label: "0 to 90 days", cls: "bg-ok/55" },
  { key: "91-180", label: "91 to 180 days", cls: "bg-info" },
  { key: "181-365", label: "181 to 365 days", cls: "bg-warn" },
  { key: "365+", label: "Over 365 days", cls: "bg-danger" },
];

const LEVEL_NAME = { bu: "Business unit", pc: "Profit centre", project: "Project", party: "", document: "Document" } as const;

export function DrillTab({ side }: { side: Side }) {
  const pfx = side === "receivables" ? "r" : "p";
  const [params, setParams] = useQueryParams();
  const role = useRoleStore((s) => s.role);
  const { requestFollowUps } = useWorkflow.getState();
  const path: DrillPath = { bu: params.get(`${pfx}bu`) ?? undefined, pc: params.get(`${pfx}pc`) ?? undefined, project: params.get(`${pfx}prj`) ?? undefined, party: params.get(`${pfx}pty`) ?? undefined };
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pathKey = [path.bu, path.pc, path.project, path.party].join("|");
  const d = useMemo(() => drill(side, { bu: path.bu, pc: path.pc, project: path.project, party: path.party }), [side, pathKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const review = useMemo(() => reviewAgeing(side), [side]);
  const statutory = useMemo(() => statutoryAgeing(side), [side]);
  const partyLabel = side === "receivables" ? "Customer" : "Supplier";
  const total = review.reduce((s, b) => s + b.amount, 0);
  const aged = review.filter((b) => b.id === "181-365" || b.id === "365+").reduce((s, b) => s + b.amount, 0);

  const chart = useMemo(() => {
    const o: Record<string, Record<string, number>> = { all: {} };
    for (const b of review) o.all[b.id] = Math.round(b.amount / 1e7);
    return o;
  }, [review]);

  const crumbs: { label: string; set: Record<string, string | null> }[] = [
    { label: side === "receivables" ? "All receivables" : "All payables", set: { bu: null, pc: null, prj: null, pty: null } },
    ...(path.bu ? [{ label: path.bu === CORPORATE ? "Corporate" : WORLD.businessUnits.find((b) => b.id === path.bu)?.name ?? path.bu, set: { pc: null, prj: null, pty: null } }] : []),
    ...(path.pc ? [{ label: PC_BY_ID.get(path.pc)?.name ?? path.pc, set: { prj: null, pty: null } }] : []),
    ...(path.project ? [{ label: path.project === "none" ? "No project" : PROJECT_BY_WBS.get(path.project)?.name ?? path.project, set: { pty: null } }] : []),
    ...(path.party ? [{ label: PARTY_BY_ID.get(path.party)?.name ?? path.party, set: {} }] : []),
  ];
  const go = (patch: Record<string, string | null>) => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) out[`${pfx}${k}`] = v;
    setParams(out, { replace: false });
    setSelected(new Set());
  };
  const open = (r: DrillRow) => {
    if (d.level === "bu") go({ bu: r.key });
    else if (d.level === "pc") go({ pc: r.key });
    else if (d.level === "project") go({ prj: r.key });
    else go({ pty: r.key });
  };

  const chosen = d.items.filter((l) => selected.has(l.key));
  const request = () => {
    const r = requestFollowUps(
      chosen.map((l) => {
        const party = l.partner ? PARTY_BY_ID.get(l.partner.id)?.name : undefined;
        const age = ageOf(l, WORLD.asOf);
        return {
          itemKey: l.key, module: "working-capital", owner: side === "receivables" ? party ?? "Customer" : "Accounts payable", dueDate: addDays(WORLD.asOf, 14),
          message:
            side === "receivables"
              ? `Please confirm when ${fmtINR(balanceOf(side, l))} on ${l.reference ?? l.docNo} dated ${fmtDate(l.postingDate)} will be paid. It is ${age} days old.`
              : `Please confirm the payment date for ${l.reference ?? l.docNo} of ${party ?? "the supplier"}, ${fmtINR(balanceOf(side, l))} dated ${fmtDate(l.postingDate)}, which is ${age} days old.`,
        };
      })
    );
    if (r.ok) {
      toast(`${r.created} follow-up${r.created === 1 ? "" : "s"} requested`, { tone: "ok" });
      setSelected(new Set());
    } else toast(r.error, { tone: "danger" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={side === "receivables" ? "Receivables outstanding" : "Payables outstanding"} value={fmtINRCompact(total)} sublabel={`${fmtInt(review.reduce((s, b) => s + b.count, 0))} open items`} accent="info" />
        <KpiTile label={`Older than ${AGEING_POLICY.reviewThresholdDays} days`} info="Open items past the review threshold of the Balance Sheet Review" value={fmtINRCompact(aged)} sublabel={total ? `${((aged / total) * 100).toFixed(1)}% of the balance` : undefined} accent={aged ? "warn" : "none"} />
        <KpiTile label="Largest in this view" value={d.rows[0] ? fmtINRCompact(d.rows[0].amount) : "-"} sublabel={d.rows[0]?.label} />
        <KpiTile label="In this view" value={fmtINRCompact(d.total.amount)} sublabel={`${fmtInt(d.total.count)} items`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Review ageing">
          <StatusBars data={chart} rows={[{ key: "all", label: "Open items" }]} groups={BAR_GROUPS} unit="₹ crore" labelWidth="6rem" />
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            {review.map((b) => (
              <div key={b.id}>
                <div className="text-muted-foreground">{b.label}</div>
                <div className="tnum">{fmtINRCompact(b.amount)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Statutory ageing" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Band</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statutory.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="py-1.5 text-sm">{b.label}</TableCell>
                  <TableCell className="py-1.5 text-right tnum text-sm">{fmtInt(b.count)}</TableCell>
                  <TableCell className="py-1.5 text-right tnum text-sm">{fmtINRCompact(b.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Panel
        title={d.level === "document" ? "Documents" : `By ${(LEVEL_NAME[d.level] || partyLabel).toLowerCase()}`}
        bodyClassName="p-0"
        actions={
          d.level === "document" && chosen.length > 0 ? (
            <Button size="sm" className="h-7" disabled={!can(role, "follow-up")} title={can(role, "follow-up") ? undefined : `${ROLES[role].label} cannot request follow-ups`} onClick={request}>
              Request follow-up for {chosen.length}
            </Button>
          ) : undefined
        }
      >
        <nav className="flex flex-wrap items-center gap-1 border-b border-border/70 px-4 py-2 text-xs">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              {i < crumbs.length - 1 ? (
                <button type="button" onClick={() => go(c.set)} className="text-primary hover:underline">
                  {c.label}
                </button>
              ) : (
                <span className="font-medium">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {d.level === "document" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pr-0">
                  <input type="checkbox" aria-label="Select all documents shown" checked={d.items.length > 0 && d.items.every((l) => selected.has(l.key))} onChange={(e) => setSelected(e.target.checked ? new Set(d.items.map((l) => l.key)) : new Set())} />
                </TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Text</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Age</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.slice(0, 200).map((l) => (
                <TableRow key={l.key} data-state={selected.has(l.key) ? "selected" : undefined}>
                  <TableCell className="w-8 pr-0">
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.docNo}`}
                      checked={selected.has(l.key)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(l.key)) n.delete(l.key);
                          else n.add(l.key);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <DocLink itemKey={l.key}>{l.reference ?? l.docNo}</DocLink>
                  </TableCell>
                  <TableCell className="max-w-64 truncate py-2 text-xs">{l.text ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(l.postingDate)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs tnum">{l.dueDate ? fmtDate(l.dueDate) : "-"}</TableCell>
                  <TableCell className="py-2 text-right tnum text-sm">{ageOf(l, WORLD.asOf)} days</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(balanceOf(side, l))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{LEVEL_NAME[d.level] || partyLabel}</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Older than {AGEING_POLICY.reviewThresholdDays} days</TableHead>
                <TableHead className="text-right">Oldest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.slice(0, 200).map((r) => (
                <TableRow key={r.key} className="cursor-pointer" onClick={() => open(r)}>
                  <TableCell className="max-w-72 py-2">
                    <div className="truncate text-sm">{r.label}</div>
                    {r.sublabel && <div className="truncate text-2xs text-muted-foreground">{r.sublabel}</div>}
                  </TableCell>
                  <TableCell className="py-2 text-right tnum text-sm">{fmtInt(r.count)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(r.amount)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.aged ? fmtINRCompact(r.aged) : "-"}</TableCell>
                  <TableCell className="py-2 text-right tnum text-sm">{r.oldest} days</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                <TableCell className="py-2 text-sm font-medium">Total</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{fmtInt(d.total.count)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{fmtINRCompact(d.total.amount)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{d.total.aged ? fmtINRCompact(d.total.aged) : "-"}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{d.total.oldest} days</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        {d.level === "document" && d.items.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the first 200 of {fmtInt(d.items.length)} documents</div>}
      </Panel>
    </div>
  );
}
