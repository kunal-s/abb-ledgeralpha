import { Building2, CalendarClock, Check, ChevronDown, Search, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRoleStore } from "@/lib/stores";
import { DEMO, ROLES } from "@/config/demo";
import { fmtDate } from "@/lib/dates";
import type { RoleId } from "@/types";

/** A control whose feature lands in a later increment: visible, disabled, says when. */
function Pending({ children, increment }: { children: React.ReactNode; increment: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-not-allowed opacity-60">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>Arrives in increment {increment}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const { role, setRole } = useRoleStore();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      {/* Scope: one company, one division (no entity switcher — FRD §2.2) */}
      <div className="flex min-w-0 shrink items-center gap-2 whitespace-nowrap text-sm font-medium">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{DEMO.company}</span>
        <span className="hidden truncate text-muted-foreground xl:inline">· {DEMO.division}</span>
      </div>

      <Pending increment="I7">
        <span className="pointer-events-none flex h-8 w-64 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search GL, document, party…</span>
        </span>
      </Pending>

      <Pending increment="I7">
        <span className="pointer-events-none flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="hidden lg:inline">Ask LedgerAlpha</span>
        </span>
      </Pending>

      <div className="flex-1" />

      {/* Period: ABB India reports on the calendar year */}
      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        {DEMO.period.label} · as at {fmtDate(DEMO.period.asOf)}
      </div>

      {/* Acting role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 gap-2 px-2">
            <div className="text-left leading-none">
              <div className="text-2xs text-muted-foreground">Acting as</div>
              <div className="mt-0.5 text-xs font-medium">{ROLES[role].label}</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Acting as role</DropdownMenuLabel>
          {(Object.keys(ROLES) as RoleId[]).map((r) => (
            <DropdownMenuItem key={r} onClick={() => setRole(r)} className="items-start">
              {role === r ? (
                <Check className="mt-0.5 h-3.5 w-3.5 text-primary" />
              ) : (
                <span className="w-3.5" />
              )}
              <div>
                <div className="text-sm">{ROLES[r].label}</div>
                <div className="text-2xs text-muted-foreground">{ROLES[r].summary}</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
