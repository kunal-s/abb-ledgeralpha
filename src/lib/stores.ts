import { create } from "zustand";
import type { RoleId } from "@/types";
import { TENANT } from "@/config/tenant";

// ----------------------------------------------------------------------------
// Role store - the acting role (docs/FRD.md §2). Stands in for authentication;
// drives role-aware views and which actions are enabled.
// ----------------------------------------------------------------------------
interface RoleState {
  role: RoleId;
  setRole: (role: RoleId) => void;
}

export const useRoleStore = create<RoleState>((set) => ({
  role: "controller",
  setRole: (role) => set({ role }),
}));

// ----------------------------------------------------------------------------
// Scope store - business unit filter applied across modules ("all" = company).
// ----------------------------------------------------------------------------
interface ScopeState {
  businessUnitId: string | "all";
  setBusinessUnit: (id: string | "all") => void;
}

export const useScopeStore = create<ScopeState>((set) => ({
  businessUnitId: "all",
  setBusinessUnit: (businessUnitId) => set({ businessUnitId }),
}));

// ----------------------------------------------------------------------------
// Period store - the period end every module reads as "as at".
// ----------------------------------------------------------------------------
interface PeriodState {
  periodEnd: string;
  setPeriodEnd: (iso: string) => void;
}

export const usePeriodStore = create<PeriodState>((set) => ({
  periodEnd: TENANT.currentPeriodEnd,
  setPeriodEnd: (periodEnd) => set({ periodEnd }),
}));

// Domain stores (ledger, rule results, decisions, sign-offs, activity) arrive
// with the platform-core increment - see docs/FRD.md §4.
