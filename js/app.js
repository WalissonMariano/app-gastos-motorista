const SESSION_KEY = "gastos-motorista-token";

const CATEGORIES = {
  receita: [
    { id: "frete-caminhao", label: "Frete caminhão", icon: "🚚" },
    { id: "frete-fiorino", label: "Frete Fiorino", icon: "🚐" },
    { id: "mudanca", label: "Mudança / carga", icon: "📦" },
    { id: "diaria", label: "Diária", icon: "🗓️" },
    { id: "outros-in", label: "Outras receitas", icon: "💰" },
  ],
  despesa: [
    { id: "combustivel", label: "Combustível", icon: "⛽" },
    { id: "pedagio", label: "Pedágio", icon: "🛣️" },
    { id: "manutencao", label: "Manutenção", icon: "🔧" },
    { id: "alimentacao", label: "Alimentação", icon: "🍱" },
    { id: "estacionamento", label: "Estacionamento", icon: "🅿️" },
    { id: "lavagem", label: "Lavagem", icon: "🚿" },
    { id: "seguro", label: "Seguro", icon: "🛡️" },
    { id: "multa", label: "Multa", icon: "🚨" },
    { id: "outros-out", label: "Outras despesas", icon: "📉" },
  ],
};

const PAYMENTS = [
  { id: "pix", label: "Pix" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "cartao", label: "Cartão" },
  { id: "outro", label: "Outro" },
];

const PERIODS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "tudo", label: "Tudo" },
];

const state = {
  view: "home",
  period: "mes",
  search: "",
  typeFilter: "all",
  transactions: [],
  user: null,
  token: localStorage.getItem(SESSION_KEY) || "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function categoryOf(type, id) {
  return CATEGORIES[type].find((item) => item.id === id) || { label: id, icon: "•" };
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function inPeriod(iso, period) {
  const date = new Date(`${iso}T12:00:00`);
  const now = new Date();
  if (period === "tudo") return true;
  if (period === "hoje") return iso === todayISO();
  if (period === "semana") return date >= startOfWeek(now);
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function visibleTransactions(options = {}) {
  const listFilters = options.listFilters ?? false;
  return state.transactions
    .filter((item) => inPeriod(item.date, state.period))
    .filter((item) => !listFilters || state.typeFilter === "all" || item.type === state.typeFilter)
    .filter((item) => {
      if (!listFilters || !state.search.trim()) return true;
      const query = state.search.trim().toLowerCase();
      const category = categoryOf(item.type, item.category);
      return [item.description, category.label].some((value) =>
        String(value || "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function totals(list = visibleTransactions()) {
  return list.reduce(
    (acc, item) => {
      if (item.type === "receita") acc.receitas += item.amount;
      else acc.despesas += item.amount;
      acc.saldo = acc.receitas - acc.despesas;
      return acc;
    },
    { receitas: 0, despesas: 0, saldo: 0 }
  );
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && url !== "/api/login") {
    clearSession();
    showLogin(data.error || "Faça login para continuar.");
    throw new Error(data.error || "Sessão expirada");
  }
  if (!response.ok) throw new Error(data.error || "Falha na requisição");
  return data;
}

function applyData(data) {
  state.user = data.user;
  state.transactions = data.transactions;
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.transactions = [];
  localStorage.removeItem(SESSION_KEY);
}

function showLogin(message) {
  const app = document.getElementById("app");
  const workspace = document.getElementById("workspace");
  const error = document.getElementById("loginError");
  app.classList.remove("is-auth");
  app.classList.add("is-guest");
  workspace.hidden = true;
  document.getElementById("loginScreen").hidden = false;
  if (message) {
    error.hidden = false;
    error.textContent = message;
  } else {
    error.hidden = true;
    error.textContent = "";
  }
}

function showApp() {
  const app = document.getElementById("app");
  app.classList.add("is-auth");
  app.classList.remove("is-guest");
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("workspace").hidden = false;
  render();
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("is-on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("is-on"), 2200);
}

function closeSheet() {
  document.getElementById("sheet").hidden = true;
  document.getElementById("sheetPanel").innerHTML = "";
}

function openSheet(html) {
  document.getElementById("sheetPanel").innerHTML = `<div class="sheet__handle"></div>${html}`;
  document.getElementById("sheet").hidden = false;
}

function setHeader() {
  const titles = {
    home: [state.user?.name || "Gastos do Motorista", "Meu caixa"],
    lancamentos: ["Lançamentos", "Receitas e despesas"],
    relatorio: ["Relatório", "Visão do período"],
  };
  const [eyebrow, title] = titles[state.view];
  document.getElementById("headerEyebrow").textContent = eyebrow;
  document.getElementById("headerTitle").textContent = title;
  document.getElementById("periodLabel").textContent =
    PERIODS.find((item) => item.id === state.period).label;
}

function transactionItem(item) {
  const category = categoryOf(item.type, item.category);
  const sign = item.type === "receita" ? "+" : "-";
  return `
    <button class="item" data-edit-tx="${item.id}" type="button">
      <span class="dot">${category.icon}</span>
      <div>
        <h3>${category.label}</h3>
        <p>${formatDate(item.date)} · ${item.description || "Sem nota"}</p>
      </div>
      <strong class="amount ${item.type === "receita" ? "in" : "out"}">${sign}${formatMoney(item.amount)}</strong>
    </button>`;
}

function renderHome() {
  const list = visibleTransactions();
  const summary = totals(list);
  const recent = list.slice(0, 6);

  return `
    <section class="hero">
      <div class="hero__head">
        <div>
          <p class="muted">Saldo do período</p>
          <p class="balance ${summary.saldo < 0 ? "is-neg" : ""}">${formatMoney(summary.saldo)}</p>
        </div>
        <p class="hint">${list.length} lançamento${list.length === 1 ? "" : "s"}</p>
      </div>
      <div class="kpi-row">
        <div class="kpi is-in"><span>Receitas</span><strong>${formatMoney(summary.receitas)}</strong></div>
        <div class="kpi is-out"><span>Despesas</span><strong>${formatMoney(summary.despesas)}</strong></div>
      </div>
    </section>
    <div class="section-title">
      <strong>Últimos lançamentos</strong>
    </div>
    <section class="list">
      ${recent.length ? recent.map(transactionItem).join("") : `<div class="empty">Nenhum lançamento neste período.</div>`}
    </section>
  `;
}

function renderLancamentos() {
  const list = visibleTransactions({ listFilters: true });
  return `
    <input class="search" id="searchInput" type="search" placeholder="Buscar por categoria ou nota" value="${state.search}" />
    <div class="filters">
      <button class="chip ${state.typeFilter === "all" ? "is-active" : ""}" data-type="all" type="button">Todos</button>
      <button class="chip ${state.typeFilter === "receita" ? "is-active" : ""}" data-type="receita" type="button">Receitas</button>
      <button class="chip ${state.typeFilter === "despesa" ? "is-active" : ""}" data-type="despesa" type="button">Despesas</button>
    </div>
    <section class="list">
      ${list.length ? list.map(transactionItem).join("") : `<div class="empty">Nada encontrado. Toque no + para lançar.</div>`}
    </section>
  `;
}

function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    const current = map.get(key) || { label: key, receitas: 0, despesas: 0 };
    current[item.type === "receita" ? "receitas" : "despesas"] += item.amount;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.receitas + b.despesas - (a.receitas + a.despesas));
}

function reportRows(rows, kind) {
  const max = Math.max(...rows.map((row) => row[kind]), 1);
  return rows
    .filter((row) => row[kind] > 0)
    .map(
      (row) => `
        <div class="report-row">
          <header>
            <span>${row.label}</span>
            <strong>${formatMoney(row[kind])}</strong>
          </header>
          <div class="bar ${kind === "despesas" ? "out" : ""}"><span style="width:${(row[kind] / max) * 100}%"></span></div>
        </div>`
    )
    .join("");
}

function renderRelatorio() {
  const list = visibleTransactions();
  const summary = totals(list);
  const byCategoryIn = groupBy(
    list.filter((item) => item.type === "receita"),
    (item) => categoryOf(item.type, item.category).label
  );
  const byCategoryOut = groupBy(
    list.filter((item) => item.type === "despesa"),
    (item) => categoryOf(item.type, item.category).label
  );

  return `
    <section class="hero">
      <p class="muted">Resultado líquido</p>
      <p class="balance ${summary.saldo < 0 ? "is-neg" : ""}">${formatMoney(summary.saldo)}</p>
      <div class="kpi-row">
        <div class="kpi is-in"><span>Entradas</span><strong>${formatMoney(summary.receitas)}</strong></div>
        <div class="kpi is-out"><span>Saídas</span><strong>${formatMoney(summary.despesas)}</strong></div>
      </div>
    </section>
    <div class="section-title"><strong>Receitas por categoria</strong></div>
    <section class="list">${reportRows(byCategoryIn, "receitas") || `<div class="empty">Sem receitas no período.</div>`}</section>
    <div class="section-title"><strong>Despesas por categoria</strong></div>
    <section class="list">${reportRows(byCategoryOut, "despesas") || `<div class="empty">Sem despesas no período.</div>`}</section>
  `;
}

function render() {
  if (!state.user) return;
  setHeader();
  const views = {
    home: renderHome,
    lancamentos: renderLancamentos,
    relatorio: renderRelatorio,
  };
  document.getElementById("content").innerHTML = views[state.view]();
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.view);
  });
}

function parseAmount(value) {
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  return Number(normalized);
}

function categoryOptions(type, selected) {
  return CATEGORIES[type]
    .map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${item.icon} ${item.label}</option>`)
    .join("");
}

function transactionForm(existing) {
  const item = existing || {
    type: "receita",
    amount: "",
    category: "frete-caminhao",
    date: todayISO(),
    payment: "pix",
    description: "",
  };

  openSheet(`
    <form class="form" id="txForm">
      <h2>${existing ? "Editar lançamento" : "Novo lançamento"}</h2>
      <div class="toggle" id="typeToggle">
        <button class="is-in ${item.type === "receita" ? "is-active" : ""}" data-type="receita" type="button">Receita</button>
        <button class="is-out ${item.type === "despesa" ? "is-active" : ""}" data-type="despesa" type="button">Despesa</button>
      </div>
      <label class="field">
        <span>Valor</span>
        <input name="amount" inputmode="decimal" placeholder="0,00" value="${existing ? String(item.amount).replace(".", ",") : ""}" required />
      </label>
      <label class="field">
        <span>Categoria</span>
        <select name="category">${categoryOptions(item.type, item.category)}</select>
      </label>
      <label class="field">
        <span>Data</span>
        <input name="date" type="date" value="${item.date}" required />
      </label>
      <label class="field">
        <span>Pagamento</span>
        <select name="payment">
          ${PAYMENTS.map((pay) => `<option value="${pay.id}" ${pay.id === item.payment ? "selected" : ""}>${pay.label}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Observação</span>
        <textarea name="description" maxlength="120" placeholder="Ex.: turno da manhã, posto X...">${item.description || ""}</textarea>
      </label>
      <div class="actions">
        ${existing ? `<button class="btn danger" id="deleteTxBtn" type="button">Excluir</button>` : `<button class="btn" type="button" id="cancelSheet">Cancelar</button>`}
        <button class="btn primary" type="submit">Salvar</button>
      </div>
    </form>
  `);

  const form = document.getElementById("txForm");
  const typeButtons = form.querySelectorAll("#typeToggle button");

  typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      typeButtons.forEach((itemBtn) => itemBtn.classList.remove("is-active"));
      button.classList.add("is-active");
      form.category.innerHTML = categoryOptions(button.dataset.type);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = parseAmount(form.amount.value);
    if (!amount || amount <= 0) {
      toast("Informe um valor válido.");
      return;
    }

    const payload = {
      type: form.querySelector("#typeToggle .is-active").dataset.type,
      amount,
      category: form.category.value,
      date: form.date.value,
      payment: form.payment.value,
      description: form.description.value.trim(),
      createdAt: existing?.createdAt || Date.now(),
    };

    try {
      if (existing) await api(`/api/transactions/${existing.id}`, { method: "PUT", body: payload });
      else await api("/api/transactions", { method: "POST", body: payload });
      applyData(await api("/api/data"));
      closeSheet();
      render();
      toast(existing ? "Lançamento atualizado." : "Lançamento registrado.");
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById("cancelSheet")?.addEventListener("click", closeSheet);
  document.getElementById("deleteTxBtn")?.addEventListener("click", async () => {
    try {
      await api(`/api/transactions/${existing.id}`, { method: "DELETE" });
      applyData(await api("/api/data"));
      closeSheet();
      render();
      toast("Lançamento excluído.");
    } catch (error) {
      toast(error.message);
    }
  });
}

async function enterSession(data) {
  state.token = data.token || state.token;
  localStorage.setItem(SESSION_KEY, state.token);
  applyData(data);
  showApp();
}

async function restoreSession() {
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    applyData(await api("/api/data"));
    showApp();
  } catch {
    showLogin();
  }
}

function bind() {
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById("loginError");
    error.hidden = true;
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          username: form.username.value,
          password: form.password.value,
        },
      });
      form.reset();
      await enterSession(data);
      toast(`Olá, ${data.user.name}.`);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message.includes("Failed to fetch")
        ? "Inicie o servidor com node server.js"
        : err.message;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      /* continua o logout local */
    }
    closeSheet();
    clearSession();
    showLogin();
    toast("Você saiu da conta.");
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      render();
    });
  });

  document.getElementById("addBtn").addEventListener("click", () => {
    transactionForm();
  });

  document.getElementById("periodBtn").addEventListener("click", () => {
    const index = PERIODS.findIndex((item) => item.id === state.period);
    state.period = PERIODS[(index + 1) % PERIODS.length].id;
    render();
  });

  document.getElementById("sheetBackdrop").addEventListener("click", closeSheet);

  document.getElementById("content").addEventListener("click", (event) => {
    const typeChip = event.target.closest("[data-type]");
    const editTx = event.target.closest("[data-edit-tx]");

    if (typeChip) {
      state.typeFilter = typeChip.dataset.type;
      render();
    }
    if (editTx) {
      transactionForm(state.transactions.find((item) => item.id === editTx.dataset.editTx));
    }
  });

  document.getElementById("content").addEventListener("input", (event) => {
    if (event.target.id !== "searchInput") return;
    state.search = event.target.value;
    const list = document.querySelector("#content .list");
    if (!list) return;
    const items = visibleTransactions({ listFilters: true });
    list.innerHTML = items.length
      ? items.map(transactionItem).join("")
      : `<div class="empty">Nada encontrado. Toque no + para lançar.</div>`;
  });
}

function init() {
  bind();
  restoreSession();
}

init();
