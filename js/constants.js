export const SCHEMA_VERSION = 1;
export const DB_NAME = "bremen-budget";
export const DB_VERSION = 1;

export const STORE_NAMES = [
  "transactions",
  "budgets",
  "accounts",
  "categories",
  "netWorthSnapshots",
  "settings",
  "recurringTransactions",
];

export const TYPE_META = {
  income: { label: "Entrata", sign: "+", icon: "↗" },
  expense: { label: "Spesa", sign: "−", icon: "↘" },
  investment: { label: "Investimento", sign: "−", icon: "◆" },
  transfer: { label: "Trasferimento", sign: "", icon: "⇄" },
};

export const DEFAULT_CATEGORIES = [
  ...["Stipendio", "Lavoro occasionale", "Rimborso", "Regalo", "Vendita", "Interesse", "Dividendo", "Altro"].map((name, index) => ({
    id: `income-${index + 1}`, name, type: "income", icon: ["💼", "🧑‍💻", "↩", "🎁", "🏷", "％", "◫", "＋"][index], color: "#228b65", isDefault: true,
  })),
  ...["Affitto", "Supermercato", "Ristoranti e bar", "Trasporti", "Viaggi", "Casa", "Utenze", "Abbonamenti", "Salute", "Sport", "Tecnologia", "Abbigliamento", "Divertimento", "Università", "Regali", "Varie"].map((name, index) => ({
    id: `expense-${index + 1}`, name, type: "expense", icon: ["⌂", "🛒", "☕", "🚋", "✈", "▣", "⚡", "⟳", "✚", "●", "⌁", "◇", "☆", "▤", "🎁", "•••"][index], color: "#d65f5f", isDefault: true,
  })),
  ...["ETF", "Azioni", "Obbligazioni", "Conto deposito", "Crypto", "Fondo pensione", "Altro"].map((name, index) => ({
    id: `investment-${index + 1}`, name, type: "investment", icon: ["▥", "⌁", "▰", "▣", "◇", "◈", "＋"][index], color: "#6c63c7", isDefault: true,
  })),
  { id: "transfer-1", name: "Trasferimento tra conti", type: "transfer", icon: "⇄", color: "#68707c", isDefault: true },
];

export const DEFAULT_ACCOUNTS = [
  { id: "trade-republic", name: "Trade Republic", type: "investment", initialBalance: 0, includeInAvailableBalance: false, isDefault: true },
  { id: "conto-italiano", name: "Conto italiano", type: "bank", initialBalance: 0, includeInAvailableBalance: true, isDefault: true },
  { id: "contanti", name: "Contanti", type: "cash", initialBalance: 0, includeInAvailableBalance: true, isDefault: true },
  { id: "carta-credito", name: "Carta di credito", type: "credit", initialBalance: 0, includeInAvailableBalance: true, isDefault: true },
  { id: "altro", name: "Altro", type: "bank", initialBalance: 0, includeInAvailableBalance: true, isDefault: true },
];

export const DEFAULT_PAYMENT_METHODS = ["Carta", "Contanti", "Bonifico", "Addebito diretto", "Apple Pay", "Altro"];

export const DEFAULT_SETTINGS = {
  currency: "EUR",
  language: "it-IT",
  theme: "system",
  firstDayOfMonth: 1,
  openingBalance: 0,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  onboardingComplete: false,
};

export function demoData() {
  const now = new Date();
  const day = (value) => {
    const date = new Date(now.getFullYear(), now.getMonth(), Math.min(value, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
    return date.toISOString().slice(0, 10);
  };
  const createdAt = new Date().toISOString();
  const base = { account: "conto-italiano", paymentMethod: "Bonifico", recurring: false, notes: "Dati dimostrativi", createdAt, updatedAt: createdAt, isDemo: true };
  const id = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return [
    { ...base, id: id(), date: day(1), type: "income", amount: 99200, category: "income-1", description: "Stipendio" },
    { ...base, id: id(), date: day(2), type: "expense", amount: 43782, category: "expense-1", description: "Affitto", recurring: true },
    { ...base, id: id(), date: day(6), type: "expense", amount: 4250, category: "expense-2", description: "Spesa settimanale", paymentMethod: "Carta" },
    { ...base, id: id(), date: day(8), type: "expense", amount: 5800, category: "expense-4", description: "Deutschlandticket", recurring: true },
    { ...base, id: id(), date: day(10), type: "investment", amount: 20000, category: "investment-1", description: "Piano di accumulo ETF", account: "trade-republic" },
  ];
}
