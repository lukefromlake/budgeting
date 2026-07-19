import { drawNetWorth } from "./charts.js";
import { accountBalance, formatDate, formatMoney, isInMonth } from "./utils.js";
import { element, emptyState } from "./ui.js";

export function snapshotTotals(snapshot) {
  const liquidity = (snapshot?.accounts || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const investments = Number(snapshot?.investmentsValue || 0);
  const debts = Number(snapshot?.debtsValue || 0);
  return { liquidity, investments, debts, net: liquidity + investments - debts };
}

export function currentNetWorth(state) {
  const sorted = [...state.netWorthSnapshots].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length) return { snapshot: sorted[0], ...snapshotTotals(sorted[0]) };
  const investmentAccountIds = new Set(state.accounts.filter((account) => account.type === "investment").map((account) => account.id));
  const contributionsSentDirectlyToInvestmentAccounts = state.transactions.filter((item) => item.type === "investment" && investmentAccountIds.has(item.account)).reduce((sum, item) => sum + item.amount, 0);
  const liquidity = state.accounts.filter((account) => account.type !== "investment" && account.type !== "credit").reduce((sum, account) => sum + accountBalance(account, state.transactions), 0) + Number(state.settings.openingBalance || 0) - contributionsSentDirectlyToInvestmentAccounts;
  const investmentAccounts = state.accounts.filter((account) => account.type === "investment").reduce((sum, account) => sum + accountBalance(account, state.transactions), 0);
  const contributions = state.transactions.filter((item) => item.type === "investment").reduce((sum, item) => sum + item.amount, 0);
  const debts = Math.abs(state.accounts.filter((account) => account.type === "credit").reduce((sum, account) => sum + Math.min(0, accountBalance(account, state.transactions)), 0));
  const investments = Math.max(contributions, investmentAccounts, 0);
  return { snapshot: null, liquidity, investments, debts, net: liquidity + investments - debts };
}

export function renderNetWorth(state, month, actions) {
  const money = (value) => formatMoney(value, state.settings.currency, state.settings.language);
  const current = currentNetWorth(state);
  const snapshots = [...state.netWorthSnapshots].sort((a, b) => a.date.localeCompare(b.date));
  const previous = snapshots.length > 1 ? snapshotTotals(snapshots.at(-2)) : null;
  document.querySelector("#net-worth-total").textContent = money(current.net);
  document.querySelector("#net-worth-cash").textContent = money(current.liquidity);
  document.querySelector("#net-worth-investments").textContent = money(current.investments);
  document.querySelector("#net-worth-debts").textContent = money(current.debts);
  const change = document.querySelector("#net-worth-change");
  if (previous) {
    const delta = current.net - previous.net;
    change.textContent = `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))} dall’ultimo snapshot`;
    change.style.color = delta >= 0 ? "var(--income)" : "var(--expense)";
  } else { change.textContent = current.snapshot ? `Aggiornato il ${formatDate(current.snapshot.date)}` : "Valore stimato dai movimenti"; change.style.color = ""; }

  const chartRows = snapshots.map((snapshot) => ({ value: snapshotTotals(snapshot).net, label: new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(`${snapshot.date}T12:00:00`)).replace(" ", " ’") }));
  drawNetWorth(document.querySelector("#networth-chart"), chartRows, state.settings);

  const investments = state.transactions.filter((item) => item.type === "investment");
  const totalInvested = investments.reduce((sum, item) => sum + item.amount, 0);
  const monthInvested = investments.filter((item) => isInMonth(item.date, month)).reduce((sum, item) => sum + item.amount, 0);
  const monthIncome = state.transactions.filter((item) => item.type === "income" && isInMonth(item.date, month)).reduce((sum, item) => sum + item.amount, 0);
  const rate = monthIncome ? Math.round(monthInvested / monthIncome * 100) : 0;
  const analysis = document.querySelector("#investment-analysis"); analysis.replaceChildren();
  const grid = element("div", { className: "analysis-grid" });
  [["Totale versato", money(totalInvested)], ["Nel mese", money(monthInvested)], ["Entrate investite", `${rate}%`], ["Valore attuale", money(current.investments)]].forEach(([label, value]) => grid.append(element("div", { className: "analysis-item" }, [element("span", { text: label }), element("strong", { text: value })])));
  analysis.append(grid);
  const byCategory = new Map(); investments.forEach((item) => byCategory.set(item.category, (byCategory.get(item.category) || 0) + item.amount));
  [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([id, value]) => {
    const category = state.categories.find((item) => item.id === id);
    analysis.append(element("div", { className: "snapshot-row" }, [element("span", { text: `${category?.icon || "◆"} ${category?.name || "Altro"}` }), element("strong", { text: money(value) })]));
  });

  const list = document.querySelector("#snapshot-list"); list.replaceChildren();
  if (!snapshots.length) list.append(emptyState("Nessuno snapshot. Salva i valori di fine mese per iniziare lo storico."));
  [...snapshots].reverse().forEach((snapshot) => {
    const totals = snapshotTotals(snapshot);
    const details = element("div", {}, [element("strong", { text: formatDate(snapshot.date) }), element("small", { text: `${money(totals.liquidity)} liquidità · ${money(totals.investments)} investiti` })]);
    const edit = element("button", { type: "button", className: "row-action", text: "✎", title: "Modifica snapshot", "aria-label": `Modifica snapshot del ${formatDate(snapshot.date)}` }); edit.addEventListener("click", () => actions.onEdit(snapshot));
    const remove = element("button", { type: "button", className: "row-action", text: "⌫", title: "Elimina snapshot", "aria-label": `Elimina snapshot del ${formatDate(snapshot.date)}` }); remove.addEventListener("click", () => actions.onDelete(snapshot));
    list.append(element("div", { className: "snapshot-row" }, [details, element("div", { className: "snapshot-actions" }, [element("strong", { text: money(totals.net) }), edit, remove])]));
  });
}
