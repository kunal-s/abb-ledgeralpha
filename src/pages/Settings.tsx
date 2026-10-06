import type { ReactNode } from "react";
import { PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TENANT } from "@/config/tenant";
import { LOCALISATION } from "@/config/localisation";
import { AGEING_POLICY, APPROVAL_BANDS, APPROVER_LABELS, MATERIALITY_POLICY, TAX_REVIEW_POLICY, WRITE_BACK_POLICY } from "@/config/policies";
import { ROLES } from "@/config/roles";
import { MODULES, NAV_GROUPS, isModuleEnabled } from "@/lib/modules";
import { WORLD } from "@/data";
import { MONTH_NAMES } from "@/lib/labels";
import { fiscalQuarterLabel, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINR, fmtINRCompact } from "@/lib/format";

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border/70">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-1 px-4 py-2.5 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {i}
        </span>
      ))}
    </div>
  );
}

function Workspace() {
  const { startMonth, prefix } = TENANT.fiscalYear;
  const endMonth = ((startMonth + 10) % 12) + 1;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Workspace" bodyClassName="p-0">
        <Fields
          rows={[
            ["Name", TENANT.workspace],
            ["Fiscal year", `${MONTH_NAMES[startMonth - 1]} – ${MONTH_NAMES[endMonth - 1]} · ${prefix}${TENANT.currentPeriodEnd.slice(0, 4)}`],
            ["Current period", `${fmtMonth(TENANT.currentPeriodEnd)} · ${fiscalQuarterLabel(TENANT.currentPeriodEnd, startMonth, prefix)}`],
            ["Last completed review", fmtDate(TENANT.priorReviewDate)],
            ["Source systems", <Chips items={TENANT.sourceSystems} />],
            ["Data", TENANT.dataMode === "demo" ? "Demo data" : TENANT.dataMode === "masked" ? "Masked extract" : "Live"],
          ]}
        />
      </Panel>
      <Panel title="Legal entities" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Currency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TENANT.legalEntities.map((e) => (
              <TableRow key={e.code}>
                <TableCell className="font-mono text-xs">{e.code}</TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell>{e.currency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <Panel title="Business units and profit centres" className="lg:col-span-2" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business unit</TableHead>
              <TableHead>Profit centres</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WORLD.businessUnits.map((bu) => (
              <TableRow key={bu.id}>
                <TableCell className="font-medium">{bu.name}</TableCell>
                <TableCell>
                  <Chips items={WORLD.profitCentres.filter((p) => p.businessUnitId === bu.id).map((p) => `${p.id} · ${p.name}`)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function Localisation() {
  const L = LOCALISATION;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Formats and calendars" bodyClassName="p-0">
        <Fields
          rows={[
            ["Country", "India"],
            ["Currency", `${L.currency} (${L.currencySymbol})`],
            ["Amounts", <span className="tnum">{fmtINR(12345678)} · {fmtINRCompact(4350000)} · {fmtINRCompact(19650000)}</span>],
            ["Dates", fmtDate(TENANT.currentPeriodEnd)],
            ["Statutory tax year", `${MONTH_NAMES[L.statutoryTaxYearStartMonth - 1]} – March · ${fiscalQuarterLabel(TENANT.currentPeriodEnd, L.statutoryTaxYearStartMonth, "FY")}`],
            ["Accounting framework", L.gaap],
            ["Financial statements", L.financialStatementsFormat],
          ]}
        />
      </Panel>
      <Panel title="Taxes" bodyClassName="p-0">
        <Fields
          rows={[
            [`Indirect tax · ${L.taxes.indirect.label}`, L.taxes.indirect.name],
            [`Withholding tax · ${L.taxes.withholding.label}`, L.taxes.withholding.name],
          ]}
        />
      </Panel>
      <Panel title="Statutory ageing bands" className="lg:col-span-2" bodyClassName="p-0">
        <Fields
          rows={[
            ["Trade receivables", <Chips items={L.disclosureAgeing.tradeReceivables.map((b) => b.label)} />],
            ["Trade payables and CWIP", <Chips items={L.disclosureAgeing.tradePayablesAndCwip.map((b) => b.label)} />],
          ]}
        />
      </Panel>
    </div>
  );
}

function People() {
  const owned = (id: string) => WORLD.glAccounts.filter((g) => g.ownerId === id).length;
  const reviewed = (id: string) => WORLD.glAccounts.filter((g) => g.reviewerId === id).length;
  return (
    <Panel title="People and roles" bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>ERP user</TableHead>
            <TableHead className="text-right">Accounts owned</TableHead>
            <TableHead className="text-right">Accounts reviewed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {WORLD.people.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-muted-foreground">{p.title}</TableCell>
              <TableCell>{ROLES[p.roleId].label}</TableCell>
              <TableCell className="font-mono text-xs">{p.userId}</TableCell>
              <TableCell className="text-right tnum">{owned(p.id) || "—"}</TableCell>
              <TableCell className="text-right tnum">{reviewed(p.id) || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function Policies() {
  const basis = { postingDate: "Posting date", documentDate: "Document date", dueDate: "Due date" }[AGEING_POLICY.basis];
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Review" bodyClassName="p-0">
        <Fields
          rows={[
            ["Ageing basis", basis],
            ["Ageing buckets", <Chips items={AGEING_POLICY.buckets.map((b) => b.label)} />],
            ["Review threshold", `${AGEING_POLICY.reviewThresholdDays} days`],
            ["Documented action required from", fmtINR(MATERIALITY_POLICY.documentedActionAmount)],
            ["Tax review required for", <Chips items={TAX_REVIEW_POLICY} />],
            ["Approved journals", WRITE_BACK_POLICY.label],
          ]}
        />
      </Panel>
      <Panel title="Approval bands" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Band</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Approval chain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {APPROVAL_BANDS.map((b, i) => {
              const from = i === 0 ? null : APPROVAL_BANDS[i - 1].upTo;
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.id}</TableCell>
                  <TableCell className="tnum">
                    {b.upTo === null ? `Above ${fmtINRCompact(from ?? 0)}` : from === null ? `Up to ${fmtINRCompact(b.upTo)}` : `${fmtINRCompact(from)} – ${fmtINRCompact(b.upTo)}`}
                  </TableCell>
                  <TableCell>{b.chain.map((c) => APPROVER_LABELS[c]).join(" → ")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function Modules() {
  const groups: (string | null)[] = [null, ...NAV_GROUPS, "bottom"];
  return (
    <Panel title="Modules" bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.flatMap((g) =>
            MODULES.filter((m) => m.group === g).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{g === null ? "Workspace" : g === "bottom" ? "Administration" : g}</TableCell>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell>
                  <StatusChip status={isModuleEnabled(m.id) ? "approved" : "not-started"} label={isModuleEnabled(m.id) ? "Enabled" : "Disabled"} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function Settings() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="localisation">Localisation</TabsTrigger>
          <TabsTrigger value="people">People and roles</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <Workspace />
        </TabsContent>
        <TabsContent value="localisation">
          <Localisation />
        </TabsContent>
        <TabsContent value="people">
          <People />
        </TabsContent>
        <TabsContent value="policies">
          <Policies />
        </TabsContent>
        <TabsContent value="modules">
          <Modules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
