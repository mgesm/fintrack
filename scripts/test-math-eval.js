const assert = require('assert');

function evaluateExpression(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let str = String(input).trim();
  if (!str) return null;

  // Handle European thousands separator: e.g. 1.250,50 -> 1250.50 or 1,250.50 -> 1250.50
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  } else {
    // Replace all commas with dots for decimal parsing
    str = str.replace(/,/g, '.');
  }

  // Remove whitespace
  str = str.replace(/\s+/g, '');

  // Whitelist check: only digits, +, -, *, /, (, ), .
  if (!/^[\d+\-*/().]+$/.test(str)) return null;

  // Tokenize
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if ('+-*/()'.includes(ch)) {
      // Check for unary minus/plus: at start, or after an operator or '('
      if ((ch === '-' || ch === '+') && (tokens.length === 0 || ['+', '-', '*', '/', '('].includes(tokens[tokens.length - 1]))) {
        let numStr = ch;
        i++;
        while (i < str.length && /[\d.]/.test(str[i])) {
          numStr += str[i];
          i++;
        }
        const num = parseFloat(numStr);
        if (!Number.isFinite(num)) return null;
        tokens.push(num);
        continue;
      }
      tokens.push(ch);
      i++;
    } else if (/[\d.]/.test(ch)) {
      let numStr = '';
      let dots = 0;
      while (i < str.length && /[\d.]/.test(str[i])) {
        if (str[i] === '.') {
          dots++;
          if (dots > 1) return null; // Multiple dots in single number
        }
        numStr += str[i];
        i++;
      }
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) return null;
      tokens.push(num);
    } else {
      return null;
    }
  }

  if (tokens.length === 0) return null;

  // Shunting-yard algorithm
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const outputQueue = [];
  const operatorStack = [];

  for (const token of tokens) {
    if (typeof token === 'number') {
      outputQueue.push(token);
    } else if ('+-*/'.includes(token)) {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop());
      }
      operatorStack.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      let foundOpen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack.pop();
        if (top === '(') {
          foundOpen = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundOpen) return null;
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop();
    if (top === '(' || top === ')') return null;
    outputQueue.push(top);
  }

  // Evaluate RPN
  const evalStack = [];
  for (const token of outputQueue) {
    if (typeof token === 'number') {
      evalStack.push(token);
    } else {
      if (evalStack.length < 2) return null;
      const b = evalStack.pop();
      const a = evalStack.pop();
      let res = 0;
      if (token === '+') res = a + b;
      else if (token === '-') res = a - b;
      else if (token === '*') res = a * b;
      else if (token === '/') {
        if (Math.abs(b) < 1e-12) return null; // Zero division
        res = a / b;
      }
      evalStack.push(res);
    }
  }

  if (evalStack.length !== 1) return null;
  const finalVal = evalStack[0];
  if (!Number.isFinite(finalVal) || finalVal <= 0) return null;
  return Math.round((finalVal + Number.EPSILON) * 100) / 100;
}

const testCases = [
  { in: '15+4.5', expected: 19.5 },
  { in: '15,50 + 4,50', expected: 20 },
  { in: '20*3', expected: 60 },
  { in: '100/4', expected: 25 },
  { in: '50 - 10.25', expected: 39.75 },
  { in: '10 + 5 * 2', expected: 20 },
  { in: '(10 + 5) * 2', expected: 30 },
  { in: '1.250,50', expected: 1250.5 },
  { in: '1250,50', expected: 1250.5 },
  { in: '45.8', expected: 45.8 },
  { in: '10 / 0', expected: null },
  { in: '10 - 20', expected: null }, // <= 0
  { in: 'alert(1)', expected: null },
  { in: '15..5', expected: null },
  { in: '15 + ', expected: null },
  { in: '-5 + 10', expected: 5 },
  { in: '10 * (2 + 3) / 2', expected: 25 },
];

let allPassed = true;
testCases.forEach(tc => {
  const actual = evaluateExpression(tc.in);
  const ok = actual === tc.expected;
  if (!ok) allPassed = false;
  console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + tc.in + ' => ' + actual + ' (expected: ' + tc.expected + ')');
});

if (allPassed) {
  console.log('\nAll 17 mathematical evaluation test cases PASSED!');
} else {
  console.error('\nSome test cases failed!');
  process.exit(1);
}
