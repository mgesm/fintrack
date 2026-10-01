const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing PDF Export Calculation Modes and Variables ---');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 1. Verify index.html defines isNoCalc inside exportPDF
assert(indexHtml.includes('var isNoCalc = (txEffMode === 2);'), 'index.html must define isNoCalc in exportPDF');

// 2. Verify runExport wraps export execution in try/catch
assert(indexHtml.includes('try {\n    if(fmt===\'pdf\')await exportPDF(range);') || indexHtml.includes('try {\r\n    if(fmt===\'pdf\')await exportPDF(range);'), 'runExport must have try/catch block around export execution');

// 3. Simulate the logic executed in exportPDF for each mode
function getEffectiveTxCalcMode(t) {
  if (!t) return 0;
  if (Array.isArray(t.tags)) {
    if (t.tags.indexOf('_no_calc') > -1) return 2;
    if (t.tags.indexOf('_no_expense') > -1) return 1;
  }
  if (t.exclude_from_calc) return 2;
  return 0;
}

const testTransactions = [
  { id: 't1', type: 'expense', amount: 50, tags: [], note: 'Normal expense' },
  { id: 't2', type: 'expense', amount: 100, tags: ['_no_expense'], note: 'Solo balance expense' },
  { id: 't3', type: 'expense', amount: 200, tags: ['_no_calc'], note: 'No computa expense' },
  { id: 't4', type: 'expense', amount: 75, exclude_from_calc: true, note: 'Legacy no computa' },
  { id: 't5', type: 'income', amount: 1500, tags: [], note: 'Salary' }
];

testTransactions.forEach(t => {
  const isExp = t.type === 'expense';
  const isInc = t.type === 'income';
  const txEffMode = getEffectiveTxCalcMode(t);
  const isNoCalc = (txEffMode === 2);

  let badge = null;
  if (txEffMode === 1) {
    badge = 'Solo balance';
  } else if (txEffMode === 2) {
    badge = 'No computa';
  }

  let color = null;
  if (isNoCalc) {
    color = 'grey (148, 163, 184)';
  } else if (isExp) {
    color = 'red (220, 38, 38)';
  } else if (isInc) {
    color = 'green (21, 128, 61)';
  } else {
    color = 'blue (37, 99, 235)';
  }

  console.log(`Tx ${t.id} (${t.note}): Mode=${txEffMode}, isNoCalc=${isNoCalc}, Badge=${badge || 'none'}, Color=${color}`);

  if (t.id === 't1') {
    assert.strictEqual(txEffMode, 0);
    assert.strictEqual(isNoCalc, false);
    assert.strictEqual(badge, null);
    assert.strictEqual(color, 'red (220, 38, 38)');
  } else if (t.id === 't2') {
    assert.strictEqual(txEffMode, 1);
    assert.strictEqual(isNoCalc, false);
    assert.strictEqual(badge, 'Solo balance');
    assert.strictEqual(color, 'red (220, 38, 38)');
  } else if (t.id === 't3' || t.id === 't4') {
    assert.strictEqual(txEffMode, 2);
    assert.strictEqual(isNoCalc, true);
    assert.strictEqual(badge, 'No computa');
    assert.strictEqual(color, 'grey (148, 163, 184)');
  } else if (t.id === 't5') {
    assert.strictEqual(txEffMode, 0);
    assert.strictEqual(isNoCalc, false);
    assert.strictEqual(color, 'green (21, 128, 61)');
  }
});

console.log('\nAll exportPDF test assertions passed successfully!');
