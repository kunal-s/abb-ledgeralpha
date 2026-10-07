import { describe, expect, it } from "vitest";
import { buildXlsx, sheetNames } from "@/lib/xlsx";

/** Reads the stored entries of a zip, checking each one's CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  // end of central directory
  let end = bytes.length - 22;
  while (dv.getUint32(end, true) !== 0x06054b50) end -= 1;
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const crcOf = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (let i = 0; i < count; i += 1) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.slice(dataStart, dataStart + size);
    expect(crcOf(data), name).toBe(crc);
    out.set(name, new TextDecoder().decode(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("xlsx writer", () => {
  const files = unzip(
    buildXlsx([
      { name: "Summary", rows: [["Account", { v: "Balance", bold: true }], ["Trade <receivables> & more", 1234567.5], [null, { v: 42, format: "int" }]], widths: [30, 16] },
      { name: "171200 / Incoming: clearing?", rows: [["x"]] },
    ])
  );

  it("is a package with the parts a workbook needs", () => {
    for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) expect(files.has(part), part).toBe(true);
  });

  it("writes text, numbers and escapes markup", () => {
    const s1 = files.get("xl/worksheets/sheet1.xml")!;
    expect(s1).toContain("Trade &lt;receivables&gt; &amp; more");
    expect(s1).toContain('<c r="B2" s="3"><v>1234567.5</v></c>');
    expect(s1).toContain('<c r="B3" s="2"><v>42</v></c>');
    expect(s1).toContain('<c r="B1" t="inlineStr" s="1">');
    expect(s1).not.toContain("A3"); // an empty cell writes nothing
    expect(s1).toContain('<col min="1" max="1" width="30" customWidth="1"/>');
  });

  it("names sheets the way Excel allows: no forbidden characters, at most 31 characters, unique", () => {
    expect(files.get("xl/workbook.xml")).toContain('name="171200   Incoming  clearing"');
    expect(sheetNames(["A", "a", "A"])).toEqual(["A", "a 2", "A 3"]);
    expect(sheetNames(["x".repeat(40)])[0]).toHaveLength(31);
  });
});
