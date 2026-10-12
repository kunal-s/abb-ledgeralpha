import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfidenceChip, StatusChip } from "@/components/vocab";
import { itemStatus } from "@/state/hooks";
import type { RecRow } from "@/state/recHooks";
import { RecItemDetail } from "@/components/recon/RecItemDrawer";
import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { can } from "@/config/roles";
import { RECON_POLICY } from "@/config/policies";
import { RECON_CLASSES, TREATMENT_LABELS } from "@/engine/recClasses";
import { needsAction } from "@/engine/recs";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** The reconciling items of one reconciliation; a row expands in place to the item's facts, classification and next step. */
export function RecItemsTable({ row, empty = "No reconciling items" }: { row: RecRow; empty?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const role = useRoleStore((s) => s.role);
  const { classifyRecItem } = useWorkflow.getState();
  const locked = !!row.signOff?.preparer;
  const classes = RECON_CLASSES[row.rec.type];
  const editable = !locked && can(role, "propose");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Date</TableHead>
          <TableHead>Reference and narration</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Class and treatment</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {row.view.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-5 text-center text-sm text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        )}
        {row.view.items.map((i) => {
          const expanded = openId === i.id;
          const aged = !!i.cls && i.cls.treatment !== "classification" && i.ageDays > RECON_POLICY.agedItemDays;
          const status = itemStatus(needsAction(i) && !row.documented.has(i.id), row.decisionByItem.get(i.id), row.followUpByItem.get(i.id));
          return (
            <Fragment key={i.id}>
              <TableRow className="cursor-pointer" onClick={() => setOpenId(expanded ? null : i.id)} aria-expanded={expanded}>
                <TableCell className="w-8 py-2 pr-0">
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                </TableCell>
                <TableCell className="whitespace-nowrap py-2">
                  <div className="text-sm tnum">{fmtDate(i.date)}</div>
                  <div className={cn("text-2xs", aged ? "text-warn-foreground" : "text-muted-foreground")}>
                    {i.ageDays} days{aged ? ", aged" : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-60 py-2">
                  <div className="truncate text-sm">{i.reference ?? i.narration}</div>
                  {i.reference && <div className="truncate text-2xs text-muted-foreground">{i.narration}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right">
                  <div className="tnum text-sm">{fmtDrCr(i.amount)}</div>
                  <div className="text-2xs text-muted-foreground">{i.side === "books" ? "Books only" : "Source only"}</div>
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <Select value={i.classId} onValueChange={(v) => (classifyRecItem(row.rec.id, i.id, v).ok ? undefined : toast("Not allowed", { tone: "danger" }))} disabled={!editable}>
                      <SelectTrigger className="h-7 w-52 text-xs">
                        <SelectValue placeholder="Choose a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {i.cls && i.confidence !== undefined && i.classId === i.suggestedClass && <ConfidenceChip score={i.confidence} showIcon={false} />}
                  </div>
                  {i.cls && <div className="mt-0.5 text-2xs text-muted-foreground">{TREATMENT_LABELS[i.cls.treatment]}</div>}
                </TableCell>
                <TableCell className="py-2">
                  <StatusChip status={status} label={status === "flagged" ? "Open" : status === "within-policy" ? (i.cls ? "No action needed" : "Not classified") : undefined} />
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <RecItemDetail row={row} item={i} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
