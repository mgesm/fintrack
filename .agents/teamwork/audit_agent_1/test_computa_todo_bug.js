const assert = require('assert');

// Simulate index.html logic
function getTxCalcMode(t){
  if(!t)return 0;
  if(Array.isArray(t.tags)){
    if(t.tags.includes('_no_calc'))return 2;
    if(t.tags.includes('_no_expense'))return 1;
  }
  if(t.exclude_from_calc===2||t.exclude_from_calc==='2'||t.exclude_from_calc==='all'||t.exclude_from_calc===true)return 2;
  if(t.exclude_from_calc===1||t.exclude_from_calc==='1'||t.exclude_from_calc==='expense'||t.exclude_from_calc==='balance')return 1;
  return 0;
}
function getEffectiveTxCalcMode(t){
  return getTxCalcMode(t);
}
function isTxExcludedFromBalance(t){
  if(!t)return false;
  var m=getEffectiveTxCalcMode(t);
  return m===2;
}

let accounts = [{ id: 'acc_1', name: 'Banco' }];
function accountTxDelta(t,accountId){
  if(t.is_balance_adjustment)return 0;
  if(t.type==='transfer'){
    var d=0;
    if(t.account_id===accountId)d-=Number(t.amount);
    if(t.to_account_id===accountId)d+=Number(t.amount);
    return d;
  }
  if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
  return t.type==='expense'?-Number(t.amount):Number(t.amount);
}

// Transaction with computa_todo = 2 (No computa)
const informationalTx = {
  id: 'tx_info_1',
  type: 'expense',
  amount: 500,
  date: '2026-11-01',
  account_id: 'acc_1',
  exclude_from_calc: 2 // Computa_todo = 2: Informational note, should NOT impact account balance!
};

console.log('isTxExcludedFromBalance(informationalTx):', isTxExcludedFromBalance(informationalTx));
const delta = accountTxDelta(informationalTx, 'acc_1');
console.log('accountTxDelta in index.html:', delta);
console.log('Expected delta according to SKILL.md Section 1.1:', 0);

if (delta === -500) {
  console.log('BUG CONFIRMED: accountTxDelta does NOT respect exclude_from_calc === 2 / computa_todo === 2!');
}
