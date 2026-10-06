import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { ConfidenceChip, DocLink, KpiTile, MethodBadge, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Factors, MatchArithmetic, levelText } from "@/components/cash/MatchParts";
import { DecisionApproval, FollowUpBody } from "@/components/review/drawerParts";
import { GL_BY_ID, PARTY_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { useCashApp } from "@/state/cashAppHooks";
import { useItemHistory } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { CASH_APP_POLICY } from "@/config/policies";
import { applicationJournal, draftRemittanceRequest, receiptAge } from "@/engine/cashapp";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

export function ReceiptDetail() {
  const { id } = useParams();
  const { byKey, data } = useCashApp();
  const row = id ? byKey.get(id) : undefined;
  const role = useRoleStore((s) => s.role);
  const { confirmMatch, rejectMatch, parkReceipt, unparkReceipt } = useWorkflow.getState();
  const [rejectReason, setRejectReason] = useState("");
  const [parkReason, setParkReason] = useState("");
  const history = useItemHistory(id);

  if (!row) {
    return (
      <div className="space-y-4">
        <PageHeader title="Receipt not found" breadcrumbs={[{ label: "Cash Application", to: "/cash-application" }, { label: id ?? "" }]} />
        <Card className="p-5 text-sm">
          <Link to="/cash-application?tab=receipts" className="font-medium text-primary hover:underline">
            Go to the receipts
          </Link>
        </Card>
      </div>
    );
  }

  const { receipt, match, best, weak, decision } = row;
  const shown = best ?? weak;
  const canPropose = can(role, "propose");
  const live = decision && decision.status !== "rejected" ? decision : undefined;
  const customer = row.customerId ? PARTY_BY_ID.get(row.customerId) : undefined;
  const entity = row.customerId ? data.entityOf.get(row.customerId) ?? [row.customerId] : [];
  const invoices = entity.flatMap((c) => data.invoicesByCustomer.get(c) ?? []).sort((a, b) => a.date.localeCompare(b.date));
  const inMatch = new Set(shown?.invoices.map((i) => i.key));
  const journal = best ? applicationJournal(best, receipt) : undefined;
  const alternatives = match.proposals.filter((p) => p.signature !== shown?.signature);
  const draft = draftRemittanceRequest(receipt, customer?.name);
  const deducted = shown ? shown.deductions.reduce((s, d) => s + d.amount, 0) : 0;
  const lineAccount = GL_BY_ID.get("171200")?.description;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Receipt ${receipt.utr ?? receipt.docNo}`}
        breadcrumbs={[{ label: "Cash Application", to: "/cash-application" }, { label: "Receipts", to: "/cash-application?tab=receipts" }, { label: receipt.utr ?? receipt.docNo }]}
        badge={<StatusChip status={row.status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Receipt" value={fmtINR(receipt.amount)} sublabel={`${fmtDate(receipt.date)} · ${row.age} days in clearing`} accent={row.age > 30 ? "warn" : "none"} />
        <KpiTile label="Applied to invoices" value={shown ? fmtINR(shown.invoiceTotal - shown.residual) : "-"} sublabel={shown ? `${shown.invoices.length} invoice${shown.invoices.length === 1 ? "" : "s"}` : "no match"} />
        <KpiTile label="Deductions explained" value={shown ? fmtINR(deducted) : "-"} sublabel={shown && shown.deductions.length ? shown.deductions.map((d) => d.label).join(" and ") : "none needed"} />
        <KpiTile label="Unexplained" value={shown ? (shown.residual === 0 ? "Nil" : fmtINR(shown.residual)) : "-"} sublabel={shown && shown.residual > 0 ? "short payment" : undefined} accent={shown && shown.residual > 0 ? "danger" : shown ? "ok" : "none"} />
        <KpiTile label="Match" value={shown ? levelText(shown) : "No match"} sublabel={shown ? <ConfidenceChip score={shown.confidence} size="sm" showIcon={false} /> : "remitter not identified"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {shown ? (
            <Panel
              title={best ? "How the receipt is explained" : "Closest explanation, below the confidence needed"}
              bodyClassName="p-0"
              actions={<MethodBadge method="deterministic" />}
            >
              <MatchArithmetic p={shown} receipt={receipt} />
            </Panel>
          ) : (
            <Panel title="Why there is no match">
              <ul className="space-y-1.5 text-sm">
                <li>{match.customers.length ? "The remittance names a customer, but no combination of its open invoices equals the receipt after standard deductions." : "The narration does not name a customer and cites no invoice."}</li>
                {match.customers.map((c) => (
                  <li key={c.customerId} className="text-xs text-muted-foreground">
                    {PARTY_BY_ID.get(c.customerId)?.name}: {c.basis}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {alternatives.length > 0 && (
            <Panel title="Other explanations" bodyClassName="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoices</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead className="text-right">Unexplained</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alternatives.map((p) => (
                    <TableRow key={p.signature}>
                      <TableCell className="max-w-56 truncate py-2 text-sm">{p.invoices.map((i) => i.reference).join(", ")}</TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-xs">{levelText(p)}</TableCell>
                      <TableCell className="max-w-48 truncate py-2 text-xs text-muted-foreground">{p.deductions.map((d) => `${d.label} ${fmtINR(d.amount)}`).join(", ") || "None"}</TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{p.residual ? fmtINR(p.residual) : "Nil"}</TableCell>
                      <TableCell className="py-2">
                        <ConfidenceChip score={p.confidence} showIcon={false} />
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button size="sm" variant="outline" className="h-7" disabled={!canPropose || !!live || !!row.parked} onClick={() => run(confirmMatch(receipt.key, p.signature), "Application proposed")}>
                          Use this
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}

          {journal && (
            <Panel title="Entry the application proposes" bodyClassName="p-0">
              <div className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">{journal.header}. Proposal only; nothing is posted from the platform.</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Dr / Cr</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Text</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journal.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-2 text-xs text-muted-foreground">{l.side}</TableCell>
                      <TableCell className="py-2">
                        <span className="font-mono text-xs">{l.gl}</span> <span className="text-xs text-muted-foreground">{GL_BY_ID.get(l.gl)?.description}</span>
                      </TableCell>
                      <TableCell className="max-w-64 truncate py-2 text-xs">{l.text}</TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
                Then clears {journal.clears!.length} open items against each other: the receipt and {journal.clears!.length - 1} invoice{journal.clears!.length === 2 ? "" : "s"}.
              </div>
            </Panel>
          )}

          {invoices.length > 0 && (
            <Panel title={`Open invoices of ${customer?.name ?? "the customer"}`} bodyClassName="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Invoice</TableHead>
                    <TableHead>Dated</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.slice(0, 40).map((i) => (
                    <TableRow key={i.key} data-state={inMatch.has(i.key) ? "selected" : undefined}>
                      <TableCell className="w-8 py-2">{inMatch.has(i.key) && <Check className="h-4 w-4 text-ok" aria-label="In this match" />}</TableCell>
                      <TableCell className="py-2">
                        <DocLink itemKey={i.key}>{i.reference}</DocLink>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(i.date)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap py-2 text-xs tnum", i.dueDate && i.dueDate < receipt.date && "text-warn-foreground")}>{i.dueDate ? fmtDate(i.dueDate) : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(i.taxable)}</TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(i.gross)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoices.length > 40 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the oldest 40 of {invoices.length} open invoices</div>}
            </Panel>
          )}
        </div>

        <div className="space-y-3">
          <Panel title="Decision" bodyClassName="space-y-3">
            {live ? (
              <DecisionApproval d={live} />
            ) : row.parked ? (
              <>
                <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                  Parked as unapplied by {PERSON_BY_ID.get(row.parked.by)?.name}, {fmtDateTime(row.parked.at)}: {row.parked.reason}
                </div>
                <Button size="sm" variant="outline" disabled={!canPropose} onClick={() => run(unparkReceipt(receipt.key), "Returned to the queue")}>
                  Return to the queue
                </Button>
              </>
            ) : (
              <>
                {decision?.status === "rejected" && (
                  <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground">
                    Application rejected{decision.rejection ? ` by ${PERSON_BY_ID.get(decision.rejection.personId)?.name}: ${decision.rejection.reason}` : ""}
                  </div>
                )}
                {best ? (
                  <>
                    <p className="text-sm">{best.rationale}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs text-muted-foreground">
                        {fmtINR(receipt.amount)} · {best.confidence >= CASH_APP_POLICY.bulkConfirmFrom ? "eligible for bulk confirmation" : "review before confirming"}
                      </span>
                      <Button size="sm" disabled={!canPropose} title={canPropose ? "Proposal only; the approval bands apply" : `${ROLES[role].label} cannot propose applications`} onClick={() => run(confirmMatch(receipt.key), "Application proposed")}>
                        Confirm match
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason to reject this match" className="h-8" />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canPropose}
                        onClick={() => {
                          const r = rejectMatch(receipt.key, rejectReason);
                          run(r, "Match rejected");
                          if (r.ok) setRejectReason("");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No match reaches the confidence needed ({CASH_APP_POLICY.proposeFrom.toFixed(2)}). Ask for the remittance advice, or park the receipt with a reason.</p>
                )}
                <div className="flex items-center gap-2 border-t border-border/70 pt-3">
                  <Input value={parkReason} onChange={(e) => setParkReason(e.target.value)} placeholder="Reason to park as unapplied" className="h-8" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canPropose}
                    onClick={() => {
                      const r = parkReceipt(receipt.key, parkReason);
                      run(r, "Receipt parked");
                      if (r.ok) setParkReason("");
                    }}
                  >
                    Park
                  </Button>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Receipt" bodyClassName="p-0">
            <Fields
              compact
              rows={[
                ["Bank narration", receipt.narration || "-"],
                ["Bank reference", receipt.utr ?? "-"],
                ["Document", <DocLink key="d" itemKey={receipt.key}>{receipt.docNo}</DocLink>],
                ["Account", `171200 · ${lineAccount}`],
                ["Posted", `${fmtDate(receipt.date)} · ${receiptAge(receipt, WORLD.asOf)} days ago`],
                ["Customer", customer ? `${customer.name}` : "Not identified"],
                ...(shown ? ([["Identified by", shown.customerBasis]] as [string, string][]) : match.customers[0] ? ([["Closest name", match.customers[0].basis]] as [string, string][]) : []),
                ...(row.rejected ? ([["Rejected matches", String(row.rejected)]] as [string, string][]) : []),
              ]}
            />
          </Panel>

          {shown && (
            <Panel title="Confidence" actions={<MethodBadge method="judgement" showConfidence={false} />}>
              <Factors factors={shown.factors} confidence={shown.confidence} />
            </Panel>
          )}

          {!live && !row.parked && (
            <Panel title="Request the remittance advice">
              <FollowUpBody
                key={`${row.followUp?.id ?? "none"}-${row.followUp?.status ?? ""}`}
                itemKey={receipt.key}
                module="cash-application"
                draft={draft}
                followUp={row.followUp}
                asOf={WORLD.asOf}
              />
            </Panel>
          )}

          {history.length > 0 && (
            <Panel title="Activity">
              <ol className="space-y-2">
                {history.slice(0, 8).map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="tnum text-muted-foreground">{fmtDateTime(e.at)}</span>
                      <span className="font-medium">{e.action}</span>
                    </div>
                    {(e.before || e.after) && <div className="text-muted-foreground">{e.before ? `${e.before} → ` : ""}{e.after}</div>}
                    {e.reason && <div className="text-muted-foreground">“{e.reason}”</div>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
