import { create } from "zustand";
import type { RoleId } from "@/types";

// ----------------------------------------------------------------------------
// Role store — the acting persona (FRD §4). Drives role-aware views and which
// actions are enabled (e.g. only the Tax Reviewer clears write-backs).
// ----------------------------------------------------------------------------
interface RoleState {
  role: RoleId;
  setRole: (role: RoleId) => void;
}

export const useRoleStore = create<RoleState>((set) => ({
  role: "division-finance-head",
  setRole: (role) => set({ role }),
}));

// Domain stores (dataset, rule run, decisions, sign-offs, audit events) arrive
// with their increments — see docs/FRD.md §11.4 for the state model.
