// Money and number helpers for the India localisation pack (docs/FRD.md §7.1).
// Amounts are in company-code currency, signed the SAP way: debit +, credit −.

const RUPEE = "₹";

const IN_INT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

/** "1,23,45,678" — Indian digit grouping, no decimals. */
export function fmtInt(v: number): string {
  return IN_INT.format(Math.round(v));
}

/** "₹1,23,45,678" / "-₹12,450" — full amount with Indian grouping. */
export function fmtINR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${RUPEE}${fmtInt(Math.abs(amount))}`;
}

/**
 * Compact lakh/crore form for tiles, charts and chips:
 *   12,450 → "₹12,450" · 43,50,000 → "₹43.5 lakh" · 1,96,50,000 → "₹1.97 cr"
 *   1,32,03,00,00,000 → "₹13,203 cr"
 * Below one lakh the full figure is shown (no "K" — not used in Indian reporting).
 */
export function fmtINRCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= CRORE) {
    const cr = abs / CRORE;
    const digits = cr >= 1000 ? 0 : cr >= 100 ? 1 : 2;
    const s = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(cr);
    return `${sign}${RUPEE}${s} cr`;
  }
  if (abs >= LAKH) {
    return `${sign}${RUPEE}${(abs / LAKH).toFixed(1)} lakh`;
  }
  return `${sign}${RUPEE}${fmtInt(abs)}`;
}

/** "₹12,450 Dr" / "₹12,450 Cr" — sign expressed as Dr/Cr, the way SAP users read it. */
export function fmtDrCr(amount: number, compact = false): string {
  const body = compact ? fmtINRCompact(Math.abs(amount)) : fmtINR(Math.abs(amount));
  if (amount === 0) return body;
  return `${body} ${amount < 0 ? "Cr" : "Dr"}`;
}

/** One-decimal percent from a 0..1 fraction: 0.734 → "73.4%". */
export function fmtPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** Confidence as a 0..1 score shown as percent. */
export function fmtConfidence(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}
