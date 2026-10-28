import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { annualGrowth, annualGrowthDetails, calculateValuation, currentMultiple, historicalMultiple, sectorMultiple, priceGapPercent } from "../site/valuation.mjs";

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

test("sector multiple averages all valid banks including the selected bank", () => {
  const banks = {
    "1120": { price: 100, basicEps: 2 },
    "1180": { price: 24, basicEps: 2 },
    "1010": { price: 42, basicEps: 3 },
    "1060": { price: 99, basicEps: 0 },
  };
  assert.equal(sectorMultiple(banks), (50 + 12 + 14) / 3);
  assert.equal(sectorMultiple(banks, "diluted"), null);
  assert.equal(sectorMultiple({ ...banks, "1120": { ...banks["1120"], dilutedEps: 4 } }, "diluted"), 25);
});

test("sector multiple divides the sum of all ten bank multiples by ten", () => {
  const banks = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
    String(index), { price: index === 0 ? 18 : 8, basicEps: 1 },
  ]));
  assert.equal(sectorMultiple(banks), 9);
});

test("current multiple and workbook multiple use their separate sources", () => {
  assert.equal(currentMultiple(88.4, 6.2), 88.4 / 6.2);
  assert.equal(currentMultiple(88.4, null), null);
  assert.equal(historicalMultiple([11, 12, 13, 14, 15, 16].map((historicalPe) => ({ historicalPe }))), 13.5);
  assert.equal(historicalMultiple([null, 12, 13, 14, 15, 16].map((historicalPe) => ({ historicalPe }))), 14);
  assert.equal(historicalMultiple([{ historicalPe: null }]), null);
});

test("Saudi Awwal historical multiple averages five available workbook years", () => {
  const banks = JSON.parse(fs.readFileSync(new URL("../site/data/banks.json", import.meta.url), "utf8")).banks;
  const awwal = banks.find((item) => item.symbol === "1060");
  assert.equal(awwal.annual[0].basicEps, -2.02);
  assert.equal(awwal.annual[0].historicalPe, null);
  assert.ok(Math.abs(historicalMultiple(awwal.annual) - 13.112) < 1e-9);
});

test("missing one method never produces a misleading four-method average", () => {
  const result = calculateValuation(bank, {
    price: 88.4, basicEps: 6.2, bookValue: 28.71, sectorPe: 13.8,
  });
  assert.equal(result.methods.historical, null);
  assert.equal(result.fairPrice, null);
});

test("two or three selected methods average only their unrounded values", () => {
  const inputs = { price: 88.4, basicEps: 6.2, bookValue: 28.71, sectorPe: 13.8, historicalPe: 16.2 };
  const two = calculateValuation(bank, inputs, "basic", { growth: false, sector: false });
  assert.deepEqual(two.includedMethods, ["graham", "historical"]);
  assert.equal(two.fairPrice, (two.methods.graham + two.methods.historical) / 2);
  const three = calculateValuation(bank, inputs, "basic", { growth: false });
  assert.equal(three.fairPrice, (three.methods.sector + three.methods.graham + three.methods.historical) / 3);
  assert.equal(two.methodGaps.historical, priceGapPercent(two.methods.historical, inputs.price));
});

test("an unavailable excluded method does not block the selected average", () => {
  const result = calculateValuation(bank, {
    price: 88.4, basicEps: 6.2, bookValue: 28.71, historicalPe: 16.2,
  }, "basic", { sector: false });
  assert.equal(result.methods.sector, null);
  assert.equal(result.includedMethods.length, 3);
  assert.ok(result.fairPrice > 0);
  assert.equal(calculateValuation(bank, { basicEps: 6.2 }, "basic",
    { growth: false, sector: false, graham: false, historical: false }).fairPrice, null);
});

test("growth uses positive adjacent years while skipping a loss transition", () => {
  const data = [-2.02, 1.56, 2.35, 3.41, 3.93, 4.11]
    .map((basicEps, index) => ({ year: 2020 + index, basicEps }));
  const expected = [2.35 / 1.56, 3.41 / 2.35, 3.93 / 3.41, 4.11 / 3.93]
    .map((ratio) => (ratio - 1) * 100).reduce((sum, rate) => sum + rate, 0) / 4;
  const details = annualGrowthDetails(data);
  assert.equal(details.usedPeriods, 4);
  assert.equal(details.possiblePeriods, 5);
  assert.ok(Math.abs(details.average - expected) < 1e-9);
  assert.equal(annualGrowth(data), details.average);
});

test("technology growth uses reported historical EPS for either current EPS basis", () => {
  const stocks = JSON.parse(fs.readFileSync(new URL("../site/data/technology.json", import.meta.url), "utf8")).stocks;
  const solutions = stocks.find((stock) => stock.symbol === "7202");
  const basic = annualGrowthDetails(solutions.annual, "basic");
  const diluted = annualGrowthDetails(solutions.annual, "diluted");
  assert.equal(basic.usedPeriods, 6);
  assert.equal(basic.average, diluted.average);
  assert.equal(solutions.annual.at(-1).reportedEps, 13.4);
  assert.equal(historicalMultiple(solutions.annual), (27.8 + 27.5 + 35.1 + 20.2) / 4);
  const valuation = calculateValuation(solutions, {
    price: 89.55, basicEps: 4.2, dilutedEps: 4.1, bookValue: 25,
    sectorPe: 30, historicalPe: historicalMultiple(solutions.annual),
  });
  assert.equal(valuation.includedMethods.length, 4);
  assert.ok(valuation.includedMethods.every((method) => valuation.methods[method] > 0));
  assert.equal(valuation.fairPrice, valuation.includedMethods
    .reduce((sum, method) => sum + valuation.methods[method], 0) / 4);
});

test("growth does not turn a gap into a one-year increase", () => {
  const data = [
    { year: 2020, basicEps: 2 },
    { year: 2021, basicEps: null },
    { year: 2023, basicEps: 4 },
    { year: 2024, basicEps: 5 },
  ];
  assert.equal(annualGrowthDetails(data).usedPeriods, 1);
  assert.equal(annualGrowth(data), 25);
  assert.equal(annualGrowth([{ basicEps: -2 }, { basicEps: 3 }]), null);
});

test("Saudi Awwal can use growth and historical methods from available periods", () => {
  const banks = JSON.parse(fs.readFileSync(new URL("../site/data/banks.json", import.meta.url), "utf8")).banks;
  const awwal = banks.find((item) => item.symbol === "1060");
  const result = calculateValuation(awwal, {
    price: 30.98, basicEps: 4.11, historicalPe: historicalMultiple(awwal.annual),
  }, "basic", { sector: false, graham: false });
  assert.equal(result.growthPeriods.usedPeriods, 4);
  assert.deepEqual(result.includedMethods, ["growth", "historical"]);
  assert.ok(result.methods.growth > 0);
  assert.ok(result.fairPrice > 0);
});

test("healthcare data excludes growth where share bases changed", () => {
  const stocks = JSON.parse(fs.readFileSync(new URL("../site/data/healthcare.json", import.meta.url), "utf8")).stocks;
  const dallah = stocks.find((stock) => stock.symbol === "4004");
  const result = calculateValuation(dallah, {
    price: 100, basicEps: 3.63, bookValue: 33.88, historicalPe: 35,
  }, "basic", { growth: false, sector: false });
  assert.equal(result.growthPercent, null);
  assert.equal(result.methods.growth, null);
  assert.ok(result.methods.graham > 0);
});
