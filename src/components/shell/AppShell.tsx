import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { DataBanner } from "@/components/shell/DataBanner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/Toaster";

export function AppShell() {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <DataBanner />
          <ScrollArea className="flex-1">
            <main className="mx-auto w-full max-w-[1600px] px-6 py-5">
              <Outlet />
            </main>
          </ScrollArea>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
