import { clamp, centsToInput, formatMoney, formatMonth, isInMonth } from "./utils.js";
import { element, emptyState } from "./ui.js";

function statusForPercent(percent, hasBudget) {
  if (!hasBudget) return { text: "Nessun limite", className: "" };
  if (percent > 100) return { text: `Superato · ${Math.round(percent)}%`, className: "over" };
  if (percent >= 75) return { text: `Attenzione · ${Math.round(percent)}%`, className: "warning" };
  return { text: `In linea · ${Math.round(percent)}%`, className: "" };
}

export function renderBudgetPage(state, month, onCategorySave) {
  const budget = state.budgets.find((item) => item.month === month) || { month, totalBudget: 0, categoryBudgets: {} };
  const expenses = state.transactions.filter((item) => item.type === "expense" && isInMonth(item.date, month));
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const money = (value) => formatMoney(value, state.settings.currency, state.settings.language);
  document.querySelector("#budget-month").value = month;
  document.querySelector("#budget-month-title").textContent = formatMonth(month);
  document.querySelector("#total-budget-input").value = budget.totalBudget ? centsToInput(budget.totalBudget) : "";
  document.querySelector("#delete-budget").disabled = !state.budgets.some((item) => item.month === month);

  const percent = budget.totalBudget ? spent / budget.totalBudget * 100 : 0;
  const remaining = budget.totalBudget - spent;
  const overview = document.querySelector("#budget-overview-content");
  overview.replaceChildren();
  const grid = element("div", { className: "budget-overview-grid" });
  [["Budget", money(budget.totalBudget)], ["Speso", money(spent)], ["Residuo", budget.totalBudget ? money(remaining) : "—"], ["Utilizzato", budget.totalBudget ? `${Math.round(percent)}%` : "—"]].forEach(([label, value]) => grid.append(element("div", { className: "overview-item" }, [element("span", { text: label }), element("strong", { text: value })])));
  const progress = element("div", { className: `progress ${percent > 100 ? "over" : percent >= 75 ? "warning" : ""}`, role: "progressbar", "aria-label": "Budget generale utilizzato", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, Math.round(percent))) }, [element("span", { style: { width: `${clamp(percent, 0, 100)}%` } })]);
  progress.style.marginTop = "15px";
  const status = statusForPercent(percent, Boolean(budget.totalBudget));
  overview.append(grid, progress, element("p", { className: `status-label ${status.className}`, text: status.text, style: { margin: "9px 0 0", fontSize: ".72rem" } }));

  const totalsByCategory = new Map();
  expenses.forEach((item) => totalsByCategory.set(item.category || "uncategorized", (totalsByCategory.get(item.category || "uncategorized") || 0) + item.amount));
  const categories = state.categories.filter((item) => item.type === "expense").sort((a, b) => (b.group || "").localeCompare(a.group || "") || a.name.localeCompare(b.name, "it"));
  const container = document.querySelector("#category-budgets");
  container.replaceChildren();
  if (!categories.length) { container.append(emptyState("Crea una categoria di spesa nelle Impostazioni.")); return; }
  categories.forEach((category) => {
    const limit = Number(budget.categoryBudgets?.[category.id] || 0);
    const categorySpent = totalsByCategory.get(category.id) || 0;
    const categoryPercent = limit ? categorySpent / limit * 100 : 0;
    const categoryRemaining = limit - categorySpent;
    const status = statusForPercent(categoryPercent, Boolean(limit));
    const input = element("input", { inputMode: "decimal", value: limit ? centsToInput(limit) : "", placeholder: "0,00", "aria-label": `Budget per ${category.name}` });
    const save = element("button", { type: "button", className: "secondary-button", text: "✓", title: "Salva limite", "aria-label": `Salva budget per ${category.name}` });
    save.addEventListener("click", () => onCategorySave(category.id, input.value));
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); save.click(); } });
    const name = element("div", { className: "category-budget-name" }, [element("span", { text: category.icon || "•", style: { color: category.color || "" } }), element("div", {}, [element("strong", { text: category.name }), element("small", { text: `${money(categorySpent)} spesi` })])]);
    const rowStatus = element("div", { className: "budget-row-status" }, [element("span", { className: `status-label ${status.className}`, text: status.text }), element("span", { text: limit ? (categoryRemaining >= 0 ? `${money(categoryRemaining)} residui` : `${money(Math.abs(categoryRemaining))} oltre`) : `${money(categorySpent)} senza budget` })]);
    const bar = element("div", { className: `progress ${categoryPercent > 100 ? "over" : categoryPercent >= 75 ? "warning" : ""}`, role: "progressbar", "aria-label": `Budget ${category.name}`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.min(100, Math.round(categoryPercent))) }, [element("span", { style: { width: `${clamp(categoryPercent, 0, 100)}%` } })]);
    container.append(element("article", { className: "category-budget-row" }, [element("div", { className: "category-budget-top" }, [name, element("div", { className: "category-budget-input" }, [input, save])]), rowStatus, bar]));
  });

  const uncategorized = expenses.filter((item) => !state.categories.some((category) => category.id === item.category)).reduce((sum, item) => sum + item.amount, 0);
  if (uncategorized) container.prepend(element("article", { className: "category-budget-row" }, [element("div", { className: "category-budget-name" }, [element("span", { text: "?" }), element("div", {}, [element("strong", { text: "Senza categoria" }), element("small", { text: `${money(uncategorized)} spesi · nessun budget` })])])]));
}
