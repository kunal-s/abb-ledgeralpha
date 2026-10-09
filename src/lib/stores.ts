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

// The acting role survives a reload, so a walkthrough does not fall back to the controller midway.
const ROLE_KEY = "ledgeralpha.actingRole";
const ROLE_IDS: RoleId[] = ["cfo", "head-of-finance", "controller", "gl-accountant", "ar-specialist", "treasury-analyst", "tax-specialist", "reporting-analyst", "controls-lead", "external-auditor"];
function savedRole(): RoleId {
  try {
    const r = localStorage.getItem(ROLE_KEY) as RoleId | null;
    return r && ROLE_IDS.includes(r) ? r : "controller";
  } catch {
    return "controller";
  }
}

export const useRoleStore = create<RoleState>((set) => ({
  role: savedRole(),
  setRole: (role) => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      // storage unavailable: the role lasts for the session
    }
    set({ role });
  },
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
