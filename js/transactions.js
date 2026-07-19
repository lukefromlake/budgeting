import { TYPE_META } from "./constants.js";
import { escapeForSearch, formatDate, formatMoney, sumByType, typeAmountLabel } from "./utils.js";
import { element, emptyState } from "./ui.js";

export function categoryName(state, id) {
  return state.categories.find((item) => item.id === id)?.name || "Senza categoria";
}

export function accountName(state, id) {
  return state.accounts.find((item) => item.id === id)?.name || "Conto rimosso";
}

export function createTransactionRow(transaction, state, { compact = false, onEdit, onDuplicate, onDelete } = {}) {
  const category = state.categories.find((item) => item.id === transaction.category);
  const icon = element("span", { className: `transaction-icon ${transaction.type}`, text: category?.icon || TYPE_META[transaction.type]?.icon || "•", "aria-hidden": "true" });
  const title = element("strong", { text: transaction.description || TYPE_META[transaction.type]?.label || "Movimento" });
  const meta = element("div", { className: "transaction-meta" }, [
    element("span", { text: formatDate(transaction.date, { day: "2-digit", month: "short" }) }),
    element("span", { text: "·", "aria-hidden": "true" }),
    element("span", { text: category?.name || "Senza categoria" }),
    element("span", { text: "·", "aria-hidden": "true" }),
    element("span", { text: transaction.type === "transfer" ? `${accountName(state, transaction.account)} → ${accountName(state, transaction.transferAccount)}` : accountName(state, transaction.account) }),
  ]);
  if (transaction.recurring) meta.append(element("span", { text: "⟳", title: "Ricorrente", "aria-label": "Ricorrente" }));
  const main = element("div", { className: "transaction-main" }, [title, meta]);
  const amount = element("strong", { className: `transaction-amount ${transaction.type}`, text: typeAmountLabel(transaction, state.settings) });
  const side = element("div", { className: "transaction-side" }, [amount]);
  if (!compact) {
    const actions = element("div", { className: "row-actions" });
    const action = (label, iconText, handler) => {
      const button = element("button", { type: "button", className: "row-action", title: label, "aria-label": `${label}: ${transaction.description || TYPE_META[transaction.type].label}`, text: iconText });
      button.addEventListener("click", handler); return button;
    };
    actions.append(action("Modifica", "✎", () => onEdit?.(transaction)), action("Duplica", "⧉", () => onDuplicate?.(transaction)), action("Elimina", "⌫", () => onDelete?.(transaction)));
    side.append(actions);
  }
  return element("article", { className: "transaction-row" }, [icon, main, side]);
}

export function renderTransactionList(container, transactions, state, actions = {}) {
  container.replaceChildren();
  if (!transactions.length) {
    container.append(emptyState(actions.emptyMessage || "Nessun movimento da mostrare."));
    return;
  }
  const fragment = document.createDocumentFragment();
  transactions.forEach((transaction) => fragment.append(createTransactionRow(transaction, state, actions)));
  container.append(fragment);
}

export function filterTransactions(transactions, filters, state) {
  const query = escapeForSearch(filters.search);
  const categoryMap = new Map(state.categories.map((item) => [item.id, item.name]));
  const accountMap = new Map(state.accounts.map((item) => [item.id, item.name]));
  const filtered = transactions.filter((item) => {
    if (filters.month && item.date.slice(0, 7) !== filters.month) return false;
    if (filters.from && item.date < filters.from) return false;
    if (filters.to && item.date > filters.to) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.account && item.account !== filters.account && item.transferAccount !== filters.account) return false;
    if (query) {
      const haystack = escapeForSearch([item.description, item.notes, categoryMap.get(item.category), accountMap.get(item.account), item.paymentMethod].join(" "));
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const [field, direction] = (filters.sort || "date-desc").split("-");
  return filtered.sort((a, b) => {
    const left = field === "amount" ? a.amount : a.date;
    const right = field === "amount" ? b.amount : b.date;
    const result = left < right ? -1 : left > right ? 1 : 0;
    return direction === "asc" ? result : -result;
  });
}

export function renderFilterTotals(container, transactions, settings) {
  container.replaceChildren();
  const totals = sumByType(transactions);
  [
    ["Entrate", totals.income], ["Spese", totals.expense], ["Investimenti", totals.investment], ["Trasferimenti", totals.transfer],
  ].forEach(([label, value]) => container.append(element("span", { className: "total-chip" }, [label, element("strong", { text: formatMoney(value, settings.currency, settings.language) })])));
}

export function dueRecurringTemplates(state, date = new Date()) {
  const today = date.toISOString().slice(0, 10);
  return state.recurringTransactions.filter((template) => {
    if (!template.active || !template.nextDate || template.nextDate > today) return false;
    return !state.transactions.some((transaction) => transaction.recurringId === template.id && transaction.date.slice(0, 7) === template.nextDate.slice(0, 7));
  });
}

export function renderRecurringProposals(container, templates, state, onConfirm) {
  container.replaceChildren();
  templates.forEach((template) => {
    const info = element("div", {}, [
      element("strong", { text: template.description }),
      element("small", { text: `${formatDate(template.nextDate)} · ${formatMoney(template.amount, state.settings.currency, state.settings.language)}` }),
    ]);
    const button = element("button", { type: "button", className: "secondary-button", text: "Conferma" });
    button.addEventListener("click", () => onConfirm(template));
    container.append(element("div", { className: "proposal-row" }, [info, button]));
  });
}
