import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { WORLD } from "@/data";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { BalanceSheetTab } from "@/pages/fs/BalanceSheetTab";
import { ProfitLossTab } from "@/pages/fs/ProfitLossTab";
import { NotesTab } from "@/pages/fs/NotesTab";
import { MappingTab } from "@/pages/fs/MappingTab";
import { AccountBody } from "@/pages/fs/AccountSheet";

const TABS = [
  { key: "balance-sheet", label: "Balance sheet" },
  { key: "profit-loss", label: "Profit and loss" },
  { key: "notes", label: "Notes" },
  { key: "mapping", label: "Mapping" },
] as const;

export function FinancialStatements() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const setPeriodEnd = usePeriodStore((s) => s.setPeriodEnd);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "balance-sheet";
  const account = params.get("acct");

  // the statements are drawn for the loaded period: earlier balances are incomplete in the demo ledger
  if (periodEnd !== WORLD.asOf) {
    return (
      <div className="space-y-4">
        <PageHeader title="Financial Statements" />
        <Card className="flex items-center justify-between gap-4 p-5 text-sm">
          <span>
            The statements are drawn for {fmtMonth(WORLD.asOf)}. The selected period is {fmtMonth(periodEnd)}.
          </span>
          <Button size="sm" onClick={() => setPeriodEnd(WORLD.asOf)}>
            Switch to {fmtMonth(WORLD.asOf)}
          </Button>
        </Card>
      </div>
    );
  }

  const open = (gl: string) => setParams({ acct: gl });

  return (
    <div className="space-y-4">
      <PageHeader title="Financial Statements" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "balance-sheet" ? null : v })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="balance-sheet">
          <BalanceSheetTab onAccount={open} />
        </TabsContent>
        <TabsContent value="profit-loss">
          <ProfitLossTab onAccount={open} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab />
        </TabsContent>
        <TabsContent value="mapping">
          <MappingTab onAccount={open} />
        </TabsContent>
      </Tabs>
      <Sheet open={!!account} onOpenChange={(o) => !o && setParams({ acct: null })}>
        <SheetContent>{account && <AccountBody key={account} gl={account} />}</SheetContent>
      </Sheet>
    </div>
  );
}
