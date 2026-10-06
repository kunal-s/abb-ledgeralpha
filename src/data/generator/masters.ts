// Master data: profit centres, people, business partners and projects.

import type { IsoDate, Party, Person, ProfitCentre, Project, ProjectStage } from "@/types";
import { addDays } from "@/lib/dates";
import type { Rng } from "@/data/rng";
import { WORLD_SPEC as S } from "@/data/workspace/spec";

const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";

function letters(rng: Rng, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += LETTERS[rng.int(0, LETTERS.length - 1)];
  return s;
}

/** Masked PAN: 4 entity letters + name initial, digits masked, check letter. */
function maskedPan(rng: Rng, name: string, kind: "C" | "F" = "C"): string {
  return `${letters(rng, 3)}${kind}${name[0].toUpperCase()}####${letters(rng, 1)}`;
}

const STATE_CODES = ["27", "29", "33", "24", "07", "09", "36", "19", "06", "32"];

export interface Masters {
  profitCentres: ProfitCentre[];
  people: Person[];
  parties: Party[];
  customers: Party[];
  vendors: Party[];
  groupCompanies: Party[];
  projects: Project[];
  /** sector descriptor per customer, used for project names */
  customerSector: Map<string, number>;
}

export function buildMasters(rng: Rng): Masters {
  const profitCentres: ProfitCentre[] = [
    ...S.profitCentres.map((p) => ({ id: p.id, name: p.name, businessUnitId: p.businessUnitId })),
    { ...S.corporateProfitCentre },
  ];
  const people: Person[] = S.people.map((p) => ({ ...p }));

  // ---- customers ---------------------------------------------------------
  const customers: Party[] = [];
  const customerSector = new Map<string, number>();
  const usedNames = new Set<string>();
  // The last `sharedLegalEntities` accounts are second accounts of existing
  // legal entities (same PAN and deductor ID, another business unit's account).
  const uniqueCount = S.customers.count - S.customers.sharedLegalEntities;
  const entities: { name: string; sector: number; pan: string; tan: string; govt: boolean }[] = [];
  for (let i = 0; i < S.customers.count; i++) {
    const id = `CUST-${String(101 + i * 3).padStart(4, "0")}`;
    let entity: (typeof entities)[number];
    if (i < uniqueCount) {
      const sector = rng.int(0, S.customers.sectors.length - 1);
      let name: string;
      do name = `${rng.pick(S.customers.prefixes)} ${S.customers.sectors[sector].name}`;
      while (usedNames.has(name));
      usedNames.add(name);
      entity = {
        name,
        sector,
        pan: maskedPan(rng, name),
        tan: `${letters(rng, 3)}${name[0].toUpperCase()}#####${letters(rng, 1)}`,
        govt: rng.chance(S.customers.sectors[sector].govt),
      };
      entities.push(entity);
    } else {
      entity = entities[((i - uniqueCount) * 5) % uniqueCount];
    }
    const { name, sector, pan, tan, govt } = entity;
    customers.push({
      id,
      type: "Customer",
      name,
      taxIdMasked: pan,
      indirectTaxIdMasked: `${rng.pick(STATE_CODES)}${pan}1Z${rng.int(1, 9)}`,
      deductorIdMasked: tan,
      status: rng.chance(0.96) ? "Active" : "Blocked",
      governmentOrPsu: govt,
      country: "IN",
    });
    customerSector.set(id, sector);
  }

  // export customers (invoiced in USD)
  const EXPORT_MARKETS = ["AE", "SA", "SG", "BD", "KE", "QA"];
  for (let i = 0; i < 12; i++) {
    const country = EXPORT_MARKETS[i % EXPORT_MARKETS.length];
    customers.push({
      id: `CUST-9${String(101 + i * 4).padStart(3, "0")}`,
      type: "Customer",
      name: `${S.customers.prefixes[(i * 7) % S.customers.prefixes.length]} Industrial Trading ${country === "SG" ? "Pte Ltd" : "LLC"}`,
      taxIdMasked: `FOREIGN-${country}`,
      status: "Active",
      currency: "USD",
      country,
    });
  }

  // ---- vendors -------------------------------------------------------------
  const vendors: Party[] = [];
  const usedVendorNames = new Set<string>();
  for (let i = 0; i < S.vendors.count; i++) {
    const id = `VEND-${String(1001 + i * 7).padStart(5, "0")}`;
    const foreign = rng.chance(S.vendors.importShare);
    let name: string;
    let country = "IN";
    let currency: string | undefined;
    if (foreign) {
      const imp = rng.pick(S.vendors.importSuffixes);
      do name = `${rng.pick(S.vendors.prefixes)} ${imp.suffix}`;
      while (usedVendorNames.has(name));
      country = imp.country;
      currency = imp.currency;
    } else {
      do name = `${rng.pick(S.vendors.prefixes)} ${rng.pick(S.vendors.domesticProducts).name}`;
      while (usedVendorNames.has(name));
    }
    usedVendorNames.add(name);
    const pan = foreign ? "" : maskedPan(rng, name);
    const statusRoll = rng.next();
    vendors.push({
      id,
      type: "Vendor",
      name,
      taxIdMasked: pan || `FOREIGN-${country}`,
      indirectTaxIdMasked: foreign ? undefined : `${rng.pick(STATE_CODES)}${pan}1Z${rng.int(1, 9)}`,
      status: statusRoll < 0.9 ? "Active" : statusRoll < 0.95 ? "Blocked" : "Inactive",
      msme: !foreign && rng.chance(S.vendors.msmeShare) ? rng.weighted([
        { value: "Micro" as const, weight: 0.35 },
        { value: "Small" as const, weight: 0.45 },
        { value: "Medium" as const, weight: 0.2 },
      ]) : undefined,
      currency,
      country,
    });
  }

  const groupCompanies: Party[] = S.groupCompanies.map((g) => ({
    id: g.id,
    type: "Group company",
    name: g.name,
    taxIdMasked: `FOREIGN-${g.country}`,
    status: "Active",
    currency: g.currency,
    country: g.country,
  }));

  // ---- projects --------------------------------------------------------------
  const projectPcs = S.profitCentres.filter((p) => p.projectBusiness);
  const projects: Project[] = [];
  const asOf = S.asOf;
  const projectCustomers = customers.filter((c) => c.country === "IN");
  for (let i = 0; i < S.projects.count; i++) {
    const customer = rng.pick(projectCustomers);
    const sector = customerSector.get(customer.id)!;
    const startYear = rng.weighted([
      { value: 2021, weight: 0.08 },
      { value: 2022, weight: 0.14 },
      { value: 2023, weight: 0.2 },
      { value: 2024, weight: 0.24 },
      { value: 2025, weight: 0.22 },
      { value: 2026, weight: 0.12 },
    ]);
    const startDate: IsoDate = `${startYear}-${String(rng.int(1, startYear === 2026 ? 8 : 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
    const stage = stageFor(rng, startYear);
    const dlpEnd =
      stage === "In DLP" ? addDays(asOf, rng.int(30, 540))
      : stage === "DLP ended" ? addDays(asOf, -rng.int(20, 420))
      : stage === "Closed" ? addDays(asOf, -rng.int(120, 900))
      : undefined;
    const short = customer.name.split(" ")[0];
    projects.push({
      wbs: `P-${startYear}-${String(1000 + i * 7 + rng.int(0, 6)).padStart(4, "0")}`,
      name: `${S.customers.sectors[sector].project} - ${short}`,
      customerId: customer.id,
      profitCentreId: rng.pick(projectPcs).id,
      stage,
      contractValue: rng.money(18_00_00_000, 0.9, 1_50_00_000, 3_50_00_00_000),
      startDate,
      dlpEnd,
    });
  }

  return {
    profitCentres,
    people,
    parties: [...customers, ...vendors, ...groupCompanies],
    customers,
    vendors,
    groupCompanies,
    projects,
    customerSector,
  };
}

function stageFor(rng: Rng, startYear: number): ProjectStage {
  if (startYear >= 2025) return rng.chance(0.93) ? "Execution" : "On hold";
  if (startYear === 2024) {
    return rng.weighted([
      { value: "Execution" as const, weight: 0.5 },
      { value: "Commissioned" as const, weight: 0.2 },
      { value: "In DLP" as const, weight: 0.22 },
      { value: "On hold" as const, weight: 0.08 },
    ]);
  }
  return rng.weighted([
    { value: "Commissioned" as const, weight: 0.1 },
    { value: "In DLP" as const, weight: 0.32 },
    { value: "DLP ended" as const, weight: 0.3 },
    { value: "Closed" as const, weight: 0.24 },
    { value: "On hold" as const, weight: 0.04 },
  ]);
}
