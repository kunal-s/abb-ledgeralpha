import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { DocLink, KpiTile, Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORKING_CAPITAL_POLICY } from "@/config/policies";
import { msmeOverdue } from "@/engine/workingCapital";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { useFollowUpsByItem } from "@/state/hooks";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { downloadCsv } from "@/lib/exportCsv";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";

export function MsmeTab() {
  const items = useMemo(() => msmeOverdue(), []);
  const followUps = useFollowUpsByItem();
  const role = useRoleStore((s) => s.role);
  const { requestFollowUps } = useWorkflow.getState();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const days = WORKING_CAPITAL_POLICY.msmePaymentDays;

  const total = items.reduce((s, i) => s + i.amount, 0);
  const longest = items[0]?.overdue ?? 0;
  const suppliers = new Set(items.map((i) => i.line.partner?.id)).size;
  const open = (key: string) => {
    const f = followUps.get(key);
    return !!f && f.status !== "closed";
  };
  const chosen = items.filter((i) => selected.has(i.line.key) && !open(i.line.key));

  const request = () => {
    const r = requestFollowUps(
      chosen.map((i) => ({
        itemKey: i.line.key, module: "working-capital", owner: "Procurement and accounts payable", dueDate: addDays(nowLocal().slice(0, 10), 7),
        message: `Invoice ${i.line.reference ?? i.line.docNo} of ${i.vendor}, ${fmtINR(i.amount)} dated ${fmtDate(i.line.documentDate)}, is ${i.days} days old. The supplier is a ${i.enterprise.toLowerCase()} enterprise and the payment window is ${days} days. Confirm the payment date or the reason for the delay.`,
      }))
    );
    if (r.ok) {
      toast(`${r.created} follow-up${r.created === 1 ? "" : "s"} requested`, { tone: "ok" });
      setSelected(new Set());
    } else toast(r.error, { tone: "danger" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Invoices past the window" info={`Unpaid invoices of micro and small suppliers more than ${days} days after the invoice date`} value={fmtInt(items.length)} sublabel={`${suppliers} suppliers`} accent={items.length ? "warn" : "ok"} />
        <KpiTile label="Amount unpaid" value={fmtINRCompact(total)} sublabel="past the payment window" accent={items.length ? "warn" : "none"} />
        <KpiTile label="Longest delay" value={`${longest} days`} sublabel="beyond the window" accent={longest > 30 ? "danger" : "none"} />
        <KpiTile label="Payment window" value={`${days} days`} sublabel="from the invoice date" />
      </div>
      <Panel
        title="Invoices past the payment window"
        bodyClassName="p-0"
        actions={
          <>
            {chosen.length > 0 && (
              <Button size="sm" className="h-7" disabled={!can(role, "follow-up")} title={can(role, "follow-up") ? undefined : `${ROLES[role].label} cannot request follow-ups`} onClick={request}>
                Request follow-up for {chosen.length}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() =>
                downloadCsv("invoices-past-payment-window.csv", ["Supplier", "Enterprise", "Document", "Invoice date", "Days since invoice", "Days beyond window", "Amount"], items.map((i) => [i.vendor, i.enterprise, i.line.reference ?? i.line.docNo, fmtDate(i.line.documentDate), i.days, i.overdue, i.amount]))
              }
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                <input type="checkbox" aria-label="Select all invoices" checked={items.length > 0 && items.every((i) => selected.has(i.line.key))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.line.key)) : new Set())} />
              </TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Invoice date</TableHead>
              <TableHead className="text-right">Days since</TableHead>
              <TableHead className="text-right">Beyond window</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Follow-up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => {
              const f = followUps.get(i.line.key);
              return (
                <TableRow key={i.line.key} data-state={selected.has(i.line.key) ? "selected" : undefined}>
                  <TableCell className="w-8 pr-0">
                    <input
                      type="checkbox"
                      aria-label={`Select ${i.line.docNo}`}
                      checked={selected.has(i.line.key)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(i.line.key)) n.delete(i.line.key);
                          else n.add(i.line.key);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-64 py-2">
                    <div className="truncate text-sm">{i.vendor}</div>
                    <div className="text-2xs text-muted-foreground">{i.enterprise} enterprise</div>
                  </TableCell>
                  <TableCell className="py-2">
                    <DocLink itemKey={i.line.key}>{i.line.reference ?? i.line.docNo}</DocLink>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(i.line.documentDate)}</TableCell>
                  <TableCell className="py-2 text-right tnum text-sm">{i.days}</TableCell>
                  <TableCell className="py-2 text-right tnum text-sm text-danger-foreground">{i.overdue}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(i.amount)}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{f && f.status !== "closed" ? (f.status === "responded" ? "Answered" : `Asked, due ${fmtDate(f.dueDate)}`) : "-"}</TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No invoice of a micro or small supplier is past the payment window
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
