const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'index.html');
const content = fs.readFileSync(htmlPath, 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
let errors = 0;

while ((match = scriptRegex.exec(content)) !== null) {
  const scriptContent = match[1].trim();
  if (!scriptContent) continue;
  count++;
  try {
    new vm.Script(scriptContent);
    console.log(`✓ Bloque de script #${count} válido`);
  } catch (err) {
    console.error(`✕ Error de sintaxis en el bloque de script #${count}:`, err.message);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nFallo de validación: ${errors} bloque(s) con errores.`);
  process.exit(1);
} else {
  console.log(`\nÉxito: Los ${count} bloques de script en index.html tienen sintaxis válida.`);
  process.exit(0);
}
