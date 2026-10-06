import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Chips, Fields } from "@/components/vocab/Fields";
import { PolicyPanels } from "@/components/settings/PolicyPanels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TENANT } from "@/config/tenant";
import { LOCALISATION } from "@/config/localisation";
import { ROLES } from "@/config/roles";
import { MODULES, NAV_GROUPS, isModuleEnabled } from "@/lib/modules";
import { WORLD } from "@/data";
import { MONTH_NAMES } from "@/lib/labels";
import { fiscalQuarterLabel, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINR, fmtINRCompact } from "@/lib/format";
import { useWorkflow } from "@/state/workflow";
import { toast } from "@/lib/toast";

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
              <TableCell className="text-right tnum">{owned(p.id) || "-"}</TableCell>
              <TableCell className="text-right tnum">{reviewed(p.id) || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function ResetDemo() {
  const [open, setOpen] = useState(false);
  const resetDemo = useWorkflow((s) => s.resetDemo);
  const sessionEvents = useWorkflow((s) => s.events.length);
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3.5 w-3.5" />
        Reset demo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset demo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Decisions, follow-ups, sign-offs and rule changes made in this session ({sessionEvents} events) return to the workspace's starting state.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                resetDemo();
                setOpen(false);
                toast("Demo reset", { description: "Workspace returned to its starting state.", tone: "ok" });
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      <PageHeader title="Settings" actions={<ResetDemo />} />
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
          <PolicyPanels />
        </TabsContent>
        <TabsContent value="modules">
          <Modules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
