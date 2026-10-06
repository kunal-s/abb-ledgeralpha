import type { ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { DETAIL_ROUTES, ENABLED_MODULES, isModuleEnabled } from "@/lib/modules";
import { ModulePage } from "@/pages/ModulePage";
import { NotFound } from "@/pages/NotFound";

// Routes come from the module registry (src/lib/modules.ts), filtered by the
// workspace's enabled modules. As a module is built, map its path to the real
// page here; unbuilt modules render the scaffold page.
const BUILT: Record<string, ReactNode> = {};

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
