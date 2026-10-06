import { Building2, CalendarClock, Check, ChevronDown, Search, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePeriodStore, useRoleStore, useScopeStore } from "@/lib/stores";
import { TENANT } from "@/config/tenant";
import { ROLES } from "@/config/roles";
import { fiscalQuarterLabel, fmtMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RoleId } from "@/types";

/** Month-ends of the current fiscal year up to the workspace's current period. */
function periodOptions(): string[] {
  const end = TENANT.currentPeriodEnd;
  const [y, m] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const month = m - i;
    const date = new Date(y, month, 0); // day 0 of next month = last day of `month`
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    out.push(iso);
    if (date.getMonth() + 1 === TENANT.fiscalYear.startMonth) break;
  }
  return out;
}

function MenuCheck({ on }: { on: boolean }) {
  return on ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />;
}

export function TopBar() {
  const { role, setRole } = useRoleStore();
  const { businessUnitId, setBusinessUnit } = useScopeStore();
  const { periodEnd, setPeriodEnd } = usePeriodStore();
  const { startMonth, prefix } = TENANT.fiscalYear;
  const bu = TENANT.businessUnits.find((b) => b.id === businessUnitId);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
      {/* Scope: legal entity › business unit */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 min-w-0 gap-2 whitespace-nowrap px-2 font-medium">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{TENANT.workspace}</span>
            <span className="hidden text-muted-foreground xl:inline">· {bu ? bu.name : "All business units"}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Business unit</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setBusinessUnit("all")}>
            <MenuCheck on={businessUnitId === "all"} />
            All business units
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {TENANT.businessUnits.map((b) => (
            <DropdownMenuItem key={b.id} onClick={() => setBusinessUnit(b.id)}>
              <MenuCheck on={businessUnitId === b.id} />
              {b.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        disabled
        className="flex h-8 w-64 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs font-medium">Ctrl K</kbd>
      </button>

      <button
        type="button"
        disabled
        className="flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-2.5 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="hidden lg:inline">Ask LedgerAlpha</span>
      </button>

      <div className="flex-1" />

      {TENANT.dataMode !== "live" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "whitespace-nowrap rounded-md px-2 py-1 text-2xs font-semibold uppercase tracking-wide",
                "bg-warn-subtle text-warn-foreground"
              )}
            >
              {TENANT.dataMode === "demo" ? "Demo data" : "Masked data"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {TENANT.dataMode === "demo"
              ? "Synthetic data on the source-system layout"
              : "Customer extract with identifiers masked"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Period */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 gap-1.5 whitespace-nowrap bg-secondary px-2.5 text-xs font-medium">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            {fmtMonth(periodEnd)} · {fiscalQuarterLabel(periodEnd, startMonth, prefix)}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Period</DropdownMenuLabel>
          {periodOptions().map((p) => (
            <DropdownMenuItem key={p} onClick={() => setPeriodEnd(p)}>
              <MenuCheck on={p === periodEnd} />
              {fmtMonth(p)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Acting role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 gap-2 whitespace-nowrap px-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary">
              {ROLES[role].label
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="hidden text-xs font-medium lg:inline">{ROLES[role].label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Role</DropdownMenuLabel>
          {(Object.keys(ROLES) as RoleId[]).map((r) => (
            <DropdownMenuItem key={r} onClick={() => setRole(r)}>
              <MenuCheck on={role === r} />
              {ROLES[r].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
