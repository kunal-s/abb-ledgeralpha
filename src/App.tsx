import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { SCREENS } from "@/lib/screens";
import { ScreenPlaceholder } from "@/pages/ScreenPlaceholder";
import { NotFound } from "@/pages/NotFound";

// Routes come from the screen registry (src/lib/screens.ts). As each screen is
// built, map its path to the real page here instead of the placeholder.
const BUILT: Record<string, React.ReactNode> = {};

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      ...SCREENS.map((s) => ({
        path: s.path,
        element: BUILT[s.path] ?? <ScreenPlaceholder />,
      })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
