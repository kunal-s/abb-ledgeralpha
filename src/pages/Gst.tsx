import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ItcBars } from "@/components/reporting/ItcBars";
import { DocLink, KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcessRail, type RailStage } from "@/components/review/ProcessRail";
import { Section } from "@/components/review/drawerParts";
import { useDecisionsByItem, useFollowUpsByItem } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { itemPath } from "@/state/drawer";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { CLASS_LABELS, byPeriod, creditAtRisk, gstMonths, gstTdsCredits, reconcile, unusedGstTds, GST_POLICY, type GstMatch, type GstMonth } from "@/engine/gst";
import { GL_BY_ID, LINES_BY_DOC, PC_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { LOCALISATION } from "@/config/localisation";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { addDays, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Decision, FollowUp } from "@/types";

const TAX = LOCALISATION.taxes.indirect.label;
const MODULE = "indirect-tax";
const LIVE = new Set(["proposed", "approved", "exported", "closed-in-erp"]);
/** the tax head's name, from the output account ("GST output - CGST" -> "CGST") */
const headName = (gl: string) => GL_BY_ID.get(gl)?.description.split(" - ").pop() ?? gl;
const HEADS = [["cgst", "241400"], ["sgst", "241500"], ["igst", "241600"]] as const;
const unitName = (id: string) => WORLD.businessUnits.find((u) => u.id === id)?.name ?? id;
const unitOf = (pc: string) => PC_BY_ID.get(pc)?.businessUnitId ?? "CORP";
const nextMonth = (period: string) => fmtMonth(addDays(`${period}-28`, 7));
const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

const RETURN_STATUS: Record<GstMonth["status"], { status: string; label: string }> = {
  "on-time": { status: "approved", label: "Filed" },
  late: { status: "in-review", label: "Filed late" },
  overdue: { status: "rejected", label: "Overdue" },
  due: { status: "not-started", label: "Due" },
  open: { status: "not-started", label: "Open" },
};

// ---------------------------------------------------------------------------
// A supplier who has not reported an invoice: from the finding to the credit
// claimed (once reported) or reversed and recovered from the supplier.
// ---------------------------------------------------------------------------
function caseStages(m: GstMatch, fu: FollowUp | undefined, d: Decision | undefined): RailStage[] {
  const b = m.book!;
  const name = (id?: string) => (id ? PERSON_BY_ID.get(id)?.name ?? id : "");
  const reported = fu?.status === "closed" && !d;
  return [
    { id: "found", label: "Found", state: "done", who: "Tax matcher", detail: `Not in the ${fmtMonth(`${m.period}-01`)} statement` },
    fu
      ? { id: "asked", label: "Supplier asked", state: "done", who: name(fu.createdBy), when: fu.createdAt, detail: `Due ${fmtDate(fu.dueDate)}` }
      : { id: "asked", label: "Supplier asked", state: "current", who: b.name, detail: "Ask the supplier to report it" },
    fu?.response
      ? { id: "answer", label: "Answer", state: "done", who: name(fu.response.by), when: fu.response.at, detail: "Recorded" }
      : { id: "answer", label: "Answer", state: fu && fu.status === "open" ? "current" : fu ? "skipped" : "upcoming", who: b.name, detail: fu ? `Due ${fmtDate(fu.dueDate)}` : "After the request" },
    d
      ? { id: "resolve", label: "Resolution", state: d.status === "proposed" ? "current" : "done", who: name(d.proposedBy), when: d.proposedAt, detail: d.status === "proposed" ? "Reversal in approval" : "Reversal approved" }
      : reported
        ? { id: "resolve", label: "Resolution", state: "done", who: name(fu!.createdBy), detail: `Credit claimed in ${nextMonth(m.period)}` }
        : { id: "resolve", label: "Resolution", state: fu?.response ? "current" : "upcoming", who: PERSON_BY_ID.get(GL_BY_ID.get("210100")?.ownerId ?? "")?.name ?? "Payables", detail: "Claim when reported, or reverse" },
    d?.status === "closed-in-erp" || reported
      ? { id: "closed", label: "Closed", state: "done", who: d ? "ERP" : name(fu!.createdBy), detail: d ? "Reversal posted" : "Reported by the supplier" }
      : { id: "closed", label: "Closed", state: "upcoming", who: "", detail: "When the credit is settled" },
  ];
}

function SupplierCase({ m, fu, d }: { m: GstMatch; fu?: FollowUp; d?: Decision }) {
  const b = m.book!;
  const role = useRoleStore((s) => s.role);
  const { requestFollowUp, respondFollowUp, closeFollowUp, proposeDecision } = useWorkflow.getState();
  const [message, setMessage] = useState(`Please report invoice ${b.ref} dated ${fmtDate(b.date)} (tax ${fmtINR(b.tax)}) in your return so the input credit is available to us.`);
  const [answer, setAnswer] = useState("");
  const stages = caseStages(m, fu, d);
  // the payables accountant proposes the reversal; the tax team reviews it, so it cannot also propose it
  const canReverse = can(role, "propose") && role !== "tax-specialist";
  const payablesOwner = PERSON_BY_ID.get(GL_BY_ID.get("210100")?.ownerId ?? "")?.name ?? "the payables accountant";
  const current = stages.find((s) => s.state === "current") ?? stages[stages.length - 1];
  const [chosen, setChosen] = useState<string>();
  const selected = stages.find((s) => s.id === (chosen ?? current.id)) ?? current;

  const reverse = () => {
    const legs = (LINES_BY_DOC.get(b.docKey) ?? []).filter((l) => ["162100", "162200", "162300"].includes(l.gl) && l.amount > 0);
    const total = legs.reduce((s, l) => s + l.amount, 0);
    run(
      proposeDecision({
        itemKey: b.apKey, module: MODULE, action: "Adjust books", amount: total, hits: [], rulesVersion: "gst", taxReviewRequired: true,
        justification: `${b.name} has not reported invoice ${b.ref} in its return${fu?.response ? `: "${fu.response.text}"` : ""}. Reverse the input credit and recover the tax from the supplier.`,
        journal: {
          header: `Input credit reversed, invoice ${b.ref} not reported by the supplier`,
          lines: [
            { gl: "210100", side: "Dr", amount: total, text: `Tax on invoice ${b.ref} recovered from the supplier`, partnerId: b.vendorId },
            ...legs.map((l) => ({ gl: l.gl, side: "Cr" as const, amount: l.amount, text: `Input credit reversed, invoice ${b.ref}` })),
          ],
        },
      }),
      "Reversal proposed"
    );
  };

  let work: React.ReactNode;
  if (selected.id === "asked" && !fu) {
    work = (
      <div className="space-y-2">
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[4rem]" />
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">To {b.name} · due {fmtDate(addDays(WORLD.asOf, 10))} · recorded; nothing is sent from the prototype</span>
          <Button size="sm" disabled={!can(role, "follow-up")} onClick={() => run(requestFollowUp({ itemKey: b.apKey, module: MODULE, owner: b.name, dueDate: addDays(WORLD.asOf, 10), message }), "Supplier asked")}>
            Ask the supplier
          </Button>
        </div>
      </div>
    );
  } else if (selected.id === "answer" && fu?.status === "open") {
    work = (
      <div className="space-y-2">
        <p className="rounded-md bg-background p-2 text-sm text-muted-foreground">{fu.message}</p>
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="The supplier's answer" className="min-h-[3.5rem]" />
        <div className="flex justify-end">
          <Button size="sm" disabled={!can(role, "follow-up") || !answer.trim()} onClick={() => run(respondFollowUp(fu.id, answer), "Answer recorded")}>
            Record the answer
          </Button>
        </div>
      </div>
    );
  } else if (selected.id === "resolve" && fu?.response && !d && fu.status !== "closed") {
    work = (
      <div className="space-y-2">
        <p className="rounded-md border border-ok/30 bg-ok-subtle p-2 text-sm text-ok-foreground">{fu.response.text}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" disabled={!can(role, "follow-up")} onClick={() => run(closeFollowUp(fu.id), `Credit to be claimed in ${nextMonth(m.period)}`)}>
            Reported: claim the credit in {nextMonth(m.period)}
          </Button>
          <Button size="sm" disabled={!canReverse} onClick={reverse}>
            Not coming: reverse and recover {fmtINRCompact(b.tax)}
          </Button>
        </div>
        {!canReverse && <div className="text-right text-xs text-muted-foreground">The reversal is proposed by the payables accountant, {payablesOwner}, and reviewed by the tax team. You are acting as {ROLES[role].label}.</div>}
      </div>
    );
  } else if (selected.id === "resolve" && d) {
    work = (
      <div className="flex items-center justify-between text-sm">
        <span>
          {d.action} {fmtINR(Math.abs(d.amount))} · {d.status === "proposed" ? `waiting for ${d.chain[d.approvals.length] ? ROLES[d.chain[d.approvals.length]].label : "tax review"}` : d.status}
        </span>
        <Link to={itemPath(b.apKey)} className="text-xs font-medium text-primary hover:underline">Approve and post on the invoice's screen</Link>
      </div>
    );
  } else {
    work = <p className="text-sm text-muted-foreground">{selected.detail}</p>;
  }

  return (
    <div className="space-y-3 bg-secondary/30 px-4 py-3">
      <ProcessRail stages={stages} selected={selected.id} onSelect={setChosen} />
      <div className="rounded-md border border-border bg-card p-3">{work}</div>
    </div>
  );
}

function Matches({ rows, cases }: { rows: GstMatch[]; cases?: boolean }) {
  const followUps = useFollowUpsByItem();
  const decisions = useDecisionsByItem();
  const [open, setOpen] = useState<string>();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">In the books</TableHead>
          <TableHead className="text-right">In the statement</TableHead>
          <TableHead className="text-right">At stake</TableHead>
          {cases && <TableHead>Case</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 25).map((m) => {
          const key = m.book?.docKey ?? m.stmt?.id ?? "";
          const fu = m.book ? followUps.get(m.book.apKey) : undefined;
          const d = m.book ? decisions.get(m.book.apKey) : undefined;
          const live = d && LIVE.has(d.status) ? d : undefined;
          const isOpen = open === key;
          const state = live ? (live.status === "closed-in-erp" ? "Reversed" : "Reversal in approval") : fu?.status === "closed" ? "Claimed" : fu?.response ? "Answered" : fu ? "Asked" : "To ask";
          return (
            <Fragment key={key}>
              <TableRow className={cn(cases && "cursor-pointer", isOpen && "bg-primary/[0.05]")} onClick={cases ? () => setOpen(isOpen ? undefined : key) : undefined}>
                <TableCell className="max-w-56 text-sm">
                  <div className="flex items-center gap-1.5">
                    {cases && (isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />)}
                    <span className="truncate">{m.book?.name ?? m.stmt?.supplierId}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{m.book ? <DocLink itemKey={m.book.apKey}>{m.book.ref}</DocLink> : <span className="font-mono text-xs">{m.stmt?.invoiceRef}</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(m.book?.date ?? m.stmt!.invoiceDate)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{m.booksTax ? fmtINR(m.booksTax) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{m.stmtTax ? fmtINR(m.stmtTax) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tnum">{fmtINR(m.atStake)}</TableCell>
                {cases && (
                  <TableCell>
                    <StatusChip status={state === "To ask" ? "flagged" : state === "Claimed" || state === "Reversed" ? "approved" : "in-follow-up"} label={state} />
                  </TableCell>
                )}
              </TableRow>
              {cases && isOpen && m.book && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <SupplierCase key={`${key}-${fu?.id ?? ""}-${fu?.status ?? ""}-${live?.id ?? ""}-${live?.status ?? ""}`} m={m} fu={fu} d={live} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={cases ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">Nothing here</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// One month's return, from the ledger: what was charged, what credit was used,
// what was paid, and by which business.
// ---------------------------------------------------------------------------
function ReturnPanel({ m, atStake, unused, onClose, onMissing }: { m: GstMonth; atStake: { value: number; count: number }; unused: number; onClose: () => void; onMissing: () => void }) {
  const s = m.settlement;
  const ties = s ? s.outputSetOff === m.output.total && s.creditUsed === m.input.total && s.outputSetOff - s.creditUsed === s.cash : undefined;
  const st = RETURN_STATUS[m.status];
  return (
    <Panel
      title={`Return for ${fmtMonth(`${m.period}-01`)}`}
      actions={
        <>
          {ties !== undefined && <span className={cn("text-xs", ties ? "text-ok-foreground" : "text-danger-foreground")}>{ties ? "Settlement ties to the ledger" : "Settlement does not tie"}</span>}
          <StatusChip status={st.status} label={st.label} />
          <Button variant="ghost" size="sm" className="h-7" onClick={onClose}>Close</Button>
        </>
      }
      bodyClassName="p-0"
    >
      <div className="grid gap-0 lg:grid-cols-3 [&>section]:border-t-0 lg:[&>section+section]:border-l lg:[&>section+section]:border-border">
        <Section title="Tax on sales">
          <div className="-mx-4">
            <Fields compact rows={[...HEADS.map(([h, gl]) => [headName(gl), <span key={h} className="tnum">{fmtINR(m.output[h])}</span>] as [string, React.ReactNode]), ["Total", <span key="t" className="font-medium tnum">{fmtINR(m.output.total)}</span>]]} />
          </div>
        </Section>
        <Section title="Input credit">
          <div className="-mx-4">
            <Fields compact rows={[...HEADS.map(([h], i) => [headName(["162100", "162200", "162300"][i]).replace(/^GST input - /, ""), <span key={h} className="tnum">{fmtINR(m.input[h])}</span>] as [string, React.ReactNode]), ["Total", <span key="t" className="font-medium tnum">{fmtINR(m.input.total)}</span>]]} />
          </div>
          {atStake.count > 0 && (
            <button type="button" onClick={onMissing} className="mt-2 text-left text-xs text-danger-foreground hover:underline">
              {fmtINR(atStake.value)} of it is on {fmtInt(atStake.count)} invoice{atStake.count === 1 ? "" : "s"} the suppliers have not reported
            </button>
          )}
        </Section>
        <Section title="Settlement and filing">
          <div className="-mx-4">
            <Fields
              compact
              rows={
                s
                  ? [
                      ["Output tax set off", <span key="o" className="tnum">{fmtINR(s.outputSetOff)}</span>],
                      ["Input credit used", <span key="c" className="tnum">{fmtINR(s.creditUsed)}</span>],
                      ["Paid in cash", <span key="p" className="font-medium tnum">{fmtINR(s.cash)}</span>],
                      ["Settlement journal", <span key="j"><DocLink itemKey={s.lineKey}>{s.docNo}</DocLink> <span className="text-xs text-muted-foreground">posted {fmtDate(s.postedOn)}</span></span>],
                      ["Return", m.filedOn ? `Filed ${fmtDate(m.filedOn)}${m.daysLate ? `, ${m.daysLate} days late` : ""} · due ${fmtDate(m.dueDate!)}` : `Due ${fmtDate(m.dueDate!)}`],
                    ]
                  : [
                      ["Output tax to pay", <span key="o" className="tnum">{fmtINR(m.output.total)}</span>],
                      ["Input credit to use", <span key="c" className="tnum">{fmtINR(m.input.total)}</span>],
                      ["Cash to pay", <span key="p" className="font-medium tnum">{fmtINR(m.output.total - m.input.total)}</span>],
                      ["Credit in the cash ledger", <span key="t" className="tnum">{fmtINR(unused)} deducted by government customers, unused</span>],
                      ["Return", m.dueDate ? `Due ${fmtDate(m.dueDate)}` : "Not yet due"],
                    ]
              }
            />
          </div>
        </Section>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business unit</TableHead>
            <TableHead className="text-right">Tax on sales</TableHead>
            <TableHead className="text-right">Input credit</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {m.byUnit.map((u) => (
            <TableRow key={u.unitId}>
              <TableCell className="text-sm">{unitName(u.unitId)}</TableCell>
              <TableCell className="text-right tnum">{fmtINRCompact(u.output)}</TableCell>
              <TableCell className="text-right tnum">{fmtINRCompact(u.input)}</TableCell>
              <TableCell className="text-right tnum">{fmtINRCompact(u.output - u.input)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function Gst() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const role = useRoleStore((s) => s.role);
  const followUps = useFollowUpsByItem();
  const [params, setParams] = useQueryParams();
  const tab = params.get("gtab") ?? "missing";
  const period = params.get("gperiod") ?? undefined;

  const matches = useMemo(() => reconcile(periodEnd), [periodEnd]);
  const periods = useMemo(() => byPeriod(matches), [matches]);
  const months = useMemo(() => gstMonths(periodEnd, unitOf), [periodEnd]);
  const risk = useMemo(() => creditAtRisk(periodEnd), [periodEnd]);
  const tds = useMemo(() => gstTdsCredits(periodEnd), [periodEnd]);
  const unused = useMemo(() => unusedGstTds(periodEnd), [periodEnd]);

  const inPeriod = (m: GstMatch) => !period || m.period === period;
  const of = (c: GstMatch["cls"]) => matches.filter((m) => m.cls === c && inPeriod(m)).sort((a, b) => b.atStake - a.atStake);
  const missing = of("missing-in-statement");
  const different = of("different");
  const unbooked = of("missing-in-books");
  const settled = months.filter((m) => m.settlement);
  const fy = { output: months.reduce((s, m) => s + m.output.total, 0), credit: settled.reduce((s, m) => s + m.settlement!.creditUsed, 0), cash: settled.reduce((s, m) => s + m.settlement!.cash, 0) };
  const next = months.find((m) => m.status === "due" || m.status === "overdue");
  const selected = period ? months.find((m) => m.period === period) : undefined;
  const missingAll = matches.filter((m) => m.cls === "missing-in-statement");
  const toAsk = missing.filter((m) => m.book && !followUps.get(m.book.apKey));
  const askAll = () => {
    const r = useWorkflow.getState().requestFollowUps(toAsk.map((m) => ({ itemKey: m.book!.apKey, module: MODULE, owner: m.book!.name, dueDate: addDays(WORLD.asOf, 10), message: `Please report invoice ${m.book!.ref} dated ${fmtDate(m.book!.date)} (tax ${fmtINR(m.book!.tax)}) in your return so the input credit is available to us.` })));
    run(r, `${toAsk.length} suppliers asked`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={TAX} badge={period ? <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{fmtMonth(`${period}-01`)}</span> : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Tax on sales" hint="Output tax charged on sales in the fiscal year to date, from the output tax accounts" value={fmtINRCompact(fy.output)} sublabel={`${fmtInt(months.length)} months`} />
        <KpiTile label="Input credit used" hint="Input credit set off against the output tax in the monthly settlements" value={fmtINRCompact(fy.credit)} sublabel={`${fmtInt(settled.length)} returns settled`} />
        <KpiTile label="Paid in cash" hint="What the settlements paid after the credit" value={fmtINRCompact(fy.cash)} sublabel={`${((fy.cash / Math.max(1, fy.output)) * 100).toFixed(0)}% of the tax on sales`} />
        <KpiTile
          label={next ? `${fmtMonth(`${next.period}-01`)} return` : "Next return"}
          hint="Tax on sales less input credit for the open month, before using the credit in the cash ledger"
          value={next ? fmtINRCompact(next.output.total - next.input.total) : "-"}
          sublabel={next?.dueDate ? `Due ${fmtDate(next.dueDate)}` : "Nothing due"}
          accent={next?.status === "overdue" ? "danger" : next ? "warn" : "none"}
          onClick={next ? () => setParams({ gperiod: next.period }) : undefined}
        />
        <KpiTile label="Not reported by suppliers" value={fmtINRCompact(missingAll.reduce((s, m) => s + m.atStake, 0))} sublabel={`${fmtInt(missingAll.length)} invoices`} accent={missingAll.length ? "danger" : "none"} onClick={() => setParams({ gtab: "missing" })} />
        <KpiTile label="Credit in the cash ledger" hint="Tax deducted by government customers, credited to the company's cash ledger and not yet used to pay a return" value={fmtINRCompact(unused)} sublabel="Use it in the next return" accent={unused ? "info" : "none"} onClick={() => setParams({ gtab: "tds" })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Input credit by return period" className="xl:col-span-2" actions={period ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setParams({ gperiod: null })}>All periods</button> : undefined}>
          <ItcBars periods={periods} selected={period} onSelect={(p) => setParams({ gperiod: p ?? null })} />
        </Panel>
        <Panel title="Returns and payments" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {[...months].reverse().map((m) => {
              const st = RETURN_STATUS[m.status];
              return (
                <li key={m.period}>
                  <button type="button" onClick={() => setParams({ gperiod: m.period === period ? null : m.period })} className={cn("flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-secondary/60", m.period === period && "bg-primary/[0.07]")}>
                    <div>
                      <div className="text-sm">{fmtMonth(`${m.period}-01`)}</div>
                      <div className="text-2xs text-muted-foreground tnum">
                        Sales tax {fmtINRCompact(m.output.total)} · {m.settlement ? `paid ${fmtINRCompact(m.settlement.cash)}` : `to pay ${fmtINRCompact(m.output.total - m.input.total)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-2xs text-muted-foreground tnum">{m.filedOn ? fmtDate(m.filedOn) : m.dueDate ? `due ${fmtDate(m.dueDate)}` : ""}</span>
                      <StatusChip status={st.status} label={st.label} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {selected && (
        <ReturnPanel
          m={selected}
          atStake={{ value: missing.reduce((s, x) => s + x.atStake, 0), count: missing.length }}
          unused={unused}
          onClose={() => setParams({ gperiod: null })}
          onMissing={() => setParams({ gtab: "missing" })}
        />
      )}

      <Tabs value={tab} onValueChange={(v) => setParams({ gtab: v === "missing" ? null : v })}>
        <TabsList>
          <TabsTrigger value="missing">Not reported by the supplier ({fmtInt(missing.length)})</TabsTrigger>
          <TabsTrigger value="different">Different tax ({fmtInt(different.length)})</TabsTrigger>
          <TabsTrigger value="unbooked">Reported, not booked ({fmtInt(unbooked.length)})</TabsTrigger>
          <TabsTrigger value="risk">Credit at risk ({fmtInt(risk.length)})</TabsTrigger>
          <TabsTrigger value="tds">Tax deducted by customers</TabsTrigger>
        </TabsList>
        <TabsContent value="missing">
          <Panel
            title={CLASS_LABELS["missing-in-statement"]}
            actions={toAsk.length > 0 ? <Button size="sm" variant="outline" className="h-7" disabled={!can(role, "follow-up")} onClick={askAll}>Ask the {fmtInt(toAsk.length)} suppliers not yet asked</Button> : undefined}
            bodyClassName="p-0"
          >
            <Matches rows={missing} cases />
          </Panel>
        </TabsContent>
        <TabsContent value="different"><Panel title={CLASS_LABELS.different} bodyClassName="p-0"><Matches rows={different} /></Panel></TabsContent>
        <TabsContent value="unbooked"><Panel title={CLASS_LABELS["missing-in-books"]} bodyClassName="p-0"><Matches rows={unbooked} /></Panel></TabsContent>
        <TabsContent value="risk">
          <Panel title={`Supplier invoices unpaid beyond ${GST_POLICY.paymentDays} days`} bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Days since the invoice</TableHead>
                  <TableHead className="text-right">Credit at risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risk.slice(0, 25).map((r) => (
                  <TableRow key={r.line.key}>
                    <TableCell className="max-w-64 truncate text-sm">{r.name}</TableCell>
                    <TableCell><DocLink itemKey={r.line.key}>{r.line.docNo}</DocLink></TableCell>
                    <TableCell className="text-right tnum">{fmtInt(r.days)}</TableCell>
                    <TableCell className="text-right tnum">{fmtINR(r.tax)}</TableCell>
                  </TableRow>
                ))}
                {risk.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No invoice is past the window</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
        <TabsContent value="tds">
          <Panel title="Tax deducted by government customers, credited to the cash ledger and not yet used" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Oldest</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tds.slice(0, 15).map((c) => (
                  <TableRow key={c.customerId}>
                    <TableCell className="max-w-64 truncate text-sm">{c.name}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(c.count)}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(c.oldest)} d</TableCell>
                    <TableCell className="text-right tnum">{fmtINRCompact(c.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
