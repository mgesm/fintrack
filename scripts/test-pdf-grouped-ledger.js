const fs = require('fs');
const path = require('path');

// Test icon SVG mapping and string generation
const CAT_ICON_PATHS = {
  'compras':'<path d="M6 8H18L19 20C19 20.55 18.55 21 18 21H6C5.45 21 5 20.55 5 20L6 8Z"/><path d="M9 8V6C9 4.34 10.34 3 12 3C13.66 3 15 4.34 15 6V8"/>',
  'deporte':'<rect x="2" y="9" width="3" height="6" rx="1"/><rect x="19" y="9" width="3" height="6" rx="1"/><rect x="5.5" y="10.3" width="2" height="3.4" rx="0.6"/><rect x="16.5" y="10.3" width="2" height="3.4" rx="0.6"/><line x1="7.5" y1="12" x2="16.5" y2="12"/>',
  'salidas':'<path d="M12 21C12 21 19 14.6 19 9.5C19 5.9 15.9 3 12 3C8.1 3 5 5.9 5 9.5C5 14.6 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>',
  'ropa':'<path d="M9 4L4 7L6 11L8 9.5V20H16V9.5L18 11L20 7L15 4"/><path d="M9 4C9 5.66 10.34 7 12 7C13.66 7 15 5.66 15 4"/>',
  'comida':'<path d="M5 3V10C5 11.1 5.9 12 7 12C8.1 12 9 11.1 9 10V3"/><path d="M7 12V21"/><path d="M19 3C16.8 3 15 5.5 15 8.5C15 10.4 15.9 11.4 17 11.7V21"/>',
  'entretenimiento':'<rect x="2" y="8" width="20" height="10" rx="4"/><path d="M7 13H9M8 12V14"/><circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="17.3" cy="14" r="0.9" fill="currentColor" stroke="none"/>',
  'cuidado personal':'<path d="M12 3C12 3 15 7.5 15 11C15 13.3 13.3 15 11 15C8.7 15 7 13.3 7 11C7 7.5 12 3 12 3Z"/><path d="M11 15V21"/>',
  'regalos':'<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13H20"/><path d="M12 9V20"/><path d="M9 9C7.5 9 6.5 7.8 6.5 6.6C6.5 5.4 7.5 4.5 8.5 4.5C10.3 4.5 12 6.5 12 9"/><path d="M15 9C16.5 9 17.5 7.8 17.5 6.6C17.5 5.4 16.5 4.5 15.5 4.5C13.7 4.5 12 6.5 12 9"/>',
  'coche':'<path d="M19 17H21C21.55 17 22 16.55 22 16V13C22 12.1 21.3 11.3 20.5 11.1C18.7 10.6 16 10 16 10C16 10 14.7 8.6 13.8 7.7C13.3 7.3 12.7 7 12 7H5C4.4 7 3.9 7.4 3.6 7.9L2.2 10.8C2.1 11.2 2 11.6 2 12V16C2 16.55 2.45 17 3 17H5"/><circle cx="7" cy="17" r="2"/><path d="M9 17H15"/><circle cx="17" cy="17" r="2"/>',
  'viajes':'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.7.7c-.4.4-.3 1.1.2 1.4l5.6 3.4-2.5 2.6h-3l-1 1 3.4 1.7 1.7 3.4 1-1v-3l2.6-2.5 3.4 5.6c.3.5 1 .6 1.4.2l.7-.7c.4-.3.6-.8.5-1.3z"/>',
  'sueldo':'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6C8 4.9 8.9 4 10 4H14C15.1 4 16 4.9 16 6V8"/><path d="M3 13H21"/>',
  'ingresos':'<path d="M3 17L9 11L13 15L21 7"/><path d="M15 7H21V13"/>',
  'suscripciones':'<path d="M17 3V7H21"/><path d="M21 7C20.3 4.7 18.2 3 15.6 3C12.5 3 10 5.5 10 8.6"/><path d="M7 21V17H3"/><path d="M3 17C3.7 19.3 5.8 21 8.4 21C11.5 21 14 18.5 14 15.4"/>',
  'alimentación':'<path d="M6 8H18L19 20C19 20.55 18.55 21 18 21H6C5.45 21 5 20.55 5 20L6 8Z"/><path d="M9 8V6C9 4.34 10.34 3 12 3C13.66 3 15 4.34 15 6V8"/>',
  'transporte':'<path d="M3 16L4.5 8.5C4.7 7.6 5.5 7 6.4 7H17.6C18.5 7 19.3 7.6 19.5 8.5L21 16"/><path d="M3 16H21V18C21 18.55 20.55 19 20 19H4C3.45 19 3 18.55 3 18V16Z"/><circle cx="7.5" cy="16" r="1.4"/><circle cx="16.5" cy="16" r="1.4"/>',
  'hogar':'<path d="M3 11L12 4L21 11"/><path d="M5 10V20C5 20.55 5.45 21 6 21H18C18.55 21 19 20.55 19 20V10"/><path d="M10 21V15H14V21"/>',
  'ocio':'<rect x="2" y="8" width="20" height="10" rx="4"/><path d="M7 13H9M8 12V14"/><circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="17.3" cy="14" r="0.9" fill="currentColor" stroke="none"/>',
  'salud':'<path d="M12 20.5C12 20.5 4 15.8 4 9.8C4 6.8 6.2 5 8.5 5C10 5 11.3 5.8 12 7C12.7 5.8 14 5 15.5 5C17.8 5 20 6.8 20 9.8C20 15.8 12 20.5 12 20.5Z"/>',
  'restaurantes':'<path d="M5 3V10C5 11.1 5.9 12 7 12C8.1 12 9 11.1 9 10V3"/><path d="M7 12V21"/><path d="M19 3C16.8 3 15 5.5 15 8.5C15 10.4 15.9 11.4 17 11.7V21"/>',
  'delivery':'<path d="M12 3v3"/><path d="M4 10a8 8 0 0 1 16 0"/><path d="M2 14h20v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2z"/>',
  'café':'<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  'mascotas':'<path d="M12 13a4 4 0 0 0-4 4c0 2 2 3 4 3s4-1 4-3a4 4 0 0 0-4-4z"/><circle cx="4.5" cy="9.5" r="2.5"/><circle cx="9" cy="5.5" r="2"/><circle cx="15" cy="5.5" r="2"/><circle cx="19.5" cy="9.5" r="2.5"/>',
  'educación':'<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/>',
  'tecnología':'<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'suministros':'<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  'inversión':'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'balance':'<line x1="12" y1="3" x2="12" y2="21"/><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/>',
  'otros':'<circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
};
const CAT_ICON_FALLBACK = '<path d="M3 7C3 5.9 3.9 5 5 5H9L11 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"/>';

const sampleCategories = [
  { id: 'c1', name: 'Alimentación', icon: 'alimentación', color: '#FF9500' },
  { id: 'c2', name: 'Restaurantes', icon: 'restaurantes', color: '#FF3B30' },
  { id: 'c3', name: 'Transporte', icon: 'coche', color: '#007AFF' },
  { id: 'c4', name: 'Sueldo', icon: 'sueldo', color: '#34C759' }
];

const sampleAccounts = [
  { id: 'a1', name: 'Principal BBVA', color: '#007AFF' },
  { id: 'a2', name: 'Efectivo', color: '#34C759' }
];

function catById(id) {
  return sampleCategories.find(c => c.id === id) || { name: 'Otros', icon: 'otros', color: '#8E8E93' };
}

function txDisplayCategory(t) {
  if (t && t.is_balance_adjustment) return { name: 'Actualización de saldo', color: t.type === 'expense' ? '#FF3B30' : '#34C759', icon: 'balance' };
  return catById(t && t.category);
}

function getTxIconSvgData(t) {
  if (t.type === 'transfer') {
    const transferInner = '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
    return { inner: transferInner, color: '#2563EB', key: 'transfer|#2563EB' };
  }
  const c = txDisplayCategory(t);
  const iconKey = String((c && c.icon) || '').toLowerCase().trim();
  const nameKey = String((c && c.name) || '').toLowerCase().trim();
  const inner = (iconKey && CAT_ICON_PATHS[iconKey]) || CAT_ICON_PATHS[nameKey] || CAT_ICON_FALLBACK;
  const col = (c && c.color) || '#8E8E93';
  return { inner: inner, color: col, key: (iconKey || nameKey || 'otros') + '|' + col };
}

const sampleTxs = [
  { id: 't1', date: '2026-08-15', amount: 54.20, type: 'expense', category: 'c1', subcategory: 'Mercadona', note: 'Compra semanal', account_id: 'a1' },
  { id: 't2', date: '2026-08-15', amount: 22.00, type: 'expense', category: 'c2', note: 'Cena amigos', account_id: 'a1' },
  { id: 't3', date: '2026-08-14', amount: 1500.00, type: 'income', category: 'c4', note: 'Nómina agosto', account_id: 'a1' },
  { id: 't4', date: '2026-08-14', amount: 50.00, type: 'transfer', account_id: 'a1', to_account_id: 'a2', note: 'Cajero' },
  { id: 't5', date: '2026-08-10', amount: 12.50, type: 'expense', category: 'c3', note: 'Gasolina', account_id: 'a1', exclude_from_calc: true }
];

console.log('--- Testing grouping by day ---');
const groups = {};
sampleTxs.forEach(t => {
  if (!groups[t.date]) groups[t.date] = [];
  groups[t.date].push(t);
});

const dateKeys = Object.keys(groups).sort().reverse();
console.log('Date keys:', dateKeys);

dateKeys.forEach(dateStr => {
  const dObj = new Date(dateStr + 'T12:00:00');
  const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dayName = daysOfWeek[dObj.getDay()];
  const dayNum = parseInt(dateStr.slice(8, 10), 10);
  const monthName = months[parseInt(dateStr.slice(5, 7), 10) - 1];
  const yearNum = dateStr.slice(0, 4);
  const dayTitle = `${dayName}, ${dayNum} de ${monthName} de ${yearNum}`;
  console.log(`\n📅 ${dayTitle} (${groups[dateStr].length} movimientos):`);
  groups[dateStr].forEach(t => {
    const iconData = getTxIconSvgData(t);
    console.log(`  - [Icon: ${iconData.key}] ${t.type.toUpperCase()}: ${t.amount} € | Note: ${t.note || 'None'}`);
  });
});

console.log('\n✓ Test completed successfully!');
