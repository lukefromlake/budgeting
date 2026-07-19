import { TYPE_META } from "./constants.js";

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => todayISO().slice(0, 7);
export const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function parseAmountToCents(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  let normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/€/g, "");
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma > dot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) normalized = normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function centsToInput(cents = 0) {
  return (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
}

export function formatMoney(cents = 0, currency = "EUR", locale = "it-IT") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(cents || 0) / 100);
}

export function formatDate(iso, options = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", options).format(new Date(`${iso}T12:00:00`));
}

export function formatMonth(month) {
  if (!month) return "—";
  const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const isInMonth = (date, month) => Boolean(date && month && date.slice(0, 7) === month);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function monthOffset(month, offset) {
  const [year, index] = month.split("-").map(Number);
  const value = new Date(year, index - 1 + offset, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function sumByType(transactions) {
  return transactions.reduce((totals, item) => {
    if (Object.hasOwn(totals, item.type)) totals[item.type] += Number(item.amount || 0);
    return totals;
  }, { income: 0, expense: 0, investment: 0, transfer: 0 });
}

export function transactionSignedAmount(transaction) {
  if (transaction.type === "income") return transaction.amount;
  if (transaction.type === "expense" || transaction.type === "investment") return -transaction.amount;
  return 0;
}

export function accountBalance(account, transactions) {
  return transactions.reduce((balance, item) => {
    if (item.type === "transfer") {
      if (item.account === account.id) balance -= item.amount;
      if (item.transferAccount === account.id) balance += item.amount;
      return balance;
    }
    if (item.account === account.id) {
      if (item.type === "investment" && account.type === "investment") balance += item.amount;
      else balance += transactionSignedAmount(item);
    }
    return balance;
  }, Number(account.initialBalance || 0));
}

export function typeAmountLabel(transaction, settings) {
  const meta = TYPE_META[transaction.type];
  const sign = transaction.type === "income" ? "+" : transaction.type === "transfer" ? "" : "−";
  return `${sign}${formatMoney(transaction.amount, settings.currency, settings.language)}`;
}

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export function debounce(fn, wait = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function validateISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export function escapeForSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function calculateRecurringNextDate(date, frequency = "monthly") {
  const source = new Date(`${date}T12:00:00`);
  if (frequency === "weekly") source.setDate(source.getDate() + 7);
  else if (frequency === "yearly") source.setFullYear(source.getFullYear() + 1);
  else source.setMonth(source.getMonth() + 1);
  return source.toISOString().slice(0, 10);
}

export function setText(element, value) {
  if (element) element.textContent = value;
}
