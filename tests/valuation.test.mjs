import assert from "node:assert/strict";
import test from "node:test";
import { annualGrowth, calculateValuation, currentMultiple, historicalMultiple, peerMultiple } from "../site/valuation.mjs";

const bank = {
  annual: [2.65, 3.69, 4.29, 4.16, 4.93, 6.20].map((basicEps, index) => ({
    year: 2020 + index, basicEps, dilutedEps: basicEps,
  })),
  qualityFlags: [],
};

test("four exact methods are averaged before display rounding", () => {
  const result = calculateValuation(bank, {
    price: 88.4, basicEps: 6.2, bookValue: 28.71,
    sectorPe: 13.8, historicalPe: 16.2,
  });
  assert.ok(Math.abs(result.growthPercent - 19.349081412405482) < 1e-9);
  assert.ok(Math.abs(result.methods.growth - 119.96430475691399) < 1e-9);
  assert.ok(Math.abs(result.methods.sector - 85.56) < 1e-9);
  assert.ok(Math.abs(result.methods.graham - 63.28542486228563) < 1e-9);
  assert.ok(Math.abs(result.methods.historical - 100.44) < 1e-9);
  assert.ok(Math.abs(result.fairPrice - 92.3124324047999) < 1e-9);
});

test("sector multiple uses peers, not the selected bank's own price multiple", () => {
  assert.equal(peerMultiple("1120", {
    "1120": { price: 100, basicEps: 2 },
    "1180": { price: 24, basicEps: 2 },
    "1010": { price: 42, basicEps: 3 },
    "1060": { price: 99, basicEps: 0 },
  }), 13);
});

test("current multiple and workbook six-year multiple use their separate sources", () => {
  assert.equal(currentMultiple(88.4, 6.2), 88.4 / 6.2);
  assert.equal(currentMultiple(88.4, null), null);
  assert.equal(historicalMultiple([11, 12, 13, 14, 15, 16].map((historicalPe) => ({ historicalPe }))), 13.5);
  assert.equal(historicalMultiple([null, 12, 13, 14, 15, 16].map((historicalPe) => ({ historicalPe }))), null);
});

test("missing one method never produces a misleading four-method average", () => {
  const result = calculateValuation(bank, {
    price: 88.4, basicEps: 6.2, bookValue: 28.71, sectorPe: 13.8,
  });
  assert.equal(result.methods.historical, null);
  assert.equal(result.fairPrice, null);
});

test("loss year invalidates growth rather than dividing through a negative EPS", () => {
  const data = [{ basicEps: -2.02 }, { basicEps: 1.56 }, { basicEps: 2.35 }];
  assert.equal(annualGrowth(data), null);
});
