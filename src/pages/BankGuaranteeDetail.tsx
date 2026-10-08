import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PARTY_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { bgItemKey, lifecycle, statusOf, watchOf } from "@/engine/bg";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const asOf = WORLD.asOf;

export function BankGuaranteeDetail() {
  const { id } = useParams();
  const bg = WORLD.bankGuarantees.find((b) => b.bgNo === id);
  const work = useWorkflow((s) => (id ? s.bgWork[id] : undefined));
  const followUps = useWorkflow((s) => s.followUps);
  const role = useRoleStore((s) => s.role);
  const { requestBgAction, recordOriginalReturned } = useWorkflow.getState();
  const [kind, setKind] = useState<"extension" | "release">("extension");
  const [message, setMessage] = useState("");
  const [due, setDue] = useState(addDays(asOf, 14));

  if (!bg) {
    return (
      <div className="space-y-4">
        <PageHeader title="Guarantee not found" breadcrumbs={[{ label: "Bank Guarantees", to: "/bank-guarantees" }, { label: id ?? "" }]} />
        <Card className="p-5 text-sm"><Link to="/bank-guarantees" className="font-medium text-primary hover:underline">Go to the register</Link></Card>
      </div>
    );
  }

  const status = statusOf(bg, work);
  const w = watchOf(bg, asOf, work);
  const steps = lifecycle(bg, asOf, work);
  const party = PARTY_BY_ID.get(bg.partyId);
  const project = bg.linkedWbs ? PROJECT_BY_WBS.get(bg.linkedWbs) : undefined;
  const mine = Object.values(followUps).filter((f) => f.itemKey === bgItemKey(bg.bgNo)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canAct = can(role, "follow-up");
  const commission = (bg.amount * (S.bankLimits[bg.bank]?.commissionPct ?? 0)) / 100;
  const defaultMessage = kind === "extension"
    ? `Please extend ${bg.bgNo} (${fmtINR(bg.amount)}, valid to ${fmtDate(bg.validTo)}) for ${project ? project.name : party?.name ?? "the contract"}.`
    : `Please release ${bg.bgNo} (${fmtINR(bg.amount)}) and return the original; ${bg.type.toLowerCase()} obligations are complete.`;

  const send = () => {
    const r = requestBgAction(bg.bgNo, kind, message.trim() || defaultMessage, due);
    if (r.ok) {
      toast(kind === "extension" ? "Extension requested" : "Release requested", { tone: "ok" });
      setMessage("");
    } else toast(r.error, { tone: "danger" });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={bg.bgNo}
        breadcrumbs={[{ label: "Bank Guarantees", to: "/bank-guarantees" }, { label: bg.type }]}
        badge={<StatusChip status={status === "Active" ? "approved" : status === "Released" ? "not-started" : status === "In claim period" ? "in-review" : "rejected"} label={status === "Expired - original awaited" ? "Original awaited" : status} />}
        actions={
          status === "Expired - original awaited" ? (
            <Button size="sm" disabled={!canAct} title={canAct ? undefined : `${ROLES[role].label} cannot record this`} onClick={() => { const r = recordOriginalReturned(bg.bgNo); toast(r.ok ? "Original recorded as returned; the guarantee is released" : r.error, { tone: r.ok ? "ok" : "danger" }); }}>
              Record original returned
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Amount" value={fmtINRCompact(bg.amount)} sublabel={fmtINR(bg.amount)} />
        <KpiTile label="Valid to" value={fmtDate(bg.validTo)} sublabel={status === "Active" ? `${w.days} days left` : "no longer valid"} accent={w.flag === "red" ? "danger" : w.flag === "amber" ? "warn" : "none"} />
        <KpiTile label="Claim period to" value={bg.claimExpiry ? fmtDate(bg.claimExpiry) : "None"} sublabel={bg.claimExpiry ? (bg.claimExpiry >= asOf ? `${daysBetween(asOf, bg.claimExpiry)} days left` : "ended") : "claims end with validity"} />
        <KpiTile label="Acceptance" value={bg.acceptance ?? "Not applicable"} sublabel={bg.direction === "Issued" ? "by the customer" : "received from the vendor"} accent={bg.acceptance === "Pending" ? "warn" : "none"} />
        <KpiTile label="Commission" value={bg.direction === "Issued" ? fmtINRCompact(commission) : "-"} sublabel={bg.direction === "Issued" ? `a year at ${S.bankLimits[bg.bank]?.commissionPct}%` : "paid by the vendor"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Life of the guarantee" className="xl:col-span-2">
          <ol className="flex items-start">
            {steps.map((s, i) => (
              <li key={s.label} className="relative min-w-0 flex-1">
                {i > 0 && <span className={cn("absolute right-1/2 top-2.5 h-px w-full", steps[i - 1].state === "done" ? "bg-primary" : "bg-border")} />}
                <span className={cn("relative z-10 mx-auto flex h-5 w-5 items-center justify-center rounded-full border", s.state === "done" ? "border-primary bg-primary text-primary-foreground" : s.state === "current" ? "border-primary bg-card" : "border-border bg-card")}>
                  {s.state === "done" ? <Check className="h-3 w-3" /> : s.state === "current" ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </span>
                <div className="mt-1.5 text-center">
                  <div className={cn("text-xs font-medium", s.state === "pending" && "text-muted-foreground")}>{s.label}</div>
                  <div className="text-2xs text-muted-foreground tnum">{s.date ? fmtDate(s.date) : ""}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Ask the bank</span>
              <div className="flex rounded-md border border-border p-0.5 text-xs">
                {(["extension", "release"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded px-2 py-0.5", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{k === "extension" ? "Extension" : "Release"}</button>
                ))}
              </div>
            </div>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={defaultMessage} className="min-h-[72px] text-sm" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">Reply by <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" /></label>
              <Button size="sm" disabled={!canAct} onClick={send} title={canAct ? undefined : `${ROLES[role].label} cannot raise follow-ups`}>Request {kind}</Button>
            </div>
            <div className="mt-2 text-2xs text-muted-foreground tnum">
              {work?.extensionRequestedAt && <span className="mr-3">Extension requested {fmtDate(work.extensionRequestedAt.slice(0, 10))}</span>}
              {work?.releaseRequestedAt && <span>Release requested {fmtDate(work.releaseRequestedAt.slice(0, 10))}</span>}
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Terms" bodyClassName="p-0">
            <Fields
              compact
              rows={[
                ["Direction", bg.direction === "Issued" ? "Issued to a customer" : "Received from a vendor"],
                ["Type", bg.type],
                [bg.direction === "Issued" ? "Customer" : "Vendor", party?.name ?? bg.partyId],
                ["Bank", bg.bank],
                ["Issued", fmtDate(bg.issueDate)],
                ...(bg.linkedPo ? ([["Purchase order", bg.linkedPo]] as [string, string][]) : []),
                ...(project ? ([["Project", `${project.wbs}, ${project.name}`]] as [string, string][]) : []),
              ]}
            />
          </Panel>
          {bg.direction === "Received" && bg.linkedPo && (
            <Panel title="Cover for vendor advances" bodyClassName="p-4">
              <Link to={`/balance-sheet-review?tab=exceptions&category=vendor-adv&show=all&q=${bg.linkedPo}`} className="text-sm font-medium text-primary hover:underline">
                Advances on purchase order {bg.linkedPo}
              </Link>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Follow-ups on this guarantee" bodyClassName="p-0">
        {mine.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing has been asked of the bank</div>
        ) : (
          <ul className="divide-y divide-border">
            {mine.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm">{f.message}</div>
                  <div className="text-2xs text-muted-foreground tnum">{f.owner}, due {fmtDate(f.dueDate)}</div>
                </div>
                <StatusChip status={f.status === "open" ? "in-review" : f.status === "responded" ? "approved" : "not-started"} label={f.status === "open" ? "Open" : f.status === "responded" ? "Answered" : "Closed"} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
