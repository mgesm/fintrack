const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT_DIR, JS_ORDER, readHtml, readAllJs } = require('./_load_app');

let errors = 0;
let checkedFiles = 0;

// 1. Validate every modular JS file (and enforce 'use strict';)
for (const rel of JS_ORDER) {
  const fullPath = path.join(ROOT_DIR, rel);
  if (!fs.existsSync(fullPath)) {
    console.error(`✕ Falta módulo esperado: ${rel}`);
    errors++;
    continue;
  }
  const code = fs.readFileSync(fullPath, 'utf8');
  checkedFiles++;
  if (!/^\s*['"]use strict['"];?/.test(code)) {
    console.error(`✕ Falta directiva 'use strict' en ${rel}`);
    errors++;
  }
  try {
    new vm.Script(code, { filename: rel });
    console.log(`✓ ${rel} válido (modo estricto)`);
  } catch (err) {
    console.error(`✕ Error de sintaxis en ${rel}:`, err.message);
    errors++;
  }
}

// 2. Validate serviceworker.js
const swPath = path.join(ROOT_DIR, 'serviceworker.js');
if (fs.existsSync(swPath)) {
  const swCode = fs.readFileSync(swPath, 'utf8');
  checkedFiles++;
  try {
    new vm.Script("'use strict';\n" + swCode, { filename: 'serviceworker.js' });
    console.log('✓ serviceworker.js válido');
  } catch (err) {
    console.error('✕ Error de sintaxis en serviceworker.js:', err.message);
    errors++;
  }
}

// 3. Validate any inline scripts remaining in index.html + zero inline on* handlers
const htmlContent = readHtml();
const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let inlineCount = 0;
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  const scriptContent = match[2].trim();
  if (!scriptContent) continue;
  inlineCount++;
  try {
    new vm.Script("'use strict';\n" + scriptContent);
    console.log(`✓ Bloque inline #${inlineCount} válido`);
  } catch (err) {
    console.error(`✕ Error de sintaxis en bloque inline #${inlineCount}:`, err.message);
    errors++;
  }
}

const inlineHandlerRegex = /\son(?:click|change|input|pointerdown|submit|keydown|keyup|focus|blur|load|error)=/i;
if (inlineHandlerRegex.test(htmlContent)) {
  console.error('✕ Detectado handler inline (on*=) en index.html (viola SEC-04 / CSP)');
  errors++;
} else {
  console.log('✓ Cero handlers inline on*= en index.html (CSP / SEC-04 OK)');
}

// 4. Combined strict-mode syntax parse + undeclared top-level assignment semantic check
const allJs = readAllJs();
try {
  new vm.Script(allJs, { filename: 'fintrack-bundle-virtual.js' });
  console.log('✓ Validación combinada de todos los módulos OK');
} catch (err) {
  console.error('✕ Error de sintaxis en conjunto de módulos:', err.message);
  errors++;
}

// Semantic scan: ensure critical cross-module globals exist and detect bare top-level typo assignments
const declared = new Set();
// Capture top-level function declarations & multi-var declarations accurately enough to flag unknown bare globals
const declMatches = allJs.matchAll(/\b(?:function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(|(?:var|let|const)\s+([^;{\n]+))/g);
for (const dm of declMatches) {
  if (dm[1]) {
    declared.add(dm[1]);
  } else if (dm[2]) {
    dm[2].split(',').forEach(part => {
      const m = part.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (m) declared.add(m[1]);
    });
  }
}

const builtinAllowed = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'history', 'console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Promise', 'Error', 'RegExp', 'Set', 'Map', 'URL', 'Blob',
  'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'fetch', 'caches',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'CustomEvent', 'Event', 'Notification', 'Worker', 'crypto', 'TextEncoder',
  'TextDecoder', 'Uint8Array', 'atob', 'btoa', 'encodeURIComponent', 'decodeURIComponent',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'Infinity', 'NaN', 'undefined',
  'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'scrollTo',
  'performance', 'module', 'exports', 'return', 'throw', 'case', 'default', 'else',
  'void', 'typeof', 'delete'
]);

const suspiciousGlobals = [];
const lines = allJs.split(/\r?\n/);
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  if (depth === 0 && trimmed && !/^(?:var|let|const|function|async\s+function|\/\/|\/\*|\*|'|"|\(|\[|\}|\{)/.test(trimmed)) {
    const m = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/);
    if (m && !declared.has(m[1]) && !builtinAllowed.has(m[1])) {
      suspiciousGlobals.push(`L${i + 1}: ${m[1]}`);
    }
  }
  // Rough brace tracking ignoring comments/strings only at coarse level
  for (let c = 0; c < line.length; c++) {
    if (line[c] === '{') depth++;
    else if (line[c] === '}' && depth > 0) depth--;
  }
}

if (suspiciousGlobals.length > 0) {
  console.error('✕ Posibles escrituras a variables globales no declaradas:', suspiciousGlobals.join(', '));
  errors++;
} else {
  console.log(`✓ Análisis semántico estático OK (${declared.size} símbolos declarados, 0 globales implícitas)`);
}

if (errors > 0) {
  console.error(`\nFallo de validación: ${errors} error(es) detectado(s).`);
  process.exit(1);
} else {
  console.log(`\nÉxito: ${checkedFiles} archivos JS y index.html validados en modo estricto.`);
  process.exit(0);
}
