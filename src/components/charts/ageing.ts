// One sequential ramp for ageing across the app: older reads darker.
export const AGEING_FILL: Record<string, string> = {
  "0-90": "hsl(var(--age-1))",
  "91-180": "hsl(var(--age-2))",
  "181-365": "hsl(var(--age-3))",
  "365+": "hsl(var(--age-4))",
};
