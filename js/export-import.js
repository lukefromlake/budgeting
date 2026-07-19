import { SCHEMA_VERSION, STORE_NAMES } from "./constants.js";
import { csvCell, downloadBlob } from "./utils.js";

export function buildBackup(data) {
  return {
    app: "Budgeting",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: data.transactions,
    budgets: data.budgets,
    categories: data.categories,
    accounts: data.accounts,
    netWorthSnapshots: data.netWorthSnapshots,
    settings: data.settings,
    recurringTransactions: data.recurringTransactions,
  };
}

export function exportJSON(data) {
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(JSON.stringify(buildBackup(data), null, 2), `budgeting-backup-${date}.json`, "application/json;charset=utf-8");
}

export function validateBackup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Il backup non sembra compatibile.");
  if (!["Budgeting", "Bremen Budget"].includes(value.app) || value.schemaVersion !== SCHEMA_VERSION) throw new Error("Versione del backup non supportata.");
  const requiredArrays = ["transactions", "budgets", "categories", "accounts", "netWorthSnapshots", "recurringTransactions"];
  if (requiredArrays.some((key) => !Array.isArray(value[key])) || typeof value.settings !== "object") throw new Error("Il backup è incompleto o danneggiato.");
  const validTransaction = value.transactions.every((row) => row && typeof row.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && ["income", "expense", "investment", "transfer"].includes(row.type) && Number.isInteger(row.amount) && row.amount > 0);
  if (!validTransaction) throw new Error("Alcuni movimenti nel backup non sono validi.");
  if (!value.categories.every((row) => row && typeof row.id === "string" && typeof row.name === "string" && ["income", "expense", "investment", "transfer"].includes(row.type))) throw new Error("Alcune categorie nel backup non sono valide.");
  if (!value.accounts.every((row) => row && typeof row.id === "string" && typeof row.name === "string" && ["bank", "cash", "investment", "credit"].includes(row.type) && Number.isInteger(row.initialBalance))) throw new Error("Alcuni conti nel backup non sono validi.");
  if (!value.budgets.every((row) => row && /^\d{4}-\d{2}$/.test(row.month) && Number.isInteger(row.totalBudget) && row.totalBudget >= 0 && row.categoryBudgets && Object.values(row.categoryBudgets).every((amount) => Number.isInteger(amount) && amount >= 0))) throw new Error("Alcuni budget nel backup non sono validi.");
  if (!value.netWorthSnapshots.every((row) => row && typeof row.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Array.isArray(row.accounts) && row.accounts.every((account) => typeof account.accountId === "string" && Number.isInteger(account.value)) && Number.isInteger(row.investmentsValue) && row.investmentsValue >= 0 && Number.isInteger(row.debtsValue) && row.debtsValue >= 0)) throw new Error("Alcuni snapshot nel backup non sono validi.");
  if (!value.recurringTransactions.every((row) => row && typeof row.id === "string" && ["income", "expense", "investment", "transfer"].includes(row.type) && Number.isInteger(row.amount) && row.amount > 0 && ["weekly", "monthly", "yearly"].includes(row.frequency))) throw new Error("Alcune ricorrenze nel backup non sono valide.");
  return value;
}

export function backupCounts(data) {
  return {
    movimenti: data.transactions.length,
    budget: data.budgets.length,
    categorie: data.categories.length,
    conti: data.accounts.length,
    patrimonio: data.netWorthSnapshots.length,
    ricorrenze: data.recurringTransactions.length,
  };
}

export function normalizeBackup(data) {
  return Object.fromEntries(STORE_NAMES.map((name) => [name, name === "settings" ? { ...data.settings } : [...(data[name] || [])]]));
}

export function exportTransactionsCSV(transactions, lookups) {
  const header = ["Data", "Tipo", "Categoria", "Descrizione", "Conto", "Conto destinazione", "Metodo di pagamento", "Importo", "Ricorrente", "Note"];
  const rows = transactions.map((row) => [
    row.date,
    lookups.type(row.type),
    lookups.category(row.category),
    row.description,
    lookups.account(row.account),
    row.transferAccount ? lookups.account(row.transferAccount) : "",
    row.paymentMethod,
    (row.amount / 100).toFixed(2).replace(".", ","),
    row.recurring ? "Sì" : "No",
    row.notes,
  ]);
  const content = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(content, `budgeting-movimenti-${date}.csv`, "text/csv;charset=utf-8");
}
