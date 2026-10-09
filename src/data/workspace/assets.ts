// Demo workspace fixed asset register inputs (workspace data, not product code):
// the immovable property by site, with the facts a reviewer checks, and name
// templates for the movable assets. The generator (src/data/generator/assets.ts)
// sizes every asset so the register ties to the fixed asset accounts.

import type { FixedAsset, IsoDate } from "@/types";

export interface ImmovableSpec {
  gl: "110100" | "110200";
  description: string;
  site: string;
  /** share of the account's cost */
  share: number;
  acquired?: IsoDate;
  /** price, stamp duty, registration and other costs, as shares of cost (land and buildings bought, not built) */
  costParts?: [number, number, number, number];
  title: NonNullable<FixedAsset["title"]>;
  titleNote?: string;
  usage: FixedAsset["usage"];
  usageSince?: IsoDate;
  lastVerified: IsoDate;
}

export const IMMOVABLE: ImmovableSpec[] = [
  // Land: not depreciated; cost includes the duties paid to acquire it
  { gl: "110100", description: "Freehold land, Vadodara plant (survey no. 214)", site: "Vadodara", share: 0.4, acquired: "2008-06-17", costParts: [0.92, 0.06, 0.01, 0.01], title: "In company name", usage: "In use", lastVerified: "2025-12-12" },
  { gl: "110100", description: "Freehold land, Nashik plant (plot D-7, industrial estate)", site: "Nashik", share: 0.3, acquired: "2011-03-02", costParts: [0.93, 0.05, 0.01, 0.01], title: "Charge registered", titleNote: "Charged to the working capital consortium banks as security", usage: "In use", lastVerified: "2025-12-15" },
  { gl: "110100", description: "Industrial land, Bengaluru campus extension (allotted plot)", site: "Bengaluru", share: 0.22, acquired: "2019-02-11", costParts: [0.91, 0.07, 0.01, 0.01], title: "Not in company name", titleNote: "Allotted by the state industrial development board on lease-cum-sale; the sale deed is executed after the lease period, so the title deed is not yet in the company's name", usage: "In use", lastVerified: "2026-03-20" },
  { gl: "110100", description: "Freehold land, Faridabad (vacant plot)", site: "Faridabad", share: 0.08, acquired: "2016-11-08", costParts: [0.92, 0.06, 0.01, 0.01], title: "In company name", usage: "Idle", usageSince: "2023-06-30", lastVerified: "2024-01-18" },
  // Buildings: depreciated over 30 years
  { gl: "110200", description: "Factory building, Vadodara plant", site: "Vadodara", share: 0.35, title: "In company name", usage: "In use", lastVerified: "2025-12-12" },
  { gl: "110200", description: "Factory building, Nashik plant", site: "Nashik", share: 0.25, title: "Charge registered", titleNote: "Charged with the land to the working capital consortium banks", usage: "In use", lastVerified: "2025-12-15" },
  { gl: "110200", description: "Office and engineering centre, Bengaluru", site: "Bengaluru", share: 0.3, title: "In company name", usage: "Partly let out", usageSince: "2025-04-01", titleNote: "Fourth floor let to a group company since 01-Apr-2025", lastVerified: "2026-03-20" },
  { gl: "110200", description: "Warehouse, Faridabad", site: "Faridabad", share: 0.06, title: "In company name", usage: "In use", lastVerified: "2024-01-18" },
  { gl: "110200", description: "Service centre, Chennai", site: "Chennai", share: 0.04, title: "In company name", usage: "In use", lastVerified: "2025-11-04" },
];

/** Movable assets: how many to show for each class, their useful life, and the names they take. */
export const MOVABLE: { gl: string; accDepGl: string; count: number; life: number; names: string[] }[] = [
  {
    gl: "110300", accDepGl: "119300", count: 36, life: 15,
    names: ["CNC machining centre", "Transformer test bay", "Coil winding line", "Powder coating plant", "EOT crane 20 t", "Switchgear assembly line", "Drives test rig", "Robotic welding cell", "Vacuum pressure impregnation plant", "High-voltage test laboratory", "Busbar fabrication line", "Motor assembly line"],
  },
  { gl: "110400", accDepGl: "119400", count: 10, life: 10, names: ["Office furniture", "Workstations and seating", "Laboratory furniture", "Canteen fit-out"] },
  { gl: "110500", accDepGl: "119500", count: 8, life: 8, names: ["Forklift", "Service van", "Staff bus", "Pool car"] },
  { gl: "110600", accDepGl: "119600", count: 14, life: 5, names: ["Servers and storage", "Laptops", "Network equipment", "Test and measurement computers", "Video conferencing systems"] },
  { gl: "125100", accDepGl: "125900", count: 6, life: 6, names: ["Engineering design software licences", "Product lifecycle management system", "Plant automation software", "Analytics platform licences"] },
];

export const BUILDING_LIFE = 30;
export const ASSET_SITES = ["Vadodara", "Nashik", "Bengaluru", "Faridabad", "Chennai"];
