import { calculateValuation, currentMultiple, historicalMultiple, METHOD_KEYS, sectorMultiple, validPositive } from "./valuation.mjs?v=8";

const $ = (id) => document.getElementById(id);
const sar = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const methodNames = { growth: "متوسط النمو", sector: "متوسط مكرر القطاع", graham: "رقم جراهام", historical: "المكرر التاريخي" };
const methodControls = { growth: "useGrowth", sector: "useSector", graham: "useGraham", historical: "useHistorical" };
const sectorLabels = {
  banking: { title: "البنوك السعودية", subtitle: "القطاع البنكي", item: "بنوك", file: "ملف البنوك المرفق" },
  technology: { title: "قطاع التقنية", subtitle: "قطاع التقنية", item: "شركات", file: "ملف قطاع التطبيقات المرفق" },
  telecom: { title: "قطاع الاتصالات", subtitle: "قطاع الاتصالات", item: "شركات", file: "حزمة بيانات الاتصالات" },
  healthcare: { title: "قطاع الرعاية الصحية", subtitle: "قطاع الرعاية الصحية", item: "شركات", file: "حزمة بيانات الرعاية الصحية" },
};
const state = {
  banks: [],
  sectors: { banking: [], technology: [], telecom: [], healthcare: [] },
  sector: initialSector(),
  market: { status: "unconfigured", banks: {} },
  selected: "1120",
  selectedBySector: { banking: "1120", technology: "7202", telecom: "7010", healthcare: "4009" },
  telecomSources: {},
  healthcareSources: {},
  basis: "basic",
  manualOpen: true,
  manual: readSavedManual(),
  selections: readSavedSelections(),
  search: "",
};

function initialSector() {
  const sector = document.body.dataset.sector;
  return sector in sectorLabels ? sector : "banking";
}

function activateSector(sector) {
  state.selectedBySector[state.sector] = state.selected;
  state.sector = sector;
  state.banks = state.sectors[sector];
  state.selected = state.selectedBySector[sector];
  if (!state.banks.some((stock) => stock.symbol === state.selected)) state.selected = state.banks[0]?.symbol;
  state.search = "";
  $("bankSearch").value = "";
  syncForm();
  render();
}

function readSavedManual() {
  try { return JSON.parse(localStorage.getItem("mizan-current-inputs-v2") || "{}"); }
  catch { return {}; }
}

function saveManual() {
  try { localStorage.setItem("mizan-current-inputs-v2", JSON.stringify(state.manual)); }
  catch { /* Private browsing may block storage. The current page still works. */ }
}

function readSavedSelections() {
  try { return JSON.parse(localStorage.getItem("mizan-method-selection-v1") || "{}"); }
  catch { return {}; }
}

function saveSelections() {
  try { localStorage.setItem("mizan-method-selection-v1", JSON.stringify(state.selections)); }
  catch { /* The current page still works when local storage is unavailable. */ }
}

function selectedMethods(bank) {
  const saved = state.selections[bank.symbol] || {};
  return Object.fromEntries(METHOD_KEYS.map((key) => [key,
    bank.unavailableMethods?.includes(key) ? false
      : typeof saved[key] === "boolean" ? saved[key] : !bank.defaultExcludedMethods?.includes(key)]));
}

function num(value) {
  const number = typeof value === "number" ? value : Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function formatted(value) { return Number.isFinite(value) ? sar.format(value) : "—"; }
function formattedPct(value) { return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${pct.format(value)}%` : "—"; }
function selectedBank() { return state.banks.find((bank) => bank.symbol === state.selected) || state.banks[0]; }
function savedInputs(bank) {
  const saved = state.manual[bank.symbol] || {};
  const defaults = ["telecom", "healthcare"].includes(bank.sector) ? {
    basicEps: bank.current?.ttmBasicEpsApprox,
    dilutedEps: bank.current?.ttmDilutedEpsApprox,
    bookValue: bank.current?.bookValue,
  } : {};
  return {
    basicEps: num(saved.basicEps !== undefined ? saved.basicEps : defaults.basicEps),
    dilutedEps: num(saved.dilutedEps !== undefined ? saved.dilutedEps : defaults.dilutedEps),
    bookValue: num(saved.bookValue !== undefined ? saved.bookValue : defaults.bookValue),
  };
}

function currentInputs(bank) {
  const record = state.market.banks?.[bank.symbol] || {};
  const peers = Object.fromEntries(state.banks.map((peer) => [peer.symbol, {
    price: num(state.market.banks?.[peer.symbol]?.price),
    ...savedInputs(peer),
  }]));
  const sectorCount = Object.values(peers).filter((peer) => currentMultiple(
    peer.price, peer[state.basis === "diluted" ? "dilutedEps" : "basicEps"]) !== null).length;
  return {
    price: num(record.price),
    ...savedInputs(bank),
    sectorPe: state.sector === "healthcare" && sectorCount !== state.banks.length
      ? null : sectorMultiple(peers, state.basis),
    historicalPe: bank.unavailableMethods?.includes("historical") ? null : historicalMultiple(bank.annual),
    sectorCount,
  };
}

function renderBankList() {
  const list = $("bankList");
  list.replaceChildren();
  const query = state.search.trim().toLocaleLowerCase("ar");
  for (const bank of state.banks) {
    if (query && !`${bank.name} ${bank.symbol}`.toLocaleLowerCase("ar").includes(query)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bank${bank.symbol === state.selected ? " active" : ""}`;
    button.setAttribute("aria-current", bank.symbol === state.selected ? "true" : "false");
    const result = calculateValuation(bank, currentInputs(bank), state.basis, selectedMethods(bank));
    const heading = document.createElement("span");
    heading.className = "bank-heading";
    const name = document.createElement("span");
    name.className = "bank-name";
    name.textContent = bank.name;
    const code = document.createElement("span");
    code.className = "bank-code";
    code.textContent = bank.symbol;
    heading.append(name, code);
    const metrics = document.createElement("span");
    metrics.className = "bank-metrics";
    const fair = document.createElement("span");
    fair.className = "bank-metric";
    const fairLabel = document.createElement("small");
    fairLabel.textContent = "السعر العادل";
    const fairValue = document.createElement("strong");
    fairValue.textContent = Number.isFinite(result.fairPrice) ? `${formatted(result.fairPrice)} ر.س` : "—";
    fair.append(fairLabel, fairValue);
    const gap = document.createElement("span");
    gap.className = `bank-metric${result.gapPercent < 0 ? " negative" : ""}`;
    const gapLabel = document.createElement("small");
    gapLabel.textContent = "الفارق";
    const gapValue = document.createElement("strong");
    gapValue.textContent = formattedPct(result.gapPercent);
    gap.append(gapLabel, gapValue);
    metrics.append(fair, gap);
    button.append(heading, metrics);
    button.addEventListener("click", () => {
      state.selected = bank.symbol;
      syncForm();
      render();
    });
    list.append(button);
  }
  if (!list.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "side-foot";
    empty.textContent = "لا توجد نتائج مطابقة.";
    list.append(empty);
  }
}

function syncForm() {
  const bank = selectedBank();
  if (!bank) return;
  const inputs = savedInputs(bank);
  $("manualBasic").value = inputs.basicEps ?? "";
  $("manualDiluted").value = inputs.dilutedEps ?? "";
  $("manualBook").value = inputs.bookValue ?? "";
}

function renderHistory(bank) {
  const field = state.basis === "diluted" ? "dilutedEps" : "basicEps";
  const reported = bank.historicalEpsBasis === "unspecified";
  const referenceOnly = bank.historyReferenceOnly === true;
  const start = bank.annual[0].year;
  const end = bank.annual.at(-1).year;
  $("historyCaption").textContent = bank.sector === "healthcare" && bank.symbol === "4017"
    ? "ربح السهم الأساسي والمخفف للأعوام 2022–2025 من القوائم الأصلية؛ الأعوام الأقدم مرجع محسوب فقط."
    : referenceOnly
    ? `ربحية السهم للأعوام المالية المنتهية في مارس ${start}–${end} كما نُشرت؛ معروضة للمرجع فقط ولا تدخل حساب النمو.`
    : reported
    ? `ربحية السهم للأعوام ${start}–${end} كما وردت في الملف؛ لم يحدد الملف هل هي أساسية أم مخففة.`
    : `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"} للأعوام ${start}–${end} من الملف المرفق.`;
  const valueFor = (row) => referenceOnly ? row.asPublishedEps : reported ? row.reportedEps : row[field];
  const max = Math.max(...bank.annual.map((row) => Math.max(valueFor(row) || 0, 0)), 1);
  const bars = $("historyBars");
  bars.replaceChildren();
  bank.annual.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "bar-item";
    const value = document.createElement("span");
    value.textContent = formatted(valueFor(row));
    const bar = document.createElement("i");
    bar.className = "bar";
    bar.style.height = `${Math.max(4, Math.round(Math.max(valueFor(row) || 0, 0) / max * 62))}px`;
    const year = document.createElement("span");
    year.textContent = row.year;
    item.append(value, bar, year);
    if (index === bank.annual.length - 1) item.classList.add("latest");
    bars.append(item);
  });
}

function renderMethod(priceId, formulaId, gapId, price, gap, formula, included) {
  $(priceId).textContent = Number.isFinite(price) ? `${formatted(price)} ر.س` : "—";
  $(priceId).classList.toggle("empty", !Number.isFinite(price));
  $(formulaId).textContent = formula;
  $(gapId).textContent = gap === null ? "الفارق عن السعر الحالي: —" : `الفارق عن السعر الحالي: ${formattedPct(gap)}`;
  $(gapId).classList.toggle("negative", gap < 0);
  $(priceId).closest(".method").classList.toggle("excluded", !included);
}

function banner(bank, record) {
  const box = $("dataBanner");
  box.className = "data-banner";
  const telecomNote = bank.sector === "telecom"
    ? ` الربح الأساسي الابتدائي تقدير لآخر 12 شهرًا حتى ${bank.current.periodEnd}، محسوب من أرباح فترات مقربة؛ وليس ربحًا سنويًا معلنًا أو توقعًا. القيمة الدفترية الابتدائية من أرقام. يمكن تعديل القيم، وتُحفظ تعديلاتك محليًا.` : "";
  const healthcareNote = bank.sector === "healthcare"
    ? bank.current.ttmBasicEpsApprox !== null
      ? ` ربح السهم الأساسي والمخفف الابتدائيان تقديران لآخر 12 شهرًا حتى ${bank.current.periodEnd} من القوائم الأصلية؛ القيمة الدفترية الابتدائية من أرقام. يمكن تعديل القيم محليًا.`
      : ` آخر فترة مفحوصة حتى ${bank.current.periodEnd}. الربح الأساسي والمخفف لآخر 12 شهرًا غير متحقق منهما؛ أبقينا حقليهما فارغين. القيمة الدفترية الابتدائية من أرقام.`
    : "";
  if (!validPositive(record?.price)) {
    box.classList.add("error");
    box.textContent = `سعر هذه الشركة غير متاح حاليًا من ياهو فايننس؛ لا يمكن حساب المكرر الحالي أو الفارق عن السعر حتى تصل لقطة السوق.${telecomNote}${healthcareNote}`;
    return;
  }
  box.classList.add("good");
  const delayed = record.isDelayed === true ? "متأخر بحسب المزود" : "بحسب توقيت اللقطة";
  const historyNote = bank.historicalEpsBasis === "unspecified"
    ? ` بيانات هذا الملف التاريخية حتى ${bank.annual.at(-1).year} وربحية السهم فيه غير محددة النوع.` : "";
  box.textContent = ["telecom", "healthcare"].includes(bank.sector)
    ? `سعر السهم من ياهو فايننس (${delayed}).${telecomNote}${healthcareNote}${historyNote}`
    : `سعر السهم من ياهو فايننس (${delayed}). أدخل ربح السهم الأساسي والمخفف والقيمة الدفترية من أحدث إفصاح؛ المكررات تُحسب تلقائيًا.${historyNote}`;
}

function render() {
  const bank = selectedBank();
  if (!bank) return;
  const sector = sectorLabels[state.sector];
  for (const [key, id] of [["banking", "sectorBanking"], ["technology", "sectorTechnology"], ["telecom", "sectorTelecom"], ["healthcare", "sectorHealthcare"]]) {
    const active = state.sector === key;
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-pressed", String(active));
  }
  $("sideTitle").textContent = sector.title;
  $("bankSearch").placeholder = state.sector === "banking" ? "ابحث باسم البنك أو الرمز..." : "ابحث باسم الشركة أو الرمز...";
  $("bankSearch").setAttribute("aria-label", $("bankSearch").placeholder);
  $("sectorSubtitle").textContent = sector.subtitle;
  $("manualDescription").textContent = state.sector === "telecom"
    ? `القيم الابتدائية: ربح آخر 12 شهرًا التقريبي والقيمة الدفترية المنشورة. ربح الفترة الأخيرة وحده ليس ربح سنة. يمكن تعديل القيم؛ تبقى تعديلاتك على جهازك فقط.`
    : state.sector === "healthcare"
    ? `القيمة الدفترية الابتدائية منشورة لدى أرقام. الربح الأساسي والمخفف لآخر 12 شهرًا لا يُملآن إلا إذا تحققا؛ فقيه فقط لها تقدير من القوائم الأصلية. يمكنك إدخال قيم موثقة، وتُحفظ على جهازك.`
    : `أدخل ربح السهم الأساسي والمخفف والقيمة الدفترية لهذه الشركة من أحدث إفصاح. تُحفظ هذه القيم على جهازك فقط، ويجلب الموقع السعر من ياهو فايننس ويحسب المكررات تلقائيًا.`;
  $("manualHelp").textContent = state.sector === "telecom"
    ? `يُحسب مكرر القطاع من السعر الحالي وربح آخر 12 شهرًا التقريبي للشركات ذات البيانات المتاحة، دون رقم ثابت. المخفف غير المتحقق منه يظل فارغًا. تاريخ قو المالي ينتهي في مارس؛ النمو والمكرر التاريخي لها مستبعدان.`
    : state.sector === "healthcare"
    ? `تبقى أرباح ثماني شركات فارغة لأن ملخص المزود لا يحدد أساسها. لا يُحسب مكرر القطاع إلا إذا توفرت أرباح من الأساس المختار لجميع الشركات التسع. المكرر التاريخي مستبعد عند وجود قيم محجوبة أو غير متحققة.`
    : `لحساب متوسط مكرر القطاع، أدخل ربح السهم على الأساس المختار لجميع ${sector.item === "بنوك" ? "البنوك" : "الشركات"} في هذا القطاع. المكررات التاريخية مستخرجة من ${sector.file} ولا تحتاج إلى إدخال.`;
  const reference = $("healthcareReference");
  if (reference) {
    const current = bank.current;
    const periodLabel = current.periodMonths === 9 ? "تسعة أشهر" : "ستة أشهر";
    const calculated = current.calculatedTtmEpsFromProvider;
    reference.textContent = `مؤشرات مرجعية حتى ${current.periodEnd}: ربح ${periodLabel} لدى أرقام ${formatted(current.reportedPeriodEpsFromProvider)} ر.س؛ الربح المتكرر لآخر 12 شهرًا لدى أرقام ${formatted(current.providerRecurringTtmEps)} ر.س؛ ${calculated === null ? "الربح الأساسي والمخفف التقريبيان من القوائم الأصلية " + formatted(current.ttmBasicEpsApprox) : "حساب آخر 12 شهرًا من ملخص المزود " + formatted(calculated)} ر.س. لا تُستخدم أرقام المزود غير المصنفة كأساسي أو مخفف في التقييم.`;
  }
  const record = state.market.banks?.[bank.symbol];
  const input = currentInputs(bank);
  const included = selectedMethods(bank);
  const result = calculateValuation(bank, input, state.basis, included);
  renderBankList();
  $("ticker").textContent = bank.symbol;
  $("bankName").textContent = bank.name;
  $("fairValue").textContent = formatted(result.fairPrice);
  $("fairValue").classList.toggle("empty", result.fairPrice === null);
  $("marketPrice").textContent = formatted(input.price);
  $("gapValue").textContent = formattedPct(result.gapPercent);
  $("gapValue").style.color = result.gapPercent < 0 ? "#9a4236" : "";
  $("providerStatus").textContent = validPositive(input.price) ? "سعر من ياهو فايننس" : "السعر غير متاح";
  $("modeLabel").textContent = "مدخلاتك";
  $("manualPanel").hidden = !state.manualOpen;
  $("manualButton").setAttribute("aria-expanded", String(state.manualOpen));
  $("manualButton").textContent = state.manualOpen ? "إخفاء المدخلات" : "تعديل المدخلات";
  $("priceTitle").textContent = "آخر سعر للسهم";
  $("priceNote").textContent = !validPositive(input.price) ? "السعر غير متاح" : record?.isDelayed ? "سعر متأخر بحسب المزود" : "من لقطة ياهو فايننس";
  const date = record?.quoteUpdatedAt ? new Date(record.quoteUpdatedAt) : null;
  $("quoteTime").textContent = date && !Number.isNaN(date.getTime())
    ? `آخر سعر: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date)}`
    : "لم يحدد المزود وقت آخر سعر.";
  $("epsLabel").textContent = `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"}`;
  $("epsValue").textContent = formatted(result.eps);
  const epsEdited = state.manual[bank.symbol]?.[state.basis === "diluted" ? "dilutedEps" : "basicEps"] !== undefined;
  $("epsDetail").textContent = validPositive(result.eps)
    ? state.sector === "telecom" ? epsEdited ? "قيمة عدّلتها محليًا؛ راجع فترة الإفصاح" : `تقدير آخر 12 شهرًا حتى ${bank.current.periodEnd}` : "من إدخالك لهذه الشركة"
    : ["telecom", "healthcare"].includes(state.sector) ? "لم يُتحقق من هذه الربحية؛ يمكن إدخالها بعد التحقق" : "أدخل ربح السهم الحالي";
  if (state.sector === "healthcare" && validPositive(result.eps)) {
    $("epsDetail").textContent = epsEdited ? "قيمة عدّلتها محليًا؛ راجع فترة الإفصاح"
      : `تقدير من القوائم الأصلية لآخر 12 شهرًا حتى ${bank.current.periodEnd}`;
  }
  $("bookValue").textContent = formatted(input.bookValue);
  $("bookDetail").textContent = validPositive(input.bookValue)
    ? ["telecom", "healthcare"].includes(state.sector) ? state.manual[bank.symbol]?.bookValue !== undefined ? "قيمة عدّلتها محليًا" : "القيمة المنشورة لدى أرقام؛ قابلة للتعديل" : "من إدخالك لهذه الشركة"
    : "أدخل القيمة الدفترية الحالية";
  const pe = currentMultiple(input.price, result.eps);
  $("currentPe").textContent = formatted(pe);
  $("sectorPeReadout").textContent = formatted(input.sectorPe);
  $("historicalPeReadout").textContent = formatted(input.historicalPe);
  $("sectorCount").textContent = `${input.sectorCount} من ${state.banks.length} ${sector.item} في المتوسط`;
  $("growthValue").textContent = result.growthPercent === null ? "—" : `${formatted(result.growthPercent)}%`;
  $("growthDetail").textContent = bank.unavailableMethods?.includes("growth")
    ? "مستبعد بسبب عدم قابلية المقارنة" : `${result.growthPeriods.usedPeriods} من ${result.growthPeriods.possiblePeriods} فترات نمو صالحة`;
  $("growthMethodDetail").textContent = bank.unavailableMethods?.includes("growth")
    ? bank.unavailableReasons?.growth || "مستبعد لقو: لم توحّد سلسلة الأرباح السنوية بعد تغير رأس المال والسنة المالية."
    : `متوسط ${result.growthPeriods.usedPeriods} من ${result.growthPeriods.possiblePeriods} فترات نمو سنوية متتالية بربح سهم موجب في السنتين؛ تُستخدم النسبة كعدد في المعادلة المرفقة.${bank.historicalEpsBasis === "unspecified" ? " نوع ربحية السهم التاريخية غير محدد في الملف." : ""}`;
  $("basicButton").classList.toggle("active", state.basis === "basic");
  $("dilutedButton").classList.toggle("active", state.basis === "diluted");
  $("basicButton").setAttribute("aria-pressed", String(state.basis === "basic"));
  $("dilutedButton").setAttribute("aria-pressed", String(state.basis === "diluted"));
  for (const key of METHOD_KEYS) {
    $(methodControls[key]).checked = included[key];
    $(methodControls[key]).disabled = bank.unavailableMethods?.includes(key) === true;
  }
  $("selectedCount").textContent = `${result.includedMethods.length} من 4 ضمن المتوسط`;
  $("summaryCaption").textContent = result.includedMethods.length === 1
    ? "تقدير الطريقة المختارة، محسوب قبل تقريب العرض."
    : "متوسط حسابي للطرق المختارة، محسوب من النتائج قبل تقريبها للعرض.";
  if (result.fairPrice !== null) {
    const values = result.includedMethods.map((key) => formatted(result.methods[key])).join(" + ");
    $("averageEquation").textContent = `(${values}) ÷ ${result.includedMethods.length} ≈ ${formatted(result.fairPrice)}`;
  } else {
    const missing = result.includedMethods.filter((key) => !validPositive(result.methods[key])).map((key) => methodNames[key]);
    $("averageEquation").textContent = result.includedMethods.length
      ? `بانتظار بيانات: ${missing.join("، ")}` : "اختر طريقة واحدة على الأقل";
  }
  renderMethod("growthPrice", "growthFormula", "growthGap", result.methods.growth, result.methodGaps.growth,
    result.growthPercent === null || !validPositive(result.eps) ? "بيانات نمو غير كافية" : !validPositive(result.growthPercent) ? "متوسط النمو غير موجب" : `${formatted(result.eps)} × ${formatted(result.growthPercent)}`, included.growth);
  renderMethod("sectorPrice", "sectorFormula", "sectorGap", result.methods.sector, result.methodGaps.sector,
    validPositive(input.sectorPe) && validPositive(result.eps) ? `${formatted(result.eps)} × ${formatted(input.sectorPe)}` : "مكرر القطاع غير متاح", included.sector);
  renderMethod("grahamPrice", "grahamFormula", "grahamGap", result.methods.graham, result.methodGaps.graham,
    validPositive(input.bookValue) && validPositive(result.eps) ? `√(22.5 × ${formatted(result.eps)} × ${formatted(input.bookValue)})` : "القيمة الدفترية أو الربح غير متاح", included.graham);
  renderMethod("historicalPrice", "historicalFormula", "historicalGap", result.methods.historical, result.methodGaps.historical,
    validPositive(input.historicalPe) && validPositive(result.eps) ? `${formatted(result.eps)} × ${formatted(input.historicalPe)}` : "متوسط المكرر التاريخي غير متاح", included.historical);
  $("sectorDetail").textContent = state.sector === "healthcare"
    ? `لا يُحسب المتوسط حتى تتوافر أرباح موثقة على الأساس المختار وأسعار لجميع الشركات التسع؛ المتاح الآن ${input.sectorCount} من ${state.banks.length}.`
    : state.sector === "telecom"
    ? `المتوسط الحسابي لمكررات الشركات التي يتوفر لها سعر وربح آخر 12 شهرًا على الأساس المختار، بما فيها الشركة الحالية؛ ${input.sectorCount} من ${state.banks.length}.`
    : `المتوسط الحسابي للمكرر الحالي لشركات هذا القطاع التي أُدخل ربح سهمها على الأساس المختار، بما فيها الشركة الحالية؛ ${input.sectorCount} من ${state.banks.length}.`;
  const availableYears = bank.annual.filter((row) => validPositive(row.historicalPe)).length;
  $("historicalDetail").textContent = bank.unavailableMethods?.includes("historical")
    ? bank.unavailableReasons?.historical || "غير متاح لقو: تغيّر رأس المال والسنة المالية في مارس؛ القيم المنشورة معروضة للمرجع فقط."
    : `متوسط مكررات ${availableYears} من ${bank.annual.length} سنوات في ${sector.file}. نوع ربح السهم المستخدم في مكرر الملف غير محدد.`;
  $("historicalPeYears").textContent = `${availableYears} من ${bank.annual.length} سنوات متاحة`;
  const warnings = [...result.warnings];
  if (!validPositive(input.price)) warnings.push("سعر ياهو فايننس غير متاح حاليًا لهذه الشركة.");
  if (included.sector && !validPositive(input.sectorPe)) warnings.push(state.sector === "healthcare"
    ? "مكرر القطاع يحتاج ربحًا موثقًا على الأساس المختار وسعرًا لجميع الشركات التسع."
    : "لحساب مكرر القطاع، أدخل ربح السهم لشركة واحدة على الأقل، أو استبعد الطريقة.");
  if (state.sector === "healthcare" && availableYears === 1) warnings.push("المكرر التاريخي متاح لسنة واحدة فقط؛ لا يمثل متوسط سنوات متعددة.");
  if (included.historical && availableYears < bank.annual.length && availableYears > 0) warnings.push(`المكرر التاريخي محسوب من ${availableYears} سنوات متاحة من أصل ${bank.annual.length}.`);
  const warningPanel = $("warningPanel");
  warningPanel.hidden = warnings.length === 0;
  warningPanel.textContent = warnings.join(" • ");
  $("dataSource").textContent = state.sector === "healthcare"
    ? `السعر: ياهو فايننس؛ السلاسل ومؤشرات الفترات: أرقام، مع استثناء فقيه من قوائمها الأصلية؛ جمع البيانات: 2026-10-28. تختلف تواريخ أحدث إفصاح.`
    : state.sector === "telecom"
    ? `السعر: ياهو فايننس؛ الأرباح: الإفصاحات وحساب آخر 12 شهرًا؛ القيمة الدفترية والمكررات السنوية: أرقام؛ جمع البيانات: 2026-10-28. تختلف فترات الشركات.`
    : `السعر: ياهو فايننس؛ تاريخ الأرباح والمكررات: ${sector.file}؛ الأرباح الحالية والقيمة الدفترية: مدخلاتك المحلية`;
  const financialSourceLink = $("financialSourceLink");
  if (financialSourceLink) {
    const sources = state.sector === "healthcare" ? state.healthcareSources : state.telecomSources;
    const source = sources[bank.current.sourceIds[0]];
    financialSourceLink.href = source || "#sources";
    financialSourceLink.textContent = state.sector === "healthcare" ? "مصدر أحدث ربح" : "إفصاح الربح لهذه الشركة";
  }
  const annualSourceLink = $("annualSourceLink");
  if (annualSourceLink) annualSourceLink.href = state.healthcareSources[bank.annualSourceId] || "#sources";
  $("marketSourceLink").href = `https://finance.yahoo.com/quote/${bank.symbol}.SR/`;
  $("sourceTimestamp").textContent = state.market.generatedAt ? `إنشاء لقطة البيانات: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(state.market.generatedAt))}` : "";
  banner(bank, record);
  renderHistory(bank);
}

function attachEvents() {
  $("sectorBanking").addEventListener("click", () => { window.location.href = "./index.html"; });
  $("sectorTechnology").addEventListener("click", () => { window.location.href = "./technology.html"; });
  $("sectorTelecom").addEventListener("click", () => { window.location.href = "./telecom.html"; });
  $("sectorHealthcare").addEventListener("click", () => { window.location.href = "./healthcare.html"; });
  $("bankSearch").addEventListener("input", (event) => { state.search = event.target.value; renderBankList(); });
  $("basicButton").addEventListener("click", () => { state.basis = "basic"; render(); });
  $("dilutedButton").addEventListener("click", () => { state.basis = "diluted"; render(); });
  $("manualButton").addEventListener("click", () => {
    state.manualOpen = !state.manualOpen;
    render();
  });
  for (const [key, id] of Object.entries(methodControls)) {
    $(id).addEventListener("change", (event) => {
      state.selections[state.selected] ||= {};
      state.selections[state.selected][key] = event.target.checked;
      saveSelections();
      render();
    });
  }
  const fields = {
    manualBasic: "basicEps", manualDiluted: "dilutedEps", manualBook: "bookValue",
  };
  for (const [id, field] of Object.entries(fields)) {
    $(id).addEventListener("input", (event) => {
      state.manual[state.selected] ||= {};
      state.manual[state.selected][field] = event.target.value;
      saveManual();
      render();
    });
  }
}

async function load() {
  attachEvents();
  try {
    const [banksResponse, technologyResponse, telecomResponse, healthcareResponse, marketResponse] = await Promise.all([
      fetch("./data/banks.json", { cache: "no-store" }),
      fetch("./data/technology.json", { cache: "no-store" }),
      fetch("./data/telecom.json", { cache: "no-store" }),
      fetch("./data/healthcare.json", { cache: "no-store" }),
      fetch("./data/market.json", { cache: "no-store" }),
    ]);
    if (!banksResponse.ok || !technologyResponse.ok || !telecomResponse.ok || !healthcareResponse.ok) throw new Error("تعذر قراءة البيانات التاريخية للقطاعات.");
    state.sectors.banking = (await banksResponse.json()).banks;
    state.sectors.technology = (await technologyResponse.json()).stocks;
    const telecomData = await telecomResponse.json();
    state.sectors.telecom = telecomData.stocks;
    state.telecomSources = telecomData.sources;
    const healthcareData = await healthcareResponse.json();
    state.sectors.healthcare = healthcareData.stocks;
    state.healthcareSources = healthcareData.sources;
    state.market = marketResponse.ok ? await marketResponse.json() : state.market;
    activateSector(state.sector);
  } catch (error) {
    $("dataBanner").className = "data-banner error";
    $("dataBanner").textContent = `تعذر تحميل بيانات الصفحة: ${error.message}`;
    $("providerStatus").textContent = "تعذر التحميل";
  }
}

load();
