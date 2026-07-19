import { TYPE_META } from "./constants.js";
import { accountBalance, centsToInput, formatMoney } from "./utils.js";
import { element, emptyState } from "./ui.js";

export function renderSettings(state, actions) {
  document.querySelector("#setting-currency").value = state.settings.currency;
  document.querySelector("#setting-language").value = state.settings.language;
  document.querySelector("#setting-theme").value = state.settings.theme;
  document.querySelector("#setting-first-day").value = state.settings.firstDayOfMonth;
  document.querySelector("#setting-opening-balance").value = centsToInput(state.settings.openingBalance);

  const categories = document.querySelector("#settings-categories"); categories.replaceChildren();
  if (!state.categories.length) categories.append(emptyState("Nessuna categoria."));
  [...state.categories].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "it")).forEach((category) => {
    const used = state.transactions.some((item) => item.category === category.id) || state.recurringTransactions.some((item) => item.category === category.id) || state.budgets.some((budget) => Object.hasOwn(budget.categoryBudgets || {}, category.id));
    const icon = element("span", { className: "management-icon", text: category.icon || "•", style: { color: category.color || "" } });
    const info = element("div", { className: "management-main" }, [element("strong", { text: category.name }), element("small", { text: `${TYPE_META[category.type]?.label || category.type}${category.group ? ` · ${category.group}` : ""}${used ? " · in uso" : ""}` })]);
    const edit = element("button", { type: "button", className: "row-action", text: "✎", "aria-label": `Modifica categoria ${category.name}`, title: "Modifica" }); edit.addEventListener("click", () => actions.onEditCategory(category));
    const remove = element("button", { type: "button", className: "row-action", text: "⌫", "aria-label": `Elimina categoria ${category.name}`, title: used ? "Categoria in uso" : "Elimina", disabled: used }); remove.addEventListener("click", () => actions.onDeleteCategory(category));
    categories.append(element("div", { className: "management-row" }, [icon, info, element("div", { className: "management-actions" }, [edit, remove])]));
  });

  const accounts = document.querySelector("#settings-accounts"); accounts.replaceChildren();
  if (!state.accounts.length) accounts.append(emptyState("Crea almeno un conto per registrare movimenti."));
  state.accounts.forEach((account) => {
    const used = state.transactions.some((item) => item.account === account.id || item.transferAccount === account.id) || state.recurringTransactions.some((item) => item.account === account.id || item.transferAccount === account.id) || state.netWorthSnapshots.some((snapshot) => snapshot.accounts?.some((item) => item.accountId === account.id));
    const balance = accountBalance(account, state.transactions);
    const iconMap = { bank: "▤", cash: "●", investment: "◆", credit: "▱" };
    const icon = element("span", { className: "management-icon", text: iconMap[account.type] || "▤" });
    const info = element("div", { className: "management-main" }, [element("strong", { text: account.name }), element("small", { text: `${formatMoney(balance, state.settings.currency, state.settings.language)} · ${account.includeInAvailableBalance ? "nel saldo" : "escluso"}` })]);
    const edit = element("button", { type: "button", className: "row-action", text: "✎", "aria-label": `Modifica conto ${account.name}` }); edit.addEventListener("click", () => actions.onEditAccount(account));
    const remove = element("button", { type: "button", className: "row-action", text: "⌫", "aria-label": `Elimina conto ${account.name}`, title: used ? "Conto in uso" : "Elimina", disabled: used }); remove.addEventListener("click", () => actions.onDeleteAccount(account));
    accounts.append(element("div", { className: "management-row" }, [icon, info, element("div", { className: "management-actions" }, [edit, remove])]));
  });

  const methods = document.querySelector("#payment-methods-list"); methods.replaceChildren();
  (state.settings.paymentMethods || []).forEach((method) => {
    const remove = element("button", { type: "button", text: "×", "aria-label": `Elimina metodo ${method}` }); remove.addEventListener("click", () => actions.onDeletePaymentMethod(method));
    methods.append(element("span", { className: "tag" }, [method, remove]));
  });
}
