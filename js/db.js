import { DB_NAME, DB_VERSION, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, STORE_NAMES } from "./constants.js";

let databasePromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Operazione IndexedDB non riuscita."));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Salvataggio locale non riuscito."));
    transaction.onabort = () => reject(transaction.error || new Error("Operazione annullata."));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const create = (name, options) => db.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : db.createObjectStore(name, options);
      const transactions = create("transactions", { keyPath: "id" });
      if (!transactions.indexNames.contains("date")) transactions.createIndex("date", "date");
      if (!transactions.indexNames.contains("type")) transactions.createIndex("type", "type");
      create("budgets", { keyPath: "month" });
      create("accounts", { keyPath: "id" });
      create("categories", { keyPath: "id" });
      const snapshots = create("netWorthSnapshots", { keyPath: "id" });
      if (!snapshots.indexNames.contains("date")) snapshots.createIndex("date", "date");
      create("settings", { keyPath: "key" });
      create("recurringTransactions", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Impossibile aprire l'archivio locale."));
    request.onblocked = () => reject(new Error("Chiudi le altre schede di Budgeting e riprova."));
  });
  return databasePromise;
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function getOne(storeName, key) {
  const db = await openDatabase();
  return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionToPromise(transaction);
  return value;
}

export async function putMany(storeName, values) {
  if (!values.length) return;
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  values.forEach((value) => store.put(value));
  await transactionToPromise(transaction);
}

export async function remove(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionToPromise(transaction);
}

export async function clearStore(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
  await transactionToPromise(transaction);
}

export async function clearAll() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAMES, "readwrite");
  STORE_NAMES.forEach((name) => transaction.objectStore(name).clear());
  await transactionToPromise(transaction);
}

export async function readSettings() {
  const rows = await getAll("settings");
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(({ key, value }) => [key, value])) };
}

export async function saveSettings(settings) {
  await putMany("settings", Object.entries(settings).map(([key, value]) => ({ key, value })));
}

export async function initializeDefaults() {
  const [accounts, categories, settings] = await Promise.all([getAll("accounts"), getAll("categories"), getAll("settings")]);
  if (!accounts.length) await putMany("accounts", DEFAULT_ACCOUNTS);
  if (!categories.length) await putMany("categories", DEFAULT_CATEGORIES);
  if (!settings.length) await saveSettings(DEFAULT_SETTINGS);
  await migrateLegacyInternshipCategories();
}

export async function migrateLegacyInternshipCategories() {
  const categoryMap = {
    "internship-1": "expense-6",
    "internship-2": "expense-16",
    "internship-3": "expense-6",
    "internship-4": "expense-6",
    "internship-5": "expense-5",
    "internship-6": "expense-16",
    "internship-7": "expense-16",
    "internship-8": "expense-16",
  };
  const categories = await getAll("categories");
  const legacyCategories = categories.filter((category) => Object.hasOwn(categoryMap, category.id));
  const oldSalary = categories.find((category) => category.id === "income-1" && category.name === "Stipendio internship");
  const oldStudentJob = categories.find((category) => category.id === "income-2" && category.name === "Werkstudent");
  if (oldSalary) await put("categories", { ...oldSalary, name: "Stipendio" });
  if (oldStudentJob) await put("categories", { ...oldStudentJob, name: "Lavoro occasionale" });
  if (!legacyCategories.length) return;

  const requiredTargets = new Set(legacyCategories.map((category) => categoryMap[category.id]));
  const missingTargets = DEFAULT_CATEGORIES.filter((category) => requiredTargets.has(category.id) && !categories.some((current) => current.id === category.id));
  await putMany("categories", missingTargets);

  const [transactions, recurring, budgets] = await Promise.all([getAll("transactions"), getAll("recurringTransactions"), getAll("budgets")]);
  const changedTransactions = transactions.filter((item) => Object.hasOwn(categoryMap, item.category)).map((item) => ({ ...item, category: categoryMap[item.category], updatedAt: new Date().toISOString() }));
  const changedRecurring = recurring.filter((item) => Object.hasOwn(categoryMap, item.category)).map((item) => ({ ...item, category: categoryMap[item.category] }));
  const changedBudgets = budgets.filter((budget) => Object.keys(budget.categoryBudgets || {}).some((id) => Object.hasOwn(categoryMap, id))).map((budget) => {
    const categoryBudgets = { ...(budget.categoryBudgets || {}) };
    Object.entries(categoryMap).forEach(([legacyId, targetId]) => {
      if (!Object.hasOwn(categoryBudgets, legacyId)) return;
      categoryBudgets[targetId] = Number(categoryBudgets[targetId] || 0) + Number(categoryBudgets[legacyId] || 0);
      delete categoryBudgets[legacyId];
    });
    return { ...budget, categoryBudgets };
  });
  await Promise.all([putMany("transactions", changedTransactions), putMany("recurringTransactions", changedRecurring), putMany("budgets", changedBudgets)]);
  await Promise.all(legacyCategories.map((category) => remove("categories", category.id)));
}

export async function loadAllData() {
  const [transactions, budgets, accounts, categories, netWorthSnapshots, settings, recurringTransactions] = await Promise.all([
    getAll("transactions"), getAll("budgets"), getAll("accounts"), getAll("categories"), getAll("netWorthSnapshots"), readSettings(), getAll("recurringTransactions"),
  ]);
  return { transactions, budgets, accounts, categories, netWorthSnapshots, settings, recurringTransactions };
}

export async function replaceAllData(data) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAMES, "readwrite");
  STORE_NAMES.forEach((name) => transaction.objectStore(name).clear());
  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    if (name === "settings") Object.entries(data.settings || {}).forEach(([key, value]) => store.put({ key, value }));
    else (data[name] || []).forEach((value) => store.put(value));
  }
  await transactionToPromise(transaction);
}

export async function mergeAllData(data) {
  for (const name of STORE_NAMES) {
    if (name === "settings") await saveSettings(data.settings || {});
    else await putMany(name, data[name] || []);
  }
}
