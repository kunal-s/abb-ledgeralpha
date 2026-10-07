import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/useQueryParams";
import { OverviewTab } from "@/pages/journals/OverviewTab";
import { ProposedTab } from "@/pages/journals/ProposedTab";
import { ReviewTab } from "@/pages/journals/ReviewTab";
import { RegisterTab } from "@/pages/journals/RegisterTab";
import { AccrualsTab } from "@/pages/journals/AccrualsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "proposed", label: "Proposed" },
  { key: "review", label: "Review" },
  { key: "register", label: "Register" },
  { key: "accruals", label: "Accruals" },
] as const;

export function Journals() {
  const [params, setParams] = useQueryParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";

  return (
    <div className="space-y-4">
      <PageHeader title="Journals" />
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
        <TabsContent value="proposed">
          <ProposedTab />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab />
        </TabsContent>
        <TabsContent value="register">
          <RegisterTab />
        </TabsContent>
        <TabsContent value="accruals">
          <AccrualsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
