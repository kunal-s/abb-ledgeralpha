// Harvested from LedgerAlpha (/app/app-ledger-alpha/src/data/rng.ts), extended
// with the distributions the world generator needs. Deterministic: the same
// seed always produces the same world, so every rehearsal sees the same data.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: number) {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
  const normal = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next: rand,
    /** float in [min, max) */
    range: (min: number, max: number) => min + rand() * (max - min),
    /** integer in [min, max] inclusive */
    int,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)],
    /** true with probability p */
    chance: (p: number) => rand() < p,
    normal,
    /**
     * Whole-rupee amount, log-normal around `median`, clamped to [min, max],
     * nudged off round thousands so generated figures never look invented.
     */
    money: (median: number, sigma: number, min: number, max: number) => {
      const v = Math.min(max, Math.max(min, median * Math.exp(sigma * normal())));
      let r = Math.round(v);
      if (r % 1000 === 0) r += int(11, 989);
      return r;
    },
    /** pick by weight */
    weighted: <T>(items: readonly { value: T; weight: number }[]): T => {
      const total = items.reduce((s, i) => s + i.weight, 0);
      let x = rand() * total;
      for (const i of items) {
        x -= i.weight;
        if (x <= 0) return i.value;
      }
      return items[items.length - 1].value;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;
