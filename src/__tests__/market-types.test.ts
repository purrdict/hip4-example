import { test, expect, describe } from "bun:test";
import {
  coinNumber,
  apiCoin,
  tokenCoin,
  assetIndex,
  orderAssetIndex,
  parseRecurringDescription,
  parseExpiryDate,
  formatCountdown,
  formatPrice,
  getMinShares,
} from "@/types/market";

describe("coin naming helpers", () => {
  test("coinNumber produces correct value", () => {
    expect(coinNumber(9, 0)).toBe(90);
    expect(coinNumber(9, 1)).toBe(91);
    expect(coinNumber(153, 0)).toBe(1530);
  });

  test("apiCoin produces #-prefixed string", () => {
    expect(apiCoin(9, 0)).toBe("#90");
    expect(apiCoin(9, 1)).toBe("#91");
  });

  test("tokenCoin produces +-prefixed string", () => {
    expect(tokenCoin(9, 0)).toBe("+90");
  });

  test("assetIndex is 10000 + coinNumber", () => {
    expect(assetIndex(9, 0)).toBe(10090);
    expect(assetIndex(9, 1)).toBe(10091);
  });

  test("orderAssetIndex is 100000000 + coinNumber", () => {
    expect(orderAssetIndex(9, 0)).toBe(100000090);
    expect(orderAssetIndex(9, 1)).toBe(100000091);
  });
});

describe("parseRecurringDescription", () => {
  test("parses valid recurring description", () => {
    const desc = "class:priceBinary|underlying:BTC|expiry:20260327-1400|targetPrice:90000|period:15m";
    const meta = parseRecurringDescription(desc);
    expect(meta).not.toBeNull();
    expect(meta!.underlying).toBe("BTC");
    expect(meta!.targetPrice).toBe(90000);
    expect(meta!.period).toBe("15m");
    expect(meta!.expiry).toBe("20260327-1400");
  });

  test("returns null for non-recurring description", () => {
    expect(parseRecurringDescription("Akami")).toBeNull();
    expect(parseRecurringDescription("")).toBeNull();
  });

  test("handles colon in values (targetPrice with colon parts)", () => {
    const desc = "class:priceBinary|underlying:ETH|expiry:20260327-1500|targetPrice:3000|period:1d";
    const meta = parseRecurringDescription(desc);
    expect(meta!.underlying).toBe("ETH");
    expect(meta!.targetPrice).toBe(3000);
  });
});

describe("parseExpiryDate", () => {
  test("parses YYYYMMDD-HHMM format", () => {
    const d = parseExpiryDate("20260327-1400");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(2); // 0-indexed
    expect(d!.getUTCDate()).toBe(27);
    expect(d!.getUTCHours()).toBe(14);
    expect(d!.getUTCMinutes()).toBe(0);
  });

  test("returns null for empty string", () => {
    expect(parseExpiryDate("")).toBeNull();
  });

  test("returns null for malformed date", () => {
    expect(parseExpiryDate("bad-date")).toBeNull();
  });
});

describe("formatCountdown", () => {
  test("returns 'Settling...' for past dates", () => {
    const past = new Date(Date.now() - 1000);
    expect(formatCountdown(past)).toBe("Settling...");
  });

  test("formats seconds for <1min", () => {
    const soon = new Date(Date.now() + 30000); // 30s
    const result = formatCountdown(soon);
    expect(result).toMatch(/^\d+s$/);
  });

  test("formats minutes and seconds for <1hr", () => {
    const inFiveMin = new Date(Date.now() + 5 * 60 * 1000 + 30 * 1000);
    const result = formatCountdown(inFiveMin);
    expect(result).toMatch(/^\d+m \d+s$/);
  });

  test("formats hours for >1hr", () => {
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const result = formatCountdown(inTwoHours);
    expect(result).toMatch(/^\d+h \d+m$/);
  });
});

describe("formatPrice", () => {
  test("strips trailing zeros", () => {
    // At price 0.5: exp = floor(log10(0.5)) = -1, tick = 10^(-5) = 0.00001
    // round(0.5 / 0.00001) * 0.00001 = 50000 * 0.00001 = 0.5 → "0.5"
    expect(formatPrice(0.5)).toBe("0.5");
  });

  test("rounds to 5 significant figures", () => {
    // price = 0.65: exp = -1, tick = 0.00001
    // round(0.65 / 0.00001) * 0.00001 = 65000 * 0.00001 = 0.65 → "0.65"
    expect(formatPrice(0.65)).toBe("0.65");
  });

  test("handles price near 0", () => {
    expect(formatPrice(0)).toBe("0.00001");
  });

  test("handles price > 1", () => {
    // price = 1.5: exp = 0, tick = 10^(-4) = 0.0001
    // round(1.5 / 0.0001) * 0.0001 = 15000 * 0.0001 = 1.5 → "1.5"
    expect(formatPrice(1.5)).toBe("1.5");
  });
});

describe("getMinShares", () => {
  test("returns 20 for null midPrice", () => {
    expect(getMinShares(null)).toBe(20);
  });

  test("returns 20 for zero midPrice", () => {
    expect(getMinShares(0)).toBe(20);
  });

  test("calculates min shares for midPrice 0.5 (~20 for 10 USDH)", () => {
    // ceil(10 / 0.5) = 20
    expect(getMinShares(0.5)).toBe(20);
  });

  test("calculates higher min shares for low price", () => {
    // ceil(10 / 0.1) = 100
    expect(getMinShares(0.1)).toBe(100);
  });
});
