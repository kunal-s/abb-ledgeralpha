import type { ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { DETAIL_ROUTES, ENABLED_MODULES, isModuleEnabled } from "@/lib/modules";
import { ModulePage } from "@/pages/ModulePage";
import { NotFound } from "@/pages/NotFound";
import { DataSources } from "@/pages/DataSources";
import { Settings } from "@/pages/Settings";
import { RulesPolicies } from "@/pages/RulesPolicies";
import { ActivityLog } from "@/pages/ActivityLog";
import { BalanceSheetReview } from "@/pages/BalanceSheetReview";
import { AccountScrutiny } from "@/pages/AccountScrutiny";
import { Reconciliations } from "@/pages/Reconciliations";
import { ReconciliationDetail } from "@/pages/ReconciliationDetail";
import { CashApplication } from "@/pages/CashApplication";
import { ReceiptDetail } from "@/pages/ReceiptDetail";
import { Tds } from "@/pages/Tds";
import { Journals } from "@/pages/Journals";
import { JournalDetail } from "@/pages/JournalDetail";
import { AuditReadiness } from "@/pages/AuditReadiness";
import { Home } from "@/pages/Home";
import { MyWork } from "@/pages/MyWork";
import { Close } from "@/pages/Close";
import { Variance } from "@/pages/Variance";
import { WorkingCapital } from "@/pages/WorkingCapital";
import { ManagementReporting } from "@/pages/ManagementReporting";
import { FinancialStatements } from "@/pages/FinancialStatements";

// Routes come from the module registry (src/lib/modules.ts), filtered by the
// workspace's enabled modules. As a module is built, map its path to the real
// page here; unbuilt modules render the scaffold page.
const BUILT: Record<string, ReactNode> = {
  "/data": <DataSources />,
  "/settings": <Settings />,
  "/rules": <RulesPolicies />,
  "/activity": <ActivityLog />,
  "/balance-sheet-review": <BalanceSheetReview />,
  "/balance-sheet-review/:gl": <AccountScrutiny />,
  "/reconciliations": <Reconciliations />,
  "/reconciliations/:id": <ReconciliationDetail />,
  "/cash-application": <CashApplication />,
  "/cash-application/:id": <ReceiptDetail />,
  "/tax/withholding": <Tds />,
  "/journals": <Journals />,
  "/journals/:id": <JournalDetail />,
  "/audit-readiness": <AuditReadiness />,
  "/": <Home />,
  "/my-work": <MyWork />,
  "/close": <Close />,
  "/reporting/variance": <Variance />,
  "/reporting/working-capital": <WorkingCapital />,
  "/reporting/management": <ManagementReporting />,
  "/reporting/financial-statements": <FinancialStatements />,
};

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      ...ENABLED_MODULES.map((m) => ({ path: m.path, element: BUILT[m.path] ?? <ModulePage /> })),
      ...DETAIL_ROUTES.filter((d) => isModuleEnabled(d.moduleId)).map((d) => ({
        path: d.path,
        element: BUILT[d.path] ?? <ModulePage />,
      })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
