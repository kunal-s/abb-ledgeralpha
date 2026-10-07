import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PBC_REQUESTS, PBC_AUDITOR_ID } from "@/data/workspace/pbc";
import { PERSON_BY_ID, WORLD } from "@/data";
import { usePbc } from "@/state/auditHooks";
import { useItemHistory } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { useQueryParams } from "@/lib/useQueryParams";
import type { PbcState } from "@/engine/audit";
import { downloadCsv } from "@/lib/exportCsv";
import { addDays, fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));
const STATUS_FILTERS = [
  { key: "open", label: "Open" },
  { key: "in-preparation", label: "In preparation" },
  { key: "provided", label: "Provided" },
  { key: "closed", label: "Closed" },
  { key: "overdue", label: "Overdue" },
  { key: "soon", label: "Due in 7 days" },
  { key: "blocked", label: "Waiting on review work" },
];
const FINANCE_TEAM = WORLD.people.filter((p) => p.roleId !== "external-auditor");

function workLink(s: PbcState): { to: string; label: string } | undefined {
  const link = s.req.link;
  if (!link) return undefined;
  if (link.kind === "accounts") return { to: "/balance-sheet-review?tab=accounts", label: "Open the accounts" };
  if (link.kind === "recs") return { to: `/reconciliations?tab=register${link.types.length === 1 ? `&type=${encodeURIComponent(link.types[0])}` : ""}`, label: "Open the reconciliations" };
  return { to: "/journals?tab=review", label: "Open the flagged journals" };
}

function RequestBody({ s }: { s: PbcState }) {
  const role = useRoleStore((r) => r.role);
  const { startRequest, provideRequest, closeRequest, reopenRequest, assignRequest } = useWorkflow.getState();
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const history = useItemHistory(s.req.id);
  const link = workLink(s);
  const live = s.status === "open" || s.status === "in-preparation";
  const mayProvide = can(role, "pbc-provide");
  const mayManage = can(role, "pbc-manage");
  const pct = s.progress && s.progress.total > 0 ? Math.round((s.progress.done / s.progress.total) * 100) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="text-base font-semibold">{s.req.title}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{s.req.id}</span> · {s.req.area}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusChip status={s.status} />
          {s.overdue && <StatusChip status="overdue" />}
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">Due {fmtDate(s.req.due)}</span>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        <Fields
          compact
          rows={[
            ["Asked by", `${PERSON_BY_ID.get(PBC_AUDITOR_ID)?.name}, ${fmtDate(s.req.requestedOn)}`],
            ["Owner", PERSON_BY_ID.get(s.ownerId)?.name ?? s.ownerId],
            ...(s.evidence ? ([["Provided", s.evidence]] as [string, string][]) : []),
            ...(s.note ? ([["Note", s.note]] as [string, string][]) : []),
          ]}
        />

        {s.progress && (
          <div className="rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{s.progress.label}</span>
              {link && (
                <Link to={link.to} className="text-xs font-medium text-primary hover:underline">
                  {link.label}
                </Link>
              )}
            </div>
            {pct !== undefined && <Progress value={pct} className="mt-2" indicatorClassName={pct === 100 ? "bg-ok" : "bg-info"} />}
          </div>
        )}

        {live && (
          <div className="space-y-2">
            {s.status === "open" && (
              <Button size="sm" variant="outline" disabled={!mayProvide} title={mayProvide ? undefined : `${ROLES[role].label} cannot prepare auditor requests`} onClick={() => run(startRequest(s.req.id), "Request started")}>
                Start preparing
              </Button>
            )}
            <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="What was provided and where it is filed" className="min-h-[3.5rem]" />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the auditor (optional)" className="h-8" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-muted-foreground">{s.blocker ? `Blocked: ${s.blocker}` : "Provided means the file or schedule has gone to the auditor"}</span>
              <Button
                size="sm"
                disabled={!mayProvide || !!s.blocker}
                title={!mayProvide ? `${ROLES[role].label} cannot provide auditor requests` : s.blocker ? "Finish the review work first" : undefined}
                onClick={() => {
                  const r = provideRequest(s.req.id, evidence, note, s.progress);
                  run(r, "Request marked as provided");
                  if (r.ok) {
                    setEvidence("");
                    setNote("");
                  }
                }}
              >
                Mark as provided
              </Button>
            </div>
          </div>
        )}

        {s.status === "provided" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">Close the request once the auditor has what it needs</span>
            <Button size="sm" disabled={!mayManage} title={mayManage ? undefined : `${ROLES[role].label} cannot close auditor requests`} onClick={() => run(closeRequest(s.req.id), "Request closed")}>
              Close request
            </Button>
          </div>
        )}

        {(s.status === "provided" || s.status === "closed") && mayManage && (
          <div className="flex items-center gap-2 border-t border-border/70 pt-3">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to reopen" className="h-8" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const r = reopenRequest(s.req.id, reason);
                run(r, "Request reopened");
                if (r.ok) setReason("");
              }}
            >
              Reopen
            </Button>
          </div>
        )}

        {mayManage && s.status !== "closed" && (
          <div className="flex items-center gap-2 border-t border-border/70 pt-3">
            <span className="text-xs text-muted-foreground">Owner</span>
            <Select value={s.ownerId} onValueChange={(v) => run(assignRequest(s.req.id, v), "Request reassigned")}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINANCE_TEAM.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
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
          </div>
        )}
      </div>
    </div>
  );
}

function RaiseDialog({ areas, open, onOpenChange }: { areas: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setParams] = useQueryParams();
  const { states, today } = usePbc();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(areas[0]);
  const [due, setDue] = useState(addDays(today, 7));
  const [ownerId, setOwnerId] = useState("");
  // the owner the area's earlier requests went to, until a person is chosen
  const owner = ownerId || states.find((s) => s.req.area === area)?.ownerId || FINANCE_TEAM[0].id;

  const submit = () => {
    const r = useWorkflow.getState().raiseRequest({ title, area, due, ownerId: owner });
    run(r, "Request raised");
    if (r.ok) {
      setTitle("");
      setOwnerId("");
      onOpenChange(false);
      setParams({ req: r.id });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What the auditor asks for" className="min-h-[3.5rem]" />
          <div className="grid grid-cols-2 gap-3">
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          </div>
          <Select value={owner} onValueChange={setOwnerId}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCE_TEAM.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Raise request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestsTab() {
  const { states, today } = usePbc();
  const role = useRoleStore((r) => r.role);
  const [raising, setRaising] = useState(false);
  const [params, setParams] = useQueryParams();
  const area = params.get("parea") ?? "all";
  const status = params.get("pstatus") ?? "all";
  const owner = params.get("powner") ?? "all";
  const q = params.get("pq") ?? "";
  const selected = params.get("req");

  const areas = useMemo(() => [...new Set(PBC_REQUESTS.map((r) => r.area))], []);
  const mayRaise = can(role, "pbc-raise");
  const owners = useMemo(() => [...new Set(states.map((s) => s.ownerId))].map((id) => PERSON_BY_ID.get(id)!).filter(Boolean), [states]);
  const shown = useMemo(
    () =>
      states.filter(
        (s) =>
          (area === "all" || s.req.area === area) &&
          (status === "all" ||
            (status === "overdue" ? s.overdue : status === "blocked" ? !!s.blocker : status === "soon" ? (s.status === "open" || s.status === "in-preparation") && !s.overdue && s.req.due <= addDays(today, 7) : s.status === status)) &&
          (owner === "all" || s.ownerId === owner) &&
          (!q || s.req.title.toLowerCase().includes(q.toLowerCase()) || s.req.id.toLowerCase().includes(q.toLowerCase()))
      ),
    [states, area, status, owner, q, today]
  );
  const open = states.find((s) => s.req.id === selected);

  return (
    <>
      <Panel title="Auditor requests" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={area} onValueChange={(v) => setParams({ parea: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setParams({ pstatus: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => setParams({ powner: v === "all" ? null : v })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={q} onChange={(e) => setParams({ pq: e.target.value || null })} placeholder="Request or number" className="h-8 w-44" />
          <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} requests</span>
          <div className="flex-1" />
          <Button size="sm" className="h-8" disabled={!mayRaise} title={mayRaise ? undefined : `${ROLES[role].label} cannot raise auditor requests`} onClick={() => setRaising(true)}>
            Raise request
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() =>
              downloadCsv(
                "auditor-requests.csv",
                ["Request", "Title", "Area", "Requested", "Due", "Owner", "Progress", "Status", "Evidence"],
                shown.map((s) => [s.req.id, s.req.title, s.req.area, fmtDate(s.req.requestedOn), fmtDate(s.req.due), PERSON_BY_ID.get(s.ownerId)?.name ?? "", s.progress?.label ?? "", s.overdue ? "Overdue" : s.status, s.evidence ?? ""])
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Review work</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => (
              <TableRow key={s.req.id} className="cursor-pointer" data-state={s.req.id === selected ? "selected" : undefined} onClick={() => setParams({ req: s.req.id })}>
                <TableCell className="max-w-96 py-2">
                  <div className="truncate text-sm">{s.req.title}</div>
                  <div className="text-2xs text-muted-foreground">
                    <span className="font-mono">{s.req.id}</span> · {s.req.area}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-sm">{PERSON_BY_ID.get(s.ownerId)?.name}</TableCell>
                <TableCell className={cn("whitespace-nowrap py-2 text-xs tnum", s.overdue && "text-danger-foreground")}>{fmtDate(s.req.due)}</TableCell>
                <TableCell className="py-2">
                  {s.progress ? (
                    <div className="w-44">
                      <div className="truncate text-xs">{s.progress.label}</div>
                      <Progress value={s.progress.total ? (s.progress.done / s.progress.total) * 100 : 0} className="mt-1 h-1" indicatorClassName={s.progress.done >= s.progress.total ? "bg-ok" : "bg-info"} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Prepared outside the platform</span>
                  )}
                </TableCell>
                <TableCell className="py-2">{s.overdue ? <StatusChip status="overdue" /> : <StatusChip status={s.status} />}</TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No requests match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
      <RaiseDialog key={raising ? "open" : "closed"} areas={areas} open={raising} onOpenChange={setRaising} />
      <Sheet open={!!open} onOpenChange={(o) => !o && setParams({ req: null })}>
        <SheetContent>{open && <RequestBody key={open.req.id} s={open} />}</SheetContent>
      </Sheet>
    </>
  );
}
