// YoungDesert Finance System (MVP) - monthly tracking + charts + localStorage

const $ = (id) => document.getElementById(id);

const storeKey = "yd_finance_v1";
const state = loadState();

// Chart instances
let chartIncomeVsExpenses = null;
let chartExpensesCategory = null;
let chartNetWorthTrend = null;

function loadState(){
  const raw = localStorage.getItem(storeKey);
  const base = raw ? JSON.parse(raw) : {
    income: [],
    expenses: [],
    assets: [
      { name: "Cash", value: 1500 },
      { name: "Savings", value: 1200 },
      { name: "Investments", value: 3500 },
      { name: "Car Value", value: 9000 }
    ],
    debts: [
      { name: "Credit Card", apr: 19.9, min: 120, balance: 3200 },
      { name: "Car Loan", apr: 6.5, min: 280, balance: 8400 }
    ],
    taxes: { state: "TN", annualIncomeOverride: null },
    snapshots: [] // { month:"YYYY-MM", netWorth:number }
  };

  // Monthly view state (YYYY-MM)
  if(!base.viewMonth){
    const now = new Date();
    base.viewMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  }

  if(!Array.isArray(base.snapshots)) base.snapshots = [];
  return base;
}
function saveState(){ localStorage.setItem(storeKey, JSON.stringify(state)); }

function money(n){
  const val = Number(n || 0);
  return val.toLocaleString(undefined, { style:"currency", currency:"USD" });
}
function pct(n){
  const val = Number(n || 0);
  return (val*100).toFixed(2) + "%";
}
function monthLabel(yyyyMm){
  const [y,m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m-1, 1);
  return d.toLocaleString(undefined, { month:"long", year:"numeric" });
}
function sameMonth(dateStr, yyyyMm){
  return typeof dateStr === "string" && dateStr.startsWith(yyyyMm);
}
function shiftMonth(yyyyMm, delta){
  const [y,m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m-1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function sumIncomeMonthly(){
  return state.income
    .filter(x => sameMonth(x.date, state.viewMonth))
    .reduce((a,x)=>a + Number(x.amount||0), 0);
}
function sumExpensesMonthly(){
  return state.expenses
    .filter(x => sameMonth(x.date, state.viewMonth))
    .reduce((a,x)=>a + Number(x.amount||0), 0);
}
function sumExpensesByCategory(){
  const rows = state.expenses.filter(x => sameMonth(x.date, state.viewMonth));
  const needs = rows.filter(x=>x.category==="Needs").reduce((a,x)=>a+Number(x.amount||0),0);
  const wants = rows.filter(x=>x.category==="Wants").reduce((a,x)=>a+Number(x.amount||0),0);
  const inv = rows.filter(x=>x.category==="Investments").reduce((a,x)=>a+Number(x.amount||0),0);
  return { needs, wants, inv };
}
function sumAssets(){
  return state.assets.reduce((a,x)=>a + Number(x.value||0), 0);
}
function sumDebts(){
  return state.debts.reduce((a,x)=>a + Number(x.balance||0), 0);
}

function ensureMonthPill(){
  const pill = $("monthPill");
  if(!pill) return;

  if(document.getElementById("prevMonthBtn")) return;

  const wrap = document.createElement("div");
  wrap.className = "monthControls";
  wrap.innerHTML = `
    <button class="del" id="prevMonthBtn">◀</button>
    <span class="pill" id="monthText"></span>
    <button class="del" id="nextMonthBtn">▶</button>
  `;
  pill.replaceWith(wrap);

  $("prevMonthBtn").addEventListener("click", ()=>{
    saveSnapshot(); // snapshot before leaving month
    state.viewMonth = shiftMonth(state.viewMonth, -1);
    saveState(); renderAll();
  });
  $("nextMonthBtn").addEventListener("click", ()=>{
    saveSnapshot();
    state.viewMonth = shiftMonth(state.viewMonth, +1);
    saveState(); renderAll();
  });
}

function saveSnapshot(){
  // snapshot current net worth for current month
  const assets = sumAssets();
  const debts = sumDebts();
  const netWorth = assets - debts;

  const existingIdx = state.snapshots.findIndex(s => s.month === state.viewMonth);
  const snap = { month: state.viewMonth, netWorth: Number(netWorth.toFixed(2)) };

  if(existingIdx >= 0) state.snapshots[existingIdx] = snap;
  else state.snapshots.push(snap);

  // keep ordered
  state.snapshots.sort((a,b)=> a.month.localeCompare(b.month));
  saveState();
}

function renderDashboard(){
  ensureMonthPill();

  const income = sumIncomeMonthly();
  const expenses = sumExpensesMonthly();
  const assets = sumAssets();
  const debts = sumDebts();
  const netWorth = assets - debts;

  $("kpiIncome").textContent = money(income);
  $("kpiExpenses").textContent = money(expenses);
  $("kpiAssets").textContent = money(assets);
  $("kpiDebts").textContent = money(debts);
  $("kpiNetWorth").textContent = money(netWorth);

  $("kpiExpIncome").textContent = income === 0 ? "0.00%" : pct(expenses / income);
  $("kpiExpAssets").textContent = assets === 0 ? "0.00%" : pct(expenses / assets);

  const monthText = document.getElementById("monthText");
  if(monthText) monthText.textContent = monthLabel(state.viewMonth);

  $("sumEarned").textContent = money(income);
  $("sumSpent").textContent = money(expenses);
  $("sumRemaining").textContent = money(income - expenses);

  renderTaxes(income);

  // Charts
  renderCharts(income, expenses, netWorth);
}

function renderCharts(income, expenses, netWorth){
  // Make sure current month snapshot exists (so trend starts)
  saveSnapshot();

  // 1) Income vs Expenses (bar)
  const ctx1 = document.getElementById("chartIncomeVsExpenses");
  if(ctx1){
    if(chartIncomeVsExpenses) chartIncomeVsExpenses.destroy();
    chartIncomeVsExpenses = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: ["Income", "Expenses"],
        datasets: [{
          label: "Amount",
          data: [income, expenses]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v)=> money(v)
            }
          }
        }
      }
    });
  }

  // 2) Expenses by Category (doughnut)
  const { needs, wants, inv } = sumExpensesByCategory();
  const ctx2 = document.getElementById("chartExpensesCategory");
  if(ctx2){
    if(chartExpensesCategory) chartExpensesCategory.destroy();
    chartExpensesCategory = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Needs", "Wants", "Investments"],
        datasets: [{
          label: "Expenses",
          data: [needs, wants, inv]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx)=> `${ctx.label}: ${money(ctx.raw)}`
            }
          }
        }
      }
    });
  }

  // 3) Net Worth Trend (line)
  const ctx3 = document.getElementById("chartNetWorthTrend");
  if(ctx3){
    const labels = state.snapshots.map(s => s.month);
    const data = state.snapshots.map(s => s.netWorth);

    if(chartNetWorthTrend) chartNetWorthTrend.destroy();
    chartNetWorthTrend = new Chart(ctx3, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Net Worth",
          data,
          tension: 0.25,
          fill: false
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx)=> money(ctx.raw) } }
        },
        scales: {
          y: {
            ticks: { callback: (v)=> money(v) }
          }
        }
      }
    });
  }
}

function rowBtn(onClick){
  const b = document.createElement("button");
  b.className = "del";
  b.textContent = "Delete";
  b.addEventListener("click", onClick);
  return b;
}

function renderIncome(){
  const tbody = $("incomeTable").querySelector("tbody");
  tbody.innerHTML = "";
  state.income
    .filter(x => sameMonth(x.date, state.viewMonth))
    .forEach((x) => {
      const idx = state.income.findIndex(item => item === x);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${x.date}</td>
        <td>${escapeHtml(x.source)}</td>
        <td class="right">${money(x.amount)}</td>
        <td></td>
      `;
      tr.lastElementChild.appendChild(rowBtn(() => {
        state.income.splice(idx,1); saveState(); renderAll();
      }));
      tbody.appendChild(tr);
    });
}

function renderExpenses(){
  const tbody = $("expenseTable").querySelector("tbody");
  tbody.innerHTML = "";
  state.expenses
    .filter(x => sameMonth(x.date, state.viewMonth))
    .forEach((x) => {
      const idx = state.expenses.findIndex(item => item === x);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${x.date}</td>
        <td>${escapeHtml(x.category)}</td>
        <td>${escapeHtml(x.desc)}</td>
        <td class="right">${money(x.amount)}</td>
        <td></td>
      `;
      tr.lastElementChild.appendChild(rowBtn(() => {
        state.expenses.splice(idx,1); saveState(); renderAll();
      }));
      tbody.appendChild(tr);
    });
}

function renderAssets(){
  const tbody = $("assetTable").querySelector("tbody");
  tbody.innerHTML = "";
  state.assets.forEach((x, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(x.name)}</td>
      <td class="right">${money(x.value)}</td>
      <td></td>
    `;
    tr.lastElementChild.appendChild(rowBtn(() => {
      state.assets.splice(idx,1); saveState(); renderAll();
    }));
    tbody.appendChild(tr);
  });
}

function renderDebts(){
  const tbody = $("debtTable").querySelector("tbody");
  tbody.innerHTML = "";
  state.debts.forEach((x, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(x.name)}</td>
      <td class="right">${x.apr ? x.apr.toFixed(2) + "%" : "-"}</td>
      <td class="right">${x.min ? money(x.min) : "-"}</td>
      <td class="right">${money(x.balance)}</td>
      <td></td>
    `;
    tr.lastElementChild.appendChild(rowBtn(() => {
      state.debts.splice(idx,1); saveState(); renderAll();
    }));
    tbody.appendChild(tr);
  });
}

// Taxes (planning estimates): TN 0, FL 0, CA avg 8% + federal avg 18%
function renderTaxes(monthlyIncome){
  const annualDefault = monthlyIncome * 12;
  const override = state.taxes.annualIncomeOverride;

  const annual = (override !== null && override !== "" && !Number.isNaN(Number(override)))
    ? Number(override)
    : annualDefault;

  $("annualIncome").value = Math.round(annual * 100) / 100;
  $("stateSelect").value = state.taxes.state;

  const federal = annual * 0.18;
  const stateRate = state.taxes.state === "CA" ? 0.08 : 0;
  const stateTax = annual * stateRate;

  $("fedTax").textContent = money(federal);
  $("stateTax").textContent = money(stateTax);
  $("netAfterTax").textContent = money(annual - (federal + stateTax));
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function renderAll(){
  renderDashboard();
  renderIncome();
  renderExpenses();
  renderAssets();
  renderDebts();
}

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// Forms
$("incomeForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  state.income.unshift({
    date: $("incomeDate").value,
    source: $("incomeSource").value.trim(),
    amount: Number($("incomeAmount").value)
  });
  e.target.reset(); saveState(); renderAll();
});

$("expenseForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  state.expenses.unshift({
    date: $("expenseDate").value,
    category: $("expenseCategory").value,
    desc: $("expenseDesc").value.trim(),
    amount: Number($("expenseAmount").value)
  });
  e.target.reset(); saveState(); renderAll();
});

$("assetForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  state.assets.unshift({
    name: $("assetName").value.trim(),
    value: Number($("assetValue").value)
  });
  e.target.reset(); saveState(); renderAll();
});

$("debtForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  state.debts.unshift({
    name: $("debtName").value.trim(),
    apr: $("debtAPR").value ? Number($("debtAPR").value) : null,
    min: $("debtMin").value ? Number($("debtMin").value) : null,
    balance: Number($("debtBalance").value)
  });
  e.target.reset(); saveState(); renderAll();
});

// Taxes inputs
$("stateSelect").addEventListener("change", (e)=>{
  state.taxes.state = e.target.value;
  saveState(); renderAll();
});
$("annualIncome").addEventListener("input", (e)=>{
  state.taxes.annualIncomeOverride = e.target.value;
  saveState(); renderAll();
});

// Export / Import / Reset
$("exportBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "yd_finance_data.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

$("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    Object.assign(state, data);
    if(!state.viewMonth){
      const now = new Date();
      state.viewMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    }
    if(!Array.isArray(state.snapshots)) state.snapshots = [];
    saveState(); renderAll();
  }catch(err){
    alert("Invalid JSON file.");
  }
  e.target.value = "";
});

$("resetBtn").addEventListener("click", ()=>{
  if(confirm("Reset all saved data?")){
    localStorage.removeItem(storeKey);
    location.reload();
  }
});

renderAll();






// ===== SUBSCRIBER MODAL =====
const SUB_KEY = "yd_subscriber_v1";        // { email, date }
const SUB_HIDE_KEY = "yd_hide_sub_modal";  // "1"

function openSubModal(){
  const overlay = document.getElementById("subModalOverlay");
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

function closeSubModal(){
  const overlay = document.getElementById("subModalOverlay");
  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

function hasSubscribed(){
  try { return !!JSON.parse(localStorage.getItem(SUB_KEY)); }
  catch { return false; }
}

function shouldHideModal(){
  return localStorage.getItem(SUB_HIDE_KEY) === "1";
}

function initSubscriberModal(){
  const overlay = document.getElementById("subModalOverlay");
  const closeBtn = document.getElementById("subModalClose");
  const skipBtn  = document.getElementById("subModalSkip");
  const form     = document.getElementById("subModalForm");
  const msg      = document.getElementById("subMsg");
  const dontShow = document.getElementById("subDontShow");

  // Show on first load only
  if(!hasSubscribed() && !shouldHideModal()){
    openSubModal();
  }

  closeBtn.addEventListener("click", () => {
    if(dontShow.checked) localStorage.setItem(SUB_HIDE_KEY, "1");
    closeSubModal();
  });

  skipBtn.addEventListener("click", () => {
    if(dontShow.checked) localStorage.setItem(SUB_HIDE_KEY, "1");
    closeSubModal();
  });

  // Click outside closes
  overlay.addEventListener("click", (e) => {
    if(e.target === overlay){
      if(dontShow.checked) localStorage.setItem(SUB_HIDE_KEY, "1");
      closeSubModal();
    }
  });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && overlay.classList.contains("show")){
      if(dontShow.checked) localStorage.setItem(SUB_HIDE_KEY, "1");
      closeSubModal();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("subEmail").value.trim();

    if(!email){
      msg.textContent = "Please enter a valid email.";
      return;
    }

    // Save locally
    localStorage.setItem(SUB_KEY, JSON.stringify({
      email,
      date: new Date().toISOString()
    }));

    // Optional: if they checked it, never show again
    localStorage.setItem(SUB_HIDE_KEY, "1");

    msg.textContent = "✅ Subscribed! Welcome to YoungDesert.";
    setTimeout(() => closeSubModal(), 600);
  });
}

initSubscriberModal();
