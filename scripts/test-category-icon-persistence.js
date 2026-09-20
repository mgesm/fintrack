// Test category icon persistence across reload scenarios
const fs = require('fs');
const assert = require('assert');

// Mock browser environment
const localStorageMap = {};
global.localStorage = {
  getItem: (k) => localStorageMap[k] || null,
  setItem: (k, v) => { localStorageMap[k] = String(v); },
  removeItem: (k) => { delete localStorageMap[k]; }
};
global.currentUser = { id: 'usr_test_123', user_metadata: {} };
global.sb = {
  auth: {
    updateUser: async (obj) => {
      Object.assign(global.currentUser.user_metadata, obj.data);
      return { data: global.currentUser, error: null };
    }
  },
  from: (table) => ({
    update: (data) => ({
      eq: (col, val) => Promise.resolve({ data: null, error: null })
    })
  })
};
global.isOffline = false;
global.queueOp = () => true;
global.saveLocalCache = () => {};
global.refreshTab = () => {};
global.showSuccessToast = () => {};
global.setSync = () => {};

// Read and extract relevant functions from index.html
const html = fs.readFileSync('index.html', 'utf8');

// Extract script content
eval(`
var _catIconsCache = null;
${html.match(/function getCategoryCustomIcons\(\)[\s\S]*?function applyCategoryCustomIcons\(\)[\s\S]*?\n\}/)[0]}

var categories = [
  { id: 'c1', name: 'alimentación', color: '#34C759', subcats: [] },
  { id: 'c2', name: 'transporte', color: '#007AFF', subcats: [] }
];

${html.match(/function catById\(id\)[\s\S]*?\n\}/)[0]}
${html.match(/async function saveCatIcon\(catId,iconKey\)[\s\S]*?\n\}/)[0]}
`);

async function runTests() {
  console.log('1. Testing initial state without icon');
  let cat1 = catById('c1');
  assert.strictEqual(cat1.icon, undefined);

  console.log('2. Changing icon for c1 to "compras" via saveCatIcon');
  await saveCatIcon('c1', 'compras');
  
  assert.strictEqual(categories.find(c => c.id === 'c1').icon, 'compras');
  assert.strictEqual(catById('c1').icon, 'compras');
  assert.strictEqual(getCategoryCustomIcons()['c1'], 'compras');
  assert.ok(localStorageMap['ft_cat_icons_usr_test_123'].includes('compras'));

  console.log('3. Simulating page reload: reset memory and reload categories from DB (without icon column)');
  _catIconsCache = null;
  categories = [
    { id: 'c1', name: 'alimentación', color: '#34C759', subcats: [] },
    { id: 'c2', name: 'transporte', color: '#007AFF', subcats: [] }
  ];

  // Before apply, catById should still resolve custom icon from map
  let cat1AfterReload = catById('c1');
  assert.strictEqual(cat1AfterReload.icon, 'compras', 'catById should resolve icon from map');

  // After applyCategoryCustomIcons (as happens in loadData)
  applyCategoryCustomIcons();
  assert.strictEqual(categories.find(c => c.id === 'c1').icon, 'compras', 'categories array should have icon populated');

  console.log('4. Changing icon for c2 to "coche"');
  await saveCatIcon('c2', 'coche');
  assert.strictEqual(catById('c2').icon, 'coche');

  console.log('✓ All category icon persistence tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
