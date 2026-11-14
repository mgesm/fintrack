const fs = require('fs');
const path = 'C:/Users/migue/.gemini/antigravity/scratch/fintrack/index.html';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const keywords = [
  'txExpenseImpact',
  'txIncomeImpact',
  'accountTxDelta',
  'accountCalcBalance',
  'accountCalcTheoreticalAsOf',
  'accountHistory',
  'accountLatestReset',
  'computa_todo',
  'roundMoney',
  'parseAmount',
  'round2',
  'fmtMoney',
  'is_balance_adjustment',
  'balance_adjustment_patrimony_id',
  'calcExpression',
  'saveTx',
  'deleteTx',
  'restoreTx',
  'renderHome',
  'calcMonthlyTotals',
  'renderAccounts',
  'adjustAccountBalance'
];

console.log('Total lines in index.html:', lines.length);

keywords.forEach(kw => {
  console.log(`\n=== Keyword: ${kw} ===`);
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(kw)) {
      count++;
      if (count <= 10) {
        console.log(`Line ${i + 1}: ${lines[i].trim().slice(0, 110)}`);
      }
    }
  }
  if (count > 10) console.log(`... total occurrences: ${count}`);
});
