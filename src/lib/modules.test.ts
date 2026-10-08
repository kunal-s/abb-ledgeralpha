import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DETAIL_ROUTES, MODULES } from "@/lib/modules";

const app = readFileSync("src/App.tsx", "utf8");

describe("the sidebar", () => {
  it("leads to a built page for every module, never to a placeholder", () => {
    for (const m of MODULES) expect(app.includes(`"${m.path}":`), `${m.label} (${m.path}) has no page in App.tsx`).toBe(true);
  });

  it("has a built page for every drill-down route", () => {
    for (const d of DETAIL_ROUTES) expect(app.includes(`"${d.path}":`), `${d.title} (${d.path}) has no page in App.tsx`).toBe(true);
  });

  it("has no module that is not in the registry", () => {
    const keys = [...app.matchAll(/^\s+"(\/[^"]*)":/gm)].map((m) => m[1]);
    const known = new Set([...MODULES.map((m) => m.path), ...DETAIL_ROUTES.map((d) => d.path)]);
    for (const k of keys) expect(known.has(k), `${k} is mapped but not registered`).toBe(true);
  });
});
