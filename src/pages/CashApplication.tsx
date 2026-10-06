import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/useQueryParams";
import { OverviewTab } from "@/pages/cash/OverviewTab";
import { ReceiptsTab } from "@/pages/cash/ReceiptsTab";
import { DecisionsTab } from "@/pages/cash/DecisionsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "receipts", label: "Receipts" },
  { key: "decisions", label: "Decisions" },
] as const;

export function CashApplication() {
  const [params, setParams] = useQueryParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";
  return (
    <div className="space-y-4">
      <PageHeader title="Cash Application" />
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
        <TabsContent value="receipts">
          <ReceiptsTab />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
