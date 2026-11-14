const fs = require('fs');
const content = fs.readFileSync('C:/Users/migue/.gemini/antigravity/scratch/fintrack/index.html', 'utf8');
const lines = content.split('\n');

function find(term) {
  console.log(`\n=== Term: ${term} ===`);
  lines.forEach((l, idx) => {
    if (l.includes(term)) {
      console.log(`L${idx + 1}: ${l.trim().slice(0, 120)}`);
    }
  });
}

find('isTxExcludedFromBalance');
find('isTxExcludedFromExpense');
find('exclude_from_calc');
find('accountTheoreticalFromLastRealReset');
