import { calculateValuation, currentMultiple, historicalMultiple, peerMultiple, validPositive } from "./valuation.mjs?v=3";

const $ = (id) => document.getElementById(id);
const sar = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const state = {
  banks: [],
  market: { status: "unconfigured", banks: {} },
  selected: "1120",
  basis: "basic",
  manualOpen: true,
  manual: readSavedManual(),
  search: "",
};

function readSavedManual() {
  try { return JSON.parse(localStorage.getItem("mizan-current-inputs-v2") || "{}"); }
  catch { return {}; }
}

function saveManual() {
  try { localStorage.setItem("mizan-current-inputs-v2", JSON.stringify(state.manual)); }
  catch { /* Private browsing may block storage. The current page still works. */ }
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
    sectorPe: peerMultiple(bank.symbol, peers, state.basis),
    historicalPe: historicalMultiple(bank.annual),
    peerCount: Object.entries(peers).filter(([symbol, peer]) => symbol !== bank.symbol
      && currentMultiple(peer.price, peer[state.basis === "diluted" ? "dilutedEps" : "basicEps"]) !== null).length,
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
  if (!validPositive(record?.price)) {
    box.classList.add("error");
    box.textContent = "سعر هذا البنك غير متاح حاليًا من سهمك؛ لا يمكن حساب المكرر الحالي أو الفارق عن السعر حتى تصل لقطة السوق.";
    return;
  }
  box.classList.add("good");
  const delayed = record.isDelayed === true ? "متأخر بحسب المزود" : "بحسب توقيت اللقطة";
  box.textContent = `سعر السهم من سهمك (${delayed}). أدخل ربح السهم الأساسي والمخفف والقيمة الدفترية من أحدث إفصاح لكل بنك؛ المكررات تُحسب تلقائيًا.`;
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
  $("providerStatus").textContent = validPositive(input.price) ? "سعر من سهمك" : "السعر غير متاح";
  $("modeLabel").textContent = "مدخلاتك";
  $("manualPanel").hidden = !state.manualOpen;
  $("manualButton").setAttribute("aria-expanded", String(state.manualOpen));
  $("manualButton").textContent = state.manualOpen ? "إخفاء المدخلات" : "تعديل المدخلات";
  $("priceTitle").textContent = "آخر سعر للسهم";
  $("priceNote").textContent = !validPositive(input.price) ? "السعر غير متاح" : record?.isDelayed ? "سعر متأخر بحسب المزود" : "من لقطة سهمك";
  const date = record?.quoteUpdatedAt ? new Date(record.quoteUpdatedAt) : null;
  $("quoteTime").textContent = date && !Number.isNaN(date.getTime())
    ? `آخر سعر: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date)}`
    : "لم يحدد المزود وقت آخر سعر.";
  $("epsLabel").textContent = `ربح السهم ${state.basis === "diluted" ? "المخفف" : "الأساسي"}`;
  $("epsValue").textContent = formatted(result.eps);
  $("epsDetail").textContent = validPositive(result.eps) ? "من إدخالك لهذا البنك" : "أدخل ربح السهم الحالي";
  $("bookValue").textContent = formatted(input.bookValue);
  $("bookDetail").textContent = validPositive(input.bookValue) ? "من إدخالك لهذا البنك" : "أدخل القيمة الدفترية الحالية";
  const pe = currentMultiple(input.price, result.eps);
  $("currentPe").textContent = formatted(pe);
  $("sectorPeReadout").textContent = formatted(input.sectorPe);
  $("historicalPeReadout").textContent = formatted(input.historicalPe);
  $("peerCount").textContent = `${input.peerCount} من ${Math.max(0, state.banks.length - 1)} بنوك نظيرة`;
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
  $("sectorDetail").textContent = `وسيط المكرر الحالي للبنوك النظيرة التي أُدخل ربح سهمها على الأساس المختار؛ ${input.peerCount} من ${Math.max(0, state.banks.length - 1)}.`;
  const availableYears = bank.annual.filter((row) => validPositive(row.historicalPe)).length;
  $("historicalDetail").textContent = `متوسط مكررات ${availableYears} من 6 سنوات في ملف البنوك؛ لا يُحسب إن نقصت سنة. نوع ربح السهم المستخدم في مكرر الملف غير محدد.`;
  const warnings = [...result.warnings];
  if (!validPositive(input.price)) warnings.push("سعر سهمك غير متاح حاليًا لهذا البنك.");
  if (!validPositive(input.sectorPe)) warnings.push("لحساب مكرر القطاع، أدخل ربح السهم لبنك نظير واحد على الأقل.");
  if (availableYears < 6) warnings.push(`المكرر التاريخي في ملف البنوك يغطي ${availableYears} سنوات فقط؛ لن نعرض متوسط ست سنوات ناقصًا.`);
  const warningPanel = $("warningPanel");
  warningPanel.hidden = warnings.length === 0;
  warningPanel.textContent = warnings.join(" • ");
  $("dataSource").textContent = "السعر: سهمك؛ تاريخ الأرباح والمكررات: ملف البنوك المرفق؛ الأرباح الحالية والقيمة الدفترية: مدخلاتك المحلية";
  $("sourceTimestamp").textContent = state.market.generatedAt ? `إنشاء لقطة البيانات: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(state.market.generatedAt))}` : "";
  banner(bank, record);
  renderHistory(bank);
}

function attachEvents() {
  $("bankSearch").addEventListener("input", (event) => { state.search = event.target.value; renderBankList(); });
  $("basicButton").addEventListener("click", () => { state.basis = "basic"; render(); });
  $("dilutedButton").addEventListener("click", () => { state.basis = "diluted"; render(); });
  $("manualButton").addEventListener("click", () => {
    state.manualOpen = !state.manualOpen;
    render();
  });
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
    const [banksResponse, marketResponse] = await Promise.all([
      fetch("./data/banks.json", { cache: "no-store" }),
      fetch("./data/market.json", { cache: "no-store" }),
    ]);
    if (!banksResponse.ok) throw new Error("تعذر قراءة تاريخ البنوك.");
    state.banks = (await banksResponse.json()).banks;
    state.market = marketResponse.ok ? await marketResponse.json() : state.market;
    syncForm();
    render();
  } catch (error) {
    $("dataBanner").className = "data-banner error";
    $("dataBanner").textContent = `تعذر تحميل بيانات الصفحة: ${error.message}`;
    $("providerStatus").textContent = "تعذر التحميل";
  }
}

load();
