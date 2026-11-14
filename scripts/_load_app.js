const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JS_ORDER = [
  'js/theme-init.js',
  'js/core.js',
  'js/accounting.js',
  'js/recurring.js',
  'js/sync.js',
  'js/investments.js',
  'js/charts.js',
  'js/export.js',
  'js/ui.js',
  'js/bootstrap.js'
];

function readHtml() {
  return fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
}

function readCss() {
  const cssPath = path.join(ROOT_DIR, 'styles.css');
  return fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
}

function readAllJs() {
  const parts = [];
  for (const rel of JS_ORDER) {
    const full = path.join(ROOT_DIR, rel);
    if (fs.existsSync(full)) parts.push(fs.readFileSync(full, 'utf8'));
  }
  const html = readHtml();
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) parts.push(m[1]);
  }
  return parts.join('\n');
}

function readAllAppSource() {
  return [readHtml(), readCss(), readAllJs()].join('\n');
}

module.exports = {
  ROOT_DIR,
  JS_ORDER,
  readHtml,
  readCss,
  readAllJs,
  readAllAppSource
};
