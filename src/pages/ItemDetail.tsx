import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { DecisionApproval, History, Section } from "@/components/review/drawerParts";
import { Decision, DocumentFields, Findings, FollowUp, Recommendation, Related } from "@/components/review/itemParts";
import { ItemTimeline } from "@/components/review/ItemTimeline";
import { ProcessRail } from "@/components/review/ProcessRail";
import { DATASETS, GL_BY_ID, PERSON_BY_ID, QUALITY, WORLD } from "@/data";
import { useReview, useItemRow } from "@/state/ReviewContext";
import type { ItemRow, Review } from "@/state/hooks";
import { inScope } from "@/engine/review";
import { rollforward, type Rollforward } from "@/engine/recDrill";
import { currentStage, itemStages, itemTimeline, type ItemStage, type StageId } from "@/engine/reviewStory";
import { buildProposal } from "@/engine/journals";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import { DOC_TYPE_LABELS } from "@/lib/labels";

const LIVE = new Set(["proposed", "approved", "exported", "closed-in-erp"]);
const firstName = (personId: string) => PERSON_BY_ID.get(personId)?.name ?? personId;

/** How the movements of a quarter read in a tile: the largest kinds with their counts. */
function movementLine(rows: Rollforward["additions"]): string {
  if (!rows.length) return "No postings";
  return rows.slice(0, 2).map((r) => `${r.label} ${fmtInt(r.count)}`).join(" · ");
}

function DataIn({ row }: { row: ItemRow }) {
  const it = row.item;
  const line = DATASETS.find((d) => d.sourceSystem === it.sourceSystem && (d.id === "acdoca" || d.id === "legacy-items"));
  const po = it.po ? DATASETS.find((d) => d.id === "po") : undefined;
  const partners = it.partner ? DATASETS.find((d) => d.id === "partners") : undefined;
  const clean = QUALITY.filter((q) => q.exceptions === 0).length;
  const rows: [string, React.ReactNode][] = [];
  if (line) rows.push(["Line item", `${line.name} · ${line.format} · ${line.sourceSystem}`]);
  if (po) rows.push(["Purchase order", `${po.name} · ${po.format} · ${po.sourceSystem}`]);
  if (partners) rows.push(["Business partner", `${partners.name} · ${partners.format} · ${partners.sourceSystem}`]);
  rows.push(["Extracted", fmtDateTime(WORLD.extractedAt)]);
  rows.push(["Load checks", <Link key="q" to="/data" className="text-primary hover:underline">{`${fmtInt(clean)} of ${fmtInt(QUALITY.length)} checks without exceptions`}</Link>]);
  return (
    <>
      <Section title="Sources">
        <Fields rows={rows} compact />
      </Section>
      <Section title="Document fields">
        <div className="-mx-4">
          <DocumentFields row={row} />
        </div>
      </Section>
    </>
  );
}

function Approval({ row, stage }: { row: ItemRow; stage: ItemStage }) {
  const d = row.decision && LIVE.has(row.decision.status) ? row.decision : undefined;
  if (!d) return <Section title="Maker and checker"><p className="text-sm text-muted-foreground">Nothing proposed yet · {stage.detail} · {stage.who}</p></Section>;
  return (
    <Section title="Maker and checker">
      <DecisionApproval d={d} />
    </Section>
  );
}

function Posting({ row, stage }: { row: ItemRow; stage: ItemStage }) {
  const d = row.decision && LIVE.has(row.decision.status) ? row.decision : undefined;
  const p = d ? buildProposal(d) : undefined;
  if (!d || !p) return <Section title="Entry"><p className="text-sm text-muted-foreground">{stage.detail}</p></Section>;
  return (
    <Section title={p.kind === "CLEARING" ? "Clearing instruction" : "Journal proposal"} aside={<StatusChip status={row.status} />}>
      <div className="mb-2 text-sm font-medium">{p.header}</div>
      {p.kind === "JV" && (
        <div className="-mx-4">
          <Fields compact rows={p.lines.map((l, i) => [`${l.side} ${l.gl || "to confirm"}`, <span key={i} className="flex justify-between gap-3"><span className="truncate">{l.glDescription}</span><span className="tnum">{fmtDrCr(l.side === "Dr" ? l.amount : -l.amount)}</span></span>])} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{stage.detail}</span>
        <Link to="/journals?tab=proposed" className="font-medium text-primary hover:underline">Open proposed journals</Link>
      </div>
    </Section>
  );
}

function AccountStage({ row, review }: { row: ItemRow; review: Review }) {
  const gl = GL_BY_ID.get(row.item.gl)!;
  const acct = review.accountByGl.get(gl.gl);
  const so = acct?.signOff;
  return (
    <Section title="Account sign-off" aside={acct ? <StatusChip status={acct.status} /> : undefined}>
      <div className="-mx-4">
        <Fields
          compact
          rows={[
            ["Account", <Link key="a" to={`/balance-sheet-review/${gl.gl}`} className="text-primary hover:underline">{`${gl.gl} · ${gl.description}`}</Link>],
            ["Preparer", so?.preparer ? `${firstName(so.preparer.personId)}, ${fmtDateTime(so.preparer.at)}` : `${firstName(gl.ownerId)}, not signed`],
            ["Reviewer", so?.reviewer ? `${firstName(so.reviewer.personId)}, ${fmtDateTime(so.reviewer.at)}` : `${firstName(gl.reviewerId)}, not signed`],
            ["Auditor schedule", <Link key="s" to={`/audit-readiness?tab=schedules&sched=${gl.gl}`} className="text-primary hover:underline">Open the schedule for {gl.gl}</Link>],
          ]}
        />
      </div>
    </Section>
  );
}

function StageWork({ id, row, stage, review }: { id: StageId; row: ItemRow; stage: ItemStage; review: Review }) {
  switch (id) {
    case "source":
      return <DataIn row={row} />;
    case "flagged":
      return row.hits.length ? (
        <>
          <Findings row={row} />
          <Recommendation row={row} />
        </>
      ) : (
        <Section title="Rule findings"><p className="text-sm text-muted-foreground">No rule applies: the item is within policy.</p></Section>
      );
    case "evidence":
      if (!row.followUp && (!row.flagged || (row.decision && LIVE.has(row.decision.status)))) {
        return <Section title="Follow-up"><p className="text-sm text-muted-foreground">{stage.detail}</p></Section>;
      }
      return <FollowUp key={`f-${row.key}-${row.followUp?.id ?? "none"}-${row.followUp?.status ?? ""}`} row={row} />;
    case "propose":
      return <Decision key={`d-${row.key}-${row.decision?.id ?? "none"}-${row.decision?.status ?? ""}`} row={row} />;
    case "approve":
      return <Approval row={row} stage={stage} />;
    case "post":
      return <Posting row={row} stage={stage} />;
    case "account":
      return <AccountStage row={row} review={review} />;
  }
}

export function ItemDetail() {
  const { key } = useParams();
  const review = useReview();
  const row = useItemRow(key);
  const gl = row ? GL_BY_ID.get(row.item.gl) : undefined;
  const acct = gl ? review.accountByGl.get(gl.gl) : undefined;

  const roll = useMemo(() => (gl ? rollforward(gl.gl, review.priorDate, review.asOf, (l) => inScope(l, review.businessUnitId)) : undefined), [gl, review.priorDate, review.asOf, review.businessUnitId]);
  const stages = useMemo(() => {
    if (!row) return [];
    const dataset = DATASETS.find((d) => d.sourceSystem === row.item.sourceSystem && (d.id === "acdoca" || d.id === "legacy-items"))?.name;
    return itemStages({ row, accountStatus: acct?.status, signOff: acct?.signOff, extractedAt: WORLD.extractedAt, dataset });
  }, [row, acct]);
  const current = stages.length ? currentStage(stages) : undefined;
  const [chosen, setChosen] = useState<StageId>();
  // when the work moves on, follow it
  useEffect(() => setChosen(undefined), [current?.id, current?.state]);

  if (!row || !gl || !roll || !current) {
    return (
      <div className="space-y-4">
        <PageHeader title="Item not found" breadcrumbs={[{ label: "Balance Sheet Review", to: "/balance-sheet-review" }, { label: key ?? "" }]} />
        <Card className="p-5 text-sm">
          <Link to="/balance-sheet-review?tab=exceptions" className="font-medium text-primary hover:underline">Go to the exceptions</Link>
        </Card>
      </div>
    );
  }

  const it = row.item;
  const selected = stages.find((s) => s.id === (chosen ?? current.id)) ?? current;
  const share = roll.closing !== 0 ? Math.abs(it.amount / roll.closing) : 0;
  const broughtForward = it.postingDate <= review.priorDate;
  const owner = PERSON_BY_ID.get(gl.ownerId)?.name ?? gl.ownerId;
  const reviewer = PERSON_BY_ID.get(gl.reviewerId)?.name ?? gl.reviewerId;
  const waiting = stages.find((s) => s.state === "current");

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${DOC_TYPE_LABELS[it.docType] ?? it.docType} ${it.docNo}`}
        breadcrumbs={[{ label: "Balance Sheet Review", to: "/balance-sheet-review" }, { label: "Accounts", to: "/balance-sheet-review?tab=accounts" }, { label: gl.gl, to: `/balance-sheet-review/${gl.gl}` }, { label: it.docNo }]}
        badge={<StatusChip status={row.status} />}
        actions={
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link to={`/balance-sheet-review/${gl.gl}`}>Account {gl.gl}</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label={`Opening ${fmtDate(review.priorDate)}`} hint="The account's balance at the start of the review period" value={fmtDrCr(roll.opening, true)} sublabel={gl.description} />
        <KpiTile label="Additions" hint="Postings that moved the balance away from nil" value={`+${fmtINRCompact(Math.abs(roll.added))}`} sublabel={movementLine(roll.additions)} />
        <KpiTile label="Reductions" hint="Postings that moved the balance towards nil" value={`−${fmtINRCompact(Math.abs(roll.reduced))}`} sublabel={movementLine(roll.reductions)} />
        <KpiTile label={`Closing ${fmtDate(review.asOf)}`} hint="Opening plus additions less reductions; ties to the trial balance" value={fmtDrCr(roll.closing, true)} sublabel={`${owner} · reviewer ${reviewer}`} />
        <KpiTile
          label="This item"
          hint="The item's share of the closing balance, and whether it was already in the opening balance"
          value={fmtDrCr(it.amount, true)}
          sublabel={`${fmtInt(row.age)} days · ${(share * 100).toFixed(1)}% of closing · ${broughtForward ? "brought forward" : "added in the period"}`}
          accent={row.flagged ? "danger" : "none"}
        />
      </div>

      <Panel title="Process" actions={waiting ? <span className="text-xs text-muted-foreground">Waiting on <span className="font-medium text-foreground">{waiting.who}</span></span> : <StatusChip status={row.status} />} bodyClassName="px-2 py-2">
        <ProcessRail stages={stages} selected={selected.id} onSelect={setChosen} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <Panel title={`${selected.label} · ${selected.who || selected.detail}`} bodyClassName="p-0 [&>section:first-child]:border-t-0">
          <StageWork id={selected.id} row={row} stage={selected} review={review} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Item" bodyClassName="p-0 [&>section:first-child]:border-t-0">
            <Related row={row} />
          </Panel>
          <Panel title="Audit trail" bodyClassName="p-0 [&>section:first-child]:border-t-0">
            <History itemKey={row.key} />
            <Section title="Document dates">
              <ItemTimeline events={itemTimeline(row, review.asOf)} />
            </Section>
          </Panel>
        </div>
      </div>
    </div>
  );
}
