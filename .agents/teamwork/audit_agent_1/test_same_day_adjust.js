const assert = require('assert');

// Simulate accountCalcBalance
let patrimony = [
  { id: 'p1', account_id: 'acc1', year: 2026, month: 11, amount: 1000, reset_date: '2026-11-14' }
];

let accounts = [{ id: 'acc1', name: 'Principal' }];

let transactions = [
  // Transaction added on the same day as the balance adjustment
  { id: 't1', type: 'expense', amount: 50, date: '2026-11-14', account_id: 'acc1' }
];

function accountHistory(accountId) {
  return patrimony.filter(p => p.account_id === accountId);
}

function accountLatestReset(accountId, yr, mo) {
  return patrimony[0];
}

function accountTxDelta(t, accountId) {
  if (t.is_balance_adjustment) return 0;
  return t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
}

function accountTouchesAccount(t, accountId) {
  return t.account_id === accountId;
}

function accountCalcBalance(accountId, yr, mo) {
  const cutoff = '2026-12-01';
  const reset = accountLatestReset(accountId, yr, mo);
  const base = reset ? Number(reset.amount) : 0;
  const baseDate = reset ? (reset.reset_date) : '0000-01-01';
  const live = transactions.filter(t => {
    return accountTouchesAccount(t, accountId) && t.date > baseDate && t.date < cutoff;
  }).reduce((s, t) => s + accountTxDelta(t, accountId), 0);
  return base + live;
}

const bal = accountCalcBalance('acc1', 2026, 11);
console.log('Balance after adding same-day transaction:', bal);
console.log('Expected if transaction was intended after adjustment:', 950);
console.log('Observation: transactions on exact reset_date (t.date > baseDate) are excluded from live calculation!');
