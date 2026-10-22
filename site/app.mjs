import { calculateValuation, currentMultiple, historicalMultiple, METHOD_KEYS, sectorMultiple, validPositive } from "./valuation.mjs?v=7";

const $ = (id) => document.getElementById(id);
const sar = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const methodNames = { growth: "متوسط النمو", sector: "متوسط مكرر القطاع", graham: "رقم جراهام", historical: "المكرر التاريخي" };
const methodControls = { growth: "useGrowth", sector: "useSector", graham: "useGraham", historical: "useHistorical" };
const sectorLabels = {
  banking: { title: "البنوك السعودية", subtitle: "القطاع البنكي", item: "بنوك", file: "ملف البنوك المرفق" },
  technology: { title: "قطاع التقنية", subtitle: "قطاع التقنية", item: "شركات", file: "ملف قطاع التطبيقات المرفق" },
};
const state = {
  banks: [],
  sectors: { banking: [], technology: [] },
  sector: initialSector(),
  market: { status: "unconfigured", banks: {} },
  selected: "1120",
  selectedBySector: { banking: "1120", technology: "7202" },
  basis: "basic",
  manualOpen: true,
  manual: readSavedManual(),
  selections: readSavedSelections(),
  search: "",
};

function initialSector() {
  return document.body.dataset.sector === "technology" ? "technology" : "banking";
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
  return Object.fromEntries(METHOD_KEYS.map((key) => [key, saved[key] !== false]));
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
  return {
    basicEps: num(saved.basicEps),
    dilutedEps: num(saved.dilutedEps),
    bookValue: num(saved.bookValue),
  };
}

function currentInputs(bank) {
  const record = state.market.banks?.[bank.symbol] || {};
  const peers = Object.fromEntries(state.banks.map((peer) => [peer.symbol, {
    price: num(state.market.banks?.[peer.symbol]?.price),
    ...savedInputs(peer),
  }]));
  return {
    price: num(record.price),
    ...savedInputs(bank),
    sectorPe: sectorMultiple(peers, state.basis),
    historicalPe: historicalMultiple(bank.annual),
    sectorCount: Object.values(peers).filter((peer) => currentMultiple(
      peer.price, peer[state.basis === "diluted" ? "dilutedEps" : "basicEps"]) !== null).length,
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
  const saved = state.manual[bank.symbol] || {};
  $("manualBasic").value = saved.basicEps ?? "";
  $("manualDiluted").value = saved.dilutedEps ?? "";
  $("manualBook").value = saved.bookValue ?? "";
}

function renderHistory(bank) {
  const field = state.basis === "diluted" ? "dilutedEps" : "basicEps";
  const reported = bank.historicalEpsBasis === "unspecified";
  const start = bank.annual[0].year;
  const end = bank.annual.at(-1).year;
  $("historyCaption").textContent = reported
    ? `ربحية السهم للأعوام ${start}–${end} كما وردت في الملف؛ لم يحدد الملف هل هي أساسية أم مخففة.`
    : `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"} للأعوام ${start}–${end} من الملف المرفق.`;
  const valueFor = (row) => reported ? row.reportedEps : row[field];
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
  if (!validPositive(record?.price)) {
    box.classList.add("error");
    box.textContent = "سعر هذه الشركة غير متاح حاليًا من ياهو فايننس؛ لا يمكن حساب المكرر الحالي أو الفارق عن السعر حتى تصل لقطة السوق.";
    return;
  }
  box.classList.add("good");
  const delayed = record.isDelayed === true ? "متأخر بحسب المزود" : "بحسب توقيت اللقطة";
  const historyNote = bank.historicalEpsBasis === "unspecified"
    ? ` بيانات هذا الملف التاريخية حتى ${bank.annual.at(-1).year} وربحية السهم فيه غير محددة النوع.` : "";
  box.textContent = `سعر السهم من ياهو فايننس (${delayed}). أدخل ربح السهم الأساسي والمخفف والقيمة الدفترية من أحدث إفصاح؛ المكررات تُحسب تلقائيًا.${historyNote}`;
}

function render() {
  const bank = selectedBank();
  if (!bank) return;
  const sector = sectorLabels[state.sector];
  for (const [key, id] of [["banking", "sectorBanking"], ["technology", "sectorTechnology"]]) {
    const active = state.sector === key;
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-pressed", String(active));
  }
  $("sideTitle").textContent = sector.title;
  $("bankSearch").placeholder = state.sector === "banking" ? "ابحث باسم البنك أو الرمز..." : "ابحث باسم الشركة أو الرمز...";
  $("bankSearch").setAttribute("aria-label", $("bankSearch").placeholder);
  $("sectorSubtitle").textContent = sector.subtitle;
  $("manualDescription").textContent = `أدخل ربح السهم الأساسي والمخفف والقيمة الدفترية لهذه الشركة من أحدث إفصاح. تُحفظ هذه القيم على جهازك فقط، ويجلب الموقع السعر من ياهو فايننس ويحسب المكررات تلقائيًا.`;
  $("manualHelp").textContent = `لحساب متوسط مكرر القطاع، أدخل ربح السهم على الأساس المختار لجميع ${sector.item === "بنوك" ? "البنوك" : "الشركات"} في هذا القطاع. المكررات التاريخية مستخرجة من ${sector.file} ولا تحتاج إلى إدخال.`;
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
  $("epsDetail").textContent = validPositive(result.eps) ? "من إدخالك لهذه الشركة" : "أدخل ربح السهم الحالي";
  $("bookValue").textContent = formatted(input.bookValue);
  $("bookDetail").textContent = validPositive(input.bookValue) ? "من إدخالك لهذه الشركة" : "أدخل القيمة الدفترية الحالية";
  const pe = currentMultiple(input.price, result.eps);
  $("currentPe").textContent = formatted(pe);
  $("sectorPeReadout").textContent = formatted(input.sectorPe);
  $("historicalPeReadout").textContent = formatted(input.historicalPe);
  $("sectorCount").textContent = `${input.sectorCount} من ${state.banks.length} ${sector.item} في المتوسط`;
  $("growthValue").textContent = result.growthPercent === null ? "—" : `${formatted(result.growthPercent)}%`;
  $("growthDetail").textContent = `${result.growthPeriods.usedPeriods} من ${result.growthPeriods.possiblePeriods} فترات نمو صالحة`;
  $("growthMethodDetail").textContent = `متوسط ${result.growthPeriods.usedPeriods} من ${result.growthPeriods.possiblePeriods} فترات نمو سنوية متتالية بربح سهم موجب في السنتين؛ تُستخدم النسبة كعدد في المعادلة المرفقة.${bank.historicalEpsBasis === "unspecified" ? " نوع ربحية السهم التاريخية غير محدد في الملف." : ""}`;
  $("basicButton").classList.toggle("active", state.basis === "basic");
  $("dilutedButton").classList.toggle("active", state.basis === "diluted");
  $("basicButton").setAttribute("aria-pressed", String(state.basis === "basic"));
  $("dilutedButton").setAttribute("aria-pressed", String(state.basis === "diluted"));
  for (const key of METHOD_KEYS) $(methodControls[key]).checked = included[key];
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
  $("sectorDetail").textContent = `المتوسط الحسابي للمكرر الحالي لشركات هذا القطاع التي أُدخل ربح سهمها على الأساس المختار، بما فيها الشركة الحالية؛ ${input.sectorCount} من ${state.banks.length}.`;
  const availableYears = bank.annual.filter((row) => validPositive(row.historicalPe)).length;
  $("historicalDetail").textContent = `متوسط مكررات ${availableYears} من ${bank.annual.length} سنوات في ${sector.file}. نوع ربح السهم المستخدم في مكرر الملف غير محدد.`;
  $("historicalPeYears").textContent = `${availableYears} من ${bank.annual.length} سنوات متاحة`;
  const warnings = [...result.warnings];
  if (!validPositive(input.price)) warnings.push("سعر ياهو فايننس غير متاح حاليًا لهذه الشركة.");
  if (included.sector && !validPositive(input.sectorPe)) warnings.push("لحساب مكرر القطاع، أدخل ربح السهم لشركة واحدة على الأقل، أو استبعد الطريقة.");
  if (included.historical && availableYears < bank.annual.length && availableYears > 0) warnings.push(`المكرر التاريخي محسوب من ${availableYears} سنوات متاحة من أصل ${bank.annual.length}.`);
  const warningPanel = $("warningPanel");
  warningPanel.hidden = warnings.length === 0;
  warningPanel.textContent = warnings.join(" • ");
  $("dataSource").textContent = `السعر: ياهو فايننس؛ تاريخ الأرباح والمكررات: ${sector.file}؛ الأرباح الحالية والقيمة الدفترية: مدخلاتك المحلية`;
  $("marketSourceLink").href = `https://finance.yahoo.com/quote/${bank.symbol}.SR/`;
  $("sourceTimestamp").textContent = state.market.generatedAt ? `إنشاء لقطة البيانات: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(state.market.generatedAt))}` : "";
  banner(bank, record);
  renderHistory(bank);
}

function attachEvents() {
  $("sectorBanking").addEventListener("click", () => { window.location.href = "./index.html"; });
  $("sectorTechnology").addEventListener("click", () => { window.location.href = "./technology.html"; });
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
    const [banksResponse, technologyResponse, marketResponse] = await Promise.all([
      fetch("./data/banks.json", { cache: "no-store" }),
      fetch("./data/technology.json", { cache: "no-store" }),
      fetch("./data/market.json", { cache: "no-store" }),
    ]);
    if (!banksResponse.ok || !technologyResponse.ok) throw new Error("تعذر قراءة البيانات التاريخية للقطاعات.");
    state.sectors.banking = (await banksResponse.json()).banks;
    state.sectors.technology = (await technologyResponse.json()).stocks;
    state.market = marketResponse.ok ? await marketResponse.json() : state.market;
    activateSector(state.sector);
  } catch (error) {
    $("dataBanner").className = "data-banner error";
    $("dataBanner").textContent = `تعذر تحميل بيانات الصفحة: ${error.message}`;
    $("providerStatus").textContent = "تعذر التحميل";
  }
}

load();
