import { calculateValuation, peerMultiple, validPositive } from "./valuation.mjs";

const $ = (id) => document.getElementById(id);
const sar = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sample = {
  price: 88.4,
  basicEps: 6.2,
  dilutedEps: 5.85,
  bookValue: 28.71,
  sectorPe: 13.8,
  historicalPe: 16.2,
};

const state = {
  banks: [],
  market: { status: "unconfigured", banks: {} },
  selected: "1120",
  basis: "basic",
  mode: "demo",
  manual: readSavedManual(),
  search: "",
};

function readSavedManual() {
  try { return JSON.parse(localStorage.getItem("mizan-manual-v1") || "{}"); }
  catch { return {}; }
}

function saveManual() {
  try { localStorage.setItem("mizan-manual-v1", JSON.stringify(state.manual)); }
  catch { /* Private browsing may block storage. The current page still works. */ }
}

function num(value) {
  const number = typeof value === "number" ? value : Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function formatted(value) { return Number.isFinite(value) ? sar.format(value) : "—"; }
function formattedPct(value) { return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${pct.format(value)}%` : "—"; }
function selectedBank() { return state.banks.find((bank) => bank.symbol === state.selected) || state.banks[0]; }
function hasProviderData(symbol) {
  const record = state.market.banks?.[symbol];
  return record && (validPositive(record.price) || validPositive(record.basicEps));
}

function manualDefaults(bank) {
  const latest = bank.annual.at(-1);
  const saved = state.manual[bank.symbol] || {};
  return {
    price: num(saved.price),
    basicEps: num(saved.basicEps) ?? latest.basicEps,
    dilutedEps: num(saved.dilutedEps) ?? latest.dilutedEps,
    bookValue: num(saved.bookValue) ?? bank.workbookBookValue.value,
    sectorPe: num(saved.sectorPe),
    historicalPe: num(saved.historicalPe),
  };
}

function currentInputs(bank) {
  if (state.mode === "demo" && bank.symbol === "1120") return sample;
  if (state.mode === "manual") return manualDefaults(bank);
  if (state.mode === "history" || !hasProviderData(bank.symbol)) {
    const latest = bank.annual.at(-1);
    return {
      price: null, basicEps: latest.basicEps, dilutedEps: latest.dilutedEps,
      bookValue: bank.workbookBookValue.value, sectorPe: null, historicalPe: null,
    };
  }
  const record = state.market.banks[bank.symbol];
  return {
    price: num(record.price),
    basicEps: num(record.basicEps),
    dilutedEps: num(record.dilutedEps),
    bookValue: num(record.bookValue),
    sectorPe: peerMultiple(bank.symbol, state.market.banks, state.basis),
    historicalPe: state.basis === "diluted"
      ? num(record.historicalPe?.dilutedAverage)
      : num(record.historicalPe?.basicAverage),
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
    const name = document.createElement("span");
    name.textContent = bank.name;
    const code = document.createElement("span");
    code.className = "bank-code";
    code.textContent = bank.symbol;
    button.append(name, code);
    button.addEventListener("click", () => {
      state.selected = bank.symbol;
      if (state.mode !== "manual") state.mode = hasProviderData(bank.symbol) ? "provider" : bank.symbol === "1120" ? "demo" : "history";
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
  const latest = bank.annual.at(-1);
  $("manualPrice").value = saved.price ?? "";
  $("manualBasic").value = saved.basicEps ?? latest.basicEps;
  $("manualDiluted").value = saved.dilutedEps ?? latest.dilutedEps;
  $("manualBook").value = saved.bookValue ?? bank.workbookBookValue.value;
  $("manualSector").value = saved.sectorPe ?? "";
  $("manualHistorical").value = saved.historicalPe ?? "";
}

function renderHistory(bank) {
  const field = state.basis === "diluted" ? "dilutedEps" : "basicEps";
  $("historyCaption").textContent = `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"} للأعوام 2020–2025 من الملف المرفق.`;
  const max = Math.max(...bank.annual.map((row) => Math.max(row[field], 0)), 1);
  const bars = $("historyBars");
  bars.replaceChildren();
  bank.annual.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "bar-item";
    const value = document.createElement("span");
    value.textContent = formatted(row[field]);
    const bar = document.createElement("i");
    bar.className = "bar";
    bar.style.height = `${Math.max(4, Math.round(Math.max(row[field], 0) / max * 62))}px`;
    const year = document.createElement("span");
    year.textContent = row.year;
    item.append(value, bar, year);
    if (index === bank.annual.length - 1) item.classList.add("latest");
    bars.append(item);
  });
}

function renderMethod(priceId, formulaId, price, formula) {
  $(priceId).textContent = Number.isFinite(price) ? `${formatted(price)} ر.س` : "—";
  $(priceId).classList.toggle("empty", !Number.isFinite(price));
  $(formulaId).textContent = formula;
}

function banner(bank, record) {
  const box = $("dataBanner");
  box.className = "data-banner";
  if (state.mode === "demo") {
    box.textContent = "مثال توضيحي لمصرف الراجحي: سعر السهم ومكرراته افتراضية، والأرباح والقيمة الدفترية من الملف. اختر «إدخال يدوي» للتجربة بقيمك.";
    return;
  }
  if (state.mode === "manual") {
    box.textContent = "وضع الإدخال اليدوي: مدخلات التقييم من اختيارك، وتاريخ أرباح السهم من ملف البنوك. القيم المخزنة هنا محلية على جهازك.";
    return;
  }
  if (state.mode === "history") {
    box.textContent = "تاريخ ربح السهم من ملف البنوك متاح. يلزم سعر السوق والمكررات والقيمة الدفترية المحدثة لإكمال السعر العادل؛ يمكنك تجربة إدخالها يدويًا.";
    return;
  }
  if (!record) {
    box.classList.add("error");
    box.textContent = "لم تصل بيانات سوق لهذا البنك. استخدم الإدخال اليدوي أو تحقق من إعداد مفتاح مزود البيانات.";
    return;
  }
  box.classList.add("good");
  const delayed = record.isDelayed === true ? "متأخرة بحسب المزود" : "بحسب حالة المزود";
  box.textContent = `بيانات سهمك ${delayed}. تاريخ فترة الأساسيات غير محدد في الاستجابة؛ تحقق من آخر إفصاح قبل الاعتماد عليها.`;
}

function render() {
  const bank = selectedBank();
  if (!bank) return;
  const record = state.market.banks?.[bank.symbol];
  const input = currentInputs(bank);
  const result = calculateValuation(bank, input, state.basis);
  renderBankList();
  $("ticker").textContent = bank.symbol;
  $("bankName").textContent = bank.name;
  $("fairValue").textContent = formatted(result.fairPrice);
  $("fairValue").classList.toggle("empty", result.fairPrice === null);
  $("marketPrice").textContent = formatted(input.price);
  $("gapValue").textContent = formattedPct(result.gapPercent);
  $("gapValue").style.color = result.gapPercent < 0 ? "#9a4236" : "";
  $("providerStatus").textContent = state.mode === "provider" ? "بيانات سهمك" : state.mode === "demo" ? "مثال توضيحي" : state.mode === "manual" ? "إدخال يدوي" : "بيانات تاريخية";
  $("modeLabel").textContent = state.mode === "provider" ? "بيانات المزود" : state.mode === "demo" ? "مثال" : state.mode === "manual" ? "مدخلاتك" : "الملف";
  $("manualPanel").hidden = state.mode !== "manual";
  $("manualButton").setAttribute("aria-expanded", String(state.mode === "manual"));
  $("manualButton").textContent = state.mode === "manual" ? "إغلاق الإدخال" : "إدخال يدوي";
  $("priceTitle").textContent = state.mode === "provider" ? "آخر سعر للسهم" : "سعر السهم المدخل";
  $("priceNote").textContent = state.mode === "demo" ? "سعر افتراضي للتوضيح" : state.mode === "manual" ? "من مدخلاتك" : state.mode === "history" ? "السعر غير متاح" : record?.isDelayed ? "سعر متأخر بحسب المزود" : "حالة التأخير بحسب المزود";
  const date = state.mode === "provider" && record?.quoteUpdatedAt ? new Date(record.quoteUpdatedAt) : null;
  $("quoteTime").textContent = date && !Number.isNaN(date.getTime())
    ? `آخر سعر: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date)}`
    : state.mode === "provider" ? "لم يحدد المزود وقت آخر سعر." : "هذه القيمة ليست سعر سوق مباشرًا.";
  $("epsLabel").textContent = `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"}`;
  $("epsValue").textContent = formatted(result.eps);
  $("epsDetail").textContent = state.mode === "provider" ? "من مزود البيانات؛ راجع فترة التقرير" : state.mode === "manual" ? "من الملف أو إدخالك" : "من ملف 2025";
  $("bookValue").textContent = formatted(input.bookValue);
  $("bookDetail").textContent = state.mode === "provider" ? "من مزود البيانات" : "تاريخ القيمة في الملف غير محدد";
  $("growthValue").textContent = result.growthPercent === null ? "—" : `${formatted(result.growthPercent)}%`;
  $("basicButton").classList.toggle("active", state.basis === "basic");
  $("dilutedButton").classList.toggle("active", state.basis === "diluted");
  $("basicButton").setAttribute("aria-pressed", String(state.basis === "basic"));
  $("dilutedButton").setAttribute("aria-pressed", String(state.basis === "diluted"));
  if (result.fairPrice !== null) {
    const values = Object.values(result.methods).map(formatted).join(" + ");
    $("averageEquation").textContent = `(${values}) ÷ 4 ≈ ${formatted(result.fairPrice)}`;
  } else {
    $("averageEquation").textContent = "بانتظار اكتمال قيم الطرق الأربع";
  }
  renderMethod("growthPrice", "growthFormula", result.methods.growth,
    result.growthPercent === null || !validPositive(result.eps) ? "بيانات نمو غير صالحة" : `${formatted(result.eps)} × ${formatted(result.growthPercent)}`);
  renderMethod("sectorPrice", "sectorFormula", result.methods.sector,
    validPositive(input.sectorPe) && validPositive(result.eps) ? `${formatted(result.eps)} × ${formatted(input.sectorPe)}` : "مكرر القطاع غير متاح");
  renderMethod("grahamPrice", "grahamFormula", result.methods.graham,
    validPositive(input.bookValue) && validPositive(result.eps) ? `√(22.5 × ${formatted(result.eps)} × ${formatted(input.bookValue)})` : "القيمة الدفترية أو الربح غير متاح");
  renderMethod("historicalPrice", "historicalFormula", result.methods.historical,
    validPositive(input.historicalPe) && validPositive(result.eps) ? `${formatted(result.eps)} × ${formatted(input.historicalPe)}` : "متوسط المكرر التاريخي غير متاح");
  $("sectorDetail").textContent = state.mode === "provider" ? "وسيط مكررات البنوك النظيرة المحسوب من السعر وربح السهم المختار، مع استبعاد هذا البنك." : "أدخل مكرر القطاع من مصدر موثق؛ القيمة التجريبية معروضة في المثال فقط.";
  $("historicalDetail").textContent = state.mode === "provider"
    ? `متوسط ست سنوات؛ السنوات المتاحة: ${record?.historicalPe?.observations?.length ?? 0} من 6. يلزم مراجعة أثر إجراءات رأس المال.`
    : "أدخل متوسط المكرر التاريخي من مصدر موثق؛ القيمة التجريبية معروضة في المثال فقط.";
  const warnings = [...result.warnings];
  if (state.mode === "provider" && record && !record.historicalPe?.complete) warnings.push("سلسلة الأسعار التاريخية لا تغطي السنوات الست المطلوبة.");
  const warningPanel = $("warningPanel");
  warningPanel.hidden = warnings.length === 0;
  warningPanel.textContent = warnings.join(" • ");
  $("dataSource").textContent = state.mode === "provider" ? "السعر والأساسيات: سهمك؛ تاريخ الأرباح: ملف البنوك المرفق" : "تاريخ الأرباح والقيمة الدفترية الأصلية: ملف البنوك المرفق";
  $("sourceTimestamp").textContent = state.mode === "provider" && state.market.generatedAt ? `إنشاء لقطة البيانات: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(state.market.generatedAt))}` : "";
  banner(bank, record);
  renderHistory(bank);
}

function attachEvents() {
  $("bankSearch").addEventListener("input", (event) => { state.search = event.target.value; renderBankList(); });
  $("basicButton").addEventListener("click", () => { state.basis = "basic"; render(); });
  $("dilutedButton").addEventListener("click", () => { state.basis = "diluted"; render(); });
  $("manualButton").addEventListener("click", () => {
    state.mode = state.mode === "manual"
      ? hasProviderData(state.selected) ? "provider" : state.selected === "1120" ? "demo" : "history"
      : "manual";
    syncForm();
    render();
  });
  const fields = {
    manualPrice: "price", manualBasic: "basicEps", manualDiluted: "dilutedEps",
    manualBook: "bookValue", manualSector: "sectorPe", manualHistorical: "historicalPe",
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
    const [banksResponse, marketResponse] = await Promise.all([
      fetch("./data/banks.json", { cache: "no-store" }),
      fetch("./data/market.json", { cache: "no-store" }),
    ]);
    if (!banksResponse.ok) throw new Error("تعذر قراءة تاريخ البنوك.");
    state.banks = (await banksResponse.json()).banks;
    state.market = marketResponse.ok ? await marketResponse.json() : state.market;
    state.mode = hasProviderData(state.selected) ? "provider" : "demo";
    syncForm();
    render();
  } catch (error) {
    $("dataBanner").className = "data-banner error";
    $("dataBanner").textContent = `تعذر تحميل بيانات الصفحة: ${error.message}`;
    $("providerStatus").textContent = "تعذر التحميل";
  }
}

load();
