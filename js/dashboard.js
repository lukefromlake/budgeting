import { drawMonthlyTrend, renderCategoryDistribution } from "./charts.js";
import { formatMoney, formatMonth, isInMonth, monthOffset, sumByType } from "./utils.js";
import { renderTransactionList } from "./transactions.js";

export function dashboardMetrics(state, month) {
  const monthly = state.transactions.filter((item) => isInMonth(item.date, month));
  const totals = sumByType(monthly);
  const availableAccounts = state.accounts.filter((item) => item.includeInAvailableBalance);
  const included = new Set(availableAccounts.map((account) => account.id));
  const initialAvailable = Number(state.settings.openingBalance || 0) + availableAccounts.reduce((sum, account) => sum + Number(account.initialBalance || 0), 0);
  const available = state.transactions.reduce((balance, item) => {
    if (item.type === "transfer") {
      if (included.has(item.account)) balance -= item.amount;
      if (included.has(item.transferAccount)) balance += item.amount;
    } else if (item.type === "investment") balance -= item.amount;
    else if (included.has(item.account)) balance += item.type === "income" ? item.amount : -item.amount;
    return balance;
  }, initialAvailable);
  const budget = state.budgets.find((item) => item.month === month) || { totalBudget: 0, categoryBudgets: {} };
  return { monthly, totals, availableAccounts, available, budget, saving: totals.income - totals.expense - totals.investment };
}

export function renderDashboard(state, month) {
  const metrics = dashboardMetrics(state, month);
  const money = (value) => formatMoney(value, state.settings.currency, state.settings.language);
  document.querySelector("#dashboard-month").value = month;
  document.querySelector("#available-balance").textContent = money(metrics.available);
  document.querySelector("#balance-caption").textContent = `Su ${metrics.availableAccounts.length} ${metrics.availableAccounts.length === 1 ? "conto incluso" : "conti inclusi"}`;
  document.querySelector("#month-income").textContent = money(metrics.totals.income);
  document.querySelector("#month-expense").textContent = money(metrics.totals.expense);
  document.querySelector("#month-investment").textContent = money(metrics.totals.investment);
  document.querySelector("#month-saving").textContent = money(metrics.saving);

  const budget = metrics.budget;
  const percent = budget.totalBudget ? Math.round(metrics.totals.expense / budget.totalBudget * 100) : 0;
  const remaining = budget.totalBudget - metrics.totals.expense;
  document.querySelector("#budget-summary-title").textContent = formatMonth(month);
  document.querySelector("#budget-spent").textContent = money(metrics.totals.expense);
  document.querySelector("#budget-total-label").textContent = `di ${money(budget.totalBudget)}`;
  const progress = document.querySelector("#budget-progress");
  progress.style.width = `${Math.min(100, percent)}%`;
  progress.parentElement.className = `progress ${percent > 100 ? "over" : percent >= 75 ? "warning" : ""}`;
  progress.parentElement.setAttribute("aria-valuenow", String(Math.min(percent, 100)));
  const status = document.querySelector("#budget-status");
  status.textContent = !budget.totalBudget ? "Nessun budget impostato" : percent > 100 ? `Superato · ${percent}% usato` : percent >= 75 ? `Attenzione · ${percent}% usato` : `In linea · ${percent}% usato`;
  document.querySelector("#budget-remaining").textContent = budget.totalBudget ? (remaining >= 0 ? `${money(remaining)} residui` : `${money(Math.abs(remaining))} oltre`) : "—";

  const categoryTotals = new Map();
  metrics.monthly.filter((item) => item.type === "expense").forEach((item) => categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amount));
  const rows = [...categoryTotals.entries()].map(([id, value]) => {
    const category = state.categories.find((item) => item.id === id);
    return { label: category?.name || "Senza categoria", icon: category?.icon, color: category?.color, value };
  }).sort((a, b) => b.value - a.value);
  renderCategoryDistribution(document.querySelector("#category-distribution"), rows, state.settings);

  const trend = Array.from({ length: 6 }, (_, index) => monthOffset(month, index - 5)).map((value) => {
    const totals = sumByType(state.transactions.filter((item) => isInMonth(item.date, value)));
    const label = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(`${value}-01T12:00:00`)).replace(".", "");
    return { label, ...totals };
  });
  drawMonthlyTrend(document.querySelector("#monthly-chart"), trend, state.settings);

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 5);
  renderTransactionList(document.querySelector("#recent-transactions"), recent, state, { compact: true, emptyMessage: "Aggiungi il primo movimento per iniziare." });
}
