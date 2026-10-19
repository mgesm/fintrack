const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');

console.log('--- REVISIÓN DE CONSULTAS EN loadData() ---');
const loadDataStart = indexHtml.indexOf('async function loadData');
const loadDataChunk = indexHtml.slice(loadDataStart, loadDataStart + 2500);

const lines = loadDataChunk.split('\n');
lines.slice(0, 75).forEach((line, i) => {
  if (line.includes('sb.from') || line.includes('fetchAllTxs') || line.includes('Promise.all')) {
    console.log(`L${i + 1}: ${line.trim()}`);
  }
});

console.log('\n--- EDGE FUNCTION: monthly-report ---');
const monthlyReport = fs.readFileSync('supabase/functions/monthly-report/index.ts', 'utf8');
monthlyReport.split('\n').forEach((line, i) => {
  if (line.includes('db.from') && line.includes('select')) {
    console.log(`L${i + 1}: ${line.trim()}`);
  }
});

console.log('\n--- EDGE FUNCTION: automatic-backup ---');
const autoBackup = fs.readFileSync('supabase/functions/automatic-backup/index.ts', 'utf8');
autoBackup.split('\n').forEach((line, i) => {
  if (line.includes('client.from') && line.includes('select')) {
    console.log(`L${i + 1}: ${line.trim()}`);
  }
});
