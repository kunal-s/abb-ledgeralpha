import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KpiTile, PageHeader, Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { PERSON_BY_ID, WORLD } from "@/data";
import { useWork } from "@/state/workHooks";
import { useItemDrawer } from "@/state/drawer";
import { personForRole, useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { MODULES } from "@/lib/modules";
import { useQueryParams } from "@/lib/useQueryParams";
import { WORK_KINDS, WORK_KIND_LABEL, dueBucket, urgency, valueText, type DueBucket, type WorkItem, type WorkKind } from "@/state/workModel";
import { fmtDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;
const FINANCE_TEAM = WORLD.people.filter((p) => p.roleId !== "external-auditor");

const GROUPS: BarGroup[] = [
  { key: "overdue", label: "Overdue", cls: "bg-danger" },
  { key: "week", label: "Due this week", cls: "bg-warn" },
  { key: "later", label: "Due later", cls: "bg-info" },
  { key: "none", label: "No due date", cls: "bg-muted-foreground/25" },
];

const DUE_FILTERS = [
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Due this week" },
  { key: "later", label: "Due later" },
  { key: "none", label: "No due date" },
];

export function MyWork() {
  const { items, today } = useWork();
  const role = useRoleStore((s) => s.role);
  const person = personForRole(role);
  const navigate = useNavigate();
  const openItem = useItemDrawer((s) => s.open);
  const [params, setParams] = useQueryParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<WorkItem>();
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const wf = useWorkflow.getState();

  const type = params.get("wtype") ?? "all";
  const module = params.get("wmodule") ?? "all";
  const due = params.get("wdue") ?? "all";
  const owner = params.get("wowner") ?? "all";
  const q = params.get("wq") ?? "";

  const modules = useMemo(() => [...new Set(items.map((i) => i.module))].sort(), [items]);
  const owners = useMemo(() => [...new Set(items.map((i) => i.ownerId).filter((x): x is string => !!x))].map((id) => PERSON_BY_ID.get(id)!).filter(Boolean), [items]);
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (type === "all" || i.kind === type) &&
          (module === "all" || i.module === module) &&
          (due === "all" || dueBucket(i, today) === due) &&
          (owner === "all" || i.ownerId === owner) &&
          (!q || i.title.toLowerCase().includes(q.toLowerCase()) || i.detail.toLowerCase().includes(q.toLowerCase()))
      ),
    [items, type, module, due, owner, q, today]
  );

  const stats = useMemo(() => {
    const count = (kinds: WorkKind[]) => items.filter((i) => kinds.includes(i.kind)).length;
    return {
      overdue: items.filter((i) => i.overdue).length,
      approvals: count(["approval", "tax-review"]),
      signOffs: count(["sign-off"]),
      matches: count(["match"]),
      followUps: count(["follow-up"]),
    };
  }, [items]);

  const chart = useMemo(() => {
    const data: Record<string, Record<string, number>> = {};
    for (const i of items) {
      const row = (data[i.kind] ??= {});
      const b: DueBucket = dueBucket(i, today);
      row[b] = (row[b] ?? 0) + 1;
    }
    return data;
  }, [items, today]);
  const chartRows = WORK_KINDS.filter((k) => chart[k.kind]).map((k) => ({ key: k.kind, label: k.label }));
  const next = useMemo(() => [...items].sort(urgency).slice(0, 7), [items]);

  const chosen = shown.filter((i) => selected.has(i.id));
  const clearSelection = () => setSelected(new Set());
  const result = (r: { ok: boolean; error?: string }, ok: string) => toast(r.ok ? ok : r.error ?? "Not allowed", { tone: r.ok ? "ok" : "danger" });

  const open = (i: WorkItem) => {
    if (i.itemKey) openItem(i.itemKey);
    else if (i.link) navigate(i.link);
  };

  const approveSelected = () => {
    const ids = chosen.filter((i) => i.kind === "approval").map((i) => i.decisionId!);
    const r = wf.approveDecisions(ids);
    if (r.ok) {
      toast(`${r.approved} approved`, { description: r.skipped ? `${r.skipped} not waiting for ${ROLES[role].label}` : undefined, tone: "ok" });
      clearSelection();
    } else toast(r.error, { tone: "danger" });
  };
  const confirmSelected = () => {
    const r = wf.confirmMatches(chosen.filter((i) => i.kind === "match").map((i) => i.receiptKey!));
    if (r.ok) {
      toast(`${r.created} matches confirmed`, { description: r.skipped ? `${r.skipped} below the confidence needed` : undefined, tone: "ok" });
      clearSelection();
    } else toast(r.error, { tone: "danger" });
  };
  const reassignSelected = () => {
    let done = 0;
    let last = "";
    for (const i of chosen) {
      const r = i.closeTaskId ? wf.reassignCloseTask(i.closeTaskId, assignee) : i.requestId ? wf.assignRequest(i.requestId, assignee) : undefined;
      if (r?.ok) done += 1;
      else if (r && !r.ok) last = r.error;
    }
    if (done) {
      toast(`${done} reassigned to ${PERSON_BY_ID.get(assignee)?.name}`, { tone: "ok" });
      clearSelection();
    } else toast(last || "Choose tasks or requests to reassign", { tone: "danger" });
  };

  const nApprove = chosen.filter((i) => i.kind === "approval").length;
  const nMatch = chosen.filter((i) => i.kind === "match").length;
  const nReassign = chosen.filter((i) => i.closeTaskId || i.requestId).length;

  const action = (i: WorkItem) => {
    switch (i.kind) {
      case "approval":
        return (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" className="h-7" onClick={() => result(wf.approveDecision(i.decisionId!), "Approved")}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setRejecting(i)}>
              Reject
            </Button>
          </div>
        );
      case "tax-review":
        return (
          <Button size="sm" className="h-7" onClick={() => result(wf.taxReview(i.decisionId!, "cleared"), "Tax review cleared")}>
            Clear
          </Button>
        );
      case "sign-off":
        return (
          <Button size="sm" className="h-7" onClick={() => result(wf.signOff(i.signOff!.ref, WORLD.asOf, i.signOff!.as), "Signed off")}>
            Sign off
          </Button>
        );
      case "match":
        return (
          <Button size="sm" className="h-7" onClick={() => result(wf.confirmMatch(i.receiptKey!), "Application proposed")}>
            Confirm
          </Button>
        );
      case "follow-up":
        return i.detail.startsWith("Answered") ? (
          <Button size="sm" variant="outline" className="h-7" onClick={() => result(wf.closeFollowUp(i.followUpId!), "Follow-up closed")}>
            Close
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => open(i)}>
            Open
          </Button>
        );
      default:
        return (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => open(i)}>
            Open
          </Button>
        );
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="My Work" badge={<span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{ROLES[role].label}, {person.name}</span>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="In the queue" value={fmtInt(items.length)} sublabel={`${modules.length} ${modules.length === 1 ? "module" : "modules"}`} accent="info" onClick={() => setParams({ wtype: null, wdue: null })} />
        <KpiTile label="Overdue" value={fmtInt(stats.overdue)} sublabel="past the date" accent={stats.overdue ? "danger" : "ok"} onClick={() => setParams({ wdue: "overdue", wtype: null })} />
        <KpiTile label="Approvals" value={fmtInt(stats.approvals)} sublabel="waiting for this role" accent={stats.approvals ? "warn" : "none"} onClick={() => setParams({ wtype: "approval", wdue: null })} />
        <KpiTile label="Sign-offs" value={fmtInt(stats.signOffs)} sublabel="ready to sign" accent={stats.signOffs ? "warn" : "none"} onClick={() => setParams({ wtype: "sign-off", wdue: null })} />
        <KpiTile label="Matches to confirm" value={fmtInt(stats.matches)} sublabel="proposed by the matcher" onClick={() => setParams({ wtype: "match", wdue: null })} />
        <KpiTile label="Follow-ups" value={fmtInt(stats.followUps)} sublabel="open or to close" onClick={() => setParams({ wtype: "follow-up", wdue: null })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Queue by type and due date" className="xl:col-span-2">
          {chartRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nothing is waiting for {ROLES[role].label}</div>
          ) : (
            <StatusBars data={chart} rows={chartRows} groups={GROUPS} unit="items" labelWidth="12rem" onSelect={(kind, bucket) => setParams({ wtype: kind, wdue: bucket })} />
          )}
        </Panel>
        <Panel title="Next up" bodyClassName="p-0">
          {next.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing is waiting</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {next.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => open(i)} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
                    <div className="truncate text-sm">{i.title}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{WORK_KIND_LABEL[i.kind]}{i.due ? ` · due ${fmtDate(i.due)}` : ""}</span>
                      {i.overdue && <span className="shrink-0 text-danger-foreground">Overdue</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Queue" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={type} onValueChange={(v) => setParams({ wtype: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {WORK_KINDS.map((k) => (
                <SelectItem key={k.kind} value={k.kind}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={module} onValueChange={(v) => setParams({ wmodule: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {moduleLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={due} onValueChange={(v) => setParams({ wdue: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due date</SelectItem>
              {DUE_FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => setParams({ wowner: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">With anyone</SelectItem>
              {owners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={q} onChange={(e) => setParams({ wq: e.target.value || null })} placeholder="Search the queue" className="h-8 w-44" />
          <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} items</span>
          <div className="flex-1" />
          {chosen.length > 0 && (
            <>
              {nApprove > 0 && (
                <Button size="sm" className="h-8" onClick={approveSelected}>
                  Approve {nApprove}
                </Button>
              )}
              {nMatch > 0 && (
                <Button size="sm" className="h-8" onClick={confirmSelected}>
                  Confirm {nMatch} {nMatch === 1 ? "match" : "matches"}
                </Button>
              )}
              {nReassign > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue placeholder="Reassign to" />
                    </SelectTrigger>
                    <SelectContent>
                      {FINANCE_TEAM.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8" disabled={!assignee || !(can(role, "close-manage") || can(role, "pbc-manage"))} onClick={reassignSelected}>
                    Reassign {nReassign}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                <input type="checkbox" aria-label="Select all items shown" checked={shown.length > 0 && shown.every((i) => selected.has(i.id))} onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())} />
              </TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>With</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.slice(0, 200).map((i) => (
              <TableRow key={i.id} className="cursor-pointer" data-state={selected.has(i.id) ? "selected" : undefined} onClick={() => open(i)}>
                <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${i.title}`}
                    checked={selected.has(i.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(i.id)) n.delete(i.id);
                        else n.add(i.id);
                        return n;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="max-w-96 py-2">
                  <div className="truncate text-sm">{i.title}</div>
                  <div className="truncate text-2xs text-muted-foreground">{i.detail}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2">
                  <div className="text-xs">{WORK_KIND_LABEL[i.kind]}</div>
                  <div className="text-2xs text-muted-foreground">{moduleLabel(i.module)}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-sm">{PERSON_BY_ID.get(i.ownerId ?? "")?.name ?? "-"}</TableCell>
                <TableCell className={cn("whitespace-nowrap py-2 text-xs tnum", i.overdue && "text-danger-foreground")}>{i.due ? fmtDate(i.due) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right text-sm tnum">{valueText(i)}</TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  {action(i)}
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {items.length === 0 ? `Nothing is waiting for ${ROLES[role].label}` : "No items match"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {shown.length > 200 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the first 200 of {fmtInt(shown.length)} items</div>}
      </Panel>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.title}</DialogTitle>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, which goes back to the preparer" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(undefined)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = wf.rejectDecision(rejecting!.decisionId!, reason);
                result(r, "Rejected");
                if (r.ok) {
                  setRejecting(undefined);
                  setReason("");
                }
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
