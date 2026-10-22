export function validPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function average(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values) {
  const sorted = values.filter(validPositive).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function annualGrowth(annual, basis = "basic") {
  const field = basis === "diluted" ? "dilutedEps" : "basicEps";
  if (!Array.isArray(annual) || annual.length < 2) return null;
  const values = annual.map((year) => year[field]);
  if (values.some((value) => !validPositive(value))) return null;
  return average(values.slice(1).map((value, index) => (value / values[index] - 1) * 100));
}

export function peerMultiple(symbol, marketBanks, basis = "basic") {
  const field = basis === "diluted" ? "dilutedEps" : "basicEps";
  return median(Object.entries(marketBanks || {})
    .filter(([peerSymbol]) => peerSymbol !== symbol)
    .map(([, peer]) => validPositive(peer?.price) && validPositive(peer?.[field])
      ? peer.price / peer[field] : null));
}

export function historicalMultiple(annual) {
  if (!Array.isArray(annual) || annual.length !== 6) return null;
  const ratios = annual.map((row) => row.historicalPe);
  return ratios.every(validPositive) ? average(ratios) : null;
}

export function currentMultiple(price, eps) {
  return validPositive(price) && validPositive(eps) ? price / eps : null;
}

export function calculateValuation(bank, inputs, basis = "basic") {
  const eps = basis === "diluted" ? inputs?.dilutedEps : inputs?.basicEps;
  const growthPercent = annualGrowth(bank.annual, basis);
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
  const values = Object.values(methods);
  const fairPrice = values.every(validPositive) ? average(values) : null;
  const gapPercent = validPositive(fairPrice) && validPositive(price)
    ? (fairPrice / price - 1) * 100 : null;
  const warnings = [...(bank.qualityFlags || [])];
  if (growthPercent === null) warnings.push("تعذر حساب نمو ربح السهم بسبب سنة خاسرة أو قيمة ناقصة.");
  if (validPositive(growthPercent) && growthPercent > 50) {
    warnings.push("متوسط النمو مرتفع جدًا؛ قد يهيمن على المتوسط النهائي.");
  }
  if (fairPrice === null) warnings.push("السعر العادل يحتاج مدخلات صالحة للطرق الأربع كلها.");
  return { eps, growthPercent, methods, fairPrice, gapPercent, warnings };
}
