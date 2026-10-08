// The datasets that make up the loaded world, as they arrived from each
// source system (docs/FRD.md §6.21).

import type { SourceDataset, World } from "@/types";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { TENANT } from "@/config/tenant";

export function describeDatasets(world: World): SourceDataset[] {
  const [erp, legacy, lake] = TENANT.sourceSystems;
  const erpLines = world.lines.filter((l) => l.sourceSystem === erp);
  const legacyLines = world.lines.filter((l) => l.sourceSystem === legacy);
  const minDate = (ls: { postingDate: string }[]) => ls.reduce((m, l) => (l.postingDate < m ? l.postingDate : m), world.asOf);
  const maxDate = (ls: { postingDate: string }[]) => ls.reduce((m, l) => (l.postingDate > m ? l.postingDate : m), "0000");
  const at = world.extractedAt;
  return [
    { id: "acdoca", name: "GL line items", sourceSystem: erp, format: "Universal journal (ACDOCA) extract", records: erpLines.length, coverageFrom: minDate(erpLines), coverageTo: world.asOf, extractedAt: at },
    { id: "legacy-items", name: "Pre-migration line items", sourceSystem: legacy, format: "BSEG / BSIS extract", records: legacyLines.length, coverageFrom: minDate(legacyLines), coverageTo: maxDate(legacyLines), extractedAt: at },
    { id: "coa", name: "Chart of accounts", sourceSystem: erp, format: "GL master (SKA1 / SKB1)", records: world.glAccounts.length, coverageTo: world.asOf, extractedAt: at },
    { id: "partners", name: "Business partners", sourceSystem: erp, format: "Vendor and customer master, identifiers masked", records: world.parties.length, coverageTo: world.asOf, extractedAt: at },
    { id: "po", name: "Purchase order status", sourceSystem: legacy, format: "EKKO / EKPO / EKBE extract", records: world.purchaseOrders.length, coverageTo: world.asOf, extractedAt: at },
    { id: "projects", name: "Projects and WBS status", sourceSystem: legacy, format: "PROJ / PRPS extract", records: world.projects.length, coverageTo: world.asOf, extractedAt: at },
    { id: "fx", name: "Month-end FX rates", sourceSystem: lake, format: "Group rate table", records: world.fxRates.length, coverageFrom: "2025-12-31", coverageTo: world.asOf, extractedAt: at },
    { id: "fwd", name: "Forward contracts", sourceSystem: "Treasury register", format: "Excel register", records: world.forwards.length, coverageTo: world.asOf, extractedAt: at },
    { id: "bg", name: "Bank guarantee register", sourceSystem: "Treasury register", format: "Excel register", records: world.bankGuarantees.length, coverageTo: world.asOf, extractedAt: at },
    { id: "26as", name: "Tax credit statement (Form 26AS)", sourceSystem: "Income-tax portal", format: "Form 26AS text export", records: world.taxCredits.length, coverageTo: world.asOf, extractedAt: S.extractedAt },
  ];
}
