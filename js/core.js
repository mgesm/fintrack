'use strict';
var APP_VERSION='2026.11.15.1';
var APP_PUBLISHED_AT='15/11/2026 08:48 CET';
var SB_URL='https://sswktibdpxqrumsqsegi.supabase.co';
var SB_KEY='sb_publishable_A4Lahtw5TjoD3hajMJITfw_o-p2zgH_';
var sb=window.supabase.createClient(SB_URL,SB_KEY);
var PALETTE=['#3dba8a','#e05c4a','#4a90d9','#d4920f','#d45c8a','#8b7ed8','#6aab3a','#888580','#e09a3a','#4abbd4','#a05cb8','#c4b840'];
var MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var MONTHS_S=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
var currentUser=null,transactions=[],categories=[],accounts=[],patrimony=[],budgets=[],recurrenceExclusions=[],transactionVoids=[],investmentOperations=[];
var _donutSig='',_barSig={},_lineSig={}; // render cache signatures
var viewYear=new Date().getFullYear(),viewMonth=new Date().getMonth();
var IS_DESKTOP=window.innerWidth>=768;
var dtActiveCat=null;
var activeTab=0,txType='expense',editingTxId=null,assetDetailState=null;
var activeCatId=null,chartYear=new Date().getFullYear();
var authMode='login';
var txTags=[],isRecurring=false;
var TX_PAGE_SIZE=50,txLimit=50,txLimitSig='',filtersOpen=false;
var searchQuery='',filterType='all',filterCat='',filterAccount='',sortOrder='date-desc',filterDateFrom='',filterDateTo='',searchScope='month';
var homeAnnualMode=false;
var isOffline=navigator.onLine===false,offlineQueue=[];
var syncState=isOffline?'offline':'syncing';
var _lastRemoteSyncTs=0;
var _lastMarkTap=0;
function isPrivacyMode(){
  try{return localStorage.getItem('ft_privacy_mode')==='true';}catch(e){return false;}
}
function getPrivacyEyeSvg(hidden, size){
  size = size || 14;
  return hidden
    ? '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function updatePrivacyIcons(){
  var priv = isPrivacyMode();
  var el = document.getElementById('balPrivacyIcon');
  if(el) el.innerHTML = getPrivacyEyeSvg(priv, 14);
  var dtEl = document.getElementById('dtBalPrivacyIcon');
  if(dtEl) dtEl.innerHTML = getPrivacyEyeSvg(priv, 14);
}
function togglePrivacyMode(){
  var cur=isPrivacyMode(),next=!cur;
  try{localStorage.setItem('ft_privacy_mode',next?'true':'false');}catch(e){}
  if(next){document.documentElement.classList.add('privacy-mode');}
  else{document.documentElement.classList.remove('privacy-mode');}
  _donutSig='';_barSig={};_lineSig={};
  updatePrivacyIcons();
  showSuccessToast(next?'Modo privado activado':'Modo privado desactivado');
  if(typeof render==='function')render();
  if(typeof dtRender==='function'&&IS_DESKTOP)dtRender();
}
function fmtPrivacy(n,isShort){
  if(isPrivacyMode())return '••••••';
  return isShort?fmtShort(n):fmt(n);
}
(function(){if(isPrivacyMode())document.documentElement.classList.add('privacy-mode');setTimeout(updatePrivacyIcons,0);})();
function handleBrandTap(e){var now=Date.now();if(now-_lastMarkTap<350){if(e)e.preventDefault();togglePrivacyMode();_lastMarkTap=0;}else{_lastMarkTap=now;}}
var _quoteCache=(function(){try{var raw=JSON.parse(localStorage.getItem('ft_quote_cache_v1')||'{}');var now=Date.now(),out={};if(raw&&typeof raw==='object'){Object.keys(raw).forEach(function(k){var e=raw[k];if(e&&e.data&&(now-e.ts)<900000)out[k]=e;});}return out;}catch(e){return {};}})(); // caché persistente con TTL
var _quoteInFlight={};
function persistQuoteCache(){
  try{localStorage.setItem('ft_quote_cache_v1',JSON.stringify(_quoteCache));}catch(e){}
}
function getCachedQuote(symbol,maxAgeMs){
  var s=String(symbol||'').toUpperCase(),entry=_quoteCache[s],ttl=maxAgeMs||300000;
  if(entry&&(Date.now()-entry.ts)<ttl)return Promise.resolve(entry.data);
  if(_quoteInFlight[s])return _quoteInFlight[s];
  _quoteInFlight[s]=sb.functions.invoke('market-data',{body:{action:'quote',symbol:s}}).then(function(r){
    delete _quoteInFlight[s];
    var payload=r&&r.data?(r.data.data||r.data):null;
    var price=Number(payload&&(payload.price||payload.close||payload.regularMarketPrice));
    if(payload&&Number.isFinite(price)&&price>0){
      _quoteCache[s]={ts:Date.now(),data:payload};
      persistQuoteCache();
      return payload;
    }
    return null;
  }).catch(function(err){
    delete _quoteInFlight[s];
    console.warn('Error al consultar cotización para '+s,err);
    return null;
  });
  return _quoteInFlight[s];
}
var DEFAULT_CATS=[
  {id:'c1',name:'alimentación',color:'#34C759',icon:'alimentación',subcats:['supermercado','mercado','alimentación online'],position:0},
  {id:'c2',name:'transporte',color:'#007AFF',icon:'transporte',subcats:['gasolina','taxi/uber','transporte público','parking'],position:1},
  {id:'c3',name:'hogar',color:'#FF9500',icon:'hogar',subcats:['alquiler/hipoteca','suministros','mantenimiento','muebles'],position:2},
  {id:'c4',name:'ocio',color:'#AF52DE',icon:'ocio',subcats:['cine/teatro','viajes','deporte','suscripciones'],position:3},
  {id:'c5',name:'salud',color:'#FF3B30',icon:'salud',subcats:['farmacia','médico','gym','seguros'],position:4},
  {id:'c6',name:'ropa',color:'#FF2D55',icon:'ropa',subcats:['ropa','zapatos','accesorios'],position:5},
  {id:'c7',name:'restaurantes',color:'#FF9F0A',icon:'restaurantes',subcats:['comida rápida','restaurante','bar/cafetería','delivery'],position:6},
  {id:'c8',name:'otros',color:'#8E8E93',icon:'otros',subcats:[],position:7}
];
function pad(n){return String(n).padStart(2,'0');}
function normStr(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function htmlEscape(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');}
function makeDiacriticRegex(str){
  var map={'a':'[aáàäâã]','e':'[eéèëê]','i':'[iíìïî]','o':'[oóòöôõ]','u':'[uúùüû]','c':'[cç]','n':'[nñ]'};
  var s=normStr(str).slice(0,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!s)return null;
  var pattern=s.split('').map(function(ch){return map[ch]||ch;}).join('');
  return pattern?new RegExp(pattern,'gi'):null;
}
// Resalta coincidencias escapando cada fragmento para preservar entidades HTML sin romperlas.
function hlText(value,query){
  var s=String(value||'');
  var q=String(query||'').trim().slice(0,80);
  if(!q||!s)return htmlEscape(s);
  var regex;
  try{regex=makeDiacriticRegex(q);}catch(e){return htmlEscape(s);}
  if(!regex)return htmlEscape(s);
  var parts=[],lastIdx=0,match;
  while((match=regex.exec(s))!==null){
    if(match[0]===''||match.index===regex.lastIndex){
      regex.lastIndex++;
      continue;
    }
    if(match.index>lastIdx)parts.push(htmlEscape(s.slice(lastIdx,match.index)));
    parts.push('<mark class="tx-search-hit">'+htmlEscape(match[0])+'</mark>');
    lastIdx=regex.lastIndex;
    if(!regex.global)break;
  }
  if(lastIdx<s.length)parts.push(htmlEscape(s.slice(lastIdx)));
  return parts.join('');
}
function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function capEsc(s){return htmlEscape(capitalize(s));}
function fmt(n){n=Number(n);if(!isFinite(n))n=0;return n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function fmtHtml(n){
  n=Number(n);if(!isFinite(n))n=0;
  var s=n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  var parts=s.split(',');
  return parts[0]+'<span class="cur-decimals">,'+parts[1]+'&nbsp;€</span>';
}
function renderEmptyState(title, subtitle, iconSvg){
  return '<div class="empty-state">'
    +'<div class="empty-state-icon">'
    +(iconSvg || '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>')
    +'</div>'
    +'<strong>'+htmlEscape(title)+'</strong>'
    +(subtitle?'<small>'+htmlEscape(subtitle)+'</small>':'')
    +'</div>';
}
function fmtShort(n){n=Number(n);if(!isFinite(n))n=0;return Math.abs(n)>=10000?(n/1000).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1})+'k €':n.toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}
function maskEmail(email){
  if(!email)return '';
  var at=email.indexOf('@');if(at<=0)return email;
  var name=email.slice(0,at),domain=email.slice(at);
  return (name.length<=2?name[0]+'*':name[0]+'***'+name[name.length-1])+domain;
}
function budgetGradientColor(pct){
  pct=Math.max(0,Math.min(pct,100));
  var green=[52,199,89],amber=[255,149,0],red=[255,59,48],c1,c2,t;
  if(pct<=80){c1=green;c2=amber;t=pct/80;}else{c1=amber;c2=red;t=(pct-80)/20;}
  var r=Math.round(c1[0]+(c2[0]-c1[0])*t),g=Math.round(c1[1]+(c2[1]-c1[1])*t),b=Math.round(c1[2]+(c2[2]-c1[2])*t);
  return 'rgb('+r+','+g+','+b+')';
}
var CAT_ICON_PATHS={
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
var AVAILABLE_CAT_ICONS=['alimentación','restaurantes','delivery','café','compras','ropa','hogar','transporte','coche','viajes','ocio','entretenimiento','deporte','salud','cuidado personal','suscripciones','regalos','tecnología','suministros','educación','mascotas','inversión','sueldo','ingresos','otros'];
var CAT_ICON_FALLBACK='<path d="M3 7C3 5.9 3.9 5 5 5H9L11 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"/>';
function catIconSvg(c,size){
  size=size||18;
  var iconKey=String((c&&c.icon)||'').toLowerCase().trim();
  if(!iconKey && c && c.id){
    var iconMap=getCategoryCustomIcons();
    if(iconMap[c.id]) iconKey=String(iconMap[c.id]).toLowerCase().trim();
  }
  var nameKey=String((c&&c.name)||'').toLowerCase().trim();
  var inner=(iconKey&&CAT_ICON_PATHS[iconKey])||CAT_ICON_PATHS[nameKey]||CAT_ICON_FALLBACK;
  return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="'+((c&&c.color)||'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';
}
function setSync(s){
  syncState=s;
  if(s==='ok'&&currentUser)try{localStorage.setItem('ft_last_sync_'+currentUser.id,new Date().toISOString());}catch(e){}
  var live=document.getElementById('ariaLive');
  if(live)live.textContent=s==='ok'?'Sincronización completada':s==='syncing'?'Sincronizando':s==='err'?'Hay cambios pendientes o un problema de sincronización':'';
  var summary=document.getElementById('syncStatusSummary');
  if(summary)summary.textContent=syncStatusSummary();
}
function syncStatusSummary(){
  if(isOffline)return 'Sin conexión · los cambios se guardarán al reconectar.';
  if(offlineQueue.length)return offlineQueue.length+' cambio'+(offlineQueue.length===1?'':'s')+' pendiente'+(offlineQueue.length===1?'':'s')+' de sincronizar.';
  if(syncState==='syncing')return 'Sincronizando tus datos…';
  if(syncState==='err')return 'No se pudo completar la última sincronización. Inténtalo de nuevo.';
  var last=currentUser?localStorage.getItem('ft_last_sync_'+currentUser.id):null;
  return last?'Sincronizado · '+new Date(last).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'}):'Sincronizado correctamente.';
}
function openSettings(){switchTab(5);}
function updatePeriodToolbar(){
  var header=document.getElementById('appHeader');
  if(header)header.classList.toggle('period-hidden',activeTab===3||activeTab===4||activeTab===5);
}
function setAccent(color){
  var el=document.documentElement;
  el.style.setProperty('--accent',color);
  el.style.setProperty('--accent-grad','linear-gradient(135deg,'+color+','+color+'cc)');
  try{localStorage.setItem('ft_accent',color);}catch(e){}
  if(typeof refreshTab==='function'&&currentUser&&!loadDataInFlight)refreshTab();
}
function setTheme(mode){
  if(mode==='system'){document.documentElement.removeAttribute('data-theme');localStorage.removeItem('ft_theme');}
  else{document.documentElement.setAttribute('data-theme',mode);localStorage.setItem('ft_theme',mode);}
  if(typeof refreshTab==='function'&&currentUser)refreshTab();
}

