import assert from "node:assert/strict";
import { dashboardMetrics } from "../js/dashboard.js";
import { validateBackup } from "../js/export-import.js";
import { accountBalance, parseAmountToCents, sumByType } from "../js/utils.js";

assert.equal(parseAmountToCents("1.234,56"), 123456);
assert.equal(parseAmountToCents("1,234.56"), 123456);
assert.equal(parseAmountToCents("1234.56"), 123456);
assert.equal(parseAmountToCents("12,3"), 1230);
assert.equal(parseAmountToCents("-5,00"), -500);
assert.equal(parseAmountToCents("test"), null);

const bank = { id: "bank", type: "bank", initialBalance: 1000, includeInAvailableBalance: true };
const portfolio = { id: "portfolio", type: "investment", initialBalance: 0, includeInAvailableBalance: false };
const transactions = [
  { type: "income", account: "bank", amount: 500 },
  { type: "expense", account: "bank", amount: 200 },
  { type: "investment", account: "portfolio", amount: 100 },
  { type: "transfer", account: "bank", transferAccount: "portfolio", amount: 50 },
];
assert.equal(accountBalance(bank, transactions), 1250);
assert.equal(accountBalance(portfolio, transactions), 150);
assert.deepEqual(sumByType(transactions), { income: 500, expense: 200, investment: 100, transfer: 50 });

const metrics = dashboardMetrics({
  transactions,
  accounts: [bank, portfolio],
  budgets: [],
  settings: { openingBalance: 0 },
}, "2026-07");
assert.equal(metrics.available, 1150);

const backup = {
  app: "Bremen Budget",
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  transactions: [{ id: "t1", date: "2026-07-01", type: "expense", amount: 100, category: "c1", account: "a1" }],
  budgets: [{ month: "2026-07", totalBudget: 1000, categoryBudgets: { c1: 500 } }],
  categories: [{ id: "c1", name: "Test", type: "expense" }],
  accounts: [{ id: "a1", name: "Test", type: "bank", initialBalance: 0 }],
  netWorthSnapshots: [{ id: "s1", date: "2026-07-31", accounts: [{ accountId: "a1", value: 900 }], investmentsValue: 0, debtsValue: 0 }],
  settings: {},
  recurringTransactions: [{ id: "r1", type: "expense", amount: 100, frequency: "monthly" }],
};
assert.equal(validateBackup(backup), backup);
assert.throws(() => validateBackup({ ...backup, schemaVersion: 99 }), /non supportata/);
assert.throws(() => validateBackup({ ...backup, transactions: [{ ...backup.transactions[0], amount: 1.2 }] }), /movimenti/);

console.log("Unit tests: OK");
