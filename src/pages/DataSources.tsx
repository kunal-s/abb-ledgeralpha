import { useMemo, useState } from "react";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceFlow } from "@/components/data/SourceFlow";
import { MonthlyVolumeChart, type MonthlyVolume } from "@/components/data/MonthlyVolumeChart";
import { BALANCES, DATASETS, DOCUMENT_COUNT, GL_BY_ID, PARTY_BY_ID, PROJECT_BY_WBS, QUALITY, WORLD, balanceAt, openItems } from "@/data";
import { closingFromLines } from "@/data/balances";
import { usePeriodStore } from "@/lib/stores";
import { TENANT } from "@/config/tenant";
import { CATEGORY_LABELS } from "@/lib/labels";
import { fmtDate, fmtMonth, fmtTime, monthEndsBetween } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";
import { downloadCsv } from "@/lib/exportCsv";
import type { AccountCategory, LineItem } from "@/types";
import { cn } from "@/lib/utils";

const OPEN = openItems();

function monthlyVolume(): MonthlyVolume[] {
  const months = monthEndsBetween("2025-01-01", WORLD.asOf);
  const lines = new Map<string, number>();
  const docs = new Map<string, Set<string>>();
  for (const l of WORLD.lines) {
    const k = l.postingDate.slice(0, 7);
    lines.set(k, (lines.get(k) ?? 0) + 1);
    const set = docs.get(k) ?? new Set<string>();
    set.add(l.docNo);
    docs.set(k, set);
  }
  return months.map((m) => {
    const k = m.slice(0, 7);
    const label = fmtMonth(m);
    return { month: `${label.slice(0, 3)} ${label.slice(-2)}`, label, lines: lines.get(k) ?? 0, documents: docs.get(k)?.size ?? 0 };
  });
}
const VOLUME = monthlyVolume();

// ---------------------------------------------------------------------------
function DatasetsTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dataset</TableHead>
          <TableHead>Source system</TableHead>
          <TableHead>Format</TableHead>
          <TableHead className="text-right">Records</TableHead>
          <TableHead>Coverage</TableHead>
          <TableHead>Extracted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {DATASETS.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.name}</TableCell>
            <TableCell>{d.sourceSystem}</TableCell>
            <TableCell className="text-muted-foreground">{d.format}</TableCell>
            <TableCell className="text-right tnum">{fmtInt(d.records)}</TableCell>
            <TableCell className="tnum text-muted-foreground">
              {d.coverageFrom ? `${fmtDate(d.coverageFrom)} – ${fmtDate(d.coverageTo)}` : `As at ${fmtDate(d.coverageTo)}`}
            </TableCell>
            <TableCell className="tnum text-muted-foreground">
              {fmtDate(d.extractedAt.slice(0, 10))} {fmtTime(d.extractedAt.slice(11))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
function ControlTotals() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const [category, setCategory] = useState<AccountCategory | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const fromLines = closingFromLines(WORLD.lines, WORLD.glAccounts, periodEnd, TENANT.fiscalYear.startMonth);
    return WORLD.glAccounts.map((g) => {
      const tb = balanceAt(BALANCES, g.gl, periodEnd);
      const li = fromLines.get(g.gl)!;
      return {
        gl: g,
        debits: tb?.debits ?? 0,
        credits: tb?.credits ?? 0,
        lineItems: li.closing,
        trialBalance: tb?.closing ?? 0,
        difference: li.closing - (tb?.closing ?? 0),
      };
    });
  }, [periodEnd]);

  const visible = rows.filter(
    (r) =>
      (category === "all" || r.gl.category === category) &&
      (!query || r.gl.gl.includes(query) || r.gl.description.toLowerCase().includes(query.toLowerCase()))
  );
  const total = (k: "debits" | "credits" | "lineItems" | "trialBalance" | "difference") => visible.reduce((s, r) => s + r[k], 0);
  const categories = [...new Set(WORLD.glAccounts.map((g) => g.category))];

  const exportRows = () =>
    downloadCsv(
      `control-totals-${periodEnd}.csv`,
      ["GL", "Account", "Category", "Debits in period", "Credits in period", "Closing per line items", "Closing per trial balance", "Difference"],
      visible.map((r) => [r.gl.gl, r.gl.description, CATEGORY_LABELS[r.gl.category], r.debits, r.credits, r.lineItems, r.trialBalance, r.difference])
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as AccountCategory | "all")}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="GL or account" className="h-8 w-56" />
        <span className="text-xs text-muted-foreground">
          {fmtMonth(periodEnd)} · {visible.length} accounts
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportRows}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>GL</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Debits in period</TableHead>
            <TableHead className="text-right">Credits in period</TableHead>
            <TableHead className="text-right">Closing per line items</TableHead>
            <TableHead className="text-right">Closing per trial balance</TableHead>
            <TableHead className="text-right">Difference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.gl.gl}>
              <TableCell className="font-mono text-xs">{r.gl.gl}</TableCell>
              <TableCell>{r.gl.description}</TableCell>
              <TableCell className="text-muted-foreground">{CATEGORY_LABELS[r.gl.category]}</TableCell>
              <TableCell className="text-right tnum">{fmtINR(r.debits)}</TableCell>
              <TableCell className="text-right tnum">{fmtINR(-r.credits)}</TableCell>
              <TableCell className="text-right tnum">{fmtDrCr(r.lineItems)}</TableCell>
              <TableCell className="text-right tnum">{fmtDrCr(r.trialBalance)}</TableCell>
              <TableCell className={cn("text-right tnum", r.difference !== 0 && "font-semibold text-danger-foreground")}>{fmtINR(r.difference)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right tnum">{fmtINR(total("debits"))}</TableCell>
            <TableCell className="text-right tnum">{fmtINR(-total("credits"))}</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(total("lineItems"))}</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(total("trialBalance"))}</TableCell>
            <TableCell className="text-right tnum">{fmtINR(total("difference"))}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
const SAMPLE: LineItem = OPEN.find((l) => l.gl === "140100" && l.wbs && l.partner) ?? OPEN[0];

const FIELD_MAP: { field: string; sap: string; value: (l: LineItem) => string }[] = [
  { field: "Company code", sap: "RBUKRS", value: (l) => l.companyCode },
  { field: "GL account", sap: "RACCT", value: (l) => `${l.gl} · ${GL_BY_ID.get(l.gl)?.description ?? ""}` },
  { field: "Fiscal year", sap: "GJAHR", value: (l) => String(l.fiscalYear) },
  { field: "Document number", sap: "BELNR", value: (l) => l.docNo },
  { field: "Line item", sap: "DOCLN", value: (l) => String(l.lineItem) },
  { field: "Document type", sap: "BLART", value: (l) => l.docType },
  { field: "Posting key", sap: "BSCHL", value: (l) => l.postingKey },
  { field: "Posting date", sap: "BUDAT", value: (l) => fmtDate(l.postingDate) },
  { field: "Document date", sap: "BLDAT", value: (l) => fmtDate(l.documentDate) },
  { field: "Due date", sap: "ZFBDT + terms", value: (l) => (l.dueDate ? fmtDate(l.dueDate) : "—") },
  { field: "Entry date and time", sap: "CPUDT / CPUTM", value: (l) => `${fmtDate(l.entryDate)}${l.entryTime ? ` ${fmtTime(l.entryTime)}` : ""}` },
  { field: "Entered by", sap: "USNAM", value: (l) => l.enteredBy },
  { field: "Amount in company-code currency", sap: "HSL", value: (l) => fmtDrCr(l.amount) },
  { field: "Document currency and amount", sap: "RWCUR / WSL", value: (l) => `${l.docCurrency} ${fmtInt(Math.abs(l.amountDoc))}` },
  { field: "Assignment", sap: "ZUONR", value: (l) => l.assignment ?? "—" },
  { field: "Reference", sap: "XBLNR", value: (l) => l.reference ?? "—" },
  { field: "Item text", sap: "SGTXT", value: (l) => l.text ?? "—" },
  { field: "Profit centre", sap: "PRCTR", value: (l) => l.profitCentre },
  { field: "WBS element", sap: "PS_POSID", value: (l) => (l.wbs ? `${l.wbs} · ${PROJECT_BY_WBS.get(l.wbs)?.name ?? ""}` : "—") },
  { field: "Business partner", sap: "KUNNR / LIFNR", value: (l) => (l.partner ? `${l.partner.id} · ${PARTY_BY_ID.get(l.partner.id)?.name ?? ""}` : "—") },
  { field: "Purchase order", sap: "EBELN / EBELP", value: (l) => (l.po ? `${l.po.number} / ${l.po.item}` : "—") },
  { field: "Clearing document", sap: "AUGBL / AUGDT", value: (l) => (l.clearing ? `${l.clearing.docNo} · ${fmtDate(l.clearing.date)}` : "Open") },
  { field: "Source system", sap: "—", value: (l) => l.sourceSystem },
];

function FieldMapping() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>SAP field</TableHead>
          <TableHead>Example</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FIELD_MAP.map((f) => (
          <TableRow key={f.field}>
            <TableCell className="font-medium">{f.field}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{f.sap}</TableCell>
            <TableCell className="tnum">{f.value(SAMPLE)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
export function DataSources() {
  const passed = QUALITY.filter((q) => q.exceptions === 0).length;
  const allPassed = passed === QUALITY.length;
  const systems = new Set(DATASETS.map((d) => d.sourceSystem)).size;
  const openAccounts = new Set(OPEN.map((l) => l.gl)).size;
  const extractedDate = WORLD.extractedAt.slice(0, 10);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Sources"
        badge={<StatusChip status={allPassed ? "approved" : "rejected"} label={allPassed ? "All checks passed" : "Checks with exceptions"} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Line items" value={fmtInt(WORLD.lines.length)} sublabel={`${fmtInt(DOCUMENT_COUNT)} documents`} />
        <KpiTile label="Open items" value={fmtInt(OPEN.length)} sublabel={`on ${openAccounts} open-item accounts`} />
        <KpiTile label="Sources" value={systems} sublabel={`${DATASETS.length} datasets`} />
        <KpiTile label="Load checks" value={`${passed}/${QUALITY.length}`} sublabel="passed" accent={allPassed ? "ok" : "danger"} />
        <KpiTile label="Extracted" value={fmtDate(extractedDate)} sublabel={`${fmtTime(WORLD.extractedAt.slice(11))} · as at ${fmtDate(WORLD.asOf)}`} />
      </div>

      <Panel title="Data flow">
        <SourceFlow
          datasets={DATASETS}
          checks={QUALITY}
          ledger={[
            { label: "Documents", value: DOCUMENT_COUNT },
            { label: "Line items", value: WORLD.lines.length },
            { label: "Open items", value: OPEN.length },
            { label: "GL accounts", value: WORLD.glAccounts.length },
            { label: "Business partners", value: WORLD.parties.length },
            { label: "Projects", value: WORLD.projects.length },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Line items by posting month" className="lg:col-span-2">
          <MonthlyVolumeChart data={VOLUME} />
        </Panel>
        <Panel title="Load checks" bodyClassName="p-0">
          <ul className="divide-y divide-border/70">
            {QUALITY.map((q) => (
              <li key={q.id} className="flex items-start gap-2.5 px-4 py-2">
                {q.exceptions === 0 ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{q.name}</div>
                  <div className="tnum text-2xs text-muted-foreground">
                    {fmtInt(q.checked)} checked · {fmtInt(q.exceptions)} exceptions
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Tabs defaultValue="datasets">
        <TabsList>
          <TabsTrigger value="datasets">Datasets</TabsTrigger>
          <TabsTrigger value="control">Control totals</TabsTrigger>
          <TabsTrigger value="fields">Field mapping</TabsTrigger>
        </TabsList>
        <TabsContent value="datasets">
          <Panel title="Datasets" bodyClassName="p-0">
            <DatasetsTable />
          </Panel>
        </TabsContent>
        <TabsContent value="control">
          <Panel title="Control totals">
            <ControlTotals />
          </Panel>
        </TabsContent>
        <TabsContent value="fields">
          <Panel title="Field mapping" bodyClassName="p-0">
            <FieldMapping />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
