export function validPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function average(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function annualGrowthDetails(annual, basis = "basic") {
  const field = basis === "diluted" ? "dilutedEps" : "basicEps";
  if (!Array.isArray(annual) || annual.length < 2) {
    return { average: null, usedPeriods: 0, possiblePeriods: 0 };
  }
  const rates = [];
  for (let index = 1; index < annual.length; index++) {
    const previous = annual[index - 1];
    const current = annual[index];
    if (!validPositive(previous?.[field]) || !validPositive(current?.[field])) continue;
    if (Number.isInteger(previous.year) && Number.isInteger(current.year) && current.year !== previous.year + 1) continue;
    rates.push((current[field] / previous[field] - 1) * 100);
  }
  return { average: average(rates), usedPeriods: rates.length, possiblePeriods: annual.length - 1 };
}

export function annualGrowth(annual, basis = "basic") {
  return annualGrowthDetails(annual, basis).average;
}

export function sectorMultiple(marketBanks, basis = "basic") {
  const field = basis === "diluted" ? "dilutedEps" : "basicEps";
  const multiples = Object.values(marketBanks || {})
    .map((bank) => validPositive(bank?.price) && validPositive(bank?.[field])
      ? bank.price / bank[field] : null)
    .filter(validPositive);
  return average(multiples);
}

export function historicalMultiple(annual) {
  if (!Array.isArray(annual)) return null;
  const ratios = annual.map((row) => row.historicalPe).filter(validPositive);
  return average(ratios);
}

export function currentMultiple(price, eps) {
  return validPositive(price) && validPositive(eps) ? price / eps : null;
}

export const METHOD_KEYS = ["growth", "sector", "graham", "historical"];

export function priceGapPercent(value, price) {
  return validPositive(value) && validPositive(price) ? (value / price - 1) * 100 : null;
}

export function calculateValuation(bank, inputs, basis = "basic", selectedMethods = {}) {
  const eps = basis === "diluted" ? inputs?.dilutedEps : inputs?.basicEps;
  const growth = annualGrowthDetails(bank.annual, basis);
  const growthPercent = growth.average;
  const bookValue = inputs?.bookValue;
  const sectorPe = inputs?.sectorPe;
  const historicalPe = inputs?.historicalPe;
  const price = inputs?.price;
  const methods = {
    growth: validPositive(eps) && validPositive(growthPercent) ? eps * growthPercent : null,
    sector: validPositive(eps) && validPositive(sectorPe) ? eps * sectorPe : null,
    graham: validPositive(eps) && validPositive(bookValue)
      ? Math.sqrt(22.5 * eps * bookValue) : null,
    historical: validPositive(eps) && validPositive(historicalPe) ? eps * historicalPe : null,
  };
  const includedMethods = METHOD_KEYS.filter((key) => selectedMethods?.[key] !== false);
  const values = includedMethods.map((key) => methods[key]);
  const fairPrice = values.length > 0 && values.every(validPositive) ? average(values) : null;
  const gapPercent = priceGapPercent(fairPrice, price);
  const methodGaps = Object.fromEntries(METHOD_KEYS.map((key) => [key, priceGapPercent(methods[key], price)]));
  const warnings = [...(bank.qualityFlags || [])];
  if (includedMethods.includes("growth") && growthPercent === null) warnings.push("لا توجد فترات نمو سنوية صالحة بين سنتين بربح سهم موجب؛ يمكنك استبعاد هذه الطريقة.");
  else if (includedMethods.includes("growth") && growth.usedPeriods < growth.possiblePeriods) {
    warnings.push(`متوسط النمو محسوب من ${growth.usedPeriods} فترات صالحة من أصل ${growth.possiblePeriods}؛ استُبعدت فترات الخسارة أو القيم الناقصة.`);
  }
  if (includedMethods.includes("growth") && growthPercent !== null && !validPositive(growthPercent)) {
    warnings.push("متوسط النمو غير موجب؛ هذه الطريقة لا تعطي سعرًا عادلًا موجبًا وفق المعادلة المرفقة.");
  }
  if (includedMethods.includes("growth") && validPositive(growthPercent) && growthPercent > 50) {
    warnings.push("متوسط النمو مرتفع جدًا؛ قد يهيمن على المتوسط النهائي.");
  }
  if (!includedMethods.length) warnings.push("اختر طريقة واحدة على الأقل لحساب السعر العادل.");
  else if (fairPrice === null) warnings.push("السعر العادل يحتاج بيانات صالحة لكل طريقة اخترتها.");
  return { eps, growthPercent, growthPeriods: growth, methods, methodGaps, includedMethods, fairPrice, gapPercent, warnings };
}
