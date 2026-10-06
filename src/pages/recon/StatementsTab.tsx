import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRecRows } from "@/state/recHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { can } from "@/config/roles";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ConfirmationStatus } from "@/types";

const STATUSES: { key: ConfirmationStatus; label: string; bar: string }[] = [
  { key: "not-sent", label: "Not sent", bar: "bg-muted-foreground/30" },
  { key: "sent", label: "Awaiting reply", bar: "bg-info" },
  { key: "reply-received", label: "Reply received", bar: "bg-warn" },
  { key: "counter-statement", label: "Counter-statement", bar: "bg-warn/60" },
  { key: "confirmed", label: "Confirmed", bar: "bg-ok" },
];
const TYPES = ["Customer statement", "Vendor statement", "Intercompany"] as const;

export function StatementsTab() {
  const all = useRecRows().filter((r) => r.view.confirmation);
  const navigate = useNavigate();
  const role = useRoleStore((s) => s.role);
  const { markConfirmationSent, applyReply } = useWorkflow.getState();
  const [params, setParams] = useQueryParams();
  const type = params.get("ctype") ?? "all";
  const status = params.get("cstatus") ?? "all";
  const q = params.get("cq") ?? "";

  const scoped = useMemo(() => all.filter((r) => type === "all" || r.rec.type === type), [all, type]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scoped) m.set(r.view.confirmation!.status, (m.get(r.view.confirmation!.status) ?? 0) + 1);
    return m;
  }, [scoped]);
  const max = Math.max(1, ...counts.values());
  const shown = useMemo(
    () => scoped.filter((r) => (status === "all" || r.view.confirmation!.status === status) && (!q || r.rec.name.toLowerCase().includes(q.toLowerCase()))),
    [scoped, status, q]
  );

  return (
    <div className="space-y-4">
      <Panel title="Confirmations by status">
        <ul className="space-y-2">
          {STATUSES.map((s) => {
            const n = counts.get(s.key) ?? 0;
            return (
              <li key={s.key} className="grid grid-cols-[10rem_1fr_2rem] items-center gap-3">
                <button type="button" className={cn("text-left text-xs hover:text-foreground", status === s.key ? "font-semibold text-foreground" : "text-muted-foreground")} onClick={() => setParams({ cstatus: status === s.key ? null : s.key })}>
                  {s.label}
                </button>
                <div className="h-4">
                  {n > 0 && <div className={cn("h-4 rounded-[3px]", s.bar)} style={{ width: `${(n / max) * 100}%`, minWidth: "0.75rem" }} />}
                </div>
                <span className="text-right text-xs tnum">{n}</span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Counterparty statements" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={type} onValueChange={(v) => setParams({ ctype: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All counterparties</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setParams({ cstatus: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-48">
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
          <Input value={q} onChange={(e) => setParams({ cq: e.target.value || null })} placeholder="Counterparty" className="h-8 w-48" />
          <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} statements</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counterparty</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Per our books</TableHead>
              <TableHead className="text-right">Per counterparty</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Replied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => {
              const conf = r.view.confirmation!;
              const pending = !!r.rec.reply && !r.view.work?.source;
              const theirs = r.view.sourceBalance ?? r.rec.reply?.balance ?? null;
              const diff = theirs === null ? null : r.rec.booksBalance - theirs;
              return (
                <TableRow key={r.rec.id} className="cursor-pointer" onClick={() => navigate(`/reconciliations/${r.rec.id}`)}>
                  <TableCell className="max-w-64 truncate py-2 text-sm">{r.rec.name}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs">{r.rec.type}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum">{fmtDrCr(r.rec.booksBalance, true)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum">{theirs === null ? <span className="text-muted-foreground">-</span> : fmtDrCr(theirs, true)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum">{diff === null ? "-" : diff === 0 ? "Nil" : fmtDrCr(diff, true)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs tnum">{conf.sentAt ? fmtDate(conf.sentAt.slice(0, 10)) : "-"}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs tnum">{conf.repliedAt ? fmtDate(conf.repliedAt.slice(0, 10)) : "-"}</TableCell>
                  <TableCell className="py-2">
                    <StatusChip status={conf.status} />
                  </TableCell>
                  <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {conf.status === "not-sent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={!can(role, "follow-up")}
                        onClick={() => {
                          const res = markConfirmationSent(r.rec.id);
                          if (res.ok) toast("Confirmation request recorded", { tone: "ok" });
                          else toast(res.error, { tone: "danger" });
                        }}
                      >
                        Send request
                      </Button>
                    )}
                    {pending && (
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={!can(role, "propose")}
                        onClick={() => {
                          const res = applyReply(r.rec.id);
                          if (!res.ok) return toast(res.error, { tone: "danger" });
                          toast(res.found > 0 ? `${res.found} item${res.found === 1 ? "" : "s"} explain the difference exactly` : "No exact explanation found", { tone: res.found > 0 ? "ok" : "warn" });
                        }}
                      >
                        Apply reply
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No statements match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
