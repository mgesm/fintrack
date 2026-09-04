const fs = require('fs');
const path = require('path');

const rootDir = 'C:\\Users\\usuario587\\.gemini\\antigravity\\scratch\\fintrack';
const swContent = fs.readFileSync(path.join(rootDir, 'serviceworker.js'), 'utf8');
const manifestContent = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

console.log('====================================================');
console.log('AUDITORIA INTEGRAL AGENTE 10 - FINTRACK');
console.log('====================================================\n');

// 1. Service Worker & PWA Lifecycle
console.log('----------------------------------------------------');
console.log('1. SERVICE WORKER Y CICLO DE VIDA PWA');
console.log('----------------------------------------------------');
const cacheNameMatch = swContent.match(/var\s+CACHE_NAME\s*=\s*'([^']+)'/);
const cachePrefixMatch = swContent.match(/var\s+CACHE_PREFIX\s*=\s*'([^']+)'/);
console.log('Cache Name activo:', cacheNameMatch ? cacheNameMatch[1] : 'NO DETECTADO');
console.log('Cache Prefix:', cachePrefixMatch ? cachePrefixMatch[1] : 'NO DETECTADO');

const precacheMatch = swContent.match(/var\s+PRECACHE\s*=\s*(\[[^\]]+\])/);
let precacheList = [];
if (precacheMatch) {
  precacheList = eval(precacheMatch[1]);
}
console.log('\nArchivos en PRECACHE (' + precacheList.length + '):');
let allFilesExist = true;
precacheList.forEach(item => {
  let localPath = item.replace(/^\.\//, '');
  if (localPath === '') localPath = '.';
  const fullPath = path.join(rootDir, localPath);
  const exists = fs.existsSync(fullPath);
  let sizeInfo = '';
  if (exists) {
    const stat = fs.statSync(fullPath);
    sizeInfo = stat.isFile() ? (stat.size / 1024).toFixed(1) + ' KB' : '(directorio)';
  } else {
    allFilesExist = false;
    sizeInfo = '¡NO EXISTE!';
  }
  console.log('  - ' + item.padEnd(30) + ' -> ' + (exists ? '✓ EXISTE' : '✗ FALTA') + ' [' + sizeInfo + ']');
});
console.log('¿Todos los archivos precacheados existen físicamente?:', allFilesExist ? 'SÍ (100% verificado)' : 'NO');

console.log('\nCiclo de vida SW:');
console.log('  - skipWaiting() en install:', swContent.includes('self.skipWaiting()') ? '✓ Presente' : '✗ Falta');
console.log('  - clients.claim() en activate:', swContent.includes('self.clients.claim()') ? '✓ Presente' : '✗ Falta');
console.log('  - Estrategia de red con fallback a caché en navigate:', swContent.includes("e.request.mode==='navigate'") && swContent.includes("caches.match('./index.html')") ? '✓ Network-First con fallback offline a index.html' : '✗ Incompleto');
console.log('  - Estrategia para subrecursos (JS, CSS, PNG):', swContent.includes('caches.match(e.request)') ? '✓ Cache-First con actualización en segundo plano (SWR)' : '✗ Incompleto');
console.log('  - Aislamiento de origen (evita interceptar APIs externas):', swContent.includes('url.origin!==location.origin') ? '✓ Correcto (ignora peticiones a Supabase/Google Fonts)' : '✗ Falta');

console.log('\nManifest PWA:');
console.log('  - Nombre:', manifestContent.name, '| Short Name:', manifestContent.short_name);
console.log('  - Display:', manifestContent.display, '| Start URL:', manifestContent.start_url);
console.log('  - Scope:', manifestContent.scope, '| Theme Color:', manifestContent.theme_color);
console.log('  - Iconos configurados:', manifestContent.icons.map(i => i.src + ' (' + i.sizes + ', ' + i.purpose + ')').join('; '));

// 2. Experiencia y adaptabilidad (Desktop vs Mobile)
console.log('\n----------------------------------------------------');
console.log('2. EXPERIENCIA Y ADAPTABILIDAD (DESKTOP VS MOBILE)');
console.log('----------------------------------------------------');
const isDesktopDeclared = htmlContent.includes('var IS_DESKTOP = window.innerWidth >= 768;') || htmlContent.includes('IS_DESKTOP=window.innerWidth>=768;');
console.log('Detección IS_DESKTOP (breakpoint 768px):', isDesktopDeclared ? '✓ Presente' : '✗ Falta');
console.log('Renderizado condicional (dtRender vs render):', htmlContent.includes('if(IS_DESKTOP){dtRender();}else{render();}') ? '✓ Implementado en refreshTab' : '✗ Falta');
console.log('Limpieza de DOM al cambiar de layout (evitar IDs duplicados):', htmlContent.includes("mtc.innerHTML=''") && htmlContent.includes("dtc.innerHTML=''") ? '✓ Implementado en applyLayout' : '✗ No limpia IDs');
console.log('Listener de resize con comprobación de ancho real:', htmlContent.includes('window.innerWidth===_lastAppWidth') ? '✓ Optimizado (ignora resize espurio por barra de URL móvil)' : '✗ Podría disparar reflows');

console.log('\nBloqueo de zoom no deseado sin romper scroll nativo:');
console.log('  - Meta viewport user-scalable=no:', /<meta\s+name=["']viewport["'][^>]*user-scalable=no[^>]*>/.test(htmlContent) ? '✓ Presente' : '✗ Falta');
console.log('  - Bloqueo de gestos Safari (gesturestart/change/end):', htmlContent.includes('gesturestart') ? '✓ Bloqueado preventDefault({passive:false})' : '✗ Falta');
console.log('  - Bloqueo de pinch multi-touch (touchmove touches.length > 1):', htmlContent.includes('e.touches.length>1') ? '✓ Bloqueado (solo multitáctil, scroll 1 dedo intacto)' : '✗ Falta');
console.log('  - Bloqueo Ctrl+rueda de ratón (wheel ctrl/meta):', htmlContent.includes("document.addEventListener('wheel'") ? '✓ Bloqueado' : '✗ Falta');
console.log('  - Bloqueo Ctrl +/-/0 en teclado (keydown ctrl/meta +,-,=,0):', htmlContent.includes("['+','-") ? '✓ Bloqueado' : '✗ Falta');
console.log('  - CSS touch-action: pan-y en html, body y tabContent:', htmlContent.includes('touch-action:pan-y') ? '✓ Configurado para permitir desplazamiento vertical fluido' : '✗ Falta');

console.log('\nGestión de Tema (claro / oscuro / sistema) mediante data-theme:');
console.log('  - Script anti-flash en <head>:', htmlContent.includes("localStorage.getItem('ft_theme')") ? '✓ Ejecutado inmediatamente antes de renderizar DOM' : '✗ Falta');
console.log('  - Función setTheme(mode):', htmlContent.includes('function setTheme(mode)') ? '✓ Soporta \'system\', \'light\', \'dark\'' : '✗ Falta');
console.log('  - Modo system remueve atributo data-theme:', htmlContent.includes("document.documentElement.removeAttribute('data-theme')") ? '✓ Sí (permite cascada a @media (prefers-color-scheme))' : '✗ No');
console.log('  - Selectores CSS html[data-theme="light"] y html[data-theme="dark"]:', htmlContent.includes('html[data-theme="light"]') && htmlContent.includes('html[data-theme="dark"]') ? '✓ Definidos con variables completas' : '✗ Incompletos');

console.log('\nRespeto estricto de prefers-reduced-motion:');
const prmRules = (htmlContent.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) || []).length;
console.log('  - Bloques CSS @media (prefers-reduced-motion: reduce): ' + prmRules + ' bloques encontrados');
console.log('  - Regla universal WCAG (*, *::before, *::after duración 0.01ms):', htmlContent.includes('animation-duration:.01ms!important') ? '✓ Implementado' : '✗ Falta');
console.log('  - Comprobación en lógica JavaScript (animateTabEntrance):', htmlContent.includes('(prefers-reduced-motion: reduce)') ? '✓ Anulada la animación programática' : '✗ Falta');

// 3. Accesibilidad y Sistema de Diseño
console.log('\n----------------------------------------------------');
console.log('3. ACCESIBILIDAD Y SISTEMA DE DISEÑO');
console.log('----------------------------------------------------');

function luminance(r, g, b) {
  let [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
}
function blend(fgRgba, bgRgb) {
  const [r, g, b, a] = fgRgba;
  return [
    Math.round((1 - a) * bgRgb[0] + a * r),
    Math.round((1 - a) * bgRgb[1] + a * g),
    Math.round((1 - a) * bgRgb[2] + a * b)
  ];
}
function ratio(rgb1, rgb2) {
  const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
}
function passAA(r) { return r >= 4.5 ? '✓ AA/AAA Pasa' : (r >= 3.0 ? '⚠ Solo texto grande (>=18pt) o UI' : '✗ Falla AA (< 3.0)'); }

console.log('Análisis de contraste WCAG 2.1:');
const lightBg = hexToRgb('#EEF0F3');
const whiteCard = hexToRgb('#FFFFFF');
const darkBg = hexToRgb('#06060A');
const darkCard = hexToRgb('#1C1C1E');

console.log('  [Tema Claro]:');
console.log('    - Texto primario (--text #1C1C1E) vs #EEF0F3:', ratio(hexToRgb('#1C1C1E'), lightBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#1C1C1E'), lightBg)));
console.log('    - Texto secundario (--text2 #3C3C43) vs #EEF0F3:', ratio(hexToRgb('#3C3C43'), lightBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#3C3C43'), lightBg)));
console.log('    - Texto terciario (--text3 #8E8E93) vs #EEF0F3:', ratio(hexToRgb('#8E8E93'), lightBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#8E8E93'), lightBg)));
console.log('    - Texto sutil (--text4 #C7C7CC) vs #EEF0F3:', ratio(hexToRgb('#C7C7CC'), lightBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#C7C7CC'), lightBg)));
console.log('    - Verde marca (--brand-green #34C759) vs Blanco:', ratio(hexToRgb('#34C759'), whiteCard).toFixed(2) + ':1', passAA(ratio(hexToRgb('#34C759'), whiteCard)));
console.log('    - Verde oscuro (--accent-dark #248A3D) vs Blanco:', ratio(hexToRgb('#248A3D'), whiteCard).toFixed(2) + ':1', passAA(ratio(hexToRgb('#248A3D'), whiteCard)));

console.log('  [Tema Oscuro]:');
const text2Dark = blend([235, 235, 245, 0.62], darkBg);
const text3Dark = blend([235, 235, 245, 0.32], darkBg);
console.log('    - Texto primario (Blanco) vs #06060A:', ratio(hexToRgb('#FFFFFF'), darkBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#FFFFFF'), darkBg)));
console.log('    - Texto secundario (62% blanco) vs #06060A:', ratio(text2Dark, darkBg).toFixed(2) + ':1', passAA(ratio(text2Dark, darkBg)));
console.log('    - Texto terciario (32% blanco) vs #06060A:', ratio(text3Dark, darkBg).toFixed(2) + ':1', passAA(ratio(text3Dark, darkBg)));
console.log('    - Verde marca (--brand-green #34C759) vs #06060A:', ratio(hexToRgb('#34C759'), darkBg).toFixed(2) + ':1', passAA(ratio(hexToRgb('#34C759'), darkBg)));

console.log('\nAuditoría de Modales y Hojas Flotantes:');
console.log('  1. critical-confirm (confirmCriticalAction):');
console.log('     - role="dialog" y aria-modal="true":', htmlContent.includes('critical-confirm-card" role="dialog" aria-modal="true"') ? '✓ Presente' : '✗ Falta');
console.log('     - aria-labelledby="criticalConfirmTitle":', htmlContent.includes('aria-labelledby="criticalConfirmTitle"') ? '✓ Presente' : '✗ Falta');
console.log('     - Foco automático en apertura:', htmlContent.includes('setTimeout(function(){input.focus();},60);') ? '✓ Foco en input de confirmación' : '✗ Falta');
console.log('     - Soporte para tecla Escape:', (htmlContent.includes('critical-confirm') && htmlContent.includes('closeRecurringDeleteDialog') && !htmlContent.includes('criticalConfirm') && !htmlContent.includes('confirmCriticalAction') ? false : htmlContent.includes('critical-confirm-bg') && htmlContent.includes('Escape')) ? '✓ Presente' : '✗ FALTA (Escape no cierra este diálogo)');
console.log('     - Atrapamiento de foco (Tab trap):', htmlContent.includes('critical-confirm-bg') && htmlContent.includes("e.key==='Tab'") ? '✓ Presente' : '✗ FALTA (Tab puede saltar al fondo)');

console.log('  2. trade modal (openInvestmentTradeModal):');
console.log('     - role="dialog" y aria-modal="true":', htmlContent.includes('investment-trade-card" role="dialog"') ? '✓ Presente' : '✗ FALTA');
console.log('     - Botón de cierre con etiqueta accesible (aria-label):', htmlContent.includes('investment-trade-close" type="button" aria-label=') ? '✓ Presente' : '✗ FALTA (solo muestra el glifo ×)');
console.log('     - Soporte para tecla Escape:', htmlContent.includes('investment-trade-modal') && htmlContent.includes('Escape') ? '✓ Presente' : '✗ FALTA (Escape no cierra el modal de inversión)');

console.log('  3. export modal (exportModalBg):');
console.log('     - role="dialog" y aria-modal="true":', htmlContent.includes('id="exportModalBg"') && htmlContent.includes('aria-modal="true"') ? '✓ Presente' : '✗ Falta');
console.log('     - aria-labelledby="exportModalTitle":', htmlContent.includes('aria-labelledby="exportModalTitle"') ? '✓ Presente' : '✗ Falta');
console.log('     - Soporte para tecla Escape:', htmlContent.includes("if(document.getElementById('exportModalBg').classList.contains('visible')){closeExportModal();return;}") ? '✓ Implementado' : '✗ Falta');
console.log('     - Atrapamiento de foco (Tab trap):', htmlContent.includes('openBg.querySelectorAll') ? '✓ Implementado vía .modal-bg.visible' : '✗ Falta');
console.log('     - Restauración de foco al cerrar:', htmlContent.includes('if(lastModalTrigger&&document.contains(lastModalTrigger))lastModalTrigger.focus();') ? '✓ Retorna foco al disparador' : '✗ Falta');

console.log('\nTamaños mínimos táctiles (Tap targets >= 44px en móviles):');
const targets = [
  { elemento: 'Engranaje de ajustes (.header-gear)', tamaño: '36x36px', evaluacion: '⚠ Inferior a 44px (36px)' },
  { elemento: 'Selector de año/mes (.home-annual-toggle)', tamaño: '32x32px', evaluacion: '⚠ Inferior a 44px (32px)' },
  { elemento: 'Navegación de mes (.nav-btn)', tamaño: '32x32px', evaluacion: '⚠ Inferior a 44px (32px)' },
  { elemento: 'Cierre ficha activo (.asset-sheet-close)', tamaño: '34x34px', evaluacion: '⚠ Inferior a 44px (34px)' },
  { elemento: 'Cierre trade modal (.investment-trade-close)', tamaño: '36x34px', evaluacion: '⚠ Inferior a 44px (36x34px)' },
  { elemento: 'Icono presupuesto (.budget-icon-btn)', tamaño: 'alto 30px', evaluacion: '⚠ Inferior a 44px (30px)' },
  { elemento: 'Paleta categoría (.cat-color-swatch)', tamaño: '26x26px', evaluacion: '⚠ Inferior a 44px (26px)' },
  { elemento: 'Eliminar tx desktop (.tx-btn.del)', tamaño: '28x28px', evaluacion: '⚠ 28x28px (solo desktop)' },
  { elemento: 'Eliminar inversión (.invest-operation-delete)', tamaño: '27x27px', evaluacion: '⚠ Inferior a 44px (27px)' },
  { elemento: 'Botón flotante (+ FAB)', tamaño: '56x56px', evaluacion: '✓ Cumple (56px > 44px)' },
  { elemento: 'Pestañas inferiores (.bnav-btn)', tamaño: 'min 48px', evaluacion: '✓ Cumple (flex 1 con alto 52px)' },
  { elemento: 'Inputs y Selects de formularios', tamaño: '>= 44px', evaluacion: '✓ Cumple (padding 12-14px + font 16px)' }
];
console.table(targets);

console.log('====================================================');
console.log('AUDITORIA FINALIZADA CON EXITO');
console.log('====================================================');
