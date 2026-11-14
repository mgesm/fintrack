const assert = require('assert');

function roundMoney(n){
  n=Number(n);
  if(!Number.isFinite(n))return 0;
  return Math.round((n+Number.EPSILON)*100)/100;
}

function parseCurrencyInput(val){
  if(val==null)return NaN;
  if(typeof val==='number')return Number.isFinite(val)?roundMoney(val):NaN;
  var s=String(val).trim().replace(/[\s\u00A0€$£]/g,'');
  if(!s)return NaN;
  var lastComma=s.lastIndexOf(',');
  var lastDot=s.lastIndexOf('.');
  if(lastComma>-1&&lastDot>-1){
    if(lastComma>lastDot){
      s=s.replace(/\./g,'').replace(',','.');
    }else{
      s=s.replace(/,/g,'');
    }
  }else if(lastComma>-1){
    s=s.replace(/,/g,'.');
  }else if(lastDot>-1){
    var parts=s.split('.');
    if(parts.length>2){
      s=parts.join('');
    }
  }
  var n=parseFloat(s);
  return Number.isFinite(n)?roundMoney(n):NaN;
}

console.log('Testing parseCurrencyInput:');
const cases = [
  { in: '12.50', expected: 12.50 },
  { in: '12,50', expected: 12.50 },
  { in: '1.250,50', expected: 1250.50 },
  { in: '1,250.50', expected: 1250.50 },
  { in: '1250', expected: 1250.00 },
  { in: '1.250', expected: 1250.00 }, // Wait! Is 1.250 treated as 1250 or 1.25?!
  { in: '1,250', expected: 1250.00 }, // Wait! Is 1,250 treated as 1250 or 1.25?!
  { in: '-50,25', expected: -50.25 },
  { in: '15+5', expected: 20 }, // Math expressions?
  { in: '0', expected: 0 },
  { in: '', expected: NaN },
  { in: 'abc', expected: NaN },
  { in: '1.000.000,50', expected: 1000000.50 },
  { in: '1,000,000.50', expected: 1000000.50 }
];

cases.forEach(c => {
  const res = parseCurrencyInput(c.in);
  console.log(`Input: "${c.in}" => Result: ${res} (Expected: ${c.expected}) Match: ${res === c.expected}`);
});
