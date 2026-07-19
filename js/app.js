import { TYPE_META, demoData } from "./constants.js";
import { clearAll, initializeDefaults, loadAllData, mergeAllData, put, putMany, remove, replaceAllData, saveSettings } from "./db.js";
import { renderDashboard } from "./dashboard.js";
import { renderBudgetPage } from "./budgets.js";
import { backupCounts, exportJSON, exportTransactionsCSV, normalizeBackup, validateBackup } from "./export-import.js";
import { currentNetWorth, renderNetWorth } from "./net-worth.js";
import { renderSettings } from "./settings.js";
import { dueRecurringTemplates, filterTransactions, renderFilterTotals, renderRecurringProposals, renderTransactionList } from "./transactions.js";
import { calculateRecurringNextDate, centsToInput, currentMonth, debounce, formatMoney, parseAmountToCents, todayISO, uid, validateISODate } from "./utils.js";
import { element, fillSelect, showFieldError, toast } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let state;
let selectedMonth = currentMonth();
let currentView = "dashboard";
let pendingImport = null;
let lastFocusedElement = null;
let confirmResolver = null;
let waitingServiceWorker = null;

function applyTheme(theme) {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("bremen-budget-theme", theme);
  $("meta[name='theme-color']").content = resolved === "dark" ? "#101512" : "#f3f5f4";
  $("#theme-toggle").setAttribute("aria-label", resolved === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro");
}

function showModal(id, initialFocus) {
  const modal = $(`#${id}`);
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => (initialFocus ? $(initialFocus, modal) : $("button, input, select, textarea", modal))?.focus());
}

function closeModal(modal) {
  if (!modal || modal.id === "onboarding-modal") return;
  modal.hidden = true;
  if (!$(".modal:not([hidden])")) document.body.classList.remove("modal-open");
  lastFocusedElement?.focus?.();
}

function askConfirmation({ title = "Conferma", message, acceptLabel = "Conferma", danger = true }) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-accept").textContent = acceptLabel;
  $("#confirm-accept").className = danger ? "danger-button" : "primary-button";
  showModal("confirm-modal", "#confirm-cancel");
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function resolveConfirmation(value) {
  const modal = $("#confirm-modal");
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  confirmResolver?.(value);
  confirmResolver = null;
  lastFocusedElement?.focus?.();
}

function focusTrap(event) {
  const modal = $(".modal:not([hidden])");
  if (!modal) return;
  if (event.key === "Escape") {
    if (modal.id === "confirm-modal") resolveConfirmation(false);
    else if (modal.id !== "onboarding-modal") closeModal(modal);
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = $$("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])", modal).filter((node) => !node.closest("[hidden]"));
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function reloadState(message) {
  state = await loadAllData();
  populateOptions();
  renderCurrentView();
  if (message) toast(message);
}

function populateOptions() {
  const accounts = state.accounts.map((item) => ({ value: item.id, label: item.name }));
  const defaultAccount = state.accounts.find((item) => item.type === "bank" && item.includeInAvailableBalance)?.id || accounts[0]?.value || "";
  fillSelect($("#transaction-account"), accounts, $("#transaction-account").value || defaultAccount);
  fillSelect($("#transaction-transfer-account"), accounts, $("#transaction-transfer-account").value || accounts.find((item) => item.value !== defaultAccount)?.value || defaultAccount);
  fillSelect($("#filter-account"), accounts, $("#filter-account").value, "Tutti");
  const allCategories = [...state.categories].sort((a, b) => a.name.localeCompare(b.name, "it")).map((item) => ({ value: item.id, label: item.name }));
  fillSelect($("#filter-category"), allCategories, $("#filter-category").value, "Tutte");
  const methods = (state.settings.paymentMethods || []).map((item) => ({ value: item, label: item }));
  fillSelect($("#transaction-payment-method"), methods, $("#transaction-payment-method").value || methods[0]?.value || "");
  updateTransactionCategories();
}

function renderCurrentView() {
  if (!state) return;
  if (currentView === "dashboard") renderDashboard(state, selectedMonth);
  else if (currentView === "transactions") renderTransactionsPage();
  else if (currentView === "budget") renderBudgetPage(state, selectedMonth, saveCategoryBudget);
  else if (currentView === "networth") renderNetWorth(state, selectedMonth, { onEdit: openSnapshotForm, onDelete: deleteSnapshot });
  else if (currentView === "settings") renderSettings(state, settingsActions);
}

function navigate(view, { updateHash = true } = {}) {
  if (![$("#view-dashboard"), $("#view-transactions"), $("#view-budget"), $("#view-networth"), $("#view-settings")].some((node) => node.dataset.view === view)) view = "dashboard";
  currentView = view;
  $$(".view").forEach((section) => { const active = section.dataset.view === view; section.hidden = !active; section.classList.toggle("is-active", active); });
  $$(".nav-item").forEach((button) => { const active = button.dataset.nav === view; button.classList.toggle("is-active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  if (updateHash && location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(renderCurrentView);
}

function transactionFilters() {
  return {
    search: $("#filter-search").value,
    month: $("#filter-month").value,
    from: $("#filter-from").value,
    to: $("#filter-to").value,
    type: $("#filter-type").value,
    category: $("#filter-category").value,
    account: $("#filter-account").value,
    sort: $("#filter-sort").value,
  };
}

function renderTransactionsPage() {
  const filters = transactionFilters();
  const filtered = filterTransactions([...state.transactions], filters, state);
  renderTransactionList($("#transactions-list"), filtered, state, {
    onEdit: openTransactionForm,
    onDuplicate: duplicateTransaction,
    onDelete: deleteTransaction,
    emptyMessage: state.transactions.length ? "Nessun movimento corrisponde ai filtri." : "Non ci sono ancora movimenti. Tocca + per aggiungerne uno.",
  });
  renderFilterTotals($("#filtered-totals"), filtered, state.settings);
  $("#transactions-result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "movimento" : "movimenti"}`;
  const activeCount = Object.entries(filters).filter(([key, value]) => value && !["search", "sort"].includes(key)).length + (filters.search ? 1 : 0);
  $("#filter-count").hidden = !activeCount;
  $("#filter-count").textContent = activeCount;
  const due = dueRecurringTemplates(state);
  $("#recurring-card").hidden = !due.length;
  renderRecurringProposals($("#recurring-proposals"), due, state, confirmRecurringProposal);
}

function updateTransactionCategories(preferred) {
  const type = $("input[name='transaction-type']:checked")?.value || "expense";
  const options = state.categories.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name, "it")).map((item) => ({ value: item.id, label: `${item.icon || "•"} ${item.name}` }));
  const select = $("#transaction-category");
  const selected = preferred || select.value;
  const transfer = type === "transfer";
  const validSelection = options.some((item) => item.value === selected) ? selected : (transfer ? options[0]?.value : "");
  fillSelect(select, options, validSelection, options.length && transfer ? null : (options.length ? "Seleziona categoria" : "Nessuna categoria disponibile"));
  $("#transfer-account-field").hidden = !transfer;
  $("#payment-method-field").hidden = transfer;
  $("#account-source-label").textContent = transfer ? "(origine)" : "";
  $("#transaction-transfer-account").required = transfer;
}

function updateRecurringField() {
  $("#frequency-field").hidden = !$("#transaction-recurring").checked;
}

function resetTransactionForm() {
  $("#transaction-form").reset();
  $("#transaction-id").value = "";
  $("#transaction-date").value = todayISO();
  $("input[name='transaction-type'][value='expense']").checked = true;
  const defaultAccount = state.accounts.find((item) => item.type === "bank" && item.includeInAvailableBalance)?.id || state.accounts[0]?.id || "";
  $("#transaction-account").value = defaultAccount;
  $("#transaction-transfer-account").value = state.accounts.find((item) => item.id !== defaultAccount)?.id || defaultAccount;
  $("#transaction-payment-method").value = state.settings.paymentMethods?.[0] || "";
  $("#transaction-modal-title").textContent = "Nuovo movimento";
  showFieldError($("#amount-error"), ""); showFieldError($("#transaction-form-error"), "");
  $("#transaction-category").value = "";
  updateTransactionCategories(); updateRecurringField();
}

function openTransactionForm(transaction = null) {
  resetTransactionForm();
  if (transaction) {
    $("#transaction-id").value = transaction.id;
    const typeRadio = $(`input[name='transaction-type'][value='${transaction.type}']`); if (typeRadio) typeRadio.checked = true;
    updateTransactionCategories(transaction.category);
    $("#transaction-amount").value = centsToInput(transaction.amount);
    $("#transaction-date").value = transaction.date;
    $("#transaction-description").value = transaction.description || "";
    $("#transaction-account").value = transaction.account || "";
    $("#transaction-transfer-account").value = transaction.transferAccount || "";
    $("#transaction-payment-method").value = transaction.paymentMethod || "";
    $("#transaction-recurring").checked = Boolean(transaction.recurring);
    $("#transaction-frequency").value = transaction.frequency || "monthly";
    $("#transaction-notes").value = transaction.notes || "";
    $("#transaction-modal-title").textContent = "Modifica movimento";
    updateRecurringField();
  }
  showModal("transaction-modal", "#transaction-amount");
}

function duplicateTransaction(transaction) {
  openTransactionForm({ ...transaction, id: "", date: todayISO(), description: `${transaction.description} (copia)`, recurring: false, recurringId: undefined, createdAt: undefined });
  $("#transaction-modal-title").textContent = "Duplica movimento";
}

async function saveTransaction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = $("#transaction-id").value;
  const existing = id ? state.transactions.find((item) => item.id === id) : null;
  const type = $("input[name='transaction-type']:checked")?.value;
  const amount = parseAmountToCents($("#transaction-amount").value);
  const date = $("#transaction-date").value;
  const category = $("#transaction-category").value;
  const description = $("#transaction-description").value.trim();
  const account = $("#transaction-account").value;
  const transferAccount = $("#transaction-transfer-account").value;
  let error = "";
  showFieldError($("#amount-error"), "");
  if (!Number.isInteger(amount) || amount <= 0) { showFieldError($("#amount-error"), "Inserisci un importo valido e maggiore di zero."); $("#transaction-amount").focus(); return; }
  if (!validateISODate(date)) error = "Inserisci una data valida.";
  else if (!type || !TYPE_META[type]) error = "Seleziona il tipo di movimento.";
  else if (!category) error = "Seleziona una categoria.";
  else if (!description) error = "Inserisci una descrizione.";
  else if (!account) error = "Seleziona un conto.";
  else if (type !== "transfer" && !$("#transaction-payment-method").value) error = "Seleziona un metodo di pagamento.";
  else if (type === "transfer" && (!transferAccount || transferAccount === account)) error = "Per un trasferimento scegli due conti diversi.";
  if (error) { showFieldError($("#transaction-form-error"), error); return; }
  const now = new Date().toISOString();
  const recurring = $("#transaction-recurring").checked;
  const frequency = $("#transaction-frequency").value;
  let recurringId = recurring ? (existing?.recurringId || uid()) : undefined;
  const transaction = {
    ...(existing || {}), id: id || uid(), date, type, amount, category, description, account,
    paymentMethod: type === "transfer" ? "" : $("#transaction-payment-method").value,
    recurring, notes: $("#transaction-notes").value.trim(), createdAt: existing?.createdAt || now, updatedAt: now,
  };
  if (type === "transfer") transaction.transferAccount = transferAccount; else delete transaction.transferAccount;
  if (recurring) { transaction.frequency = frequency; transaction.recurringId = recurringId; }
  else { delete transaction.frequency; delete transaction.recurringId; }
  form.querySelector("button[type='submit']").disabled = true;
  try {
    await put("transactions", transaction);
    if (recurring) {
      await put("recurringTransactions", { id: recurringId, type, amount, category, description, account, transferAccount: type === "transfer" ? transferAccount : undefined, paymentMethod: transaction.paymentMethod, notes: transaction.notes, frequency, nextDate: calculateRecurringNextDate(date, frequency), active: true, isDemo: transaction.isDemo || false });
    } else if (existing?.recurringId) await remove("recurringTransactions", existing.recurringId);
    closeModal($("#transaction-modal"));
    await reloadState(id ? "Movimento aggiornato." : "Movimento salvato.");
  } catch (errorObject) { showFieldError($("#transaction-form-error"), errorObject.message || "Non è stato possibile salvare il movimento."); }
  finally { form.querySelector("button[type='submit']").disabled = false; }
}

async function deleteTransaction(transaction) {
  const confirmed = await askConfirmation({ title: "Eliminare il movimento?", message: `${transaction.description} · ${formatMoney(transaction.amount, state.settings.currency, state.settings.language)}. Questa azione non può essere annullata.`, acceptLabel: "Elimina" });
  if (!confirmed) return;
  await remove("transactions", transaction.id);
  await reloadState("Movimento eliminato.");
}

async function confirmRecurringProposal(template) {
  const transaction = { id: uid(), date: template.nextDate, type: template.type, amount: template.amount, category: template.category, description: template.description, account: template.account, paymentMethod: template.paymentMethod || "", recurring: true, recurringId: template.id, frequency: template.frequency, notes: template.notes || "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (template.type === "transfer") transaction.transferAccount = template.transferAccount;
  await put("transactions", transaction);
  await put("recurringTransactions", { ...template, nextDate: calculateRecurringNextDate(template.nextDate, template.frequency) });
  await reloadState("Movimento ricorrente registrato.");
}

async function saveTotalBudget(event) {
  event.preventDefault();
  const amount = parseAmountToCents($("#total-budget-input").value);
  if (!Number.isInteger(amount) || amount <= 0) { toast("Inserisci un budget maggiore di zero.", "error"); return; }
  const existing = state.budgets.find((item) => item.month === selectedMonth);
  await put("budgets", { month: selectedMonth, totalBudget: amount, categoryBudgets: existing?.categoryBudgets || {} });
  await reloadState("Budget mensile salvato.");
}

async function saveCategoryBudget(categoryId, value) {
  const amount = value.trim() ? parseAmountToCents(value) : 0;
  if (!Number.isInteger(amount) || amount < 0) { toast("Inserisci un importo valido per la categoria.", "error"); return; }
  const existing = state.budgets.find((item) => item.month === selectedMonth) || { month: selectedMonth, totalBudget: 0, categoryBudgets: {} };
  const categoryBudgets = { ...(existing.categoryBudgets || {}) };
  if (amount) categoryBudgets[categoryId] = amount; else delete categoryBudgets[categoryId];
  await put("budgets", { ...existing, categoryBudgets });
  await reloadState(amount ? "Budget di categoria salvato." : "Budget di categoria rimosso.");
}

async function copyPreviousBudget() {
  const [year, month] = selectedMonth.split("-").map(Number);
  const previousDate = new Date(year, month - 2, 1);
  const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const previous = state.budgets.find((item) => item.month === previousMonth);
  if (!previous) { toast("Non esiste un budget nel mese precedente.", "error"); return; }
  const current = state.budgets.find((item) => item.month === selectedMonth);
  if (current && !await askConfirmation({ title: "Sostituire il budget?", message: "Il budget di questo mese sarà sostituito con quello del mese precedente.", acceptLabel: "Sostituisci" })) return;
  await put("budgets", { ...structuredClone(previous), month: selectedMonth });
  await reloadState("Budget copiato dal mese precedente.");
}

async function deleteCurrentBudget() {
  const budget = state.budgets.find((item) => item.month === selectedMonth); if (!budget) return;
  if (!await askConfirmation({ title: "Eliminare il budget?", message: "Verranno rimossi il limite generale e tutti i limiti di categoria per il mese selezionato.", acceptLabel: "Elimina" })) return;
  await remove("budgets", selectedMonth); await reloadState("Budget eliminato.");
}

function openSnapshotForm(snapshot = null) {
  $("#snapshot-form").reset(); $("#snapshot-id").value = snapshot?.id || ""; $("#snapshot-date").value = snapshot?.date || todayISO();
  $("#snapshot-modal-title").textContent = snapshot ? "Modifica snapshot" : "Nuovo snapshot";
  const accountValues = new Map((snapshot?.accounts || []).map((item) => [item.accountId, item.value]));
  const fields = $("#snapshot-account-fields"); fields.replaceChildren();
  state.accounts.filter((account) => account.type !== "investment" && account.type !== "credit").forEach((account) => {
    const calculated = accountValues.has(account.id) ? accountValues.get(account.id) : account.initialBalance + state.transactions.reduce((balance, item) => {
      if (item.type === "income" && item.account === account.id) return balance + item.amount;
      if (["expense", "investment"].includes(item.type) && item.account === account.id) return balance - item.amount;
      if (item.type === "transfer" && item.account === account.id) return balance - item.amount;
      if (item.type === "transfer" && item.transferAccount === account.id) return balance + item.amount;
      return balance;
    }, 0);
    const input = element("input", { inputMode: "decimal", value: centsToInput(calculated), dataset: { snapshotAccount: account.id } });
    fields.append(element("label", {}, [`${account.name} (€)`, input]));
  });
  const current = currentNetWorth(state);
  $("#snapshot-investments").value = centsToInput(snapshot?.investmentsValue ?? current.investments);
  $("#snapshot-debts").value = centsToInput(snapshot?.debtsValue ?? current.debts);
  $("#snapshot-notes").value = snapshot?.notes || "";
  showFieldError($("#snapshot-form-error"), ""); showModal("snapshot-modal", "#snapshot-date");
}

async function saveSnapshot(event) {
  event.preventDefault();
  const id = $("#snapshot-id").value; const date = $("#snapshot-date").value;
  const accounts = $$('[data-snapshot-account]').map((input) => ({ accountId: input.dataset.snapshotAccount, value: parseAmountToCents(input.value) }));
  const investmentsValue = parseAmountToCents($("#snapshot-investments").value); const debtsValue = parseAmountToCents($("#snapshot-debts").value);
  if (!validateISODate(date)) { showFieldError($("#snapshot-form-error"), "Inserisci una data valida."); return; }
  if (accounts.some((item) => !Number.isInteger(item.value)) || !Number.isInteger(investmentsValue) || investmentsValue < 0 || !Number.isInteger(debtsValue) || debtsValue < 0) { showFieldError($("#snapshot-form-error"), "Controlla gli importi inseriti."); return; }
  await put("netWorthSnapshots", { id: id || uid(), date, accounts, investmentsValue, debtsValue, notes: $("#snapshot-notes").value.trim(), updatedAt: new Date().toISOString() });
  closeModal($("#snapshot-modal")); await reloadState(id ? "Snapshot aggiornato." : "Snapshot salvato.");
}

async function deleteSnapshot(snapshot) {
  if (!await askConfirmation({ title: "Eliminare lo snapshot?", message: `Rimuovere i valori del ${snapshot.date}?`, acceptLabel: "Elimina" })) return;
  await remove("netWorthSnapshots", snapshot.id); await reloadState("Snapshot eliminato.");
}

function openEntityForm(kind, entity = null) {
  $("#entity-form").reset(); $("#entity-kind").value = kind; $("#entity-id").value = entity?.id || "";
  const categoryMode = kind === "category"; $("#category-entity-fields").hidden = !categoryMode; $("#account-entity-fields").hidden = categoryMode;
  $("#entity-modal-title").textContent = `${entity ? "Modifica" : "Nuovo"} ${categoryMode ? "categoria" : "conto"}`;
  if (categoryMode) {
    $("#entity-name").value = entity?.name || ""; $("#entity-category-type").value = entity?.type || "expense"; $("#entity-icon").value = entity?.icon || "●"; $("#entity-color").value = /^#[0-9a-f]{6}$/i.test(entity?.color || "") ? entity.color : "#2f7d68";
  } else {
    $("#account-entity-name").value = entity?.name || ""; $("#entity-account-type").value = entity?.type || "bank"; $("#entity-initial-balance").value = centsToInput(entity?.initialBalance || 0); $("#entity-available").checked = entity?.includeInAvailableBalance ?? true;
  }
  showFieldError($("#entity-form-error"), ""); showModal("entity-modal", categoryMode ? "#entity-name" : "#account-entity-name");
}

async function saveEntity(event) {
  event.preventDefault(); const kind = $("#entity-kind").value; const id = $("#entity-id").value || uid();
  if (kind === "category") {
    const name = $("#entity-name").value.trim(); if (!name) { showFieldError($("#entity-form-error"), "Inserisci il nome della categoria."); return; }
    const duplicate = state.categories.some((item) => item.id !== id && item.type === $("#entity-category-type").value && item.name.toLowerCase() === name.toLowerCase()); if (duplicate) { showFieldError($("#entity-form-error"), "Esiste già una categoria con questo nome."); return; }
    const old = state.categories.find((item) => item.id === id);
    if (old && old.type !== $("#entity-category-type").value && state.transactions.some((item) => item.category === id)) { showFieldError($("#entity-form-error"), "Il tipo non può cambiare finché la categoria è usata da un movimento."); return; }
    await put("categories", { ...(old || {}), id, name, type: $("#entity-category-type").value, icon: $("#entity-icon").value.trim() || "●", color: $("#entity-color").value, isDefault: old?.isDefault || false });
  } else {
    const name = $("#account-entity-name").value.trim(); const initialBalance = parseAmountToCents($("#entity-initial-balance").value);
    if (!name) { showFieldError($("#entity-form-error"), "Inserisci il nome del conto."); return; }
    if (!Number.isInteger(initialBalance)) { showFieldError($("#entity-form-error"), "Inserisci un saldo iniziale valido."); return; }
    const old = state.accounts.find((item) => item.id === id);
    await put("accounts", { ...(old || {}), id, name, type: $("#entity-account-type").value, initialBalance, includeInAvailableBalance: $("#entity-available").checked, isDefault: old?.isDefault || false });
  }
  closeModal($("#entity-modal")); await reloadState(kind === "category" ? "Categoria salvata." : "Conto salvato.");
}

async function deleteCategory(category) {
  if (state.transactions.some((item) => item.category === category.id) || state.recurringTransactions.some((item) => item.category === category.id) || state.budgets.some((budget) => Object.hasOwn(budget.categoryBudgets || {}, category.id))) { toast("La categoria è ancora usata da movimenti, ricorrenze o budget.", "error"); return; }
  if (!await askConfirmation({ title: "Eliminare la categoria?", message: `La categoria “${category.name}” verrà rimossa.`, acceptLabel: "Elimina" })) return;
  await remove("categories", category.id); await reloadState("Categoria eliminata.");
}

async function deleteAccount(account) {
  if (state.transactions.some((item) => item.account === account.id || item.transferAccount === account.id) || state.recurringTransactions.some((item) => item.account === account.id || item.transferAccount === account.id) || state.netWorthSnapshots.some((snapshot) => snapshot.accounts?.some((item) => item.accountId === account.id))) { toast("Il conto è ancora usato da movimenti, ricorrenze o snapshot.", "error"); return; }
  if (state.accounts.length <= 1) { toast("Deve rimanere almeno un conto.", "error"); return; }
  if (!await askConfirmation({ title: "Eliminare il conto?", message: `Il conto “${account.name}” verrà rimosso.`, acceptLabel: "Elimina" })) return;
  await remove("accounts", account.id); await reloadState("Conto eliminato.");
}

const settingsActions = {
  onEditCategory: (item) => openEntityForm("category", item), onDeleteCategory: deleteCategory,
  onEditAccount: (item) => openEntityForm("account", item), onDeleteAccount: deleteAccount,
  onDeletePaymentMethod: async (method) => {
    if ((state.settings.paymentMethods || []).length <= 1) { toast("Deve rimanere almeno un metodo di pagamento.", "error"); return; }
    state.settings.paymentMethods = state.settings.paymentMethods.filter((item) => item !== method); await saveSettings(state.settings); await reloadState("Metodo di pagamento eliminato.");
  },
};

async function savePreferences(event) {
  event.preventDefault(); const openingBalance = parseAmountToCents($("#setting-opening-balance").value); const firstDay = Number($("#setting-first-day").value);
  if (!Number.isInteger(openingBalance)) { toast("Inserisci un saldo iniziale valido.", "error"); return; }
  if (!Number.isInteger(firstDay) || firstDay < 1 || firstDay > 28) { toast("Il primo giorno deve essere compreso tra 1 e 28.", "error"); return; }
  state.settings = { ...state.settings, currency: $("#setting-currency").value, language: $("#setting-language").value, theme: $("#setting-theme").value, firstDayOfMonth: firstDay, openingBalance };
  await saveSettings(state.settings); applyTheme(state.settings.theme); await reloadState("Preferenze salvate.");
}

async function addPaymentMethod(event) {
  event.preventDefault(); const input = $("#new-payment-method"); const value = input.value.trim(); if (!value) return;
  if (state.settings.paymentMethods.some((item) => item.toLowerCase() === value.toLowerCase())) { toast("Questo metodo esiste già.", "error"); return; }
  state.settings.paymentMethods = [...state.settings.paymentMethods, value]; await saveSettings(state.settings); input.value = ""; await reloadState("Metodo di pagamento aggiunto.");
}

async function loadDemoTransactions({ onboarding = false } = {}) {
  if (state.transactions.some((item) => item.isDemo)) { toast("I dati demo sono già presenti.", "error"); return; }
  const rows = demoData(); await putMany("transactions", rows);
  const recurring = rows.filter((item) => item.recurring).map((item) => ({ id: uid(), type: item.type, amount: item.amount, category: item.category, description: item.description, account: item.account, paymentMethod: item.paymentMethod, notes: item.notes, frequency: "monthly", nextDate: calculateRecurringNextDate(item.date, "monthly"), active: true, isDemo: true }));
  await putMany("recurringTransactions", recurring);
  state.settings.onboardingComplete = true; await saveSettings(state.settings);
  if (onboarding) { $("#onboarding-modal").hidden = true; document.body.classList.remove("modal-open"); }
  await reloadState("Dati demo caricati.");
}

async function deleteDemoTransactions() {
  const rows = state.transactions.filter((item) => item.isDemo); const recurring = state.recurringTransactions.filter((item) => item.isDemo);
  if (!rows.length && !recurring.length) { toast("Non ci sono dati demo da eliminare.", "error"); return; }
  if (!await askConfirmation({ title: "Eliminare i dati demo?", message: `Verranno rimossi ${rows.length} movimenti dimostrativi. I tuoi dati restano invariati.`, acceptLabel: "Elimina" })) return;
  await Promise.all([...rows.map((item) => remove("transactions", item.id)), ...recurring.map((item) => remove("recurringTransactions", item.id))]); await reloadState("Dati demo eliminati.");
}

async function deleteEverything() {
  if (!await askConfirmation({ title: "Cancellare tutti i dati?", message: "Questa operazione è irreversibile. Prima di procedere, verifica di avere un backup recente.", acceptLabel: "Cancella definitivamente" })) return;
  await clearAll(); await initializeDefaults(); state = await loadAllData();
  state.settings.onboardingComplete = true; await saveSettings(state.settings); await reloadState("Tutti i dati sono stati cancellati.");
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Il backup è troppo grande (massimo 20 MB).");
    pendingImport = validateBackup(JSON.parse(await file.text()));
    const counts = backupCounts(pendingImport);
    $("#import-summary").textContent = `Il file contiene ${counts.movimenti} movimenti, ${counts.budget} budget, ${counts.categorie} categorie, ${counts.conti} conti, ${counts.patrimonio} snapshot e ${counts.ricorrenze} ricorrenze.`;
    showModal("import-modal", "input[name='import-mode']");
  } catch (error) { pendingImport = null; toast(error instanceof SyntaxError ? "Il file non contiene JSON valido." : error.message, "error"); }
}

async function confirmImport() {
  if (!pendingImport) return;
  const mode = $("input[name='import-mode']:checked").value;
  try {
    const normalized = normalizeBackup(pendingImport);
    if (mode === "replace") await replaceAllData(normalized); else await mergeAllData(normalized);
    await initializeDefaults(); closeModal($("#import-modal")); pendingImport = null; await reloadState("Backup importato correttamente.");
  } catch (error) { toast(error.message || "Importazione non riuscita.", "error"); }
}

function resetFilters() {
  $("#filter-search").value = ""; $("#filter-month").value = ""; $("#filter-from").value = ""; $("#filter-to").value = ""; $("#filter-type").value = ""; $("#filter-category").value = ""; $("#filter-account").value = ""; $("#filter-sort").value = "date-desc"; renderTransactionsPage();
}

function bindEvents() {
  document.addEventListener("keydown", focusTrap);
  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  $$('[data-open-transaction]').forEach((button) => button.addEventListener("click", () => openTransactionForm()));
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal"))));
  $("#confirm-cancel").addEventListener("click", () => resolveConfirmation(false)); $("#confirm-accept").addEventListener("click", () => resolveConfirmation(true));
  $("#transaction-form").addEventListener("submit", saveTransaction);
  $$('input[name="transaction-type"]').forEach((input) => input.addEventListener("change", () => updateTransactionCategories()));
  $("#transaction-recurring").addEventListener("change", updateRecurringField);
  $("#dashboard-month").addEventListener("change", (event) => { selectedMonth = event.target.value || currentMonth(); renderCurrentView(); });
  $("#budget-month").addEventListener("change", (event) => { selectedMonth = event.target.value || currentMonth(); renderCurrentView(); });
  $("#toggle-filters").addEventListener("click", () => { const panel = $("#advanced-filters"); panel.hidden = !panel.hidden; $("#toggle-filters").setAttribute("aria-expanded", String(!panel.hidden)); });
  const filterHandler = debounce(renderTransactionsPage, 120);
  ["#filter-search", "#filter-month", "#filter-from", "#filter-to", "#filter-type", "#filter-category", "#filter-account", "#filter-sort"].forEach((selector) => $(selector).addEventListener("input", filterHandler));
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#total-budget-form").addEventListener("submit", saveTotalBudget); $("#copy-previous-budget").addEventListener("click", copyPreviousBudget); $("#delete-budget").addEventListener("click", deleteCurrentBudget);
  $("#open-snapshot").addEventListener("click", () => openSnapshotForm()); $("#snapshot-form").addEventListener("submit", saveSnapshot);
  $("#preferences-form").addEventListener("submit", savePreferences); $("#add-category").addEventListener("click", () => openEntityForm("category")); $("#add-account").addEventListener("click", () => openEntityForm("account")); $("#entity-form").addEventListener("submit", saveEntity);
  $("#payment-method-form").addEventListener("submit", addPaymentMethod);
  $("#export-json").addEventListener("click", () => { exportJSON(state); toast("Backup JSON creato."); });
  $("#export-csv").addEventListener("click", () => { exportTransactionsCSV([...state.transactions].sort((a, b) => b.date.localeCompare(a.date)), { type: (id) => TYPE_META[id]?.label || id, category: (id) => state.categories.find((item) => item.id === id)?.name || "", account: (id) => state.accounts.find((item) => item.id === id)?.name || "" }); toast("File CSV creato."); });
  $("#import-json-file").addEventListener("change", handleImportFile); $("#confirm-import").addEventListener("click", confirmImport);
  $("#load-demo").addEventListener("click", () => loadDemoTransactions()); $("#delete-demo").addEventListener("click", deleteDemoTransactions); $("#delete-all-data").addEventListener("click", deleteEverything);
  $("#start-empty").addEventListener("click", async () => { state.settings.onboardingComplete = true; await saveSettings(state.settings); $("#onboarding-modal").hidden = true; document.body.classList.remove("modal-open"); toast("Bremen Budget è pronto."); });
  $("#start-demo").addEventListener("click", () => loadDemoTransactions({ onboarding: true }));
  $("#theme-toggle").addEventListener("click", async () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; state.settings.theme = next; await saveSettings(state.settings); applyTheme(next); renderCurrentView(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state?.settings.theme === "system") { applyTheme("system"); renderCurrentView(); } });
  window.addEventListener("resize", debounce(() => { if (["dashboard", "networth"].includes(currentView)) renderCurrentView(); }, 180));
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1), { updateHash: false }));
  $("#update-app").addEventListener("click", () => waitingServiceWorker?.postMessage({ type: "SKIP_WAITING" }));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !["http:", "https:"].includes(location.protocol)) return;
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    if (registration.waiting) { waitingServiceWorker = registration.waiting; $("#update-banner").hidden = false; }
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) { waitingServiceWorker = worker; $("#update-banner").hidden = false; } });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
  } catch { /* L'app resta utilizzabile anche se la registrazione PWA fallisce. */ }
}

async function init() {
  try {
    applyTheme(localStorage.getItem("bremen-budget-theme") || "system");
    await initializeDefaults(); state = await loadAllData(); applyTheme(state.settings.theme || "system");
    bindEvents(); populateOptions();
    const hashView = location.hash.slice(1); navigate(["dashboard", "transactions", "budget", "networth", "settings"].includes(hashView) ? hashView : "dashboard");
    if (!state.settings.onboardingComplete) { showModal("onboarding-modal", "#start-demo"); }
    $("#app").setAttribute("aria-busy", "false");
    await registerServiceWorker();
  } catch (error) {
    $("#app").setAttribute("aria-busy", "false");
    toast(error.message || "Non è stato possibile avviare Bremen Budget.", "error");
  }
}

init();
