import { describe, expect, it } from "vitest";
import { addRupiah, formatRupiah, multiplyRupiah, parseRupiah, rupiah } from "./money";

describe("money (BR-001)", () => {
  it("memformat sesuai DESIGN.md §5.2", () => {
    expect(formatRupiah(89000)).toBe("Rp89.000");
    expect(formatRupiah(1250000)).toBe("Rp1.250.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(-10000)).toBe("-Rp10.000");
  });

  it("menolak nilai pecahan", () => {
    expect(() => rupiah(1.5)).toThrow(RangeError);
    expect(() => formatRupiah(89000.01)).toThrow(RangeError);
  });

  it("menghitung contoh checkout Lampiran A secara tepat", () => {
    const subtotal = multiplyRupiah(89000, 2);
    const total = addRupiah(subtotal, -10000, 18000);
    expect(subtotal).toBe(178000);
    expect(total).toBe(186000);
  });

  it("mem-parse input admin", () => {
    expect(parseRupiah("Rp89.000")).toBe(89000);
    expect(parseRupiah("129000")).toBe(129000);
    expect(() => parseRupiah("abc")).toThrow(RangeError);
  });

  it("menolak kuantitas tidak valid", () => {
    expect(() => multiplyRupiah(89000, -1)).toThrow(RangeError);
    expect(() => multiplyRupiah(89000, 1.5)).toThrow(RangeError);
  });
});
