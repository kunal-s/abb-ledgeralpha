import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/useQueryParams";
import { LOCALISATION } from "@/config/localisation";
import { OverviewTab } from "@/pages/tds/OverviewTab";
import { ReceivableTab } from "@/pages/tds/ReceivableTab";
import { ExpectedTab } from "@/pages/tds/ExpectedTab";
import { StatementTab } from "@/pages/tds/StatementTab";
import { PayableTab } from "@/pages/tds/PayableTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "receivable", label: "Receivable" },
  { key: "expected", label: "Expected" },
  { key: "statement", label: "Statement" },
  { key: "payable", label: "Payable" },
] as const;

export function Tds() {
  const [params, setParams] = useQueryParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";
  return (
    <div className="space-y-4">
      <PageHeader title={LOCALISATION.taxes.withholding.label} />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "overview" ? null : v }, { replace: false })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="receivable">
          <ReceivableTab />
        </TabsContent>
        <TabsContent value="expected">
          <ExpectedTab />
        </TabsContent>
        <TabsContent value="statement">
          <StatementTab />
        </TabsContent>
        <TabsContent value="payable">
          <PayableTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
