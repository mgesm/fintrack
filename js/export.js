'use strict';
// EXPORT
function exportJSON(){var json=JSON.stringify({version:4,transactions:transactions,categories:categories,accounts:accounts,patrimony:patrimony,budgets:budgets,recurrenceExclusions:recurrenceExclusions,transactionVoids:transactionVoids,investmentOperations:investmentOperations,categoryExclusions:getCategoryExpenseExclusions(),categoryIcons:getCategoryCustomIcons()},null,2);var blob=new Blob([json],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fintrack_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
// ── export period selection ───────────────────────────────────────
function todayStr(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function currentMonthRange(){var from=viewYear+'-'+pad(viewMonth+1)+'-01';var to=lastDayOfMonthStr(viewYear,viewMonth+1);return {from:from,to:to,label:capitalize(MONTHS[viewMonth])+' '+viewYear};}
function getExportTx(range){var t=transactions.slice();if(range&&range.from)t=t.filter(function(x){return x.date>=range.from;});if(range&&range.to)t=t.filter(function(x){return x.date<=range.to;});return t;}
function rangeBounds(range){
  if(range&&range.from&&range.to)return {from:range.from,to:range.to};
  var ds=transactions.map(function(t){return t.date;}).filter(Boolean).sort();
  return {from:ds[0]||todayStr(),to:ds[ds.length-1]||todayStr()};
}
function openExportModal(scope){
  lastModalTrigger=document.activeElement;
  var mEl=document.getElementById('exportMonth');if(mEl&&!mEl.value)mEl.value=viewYear+'-'+pad(viewMonth+1);
  var yrSel=document.getElementById('exportYear');
  if(yrSel){
    var yrs={};
    transactions.forEach(function(t){if(t.date)yrs[t.date.slice(0,4)]=true;});
    yrs[viewYear||new Date().getFullYear()]=true;
    var yrArr=Object.keys(yrs).sort().reverse();
    yrSel.innerHTML=yrArr.map(function(y){return '<option value="'+y+'"'+(y===String(chartYear||viewYear)?' selected':'')+'>'+y+'</option>';}).join('');
  }
  if(scope){
    var sEl=document.getElementById('exportScope');
    if(sEl)sEl.value=scope;
  }
  onExportScopeChange();
  document.getElementById('exportModalBg').classList.add('visible');document.getElementById('exportModalBg').setAttribute('aria-hidden','false');lockBodyScroll();
}
function closeExportModal(){document.getElementById('exportModalBg').classList.remove('visible');document.getElementById('exportModalBg').setAttribute('aria-hidden','true');if(lastModalTrigger&&document.contains(lastModalTrigger))lastModalTrigger.focus();unlockBodyScroll();}
function onExportScopeChange(){
  var s=document.getElementById('exportScope').value;
  document.getElementById('exportMonthWrap').style.display=s==='month'?'block':'none';
  var yrWrap=document.getElementById('exportYearWrap');if(yrWrap)yrWrap.style.display=s==='year'?'block':'none';
  document.getElementById('exportRangeWrap').style.display=s==='range'?'block':'none';
}
function exportRangeFromUI(){
  var s=document.getElementById('exportScope').value;
  if(s==='all')return {from:null,to:null,label:'Todo'};
  if(s==='month'){var m=document.getElementById('exportMonth').value;if(!m){alert('Elige un mes');return null;}var y=parseInt(m.slice(0,4),10),mo=parseInt(m.slice(5,7),10)-1;if(isNaN(y)||isNaN(mo)||mo<0||mo>11){alert('Mes inválido');return null;}return {from:m+'-01',to:lastDayOfMonthStr(y,mo+1),label:capitalize(MONTHS[mo])+' '+y};}
  if(s==='year'){var yEl=document.getElementById('exportYear');var yr=parseInt(yEl?yEl.value:viewYear,10);if(isNaN(yr)||yr<2000||yr>2100){alert('Año inválido');return null;}return {from:yr+'-01-01',to:yr+'-12-31',label:String(yr)};}
  var f=document.getElementById('exportFrom2').value,t=document.getElementById('exportTo2').value;
  if(!f||!t){alert('Elige fecha de inicio y fin');return null;}
  if(f>t){var tmp=f;f=t;t=tmp;}
  return {from:f,to:t,label:f+' a '+t};
}
var _scriptCache={};
function loadScript(src,ms){
  if(_scriptCache[src])return _scriptCache[src];
  _scriptCache[src]=new Promise(function(resolve,reject){
    var s=document.createElement('script');s.src=src;
    var t=setTimeout(function(){delete _scriptCache[src];reject(new Error('timeout'));},ms||10000);
    s.onload=function(){clearTimeout(t);resolve();};
    s.onerror=function(){clearTimeout(t);delete _scriptCache[src];reject(new Error('load failed'));};
    document.head.appendChild(s);
  });
  return _scriptCache[src];
}
async function ensureExportLibs(fmt){
  if(fmt==='pdf'){
    if(typeof window.jspdf==='undefined')await loadScript('./vendor/jspdf.umd.min.js');
    if(document.fonts&&document.fonts.ready)try{await document.fonts.ready;}catch(_){}
  }else if(fmt==='xlsx'&&typeof ExcelJS==='undefined'){
    await loadScript('./vendor/exceljs.min.js');
  }
}
async function runExport(fmt){
  var scope=document.getElementById('exportScope').value;
  var range=(scope==='year'&&fmt==='pdf')?null:exportRangeFromUI();
  if(!(scope==='year'&&fmt==='pdf')&&!range)return;
  try{
    await ensureExportLibs(fmt);
  }catch(e){alert('No se pudo cargar la librería necesaria. Comprueba tu conexión e inténtalo de nuevo.');return;}
  if(scope==='year'&&fmt==='pdf'){
    var yrSel=document.getElementById('exportYear');
    var yr=yrSel?parseInt(yrSel.value,10):(viewYear||new Date().getFullYear());
    closeExportModal();
    try {
      await exportAnnualPDF(yr);
    } catch(err) {
      console.error('Error al exportar PDF anual:', err);
      alert('Error al generar el PDF anual: ' + (err.message || err));
    }
    return;
  }
  try {
    if(fmt==='pdf')await exportPDF(range);
    else if(fmt==='xlsx')exportXLSX(range);
    else if(fmt==='csv')exportCSV(range);
    closeExportModal();
  } catch(err) {
    console.error('Error al exportar:', err);
    alert('Error al generar la exportación: ' + (err.message || err));
  }
}
// ── shared helpers for chart images & brand header in PDF/Excel exports ───
function hexToRgb(h){h=(h||'#888').replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];return [parseInt(h.substr(0,2),16)||0,parseInt(h.substr(2,2),16)||0,parseInt(h.substr(4,2),16)||0];}

// ── Iconos de categoría de alta definición para PDF ──────────────────────────
var _catIconPdfCache = {};
function getTxIconSvgData(t) {
  if (t.type === 'transfer') {
    var transferInner = '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
    return { inner: transferInner, color: '#2563EB', key: 'transfer|#2563EB' };
  }
  var c = txDisplayCategory(t);
  var iconKey = String((c && c.icon) || '').toLowerCase().trim();
  var nameKey = String((c && c.name) || '').toLowerCase().trim();
  var inner = (iconKey && CAT_ICON_PATHS[iconKey]) || CAT_ICON_PATHS[nameKey] || CAT_ICON_FALLBACK;
  var col = (c && c.color) || '#8E8E93';
  return { inner: inner, color: col, key: (iconKey || nameKey || 'otros') + '|' + col };
}

function renderCategoryIconToDataURL(innerSvg, colorHex) {
  var key = innerSvg + '|' + colorHex;
  if (_catIconPdfCache[key]) return Promise.resolve(_catIconPdfCache[key]);
  return new Promise(function(resolve) {
    try {
      var col = colorHex || '#8E8E93';
      var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="' + col + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" color="' + col + '">' + innerSvg + '</svg>';
      var img = new Image();
      var svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(svgBlob);
      var timeout = setTimeout(function() {
        URL.revokeObjectURL(url);
        resolve(null);
      }, 1200);
      img.onload = function() {
        clearTimeout(timeout);
        try {
          var px = 72; // Hi-DPI Retina 72x72 px
          var cv = document.createElement('canvas');
          cv.width = px; cv.height = px;
          var ctx = cv.getContext('2d');
          var rgb = hexToRgb(col);
          
          // Fondo squircle con tinte sutil (14% opacidad)
          ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ', 0.14)';
          var r = 22;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(0, 0, px, px, r);
            ctx.fill();
          } else {
            ctx.fillRect(0, 0, px, px);
          }
          
          // Dibujar icono centrado (38x38 dentro de 72x72)
          var iconPx = 38;
          var offset = (px - iconPx) / 2;
          ctx.drawImage(img, offset, offset, iconPx, iconPx);
          
          var dataUrl = cv.toDataURL('image/png');
          _catIconPdfCache[key] = dataUrl;
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = function() {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch (ex) {
      resolve(null);
    }
  });
}

async function prepareTxIconMap(txs) {
  var iconMap = {};
  var promises = [];
  (txs || []).forEach(function(t) {
    var iconData = getTxIconSvgData(t);
    if (!iconMap[iconData.key]) {
      iconMap[iconData.key] = true;
      promises.push(
        renderCategoryIconToDataURL(iconData.inner, iconData.color).then(function(dataUrl) {
          if (dataUrl) iconMap[iconData.key] = dataUrl;
        })
      );
    }
  });
  await Promise.all(promises);
  return iconMap;
}

// ── MEMBRETE EDITORIAL PREMIUM "WHITE EDITION" (Outfit 800 + Inter) ────────
function exportBrandHeaderDataURL(w, h, rangeLabel, userEmail, dateStr) {
  var cv = document.createElement('canvas'); var dpr = 3;
  cv.width = w * dpr; cv.height = h * dpr; var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);

  // 1. Fondo blanco editorial inmaculado (sin línea verde superior)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);

  // 2. WORDMARK OFICIAL "fintrack." alineado a la izquierda (Outfit 800)
  var logoX = 0, logoY = h / 2;
  ctx.font = '800 24px Outfit, -apple-system, sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  var finW = ctx.measureText('fin').width;
  var trackW = ctx.measureText('track').width;
  ctx.fillStyle = '#0F172A'; ctx.fillText('fin', logoX, logoY);
  ctx.fillStyle = '#16A34A'; ctx.fillText('track', logoX + finW, logoY);
  ctx.fillText('.', logoX + finW + trackW, logoY);

  // 3. METADATOS EDITORIALES A LA DERECHA (Mes y fecha de emisión)
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0F172A'; ctx.font = '700 13px Inter, -apple-system, sans-serif';
  ctx.fillText(rangeLabel, w, logoY - 8);

  ctx.fillStyle = '#64748B'; ctx.font = '400 8.5px Inter, -apple-system, sans-serif';
  var metaSub = 'Emitido el ' + dateStr + (userEmail ? ' · ' + userEmail : '');
  ctx.fillText(metaSub, w, logoY + 9);

  // 4. Hairline inferior de cierre editorial
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();

  return cv.toDataURL('image/png');
}

// ── KPI CARDS PLANAS Y SUTILES fintrack (Fondo plano verde/rojo/azul claro, sin iconos) ──
function exportKpiCardsDataURL(w, h, incData, expData, balData) {
  var cv = document.createElement('canvas'); var dpr = 3;
  cv.width = w * dpr; cv.height = h * dpr; var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;

  var gap = 12;
  var cw = (w - 2 * gap) / 3;
  var ch = h;
  var r = 20; // Radio exacto de 20px solicitado por el usuario

  var cards = [
    {
      type: 'inc', kicker: 'TOTAL INGRESOS', amount: '+' + incData.formatted,
      sub: incData.count + ' movimientos',
      bg: '#F0FDF4', border: '#BBF7D0', textColor: '#15803D', kickerColor: '#166534'
    },
    {
      type: 'exp', kicker: 'TOTAL GASTOS', amount: '-' + expData.formatted,
      sub: expData.count + ' movimientos',
      bg: '#FEF2F2', border: '#FECACA', textColor: '#DC2626', kickerColor: '#991B1B'
    },
    {
      type: 'bal', kicker: 'BALANCE', // Renombrado a BALANCE
      amount: (balData.isPositive ? '+' : '') + balData.formatted,
      sub: balData.isPositive ? ('Tasa de ahorro: ' + balData.savRate + '%') : 'Gasto supera ingresos',
      bg: '#EFF6FF', border: '#BFDBFE',
      textColor: balData.isPositive ? '#1E3A8A' : '#DC2626',
      kickerColor: balData.isPositive ? '#1E40AF' : '#991B1B'
    }
  ];

  cards.forEach(function(c, i) {
    var cx = i * (cw + gap);
    ctx.save();
    ctx.beginPath();
    // Inset de 0.5px para trazo de 1px exacto, nítido y sin recorte perimetral
    var cardX = cx + 0.5;
    var cardY = 0.5;
    var cardW = cw - 1;
    var cardH = ch - 1;
    if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, r); else ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fillStyle = c.bg; ctx.fill();

    ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c.kickerColor; ctx.font = '600 10px Inter, -apple-system, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.5px';
    ctx.fillText(c.kicker, cardX + 16, 22);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.fillStyle = c.textColor; ctx.font = '800 21px Inter, -apple-system, sans-serif';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.5px';
    ctx.fillText(c.amount, cardX + 16, 56);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.fillStyle = '#64748B'; ctx.font = '500 10px Inter, -apple-system, sans-serif';
    ctx.fillText(c.sub, cardX + 16, 78);
    ctx.restore();
  });

  return cv.toDataURL('image/png');
}

function exportDonutDataURL(entries, total, px) {
  var cv = document.createElement('canvas'); var dpr = 3; cv.width = px * dpr; cv.height = px * dpr; var x = cv.getContext('2d'); x.scale(dpr, dpr);
  x.imageSmoothingEnabled = true;
  var cx = px / 2, cy = px / 2;
  var ro = px * 0.440, ri = px * 0.355;

  x.beginPath(); x.arc(cx, cy, ro, 0, Math.PI * 2); x.arc(cx, cy, ri, Math.PI * 2, 0, true); x.closePath();
  x.fillStyle = '#EEF2F6'; x.fill();

  var chartTotal = (entries && entries.reduce(function(s,e){return s+e.value;},0)) || total;
  if (chartTotal > 0 && entries && entries.length > 0) {
    var a0 = -Math.PI / 2, gap = entries.length > 1 ? 0.018 : 0;
    entries.forEach(function(e) {
      var ang = (e.value / chartTotal) * Math.PI * 2, a1 = a0 + ang;
      if (ang > gap * 1.2) {
        x.beginPath(); x.arc(cx, cy, ro, a0 + gap / 2, a1 - gap / 2, false); x.arc(cx, cy, ri, a1 - gap / 2, a0 + gap / 2, true); x.closePath();
        x.fillStyle = e.color || '#16A34A'; x.fill();
      }
      a0 = a1;
    });
  }

  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#64748B'; x.font = '600 ' + Math.round(px * 0.040) + 'px Inter, -apple-system, sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '1.0px';
  x.fillText('GASTOS', cx, cy - px * 0.075);

  x.fillStyle = '#0F172A'; x.font = '800 ' + Math.round(px * 0.096) + 'px Inter, -apple-system, sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '-0.6px';
  var formattedTotal = fmt(total);
  x.fillText(formattedTotal, cx, cy + px * 0.010);

  var catCount = (entries && entries.length) || 0;
  var subText = total > 0 ? (catCount === 1 ? '1 CATEGORÍA' : catCount + ' CATEGORÍAS') : 'SIN GASTOS';
  x.fillStyle = '#94A3B8'; x.font = '600 ' + Math.round(px * 0.034) + 'px Inter, -apple-system, sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '0.6px';
  x.fillText(subText, cx, cy + px * 0.078);
  if ('letterSpacing' in x) x.letterSpacing = '0px';

  return cv.toDataURL('image/png');
}

// ── GRÁFICOS ANUALES EN PDF (Ingresos vs Gastos/Ahorro y Evolución del Patrimonio con aire vertical) ──
function exportAnnualBarsDataURL(w, h, year) {
  var cv = document.createElement('canvas'); var dpr = 3;
  cv.width = w * dpr; cv.height = h * dpr; var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = '#FFFFFF'; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0.5, 0.5, w - 1, h - 1, 8); else ctx.rect(0.5, 0.5, w - 1, h - 1);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 0.8; ctx.stroke();

  var titleY = 20;
  ctx.fillStyle = '#0F172A'; ctx.font = '700 11px Inter, -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('Ingresos vs gastos mensuales · ' + year, 16, titleY);

  var legX = w - 216; ctx.font = '500 8.5px Inter, -apple-system, sans-serif';
  ctx.fillStyle = '#16A34A'; ctx.beginPath(); ctx.arc(legX, titleY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#64748B'; ctx.fillText('Ingresos', legX + 7, titleY);
  ctx.fillStyle = '#DC2626'; ctx.beginPath(); ctx.arc(legX + 70, titleY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#64748B'; ctx.fillText('Gastos', legX + 77, titleY);
  ctx.fillStyle = '#D97706'; ctx.beginPath(); ctx.arc(legX + 138, titleY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#64748B'; ctx.fillText('Ahorro', legX + 145, titleY);

  var incData = Array(12).fill(0), expData = Array(12).fill(0), savData = [];
  ensureTxIndices();
  var yearTxs = _txByYearStr[String(year)] || [];
  yearTxs.forEach(function(t) {
    if (t.is_balance_adjustment) return;
    var m = parseInt(String(t.date).slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      if (t.type === 'income') incData[m] += txIncomeImpact(t);
      else if (t.type === 'expense') expData[m] += txExpenseImpact(t);
    }
  });
  for (var m = 0; m < 12; m++) savData.push(incData[m] - expData[m]);

  var maxBar = Math.max(1, Math.max.apply(null, incData.concat(expData)));
  var dataMax = Math.max(maxBar, Math.max.apply(null, savData), 0);
  var dataMin = Math.min(0, Math.min.apply(null, savData));
  var ax = axisTicks(dataMin, dataMax, 4), y0 = ax.min, y1 = ax.max;
  if (y1 === y0) { y1 = y0 + 100; }

  // Espacio holgado: padT = 48 proporciona 28px de aire limpio entre el título (titleY=20) y los gráficos
  var padL = 48, padR = 16, padT = 48, padB = 24;
  var plotW = w - padL - padR, plotH = h - padT - padB;
  function Y(v) { return padT + plotH - ((v - y0) / (y1 - y0)) * plotH; }

  ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
  ax.ticks.forEach(function(t) {
    var yy = Y(t);
    ctx.strokeStyle = t === 0 ? 'rgba(100, 116, 139, 0.35)' : 'rgba(100, 116, 139, 0.12)';
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    ctx.fillStyle = '#94A3B8'; ctx.font = '500 8px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.setLineDash([]);
    ctx.fillText(fmtAxis(t), padL - 6, yy);
    ctx.setLineDash([2, 4]);
  });
  ctx.setLineDash([]);

  var slot = plotW / 12, barW = Math.min(slot * 0.30, 14), gap = 3, yz = Y(0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (var m = 0; m < 12; m++) {
    var cxc = padL + slot * m + slot / 2;
    var yi = Y(incData[m]), ye = Y(expData[m]);

    var iH = Math.abs(yz - yi), iY = Math.min(yi, yz);
    if (iH > 0) {
      ctx.fillStyle = 'rgba(22, 163, 74, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cxc - barW - gap / 2, iY, barW, iH, [2, 2, 0, 0]);
      else ctx.rect(cxc - barW - gap / 2, iY, barW, iH);
      ctx.fill();
    }

    var eH = Math.abs(yz - ye), eY = Math.min(ye, yz);
    if (eH > 0) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cxc + gap / 2, eY, barW, eH, [2, 2, 0, 0]);
      else ctx.rect(cxc + gap / 2, eY, barW, eH);
      ctx.fill();
    }

    ctx.fillStyle = '#64748B'; ctx.font = '500 8px Inter, -apple-system, sans-serif';
    ctx.fillText(MONTHS_S[m], cxc, h - padB + 6);
  }

  // Línea de Ahorro
  ctx.strokeStyle = '#D97706'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  for (var m2 = 0; m2 < 12; m2++) {
    var sx = padL + slot * m2 + slot / 2, sy = Y(savData[m2]);
    if (m2 === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  for (var m3 = 0; m3 < 12; m3++) {
    var sx3 = padL + slot * m3 + slot / 2, sy3 = Y(savData[m3]);
    ctx.beginPath(); ctx.arc(sx3, sy3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#D97706'; ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.stroke();
  }

  return cv.toDataURL('image/png');
}

function exportAnnualNetWorthDataURL(w, h, year) {
  var cv = document.createElement('canvas'); var dpr = 3;
  cv.width = w * dpr; cv.height = h * dpr; var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = '#FFFFFF'; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0.5, 0.5, w - 1, h - 1, 8); else ctx.rect(0.5, 0.5, w - 1, h - 1);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 0.8; ctx.stroke();

  var titleY = 20;
  ctx.fillStyle = '#0F172A'; ctx.font = '700 11px Inter, -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('Evolución mensual del patrimonio · ' + year, 16, titleY);

  var regAccounts = accounts.filter(function(a) {
    return !isAccountInvestment(a.id) && !a.is_investment && a.type !== 'investment' && a.id !== '__investments__' && !/inversi[oó]n/i.test(a.name);
  });

  ensureTxIndices();
  var series = regAccounts.map(function(a) {
    var hist = accountHistory(a.id);
    var accTxs = _txByAccount[a.id] || [];
    var dates = [];
    if (hist.length) {
      var d0 = hist[0].reset_date || lastDayOfMonthStr(hist[0].year, hist[0].month);
      if (d0) dates.push(d0);
    }
    if (accTxs.length) {
      var minTx = accTxs.reduce(function(min, t) { return (!min || t.date < min) ? t.date : min; }, '');
      if (minTx) dates.push(minTx);
    }
    dates.sort();
    var firstDate = dates[0] || '';

    return {
      label: capitalize(a.name),
      color: a.color || '#2563EB',
      data: Array.from({ length: 12 }, function(_, m) {
        var endOfMonth = lastDayOfMonthStr(year, m + 1);
        if (firstDate && endOfMonth < firstDate.slice(0, 7) + '-01') return null;
        return accountCalcBalanceAsOf(a.id, endOfMonth);
      })
    };
  });

  var curX = w - 16; ctx.textAlign = 'right'; ctx.font = '500 8.5px Inter, -apple-system, sans-serif';
  series.slice().reverse().forEach(function(se) {
    var lbl = se.label.slice(0, 14);
    var tw = ctx.measureText(lbl).width;
    ctx.fillStyle = '#64748B'; ctx.fillText(lbl, curX, titleY);
    ctx.fillStyle = se.color; ctx.beginPath(); ctx.arc(curX - tw - 6, titleY, 3, 0, Math.PI * 2); ctx.fill();
    curX -= (tw + 18);
  });

  var all = [];
  series.forEach(function(se) {
    se.data.forEach(function(v) { if (v !== null && !isNaN(v)) all.push(v); });
  });
  if (!all.length) all = [0, 100];
  var minVal = Math.min.apply(null, all), maxVal = Math.max.apply(null, all);
  var ax = axisTicks(Math.min(0, minVal), maxVal, 4), y0 = ax.min, y1 = ax.max;
  if (y1 === y0) { y1 = y0 + 100; }

  // Espacio holgado: padT = 48 proporciona 28px de aire limpio entre el título (titleY=20) y los gráficos
  var padL = 48, padR = 16, padT = 48, padB = 24;
  var plotW = w - padL - padR, plotH = h - padT - padB;
  function X(m) { return padL + (plotW / 12) * m + (plotW / 12) / 2; }
  function Y(v) { return padT + plotH - ((v - y0) / (y1 - y0)) * plotH; }

  ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
  ax.ticks.forEach(function(t) {
    var yy = Y(t);
    ctx.strokeStyle = t === 0 ? 'rgba(100, 116, 139, 0.35)' : 'rgba(100, 116, 139, 0.12)';
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    ctx.fillStyle = '#94A3B8'; ctx.font = '500 8px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.setLineDash([]);
    ctx.fillText(fmtAxis(t), padL - 6, yy);
    ctx.setLineDash([2, 4]);
  });
  ctx.setLineDash([]);

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (var mm = 0; mm < 12; mm++) {
    ctx.fillStyle = '#64748B'; ctx.font = '500 8px Inter, -apple-system, sans-serif';
    ctx.fillText(MONTHS_S[mm], X(mm), h - padB + 6);
  }

  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  series.forEach(function(se) {
    ctx.strokeStyle = se.color; ctx.lineWidth = 1.6; ctx.beginPath();
    var started = false;
    for (var m = 0; m < 12; m++) {
      var v = se.data[m]; if (v === null || isNaN(v)) continue;
      var x = X(m), y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (var m2 = 0; m2 < 12; m2++) {
      var v2 = se.data[m2]; if (v2 === null || isNaN(v2)) continue;
      ctx.beginPath(); ctx.arc(X(m2), Y(v2), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = se.color; ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.stroke();
    }
  });

  return cv.toDataURL('image/png');
}


// ── EXPORTACIÓN RESUMEN ANUAL A PDF (fintrack White Edition) ───────
async function exportAnnualPDF(year) {
  await ensureExportLibs('pdf');
  year = parseInt(year, 10) || viewYear || 2026;
  var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var PW = 210, PH = 297, M = 14, UW = PW - 2 * M;
  var yearTxs = transactions.filter(function(t){ return (t.date||'').slice(0,4) === String(year) && !t.is_balance_adjustment; });
  var incByMonth = Array(12).fill(0), expByMonth = Array(12).fill(0), balIncByMonth = Array(12).fill(0), balExpByMonth = Array(12).fill(0);
  var catTotals = {};
  yearTxs.forEach(function(t){
    var mo = parseInt(t.date.slice(5,7), 10) - 1;
    if (mo >= 0 && mo < 12) {
      if (t.type === 'income') {
        var inc = txIncomeImpact(t);
        incByMonth[mo] += inc;
        balIncByMonth[mo] += txBalanceIncomeImpact(t);
      } else if (t.type === 'expense') {
        var exp = txExpenseImpact(t);
        expByMonth[mo] += exp;
        balExpByMonth[mo] += txBalanceExpenseImpact(t);
        var c = txDisplayCategory(t);
        catTotals[c.name] = (catTotals[c.name] || 0) + exp;
      }
    }
  });
  var totalInc = incByMonth.reduce(function(a,b){return a+b;},0);
  var totalExp = expByMonth.reduce(function(a,b){return a+b;},0);
  var totalBalInc = balIncByMonth.reduce(function(a,b){return a+b;},0);
  var totalBalExp = balExpByMonth.reduce(function(a,b){return a+b;},0);
  var totalBal = totalBalInc - totalBalExp;
  var savRate = totalBalInc > 0 ? (totalBal / totalBalInc * 100) : 0;
  var email = currentUser ? (currentUser.email || '') : '';
  var dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Cabecera institucional
  try {
    doc.addImage(exportBrandHeaderDataURL(728, 64, 'Informe Anual ' + year, email, dateStr), 'PNG', M, 12, UW, 16);
  } catch(e) {
    doc.setFontSize(16); doc.text('fintrack. Informe Anual ' + year, M, 24);
  }
  var y = 33;

  // 4 KPI Cards Anuales (Canvas Hi-DPI)
  var cvKpi = document.createElement('canvas'); var dpr = 3;
  cvKpi.width = 728 * dpr; cvKpi.height = 84 * dpr;
  var ctxK = cvKpi.getContext('2d'); ctxK.scale(dpr, dpr);
  ctxK.fillStyle = '#FFFFFF'; ctxK.fillRect(0, 0, 728, 84);
  var kpiCards = [
    { title: 'INGRESOS TOTALES', val: fmt(totalInc), col: '#16A34A', bg: 'rgba(52,199,89,0.08)' },
    { title: 'GASTOS TOTALES', val: fmt(totalExp), col: '#DC2626', bg: 'rgba(255,59,48,0.08)' },
    { title: 'BALANCE NETO', val: (totalBal>=0?'+':'')+fmt(totalBal), col: (totalBal>=0?'#007AFF':'#DC2626'), bg: 'rgba(0,122,255,0.08)' },
    { title: 'TASA DE AHORRO', val: savRate.toFixed(1) + ' %', col: '#0F172A', bg: 'rgba(120,120,140,0.08)' }
  ];
  var cardW = (728 - 3 * 10) / 4;
  kpiCards.forEach(function(c, i){
    var cx = i * (cardW + 10);
    ctxK.fillStyle = c.bg;
    ctxK.beginPath();
    ctxK.roundRect(cx, 0, cardW, 84, 14);
    ctxK.fill();
    ctxK.strokeStyle = 'rgba(0,0,0,0.06)'; ctxK.lineWidth = 1; ctxK.stroke();
    ctxK.fillStyle = '#64748B'; ctxK.font = '700 10px Inter, -apple-system, sans-serif';
    ctxK.fillText(c.title, cx + 12, 24);
    ctxK.fillStyle = c.col; ctxK.font = '800 18px Inter, -apple-system, sans-serif';
    ctxK.fillText(c.val, cx + 12, 54);
  });
  doc.addImage(cvKpi.toDataURL('image/png'), 'PNG', M, y, UW, 21);
  y += 27;

  // Título sección Desglose Mensual
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text('DESGLOSE MES A MES', M, y);
  y += 5;

  // Cabecera de la tabla mensual
  doc.setFillColor(248, 250, 252);
  doc.rect(M, y, UW, 7, 'F');
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.line(M, y, M + UW, y); doc.line(M, y + 7, M + UW, y + 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text('MES', M + 4, y + 4.8);
  doc.text('INGRESOS', M + 60, y + 4.8, { align: 'right' });
  doc.text('GASTOS', M + 105, y + 4.8, { align: 'right' });
  doc.text('BALANCE', M + 150, y + 4.8, { align: 'right' });
  doc.text('AHORRO %', M + UW - 4, y + 4.8, { align: 'right' });
  y += 7;

  // Filas de los 12 meses
  var rowH = 6.2;
  MONTHS.forEach(function(mName, idx){
    var incM = incByMonth[idx], expM = expByMonth[idx];
    var balIncM = balIncByMonth[idx], balExpM = balExpByMonth[idx];
    var balM = balIncM - balExpM;
    var rateM = balIncM > 0 ? (balM / balIncM * 100).toFixed(1) + ' %' : '—';
    if (idx % 2 === 1) {
      doc.setFillColor(252, 252, 253);
      doc.rect(M, y, UW, rowH, 'F');
    }
    doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.15);
    doc.line(M, y + rowH, M + UW, y + rowH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(30, 41, 59);
    doc.text(capitalize(mName), M + 4, y + 4.2);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(22, 163, 74);
    doc.text(fmt(incM), M + 60, y + 4.2, { align: 'right' });
    doc.setTextColor(220, 38, 38);
    doc.text(fmt(expM), M + 105, y + 4.2, { align: 'right' });
    doc.setTextColor(balM >= 0 ? 0 : 220, balM >= 0 ? 122 : 38, balM >= 0 ? 255 : 38);
    doc.text((balM >= 0 ? '+' : '') + fmt(balM), M + 150, y + 4.2, { align: 'right' });
    doc.setTextColor(100, 116, 139);
    doc.text(rateM, M + UW - 4, y + 4.2, { align: 'right' });
    y += rowH;
  });

  // Totales de cierre en pie de tabla
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, UW, 7.5, 'F');
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
  doc.line(M, y, M + UW, y); doc.line(M, y + 7.5, M + UW, y + 7.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);
  doc.text('TOTAL ' + year, M + 4, y + 5);
  doc.setTextColor(22, 163, 74); doc.text(fmt(totalInc), M + 60, y + 5, { align: 'right' });
  doc.setTextColor(220, 38, 38); doc.text(fmt(totalExp), M + 105, y + 5, { align: 'right' });
  doc.setTextColor(totalBal >= 0 ? 0 : 220, totalBal >= 0 ? 122 : 38, totalBal >= 0 ? 255 : 38);
  doc.text((totalBal >= 0 ? '+' : '') + fmt(totalBal), M + 150, y + 5, { align: 'right' });
  doc.setTextColor(15, 23, 42); doc.text(savRate.toFixed(1) + ' %', M + UW - 4, y + 5, { align: 'right' });
  y += 14;

  // Top Categorías de Gasto del Año
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text('DISTRIBUCIÓN PRINCIPAL DE GASTOS ANUALES', M, y);
  y += 6;
  var sortedCats = Object.entries(catTotals).sort(function(a,b){return b[1]-a[1];}).slice(0, 6);
  if (sortedCats.length) {
    sortedCats.forEach(function(catEntry){
      var cName = catEntry[0], cAmt = catEntry[1];
      var pct = totalExp > 0 ? (cAmt / totalExp * 100) : 0;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 41, 59);
      doc.text(cName, M + 2, y + 3.5);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
      doc.text(pct.toFixed(1) + ' %', M + 75, y + 3.5, { align: 'right' });
      doc.setTextColor(15, 23, 42);
      doc.text(fmt(cAmt), M + UW - 2, y + 3.5, { align: 'right' });
      // Micro progress bar
      var barY = y + 5;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(M + 2, barY, UW - 4, 1.8, 0.9, 0.9, 'F');
      doc.setFillColor(36, 138, 61);
      doc.roundedRect(M + 2, barY, Math.max(1, (UW - 4) * (pct / 100)), 1.8, 0.9, 0.9, 'F');
      y += 10;
    });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text('No hay gastos registrados en este año.', M + 2, y + 4);
    y += 10;
  }

  // Footer institucional
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
  doc.text('fintrack · Informe Anual ' + year + ' · Generado el ' + dateStr, M, PH - 8);
  doc.text('Página 1 de 1', PW - M, PH - 8, { align: 'right' });

  doc.save('fintrack_anual_' + year + '.pdf');
  showSuccessToast('PDF Anual descargado con éxito');
}
async function exportPDF(range) {
  if (typeof window.jspdf === 'undefined') { alert('Librería PDF no cargada, inténtalo en unos segundos.'); return; }
  range = range || currentMonthRange();
  var rb = rangeBounds(range);
  var year = parseInt(rb.from.slice(0, 4), 10) || 2026;
  var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var PW = 210, PH = 297, M = 14, UW = PW - 2 * M; // 182mm usable width
  var txs = getExportTx(range).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  var iconMap = await prepareTxIconMap(txs);
  var exps = txs.filter(function(t) { return !t.is_balance_adjustment && txExpenseImpact(t) > 0; });
  var incs = txs.filter(function(t) { return !t.is_balance_adjustment && txIncomeImpact(t) > 0; });
  var totals = calcPeriodTotals(txs);
  var tExp = totals.expense;
  var tBalExp = totals.balExpense;
  var tInc = totals.income;
  var tBalInc = totals.balIncome;
  var tExpNoCalc = totals.uncomputedExpense;
  var bal = totals.balance;
  var savRate = totals.savingsRate;
  var email = currentUser ? (currentUser.email || '') : '';
  var dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. BRAND HERO HEADER (fintrack. alineado a la izquierda, sin ft., sin línea verde, sin subtítulo, sin chip)
  var headerH = 16;
  try {
    doc.addImage(exportBrandHeaderDataURL(728, 64, range.label, email, dateStr), 'PNG', M, 12, UW, headerH);
  } catch (e) {
    doc.setTextColor(15, 23, 42); doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('fintrack.', M, 24);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139); doc.text(range.label, PW - M, 24, { align: 'right' });
  }
  var y = 12 + headerH + 5;

  // 2. FLAT SUBTLE KPI CARDS (Radio 20px, Borde 1px uniforme, BALANCE, azul marino si >= 0)
  var kpiH = 24;
  try {
    var incData = { formatted: fmt(tInc), count: incs.length };
    var expData = { formatted: fmt(tExp), count: exps.length };
    var balData = { formatted: fmt(bal), isPositive: bal >= 0, amountNum: bal, savRate: savRate.toFixed(1) };
    doc.addImage(exportKpiCardsDataURL(728, 96, incData, expData, balData), 'PNG', M, y, UW, kpiH);
  } catch (e) {
    var cwFallback = (UW - 2 * 4) / 3;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.22);
    doc.roundedRect(M, y, cwFallback, kpiH, 3.8, 3.8, 'FD');
  }
  y += kpiH + 5;

  // 3. ANALYTICS (DONUT & TOP CATEGORIES RANKING CON PUNTOS TIPO VIÑETA)
  var entries = donutEntries(txs);
  doc.setFillColor(255, 255, 255); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.22);
  var analyticsH = 50;
  doc.roundedRect(M, y, UW, analyticsH, 3.5, 3.5, 'FD');
  doc.setTextColor(15, 23, 42); doc.setFontSize(8.8); doc.setFont('helvetica', 'bold');
  doc.text('Distribución y Categorías de Gasto', M + 6, y + 6.0);

  var donutSize = 38;
  try {
    doc.addImage(exportDonutDataURL(entries, tExp, 240), 'PNG', M + 5, y + 8.5, donutSize, donutSize);
  } catch (e) {}

  var lx = M + donutSize + 10, ly = y + 11.5;
  var topEntries = entries.slice(0, 6);
  if (topEntries.length) {
    topEntries.forEach(function(e) {
      var catName = e.id==='__balance_adjustment'?'Actualización de saldo':catById(e.id).name;
      var colorHex = e.color || (e.id==='__balance_adjustment'?'#FF3B30':catById(e.id).color);
      var rgb = hexToRgb(colorHex);
      var pct = tExp > 0 ? e.value / tExp : 0;

      // Cuadrado pequeño estilo punto de numeración (1.3 x 1.3 mm)
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(lx, ly - 1.5, 1.3, 1.3, 0.35, 0.35, 'F');

      doc.setTextColor(31, 41, 55); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(capitalize(catName).slice(0, 18), lx + 3.4, ly);

      var barW = 46, bx = lx + 39;
      doc.setFillColor(238, 242, 246);
      doc.roundedRect(bx, ly - 1.0, barW, 0.8, 0.4, 0.4, 'F');
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(bx, ly - 1.0, Math.max(0.8, barW * pct), 0.8, 0.4, 0.4, 'F');

      doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text(fmt(e.value), PW - M - 14, ly, { align: 'right' });
      doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
      doc.text(Math.round(pct * 100) + '%', PW - M - 4, ly, { align: 'right' });
      ly += 6.0;
    });
  } else {
    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('No hay gastos registrados en este periodo.', lx, ly + 12);
  }

  if (tExpNoCalc > 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(148, 163, 184);
    doc.text('Gastos no computados en el gráfico: ' + fmt(tExpNoCalc), M + 6, y + analyticsH - 2.8);
  }

  y += analyticsH + 5;

  // 4. ESTADO DE CUENTAS BANCARIAS (Página 1: después del Donut y antes de los gráficos anuales)
  var regAccounts = accounts.filter(function(a) {
    return !isAccountInvestment(a.id) && !a.is_investment && a.type !== 'investment' && a.id !== '__investments__' && !/inversi[oó]n/i.test(a.name);
  });

  if (regAccounts.length) {
    doc.setTextColor(15, 23, 42); doc.setFontSize(8.8); doc.setFont('helvetica', 'bold');
    doc.text('Estado de Cuentas Bancarias', M, y + 2.5); y += 6.0;
    var accCardW = (UW - 4) / 2, accCardH = 13;
    regAccounts.forEach(function(a, i) {
      var row = Math.floor(i / 2), col = i % 2;
      var ax = M + col * (accCardW + 4);
      var ay = y + row * (accCardH + 3);
      var rgb = hexToRgb(a.color);
      doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
      doc.roundedRect(ax, ay, accCardW, accCardH, 2.5, 2.5, 'FD');
      doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(ax + 1.2, ay + 1.2, 1.8, accCardH - 2.4, 0.6, 0.6, 'F');
      doc.setTextColor(15, 23, 42); doc.setFontSize(8.2); doc.setFont('helvetica', 'bold');
      doc.text(capitalize(a.name).slice(0, 18), ax + 5, ay + 5.2);
      var balNow = accountCalcBalanceAsOf(a.id, rb.to);
      doc.setTextColor(15, 23, 42); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text(balNow !== null ? fmt(balNow) : '—', ax + accCardW - 4, ay + 5.2, { align: 'right' });
      var hist = accountHistory(a.id).filter(function(p) { var d = p.reset_date || lastDayOfMonthStr(p.year, p.month); return d >= rb.from && d <= rb.to; });
      doc.setFontSize(6.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      var lastAudit = hist.length ? (hist[hist.length - 1].reset_date || lastDayOfMonthStr(hist[hist.length - 1].year, hist[hist.length - 1].month)) : 'Sin ajustes en periodo';
      doc.text('Último saldo real: ' + lastAudit, ax + 5, ay + 9.8);
    });
    var totalAccRows = Math.ceil(regAccounts.length / 2);
    y += totalAccRows * (accCardH + 3) + 3;
  }

  // 5. SECCIÓN ANUAL (Ingresos vs Gastos y Ahorro Mensual + Evolución Mensual del Patrimonio)
  var annualChartH = 35;
  try {
    doc.addImage(exportAnnualBarsDataURL(728, 146, year), 'PNG', M, y, UW, annualChartH);
  } catch (e) {}
  y += annualChartH + 4;

  try {
    doc.addImage(exportAnnualNetWorthDataURL(728, 146, year), 'PNG', M, y, UW, annualChartH);
  } catch (e) {}
  y += annualChartH + 5;

  // 6. PÁGINA 2: GASTOS POR CATEGORÍA Y CONTROL PRESUPUESTARIO
  doc.addPage(); y = 14;

  var bycat = {};
  exps.forEach(function(t) { bycat[t.category] = (bycat[t.category] || 0) + (txExpenseImpact(t) || Number(t.amount) || 0); });
  var sorted = Object.entries(bycat).sort(function(a, b) { return b[1] - a[1]; });
  if (sorted.length) {
    doc.setTextColor(100, 116, 139); doc.setFontSize(6.8); doc.setFont('helvetica', 'bold');
    doc.text('CONTROL PRESUPUESTARIO', M, y); y += 4;
    doc.setTextColor(15, 23, 42); doc.setFontSize(9.2); doc.setFont('helvetica', 'bold');
    doc.text('Cumplimiento y Presupuesto por Categoría', M, y); y += 5.5;

    var barW = 60, bx = M + 42;
    doc.setTextColor(100, 116, 139); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text('CATEGORÍA', M, y);
    doc.text('EJECUCIÓN / LÍMITE', bx, y);
    doc.text('GASTO / LÍMITE', PW - M - 22, y, { align: 'right' });
    doc.text('ESTADO', PW - M - 1, y, { align: 'right' });
    y += 2.5;

    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.18);
    doc.line(M, y, PW - M, y); y += 4.8;

    var maxCatAmt = sorted[0][1];
    sorted.forEach(function(e) {
      if (y + 7 > 280) { doc.addPage(); y = 14; }
      var c = catById(e[0]), rgb = hexToRgb(c.color);
      var bud = budgetForCatRange(e[0], rb.from, rb.to);
      var pctBud = bud > 0 ? e[1] / bud : 0;

      // Puntos viñeta pequeños (1.3 x 1.3 mm)
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(M, y - 1.5, 1.3, 1.3, 0.35, 0.35, 'F');

      doc.setTextColor(31, 41, 55); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(capitalize(c.name).slice(0, 18), M + 3.2, y);

      doc.setFillColor(238, 242, 246);
      doc.roundedRect(bx, y - 1.0, barW, 0.8, 0.4, 0.4, 'F');

      var fillW = Math.min(barW, barW * Math.min(e[1] / (maxCatAmt || 1), 1));
      if (bud > 0 && pctBud >= 1) doc.setFillColor(239, 68, 68); else doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(bx, y - 1.0, Math.max(0.8, fillW), 0.8, 0.4, 0.4, 'F');

      if (bud > 0 && maxCatAmt > 0) {
        var mkX = bx + barW * Math.min(bud / maxCatAmt, 1);
        doc.setFillColor(51, 65, 85);
        doc.circle(mkX, y - 2.0, 0.32, 'F');
        doc.setDrawColor(51, 65, 85); doc.setLineWidth(0.20);
        doc.line(mkX, y - 2.0, mkX, y + 0.4);
      }

      // Gasto / Límite
      var amtText = fmt(e[1]) + (bud > 0 ? ' / ' + fmt(bud) : ' / —');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.setFontSize(7.2);
      doc.text(amtText, PW - M - 22, y, { align: 'right' });

      var pillW = 18, pillH = 4.0, pillX = PW - M - pillW, pillY = y - 2.9;
      if (bud > 0) {
        if (pctBud >= 1) {
          doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202); doc.setLineWidth(0.15);
          doc.roundedRect(pillX, pillY, pillW, pillH, 0.8, 0.8, 'FD');
          doc.setTextColor(220, 38, 38); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
          doc.text('+' + Math.round((pctBud - 1) * 100) + '%', pillX + pillW / 2, y - 0.3, { align: 'center' });
        } else if (pctBud >= 0.8) {
          doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 230, 138); doc.setLineWidth(0.15);
          doc.roundedRect(pillX, pillY, pillW, pillH, 0.8, 0.8, 'FD');
          doc.setTextColor(217, 119, 6); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
          doc.text(Math.round(pctBud * 100) + '%', pillX + pillW / 2, y - 0.3, { align: 'center' });
        } else {
          doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.15);
          doc.roundedRect(pillX, pillY, pillW, pillH, 0.8, 0.8, 'FD');
          doc.setTextColor(22, 163, 74); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
          doc.text(Math.round(pctBud * 100) + '%', pillX + pillW / 2, y - 0.3, { align: 'center' });
        }
      } else {
        var sharePct = tExp > 0 ? Math.round((e[1] / tExp) * 100) : 0;
        doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15);
        doc.roundedRect(pillX, pillY, pillW, pillH, 0.8, 0.8, 'FD');
        doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
        doc.text(sharePct + '% tot', pillX + pillW / 2, y - 0.3, { align: 'center' });
      }

      doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.12);
      doc.line(M, y + 2.8, PW - M, y + 2.8);
      y += 6.0;
    });
    y += 4;
  }

  // 7. DETAILED TRANSACTIONS LEDGER (Agrupado por días y con iconos de categoría)
  if (y > 185) { doc.addPage(); y = 14; }
  doc.setTextColor(15, 23, 42); doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
  doc.text('Libro Detallado de Movimientos', M, y);
  doc.setFontSize(7.6); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  var netSign = bal >= 0 ? '+' : '';
  var ledgerSub = range.label + ' · ' + txs.length + ' movimientos registrados · Balance: ' + netSign + fmt(bal) + (tExpNoCalc > 0 ? ' · Gastos no computados: ' + fmt(tExpNoCalc) : '');
  doc.text(ledgerSub, M, y + 5.0);
  y += 11;

  // Agrupación cronológica por jornada
  var groups = {};
  txs.forEach(function(t) {
    var dKey = t.date;
    if (!groups[dKey]) groups[dKey] = [];
    groups[dKey].push(t);
  });
  var dateKeys = Object.keys(groups).sort().reverse();
  var daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var dayBoxH = 4.6;
  var dayBoxOffset = 3.3;
  var dayHeaderAdvance = 5.6;
  var rowH = 8.6;
  var dayGap = 1.0;

  dateKeys.forEach(function(dateStr) {
    var dayTxs = groups[dateStr];
    var dObj = new Date(dateStr + 'T12:00:00');
    var dayName = !isNaN(dObj.getDay()) ? daysOfWeek[dObj.getDay()] : '';
    var dayNum = parseInt(dateStr.slice(8, 10), 10);
    var mIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
    var monthName = (mIdx >= 0 && mIdx < 12) ? MONTHS[mIdx] : '';
    var yearNum = dateStr.slice(0, 4);
    var dayTitle = (dayName ? capitalize(dayName) + ', ' : '') + dayNum + ' de ' + monthName + (yearNum !== String(year) ? ' de ' + yearNum : '');

    // Salto de página preventivo si no cabe la cabecera del día y al menos un movimiento
    if (y + dayHeaderAdvance + rowH > 274) {
      doc.addPage();
      y = 17.5;
    }

    // Cabecera de día con contenedor fino estilizado (4.6mm)
    var boxTop = y - dayBoxOffset;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.12);
    doc.roundedRect(M, boxTop, UW, dayBoxH, 1.0, 1.0, 'FD');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(30, 41, 59);
    doc.text(dayTitle, M + 3.0, y);

    var countLabel = dayTxs.length + (dayTxs.length === 1 ? ' movimiento' : ' movimientos');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(100, 116, 139);
    doc.text(countLabel, PW - M - 3.0, y, { align: 'right' });
    y += dayHeaderAdvance;

    dayTxs.forEach(function(t, txIdx) {
      if (y + rowH > 274) {
        doc.addPage();
        y = 17.5;
        var contBoxTop = y - dayBoxOffset;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.12);
        doc.roundedRect(M, contBoxTop, UW, dayBoxH, 1.0, 1.0, 'FD');

        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(30, 41, 59);
        doc.text(dayTitle + ' (cont.)', M + 3.0, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(100, 116, 139);
        doc.text(countLabel, PW - M - 3.0, y, { align: 'right' });
        y += dayHeaderAdvance;
      }

      var rowTop = y - 3.8;
      var iconSize = 5.6;
      var iconX = M + 2.0;
      var iconY = rowTop + (rowH - iconSize) / 2;
      var iconData = getTxIconSvgData(t);
      var iconUrl = iconMap && iconMap[iconData.key];
      var rgb = hexToRgb(iconData.color);

      // Icono de categoría
      if (iconUrl) {
        doc.addImage(iconUrl, 'PNG', iconX, iconY, iconSize, iconSize);
      } else {
        doc.setFillColor(Math.round(rgb[0] * 0.14 + 255 * 0.86), Math.round(rgb[1] * 0.14 + 255 * 0.86), Math.round(rgb[2] * 0.14 + 255 * 0.86));
        doc.roundedRect(iconX, iconY, iconSize, iconSize, 1.4, 1.4, 'F');
      }

      var textX = M + 9.8;
      var isTra = t.type === 'transfer';
      var isAdj = !!t.is_balance_adjustment;
      var isExp = t.type === 'expense', isInc = t.type === 'income';
      var txEffMode = getEffectiveTxCalcMode(t);
      var isNoCalc = (txEffMode === 2);
      var c = txDisplayCategory(t);
      var mainTitle = isTra ? (accNameById(t.account_id) + ' -> ' + accNameById(t.to_account_id)) : (isAdj ? 'Ajuste de saldo' : capitalize(c.name));

      // Línea 1: Categoría / concepto + subcategoría + insignias
      var line1Y = rowTop + 3.2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(15, 23, 42);
      var cleanTitle = mainTitle.replace(/→/g, '->');
      doc.text(cleanTitle, textX, line1Y);

      var titleW = doc.getTextWidth(cleanTitle);
      var curLine1X = textX + titleW;

      if (!isTra && !isAdj && t.subcategory) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.0); doc.setTextColor(100, 116, 139);
        var subText = ' · ' + capitalize(t.subcategory);
        doc.text(subText, curLine1X, line1Y);
        curLine1X += doc.getTextWidth(subText);
      }

      if (txEffMode === 1) {
        curLine1X += 2.2;
        doc.setFillColor(254, 243, 199); doc.setDrawColor(251, 191, 36); doc.setLineWidth(0.12);
        doc.roundedRect(curLine1X, line1Y - 2.5, 16, 3.2, 0.7, 0.7, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(180, 83, 9);
        doc.text('Solo balance', curLine1X + 8, line1Y - 0.3, { align: 'center' });
        curLine1X += 17;
      } else if (txEffMode === 2) {
        curLine1X += 2.2;
        doc.setFillColor(241, 245, 249); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.12);
        doc.roundedRect(curLine1X, line1Y - 2.5, 14, 3.2, 0.7, 0.7, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(100, 116, 139);
        doc.text('No computa', curLine1X + 7, line1Y - 0.3, { align: 'center' });
        curLine1X += 15;
      }

      if (t.recurring) {
        curLine1X += 2.2;
        doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.12);
        doc.roundedRect(curLine1X, line1Y - 2.5, 14, 3.2, 0.7, 0.7, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(22, 163, 74);
        doc.text('Recurrente', curLine1X + 7, line1Y - 0.3, { align: 'center' });
      }

      // Línea 2: Nota / detalle y Cuenta bancaria
      var line2Y = rowTop + 6.6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(100, 116, 139);
      var line2Parts = [];
      if (t.note) line2Parts.push(t.note.replace(/→/g, '->'));
      if (!isTra) {
        var accName = accNameById(t.account_id);
        if (accName && accName !== '?') line2Parts.push('Cuenta ' + accName);
      }
      var line2Text = line2Parts.join(' · ');
      if (!line2Text && isTra && t.note) line2Text = t.note.replace(/→/g, '->');
      if (line2Text.length > 58) line2Text = line2Text.slice(0, 55) + '...';
      if (line2Text) doc.text(line2Text, textX, line2Y);

      // Importe (columna derecha)
      var sign = isExp ? '-' : (isInc ? '+' : '');
      if (isNoCalc) {
        doc.setTextColor(148, 163, 184);
      } else if (isExp) {
        doc.setTextColor(220, 38, 38);
      } else if (isInc) {
        doc.setTextColor(21, 128, 61);
      } else {
        doc.setTextColor(37, 99, 235);
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2);
      doc.text(sign + fmt(t.amount), PW - M - 2.0, rowTop + 4.9, { align: 'right' });

      // Línea divisoria suave inferior entre filas del mismo día
      if (txIdx < dayTxs.length - 1) {
        doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.12);
        doc.line(textX, rowTop + rowH, PW - M, rowTop + rowH);
      }

      y += rowH;
    });

    y += dayGap;
  });

  // Totales de cierre
  if (y > 268) { doc.addPage(); y = 14; }
  y += 2;
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.25);
  doc.line(M, y, PW - M, y); y += 4.5;
  doc.setFontSize(6.8); doc.setFont('helvetica', 'bold');

  // Total Movimientos
  doc.setTextColor(100, 116, 139);
  doc.text('MOVIMIENTOS: ', M + 2, y);
  var tmW = doc.getTextWidth('MOVIMIENTOS: ');
  doc.setTextColor(15, 23, 42);
  doc.text(String(txs.length), M + 2 + tmW, y);

  if (tExpNoCalc > 0) {
    // Gastos
    var gx = M + 38;
    doc.setTextColor(100, 116, 139);
    doc.text('GASTOS: ', gx, y);
    var gw = doc.getTextWidth('GASTOS: ');
    doc.setTextColor(220, 38, 38);
    doc.text('-' + fmt(tExp), gx + gw, y);

    // Ingresos
    var ix = M + 76;
    doc.setTextColor(100, 116, 139);
    doc.text('INGRESOS: ', ix, y);
    var iw = doc.getTextWidth('INGRESOS: ');
    doc.setTextColor(22, 163, 74);
    doc.text('+' + fmt(tInc), ix + iw, y);

    // No computados
    var ncx = M + 116;
    doc.setTextColor(100, 116, 139);
    doc.text('NO COMPUTADOS: ', ncx, y);
    var ncw = doc.getTextWidth('NO COMPUTADOS: ');
    doc.setTextColor(148, 163, 184);
    doc.text('-' + fmt(tExpNoCalc), ncx + ncw, y);
  } else {
    // Gastos
    var gx = M + 56;
    doc.setTextColor(100, 116, 139);
    doc.text('GASTOS: ', gx, y);
    var gw = doc.getTextWidth('GASTOS: ');
    doc.setTextColor(220, 38, 38);
    doc.text('-' + fmt(tExp), gx + gw, y);

    // Ingresos
    var ix = M + 104;
    doc.setTextColor(100, 116, 139);
    doc.text('INGRESOS: ', ix, y);
    var iw = doc.getTextWidth('INGRESOS: ');
    doc.setTextColor(22, 163, 74);
    doc.text('+' + fmt(tInc), ix + iw, y);
  }

  // Balance Neto (azul oscuro si >= 0, rojo si < 0)
  var netValStr = (bal >= 0 ? '+' : '') + fmt(bal);
  var netValW = doc.getTextWidth(netValStr);
  doc.setTextColor(bal >= 0 ? 30 : 220, bal >= 0 ? 58 : 38, bal >= 0 ? 138 : 38);
  doc.text(netValStr, PW - M - 2, y, { align: 'right' });
  doc.setTextColor(100, 116, 139);
  doc.text('NETO: ', PW - M - 2 - netValW, y, { align: 'right' });

  // 8. RUNNING FOOTER INSTITUCIONAL EN TODAS LAS PÁGINAS (fintrack. y paginación)
  var totalPages = doc.internal.getNumberOfPages();
  for (var pi = 1; pi <= totalPages; pi++) {
    doc.setPage(pi);
    var footerY = 287;
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.18);
    doc.line(M, footerY - 2.5, PW - M, footerY - 2.5);

    doc.setFontSize(6.8); doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); doc.text('fin', M, footerY + 1);
    var finW_pdf = doc.getTextWidth('fin');
    doc.setTextColor(22, 163, 74); doc.text('track.', M + finW_pdf, footerY + 1);
    var ftW_pdf = doc.getTextWidth('fintrack. ');
    doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text(' · Documento financiero confidencial generado automáticamente por fintrack', M + ftW_pdf + 1, footerY + 1);

    var pageStr = 'Página ' + String(pi).padStart(2, '0') + ' / ' + String(totalPages).padStart(2, '0');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text(pageStr, PW - M, footerY + 1, { align: 'right' });
  }

  doc.save('fintrack_' + range.label.replace(/[^0-9a-zA-Z]+/g, '_') + '.pdf');
}
function exportCSV(range){
  var rows=[['Fecha','Tipo','Categoría','Subcategoría','Nota','Cuenta','Importe','Computa']];
  getExportTx(range).slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);}).forEach(function(t){
    var tipo=t.is_balance_adjustment?'Ajuste de saldo':(t.type==='expense'?'Gasto':(t.type==='income'?'Ingreso':'Transferencia'));
    var cat=t.is_balance_adjustment?'Actualización de saldo':(t.type==='transfer'?(accNameById(t.account_id)+' → '+accNameById(t.to_account_id)):catById(t.category).name);
    var cuenta=t.type==='transfer'?(accNameById(t.account_id)+' → '+accNameById(t.to_account_id)):accNameById(t.account_id);
    var amt=(t.type==='expense'?-t.amount:t.amount).toString().replace('.',',');
    var mEff=getEffectiveTxCalcMode(t);
    var computa=mEff===0?'Sí':(mEff===1?'Solo balance':'No');
    function csvEsc(v){v=(v||'').replace(/"/g,'""').replace(/[\r\n]+/g,' ');if(/^[=+\-@\t]/.test(v))v="'"+v;return v;}
    rows.push([t.date,tipo,csvEsc(cat),csvEsc(t.subcategory),csvEsc(t.note||''),csvEsc(cuenta),amt,computa]);
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c)+'"';}).join(';');}).join('\r\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fintrack_'+((range&&range.label)?range.label.replace(/[^0-9a-zA-Z]+/g,'_'):new Date().toISOString().slice(0,10))+'.csv';a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function validateImportData(d){
  function isStr(v,max){return typeof v==='string'&&v.length<=(max||500);}
  function isNum(v){return typeof v==='number'&&isFinite(v);}
  function isId(v){return typeof v==='string'&&v.length>=1&&v.length<=100&&/^[A-Za-z0-9_|.-]+$/.test(v);}
  function isColor(v){return typeof v==='string'&&/^#[0-9a-fA-F]{3,8}$/.test(v);}
  function isDate(v){if(!isStr(v,10)||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;var d2=new Date(v+'T12:00:00');return !isNaN(d2)&&d2.toISOString().slice(0,10)===v;}
  function checkDupIds(arr,label){
    var seen={};
    arr.forEach(function(x,i){if(x&&x.id){if(seen[x.id])throw new Error(label+' #'+i+': id duplicado ('+x.id+')');seen[x.id]=true;}});
  }
  if(!d||typeof d!=='object')throw new Error('formato no válido');
  if(!Array.isArray(d.categories)||!Array.isArray(d.transactions))throw new Error('formato no válido: faltan categorías o transacciones');
  d.categories.forEach(function(c,i){
    if(!c||!isId(c.id))throw new Error('categoría #'+i+': id inválido');
    if(!isStr(c.name,80)||!c.name)throw new Error('categoría #'+i+': nombre inválido');
    if(c.color!==undefined&&c.color!==null&&(!isStr(c.color,20)||!/^#[0-9a-fA-F]{3,8}$/.test(c.color)))throw new Error('categoría #'+i+': color inválido');
    if(c.subcats!==undefined&&(!Array.isArray(c.subcats)||c.subcats.some(function(s){return !isStr(s,60);})))throw new Error('categoría #'+i+': subcategorías inválidas');
    if(c.position!==undefined&&!isNum(c.position))throw new Error('categoría #'+i+': posición inválida');
    if(c.archived!==undefined&&typeof c.archived!=='boolean')throw new Error('categoría #'+i+': estado archivado inválido');
    if(c.kind!==undefined&&['expense','income'].indexOf(c.kind)===-1)throw new Error('categoría #'+i+': tipo inválido');
  });
  checkDupIds(d.categories,'categoría');
  var validTypes=['expense','income','transfer'];
  var validIntervals=['weekly','biweekly','monthly','quarterly','semiannual','yearly'];
  d.transactions.forEach(function(t,i){
    if(!t||!isId(t.id))throw new Error('transacción #'+i+': id inválido');
    if(validTypes.indexOf(t.type)===-1)throw new Error('transacción #'+i+': tipo inválido');
    if(!isNum(t.amount)||t.amount<0)throw new Error('transacción #'+i+': importe inválido');
    if(t.category!=null&&t.category!=='transfer'&&!isId(t.category))throw new Error('transacción #'+i+': categoría inválida');
    if(t.subcategory!=null&&!isStr(t.subcategory,60))throw new Error('transacción #'+i+': subcategoría inválida');
    if(t.note!=null&&!isStr(t.note,1000))throw new Error('transacción #'+i+': nota demasiado larga');
    if(!isDate(t.date))throw new Error('transacción #'+i+': fecha inválida');
    if(t.recur_interval!=null&&validIntervals.indexOf(t.recur_interval)===-1)throw new Error('transacción #'+i+': intervalo de recurrencia inválido');
    if(t.recur_end_date!=null&&!isDate(t.recur_end_date))throw new Error('transacción #'+i+': fecha de fin inválida');
    if(t.recur_series_id!=null&&!isId(t.recur_series_id))throw new Error('transacción #'+i+': id de serie inválido');
    if(t.tags!==undefined&&(!Array.isArray(t.tags)||t.tags.some(function(g){return !isStr(g,40);})))throw new Error('transacción #'+i+': etiquetas inválidas');
    if(t.account_id!=null&&!isId(t.account_id))throw new Error('transacción #'+i+': cuenta inválida');
    if(t.to_account_id!=null&&!isId(t.to_account_id))throw new Error('transacción #'+i+': cuenta destino inválida');
  });
  checkDupIds(d.transactions,'transacción');
  if(d.accounts!==undefined){
    if(!Array.isArray(d.accounts))throw new Error('cuentas: formato inválido');
    d.accounts.forEach(function(a,i){
      if(!a||!isId(a.id))throw new Error('cuenta #'+i+': id inválido');
      if(!isStr(a.name,80)||!a.name)throw new Error('cuenta #'+i+': nombre inválido');
      if(a.is_investment!==undefined&&typeof a.is_investment!=='boolean')throw new Error('cuenta #'+i+': is_investment debe ser booleano');
      if(a.color!=null&&!isColor(a.color))throw new Error('cuenta #'+i+': color inválido');
    });
    checkDupIds(d.accounts,'cuenta');
  }
  if(d.patrimony!==undefined){
    if(!Array.isArray(d.patrimony))throw new Error('patrimonio: formato inválido');
    d.patrimony.forEach(function(p,i){
      if(!p||!isId(p.id))throw new Error('patrimonio #'+i+': id inválido');
      if(p.account_id!=null&&!isId(p.account_id))throw new Error('patrimonio #'+i+': cuenta inválida');
      if(!isNum(p.year)||!isNum(p.month)||!isNum(p.amount))throw new Error('patrimonio #'+i+': valores numéricos inválidos');
    });
    checkDupIds(d.patrimony,'patrimonio');
  }
  if(d.budgets!==undefined){
    if(!Array.isArray(d.budgets))throw new Error('presupuestos: formato inválido');
    d.budgets.forEach(function(b,i){
      if(!b||!isId(b.id))throw new Error('presupuesto #'+i+': id inválido');
      if(b.category_id!=null&&!isId(b.category_id))throw new Error('presupuesto #'+i+': categoría inválida');
      if(!isNum(b.amount))throw new Error('presupuesto #'+i+': importe inválido');
      if(b.month_year!=null&&!isStr(b.month_year,10))throw new Error('presupuesto #'+i+': mes inválido');
      if(b.note!=null&&!isStr(b.note,200))throw new Error('presupuesto #'+i+': nota inválida');
    });
    checkDupIds(d.budgets,'presupuesto');
  }
  if(d.recurrenceExclusions!==undefined){
    if(!Array.isArray(d.recurrenceExclusions))throw new Error('exclusiones de recurrencia: formato invÃ¡lido');
    d.recurrenceExclusions.forEach(function(x,i){
      if(!x||!isId(x.id))throw new Error('exclusiÃ³n #'+i+': id invÃ¡lido');
      if(!isStr(x.recur_series_id,160))throw new Error('exclusiÃ³n #'+i+': serie invÃ¡lida');
      if(!isStr(x.skipped_date,10)||!/^\d{4}-\d{2}-\d{2}$/.test(x.skipped_date))throw new Error('exclusiÃ³n #'+i+': fecha invÃ¡lida');
    });
    checkDupIds(d.recurrenceExclusions,'exclusiÃ³n');
  }
  if(d.transactionVoids!==undefined){
    if(!Array.isArray(d.transactionVoids))throw new Error('anulaciones: formato inválido');
    d.transactionVoids.forEach(function(v,i){if(!v||!isId(v.id)||!isId(v.transaction_id)||!v.transaction_data||typeof v.transaction_data!=='object'||!isStr(v.voided_at,40))throw new Error('anulación #'+i+': datos inválidos');});
    checkDupIds(d.transactionVoids,'anulación');
  }
  if(d.investmentOperations!==undefined){
    if(!Array.isArray(d.investmentOperations))throw new Error('operaciones de inversión: formato inválido');
    var validSides=['buy','sell'];
    d.investmentOperations.forEach(function(op,i){
      if(!op||!isId(op.id))throw new Error('operación de inversión #'+i+': id inválido');
      if(!isStr(op.symbol,20)||!op.symbol.trim())throw new Error('operación de inversión #'+i+': símbolo inválido');
      if(op.product_name!=null&&!isStr(op.product_name,120))throw new Error('operación de inversión #'+i+': nombre de producto demasiado largo');
      if(validSides.indexOf(op.side)===-1)throw new Error('operación de inversión #'+i+': tipo de operación inválido (debe ser compra o venta)');
      if(!isNum(op.units)||op.units<=0)throw new Error('operación de inversión #'+i+': número de títulos debe ser mayor que 0');
      if(!isNum(op.unit_price)||op.unit_price<=0)throw new Error('operación de inversión #'+i+': precio unitario debe ser mayor que 0');
      if(!isNum(op.amount)||op.amount<=0)throw new Error('operación de inversión #'+i+': importe total debe ser mayor que 0');
      if(!isDate(op.operation_date))throw new Error('operación de inversión #'+i+': fecha de operación inválida');
      if(op.cash_account_id!=null&&!isId(op.cash_account_id))throw new Error('operación de inversión #'+i+': cuenta de efectivo inválida');
      if(op.investment_account_id!=null&&!isId(op.investment_account_id))throw new Error('operación de inversión #'+i+': cuenta de inversión inválida');
      if(op.transaction_id!=null&&!isId(op.transaction_id))throw new Error('operación de inversión #'+i+': transacción vinculada inválida');
    });
    checkDupIds(d.investmentOperations,'operación de inversión');
  }
}
async function readBackupFile(file){
  if(file.name.endsWith('.gz')&&typeof DecompressionStream==='function'){
    try{
      var ds=new DecompressionStream('gzip');
      var stream=file.stream().pipeThrough(ds);
      return await new Response(stream).text();
    }catch(e){
      console.warn('Error al descomprimir gzip, intentando lectura directa',e);
    }
  }
  return new Promise(function(resolve,reject){
    var reader=new FileReader();
    reader.onerror=function(){reject(new Error('no se pudo leer el archivo seleccionado'));};
    reader.onload=function(){resolve(String(reader.result||''));};
    reader.readAsText(file,'UTF-8');
  });
}
async function importJSONFile(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  var status=document.getElementById('importStatus');
  try{
    if(file.size>10485760)throw new Error('la copia supera el tamaño máximo de 10 MB');
    if(status){status.textContent='leyendo archivo...';status.className='status-msg';}
    await importJSON(await readBackupFile(file),status);
  }catch(e){
    if(status){status.textContent='Error al importar: '+(e&&e.message?e.message:'archivo no válido');status.className='status-msg status-err';}
  }finally{input.value='';}
}
function normalizeImportedBackup(data){
  if(!data||typeof data!=='object')return data;
  // Las copias automáticas de Supabase usan { data: { recurrence_exclusions, ... } };
  // las exportaciones manuales usan las colecciones directamente en la raíz.
  if(data.data&&typeof data.data==='object'&&!Array.isArray(data.data)){
    var source=data.data;
    return {
      version:data.version||3,
      transactions:source.transactions||[],
      categories:source.categories||[],
      accounts:source.accounts||[],
      patrimony:source.patrimony||[],
      budgets:source.budgets||[],
      recurrenceExclusions:source.recurrenceExclusions||source.recurrence_exclusions||[],
      transactionVoids:source.transactionVoids||source.transaction_voids||[],
      investmentOperations:source.investmentOperations||source.investment_operations||[],
      categoryExclusions:source.categoryExclusions||source.category_exclusions||data.categoryExclusions||{},
      categoryIcons:source.categoryIcons||source.category_icons||data.categoryIcons||{}
    };
  }
  return data;
}
async function importJSON(rawInput,statusEl){
  var raw=typeof rawInput==='string'?rawInput.trim():'';var s=statusEl||document.getElementById('importStatus');
  if(isOffline){if(s){s.textContent='No puedes importar datos mientras estás sin conexión. Conéctate a Internet para generar el respaldo previo de seguridad.';s.className='status-msg status-err';}return;}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  try{
    if(raw.length>10485760)throw new Error('la copia supera el tamaño máximo de 10 MB');
    var d=normalizeImportedBackup(JSON.parse(raw));
    validateImportData(d);
    var accepted=await confirmCriticalAction({title:'Importar copia de seguridad',description:'Se mostrarán los datos del archivo y se sustituirán tus datos actuales. Antes se creará una copia de seguridad real de tu estado actual.',counts:backupPreviewCounts(d),phrase:'IMPORTAR',approveLabel:'Importar copia'});
    if(!accepted)return;
    s.textContent='creando copia de seguridad previa...';s.className='status-msg';
    await createSafetyBackup('before_import');
    s.textContent='importando datos de forma segura...';
    var atomicImport=await sb.rpc('replace_fintrack_data',{payload:d});
    if(atomicImport.error)throw new Error('importación: '+atomicImport.error.message);
    if(d.categoryExclusions){
      saveCategoryExpenseExclusions(d.categoryExclusions);
    }
    if(d.categoryIcons){
      saveCategoryCustomIcons(d.categoryIcons);
    }
    s.textContent=d.transactions.length+' transacciones importadas';s.className='status-msg status-ok';
    await loadData();
    return;
  }catch(e){s.textContent='Error: '+e.message;s.className='status-msg status-err';}
}
function exportXLSX(range){
  if(typeof ExcelJS==='undefined'){alert('Librería no cargada, espera unos segundos e inténtalo de nuevo.');return;}
  range=range||currentMonthRange();
  var wb=new ExcelJS.Workbook();
  wb.creator='fintrack';wb.created=new Date();
  var email=currentUser?currentUser.email:'';
  var dateStr=new Date().toLocaleDateString('es-ES');

  // ── COLOR PALETTE ─────────────────────────────────────────────
  var C={
    dark:'1A1814', white:'FFFFFF', light:'F7F5F2', mid:'F0EDE8',
    green:'2D9467', greenLight:'E1F5EE', red:'CC4A38', redLight:'FCEBEB',
    blue:'185FA5', blueLight:'E8F0FB', amber:'BE820A', amberLight:'FDF3DC',
    text:'3A3835', text2:'6B6760', text3:'A09D98', border:'D9D6D0'
  };

  function hdrStyle(bgHex,fgHex,sz,bold,align){
    return {font:{bold:bold!==false,size:sz||10,color:{argb:'FF'+fgHex},name:'Calibri'},
      fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+bgHex}},
      alignment:{horizontal:align||'center',vertical:'middle',wrapText:false},
      border:{top:{style:'thin',color:{argb:'FF'+C.border}},bottom:{style:'thin',color:{argb:'FF'+C.border}},left:{style:'thin',color:{argb:'FF'+C.border}},right:{style:'thin',color:{argb:'FF'+C.border}}}};
  }
  function dataStyle(bgHex,fgHex,align,numFmt,bold){
    var s={font:{bold:!!bold,size:10,color:{argb:'FF'+(fgHex||C.text)},name:'Calibri'},
      fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+(bgHex||C.white)}},
      alignment:{horizontal:align||'left',vertical:'middle'}};
    if(numFmt)s.numFmt=numFmt;
    return s;
  }
  var moneyFmt='#,##0.00 "€"';
  var moneyFmtRed='#,##0.00 "€";[Red]-#,##0.00 "€"';

  function titleRow(ws,text,cols){
    ws.mergeCells(1,1,1,cols);
    var r=ws.getRow(1);r.height=32;
    var c=r.getCell(1);c.value=text;
    c.style=hdrStyle(C.dark,C.white,14,true,'left');
    c.alignment={horizontal:'left',vertical:'middle',indent:1};
  }
  function subtitleRow(ws,cols){
    ws.mergeCells(2,1,2,cols);
    var r=ws.getRow(2);r.height=18;
    var c=r.getCell(1);c.value='Usuario: '+email+'   |   Exportado: '+dateStr;
    c.style=dataStyle(C.mid,C.text2,'left');
  }

  // ── SHEET 0: RESUMEN (KPIs + donut del mes en curso) ──────────
  (function(){
    var ws0=wb.addWorksheet('Resumen');
    ws0.columns=[{width:22},{width:20},{width:14},{width:14},{width:14},{width:14}];
    titleRow(ws0,'fintrack — Resumen · '+range.label,6);
    subtitleRow(ws0,6);
    ws0.addRow([]);
    var mtx=getExportTx(range);
    var totals=calcPeriodTotals(mtx);
    var tExp=totals.expense;
    var tBalExp=totals.balExpense;
    var tInc=totals.income;
    var tBalInc=totals.balIncome;
    var balVal=totals.balance;
    var kr=ws0.addRow(['Ingresos','Gastos','Balance']);kr.height=18;
    kr.getCell(1).style=hdrStyle(C.green,C.white,10,true,'center');
    kr.getCell(2).style=hdrStyle(C.red,C.white,10,true,'center');
    kr.getCell(3).style=hdrStyle(C.blue,C.white,10,true,'center');
    var vr=ws0.addRow([tInc,tExp,balVal]);vr.height=22;
    vr.getCell(1).style=dataStyle(C.greenLight,C.green,'center',moneyFmt,true);vr.getCell(1).numFmt=moneyFmt;
    vr.getCell(2).style=dataStyle(C.redLight,C.red,'center',moneyFmt,true);vr.getCell(2).numFmt=moneyFmt;
    vr.getCell(3).style=dataStyle(C.blueLight,C.blue,'center',moneyFmtRed,true);vr.getCell(3).numFmt=moneyFmtRed;
    vr.getCell(3).value={formula:'A'+vr.number+'-B'+vr.number,result:balVal};
    ws0.addRow([]);ws0.addRow([]);
    var br=ws0.addRow(['Gastos por categoría']);br.getCell(1).style=hdrStyle(C.dark,C.white,11,true,'left');ws0.mergeCells(br.number,1,br.number,3);
    var entries=donutEntries(mtx);
    entries.forEach(function(e){
      var catName = e.id==='__balance_adjustment'?'Actualización de saldo':catById(e.id).name;
      var pctVal = tExp ? e.value / tExp : 0;
      var r=ws0.addRow([capitalize(catName),e.value,pctVal]);
      r.getCell(1).style=dataStyle(C.white,C.text,'left');
      r.getCell(2).style=dataStyle(C.white,C.text,'right',moneyFmt);r.getCell(2).numFmt=moneyFmt;
      r.getCell(3).style=dataStyle(C.white,C.text2,'right','0%');r.getCell(3).numFmt='0%';
      r.getCell(3).value={formula:'B'+r.number+'/$B$'+vr.number,result:pctVal};
    });
    try{
      var rawImg=exportDonutDataURL(entries,tExp,260);
      var base64Data=(typeof rawImg==='string')?rawImg.replace(/^data:image\/png;base64,/,''):rawImg;
      var imgId=wb.addImage({base64:base64Data,extension:'png'});
      ws0.addImage(imgId,{tl:{col:4.2,row:4.2},ext:{width:200,height:200}});
    }catch(e){}
  })();

  // ── SHEET 1: TRANSACCIONES ────────────────────────────────────
  var ws1=wb.addWorksheet('Transacciones');
  ws1.columns=[
    {key:'date',width:13},{key:'type',width:11},{key:'cat',width:22},
    {key:'subcat',width:22},{key:'note',width:36},{key:'acc',width:20},
    {key:'tags',width:22},{key:'rec',width:12},{key:'amount',width:16}
  ];
  titleRow(ws1,'fintrack — Registro de Transacciones',9);
  subtitleRow(ws1,9);
  ws1.addRow([]);
  var h1=ws1.addRow(['Fecha','Tipo','Categoría','Subcategoría','Nota','Cuenta','Etiquetas','Recurrente','Importe (€)']);
  h1.height=20;
  h1.eachCell(function(cell){cell.style=hdrStyle(C.dark,C.white,10,true,'center');});

  var txSorted=getExportTx(range).slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  var totalInc=0,totalBalInc=0,totalExp=0,totalBalExp=0;
  txSorted.forEach(function(t,i){
    var isExp=t.type==='expense';
    var isInc=t.type==='income';
    var bg=i%2===0?C.white:C.light;
    var amount=isExp?-t.amount:t.amount;
    if(isInc){
      totalInc+=txIncomeImpact(t);
      totalBalInc+=txBalanceIncomeImpact(t);
    } else if(isExp){
      totalExp+=txExpenseImpact(t);
      totalBalExp+=txBalanceExpenseImpact(t);
    }
    var typeLabel=t.is_balance_adjustment?'Ajuste de saldo':(isExp?'Gasto':isInc?'Ingreso':'Transferencia');
    var catLabel=t.is_balance_adjustment?'Actualización de saldo':(t.type==='transfer'?(accNameById(t.account_id)+' → '+accNameById(t.to_account_id)):catById(t.category).name);
    var accLabel=t.type==='transfer'?(accNameById(t.account_id)+' → '+accNameById(t.to_account_id)):accNameById(t.account_id);
    var rowTags=(t.tags||[]).filter(function(g){return g!=='_no_calc'&&g!=='_no_expense';});
    var mEff=getEffectiveTxCalcMode(t);
    if(mEff===1)rowTags.push('solo balance');
    else if(mEff===2)rowTags.push('no computa');
    var row=ws1.addRow([t.date,typeLabel,catLabel,t.subcategory||'',t.note||'',accLabel,rowTags.join(', '),t.recurring?'Sí':'No',amount]);
    row.height=18;
    var typeColor=isExp?C.red:isInc?C.green:C.text2;
    row.getCell(1).style=dataStyle(bg,C.text,'center');
    row.getCell(2).style=dataStyle(bg,typeColor,'center',null,true);
    row.getCell(3).style=dataStyle(bg,C.text,'left');
    row.getCell(4).style=dataStyle(bg,C.text2,'left');
    row.getCell(5).style=dataStyle(bg,C.text2,'left');
    row.getCell(6).style=dataStyle(bg,C.text2,'left');
    row.getCell(7).style=dataStyle(bg,C.text3,'left');
    row.getCell(8).style=dataStyle(bg,C.text2,'center');
    var amtStyle=dataStyle(bg,isExp?C.red:C.green,'right',moneyFmtRed,true);
    row.getCell(9).style=amtStyle;row.getCell(9).numFmt=moneyFmtRed;
  });
  ws1.addRow([]);
  totalInc=roundMoney(totalInc);
  totalBalInc=roundMoney(totalBalInc);
  totalExp=roundMoney(totalExp);
  totalBalExp=roundMoney(totalBalExp);
  var netBalVal=roundMoney(totalBalInc-totalBalExp);
  var rIncRow=ws1.addRow(['','','','','','','','Ingresos totales:',totalInc]);rIncRow.height=20;
  var rExpRow=ws1.addRow(['','','','','','','','Gastos totales:',-totalExp]);rExpRow.height=20;
  var rBalRow=ws1.addRow(['','','','','','','','Balance neto:',netBalVal]);rBalRow.height=20;
  rBalRow.getCell(9).value={formula:'I'+rIncRow.number+'+I'+rExpRow.number,result:netBalVal};
  var totList=[rIncRow,rExpRow,rBalRow];
  var bgs=[C.greenLight,C.redLight,C.blueLight];
  var fgs=[C.green,C.red,C.blue];
  totList.forEach(function(r,i){
    for(var c=1;c<=7;c++)r.getCell(c).style=dataStyle(bgs[i]);
    r.getCell(8).style=dataStyle(bgs[i],fgs[i],'right',null,true);
    r.getCell(9).style=dataStyle(bgs[i],fgs[i],'right',moneyFmtRed,true);
    r.getCell(9).numFmt=moneyFmtRed;
  });

  // ── SHEET 2: RESUMEN MENSUAL ──────────────────────────────────
  var ws2=wb.addWorksheet('Resumen Mensual');
  var nCols=5+categories.length;
  var ws2Cols=[{width:7},{width:16},{width:16},{width:16},{width:16}];
  categories.forEach(function(){ws2Cols.push({width:17});});
  ws2.columns=ws2Cols;
  titleRow(ws2,'fintrack — Resumen Mensual por Categoría',nCols);
  subtitleRow(ws2,nCols);
  ws2.addRow([]);
  var hd2=['Año','Mes','Ingresos (€)','Gastos (€)','Balance (€)'];
  categories.forEach(function(c){hd2.push(c.name+' (€)');});
  var h2=ws2.addRow(hd2);
  h2.height=20;
  h2.eachCell(function(cell){cell.style=hdrStyle(C.dark,C.white,10,true,'center');});

  var years=[...new Set(transactions.map(function(t){return t.date?parseInt(String(t.date).slice(0,4),10):new Date().getFullYear();}))].sort();
  if(!years.length)years=[new Date().getFullYear()];
  var prevYr=null;
  ensureTxIndices();
  years.forEach(function(yr){
    for(var m=0;m<12;m++){
      var ym=yr+'-'+pad(m+1);
      var txs=_txByMonthStr[ym]||[];
      if(!txs.length)return;
      var inc=0,exp=0,balInc=0,balExp=0,catExpMap={};
      for(var ti=0;ti<txs.length;ti++){
        var t=txs[ti];
        if(t.is_balance_adjustment)continue;
        var incAmt=txIncomeImpact(t);
        var expAmt=txExpenseImpact(t);
        var balIncAmt=txBalanceIncomeImpact(t);
        var balExpAmt=txBalanceExpenseImpact(t);
        if(incAmt>0)inc+=incAmt;
        if(balIncAmt>0)balInc+=balIncAmt;
        if(expAmt>0){
          exp+=expAmt;
          if(t.category)catExpMap[t.category]=(catExpMap[t.category]||0)+expAmt;
        }
        if(balExpAmt>0)balExp+=balExpAmt;
      }
      inc=roundMoney(inc);
      exp=roundMoney(exp);
      balInc=roundMoney(balInc);
      balExp=roundMoney(balExp);
      var bal=roundMoney(balInc-balExp);
      var rowData=[yr,MONTHS[m],inc,-exp,bal];
      categories.forEach(function(c){
        var catExp=roundMoney(catExpMap[c.id]||0);
        rowData.push(catExp>0?-catExp:0);
      });
      var isNewYr=prevYr!==yr;prevYr=yr;
      var bg=isNewYr?C.mid:C.white;
      var r2=ws2.addRow(rowData);r2.height=18;
      r2.getCell(1).style=dataStyle(bg,C.text,'center',null,isNewYr);
      r2.getCell(2).style=dataStyle(bg,C.text,'left',null,false);
      r2.getCell(3).style=dataStyle(bg,C.green,'right',moneyFmt,true);r2.getCell(3).numFmt=moneyFmt;
      r2.getCell(4).style=dataStyle(bg,C.red,'right',moneyFmt,true);r2.getCell(4).numFmt=moneyFmt;
      var balFg=bal>=0?C.green:C.red;
      r2.getCell(5).style=dataStyle(bg,balFg,'right',moneyFmtRed,true);r2.getCell(5).numFmt=moneyFmtRed;
      for(var ci=0;ci<categories.length;ci++){
        r2.getCell(6+ci).style=dataStyle(bg,C.text2,'right',moneyFmt);r2.getCell(6+ci).numFmt=moneyFmt;
      }
    }
  });

  // ── SHEET 3: PATRIMONIO ───────────────────────────────────────
  if(accounts.length){
    var ws3=wb.addWorksheet('Patrimonio');
    var nColsPat=2+accounts.length+1;
    var ws3Cols=[{width:7},{width:16}];
    accounts.forEach(function(){ws3Cols.push({width:20});});
    ws3Cols.push({width:18});
    ws3.columns=ws3Cols;
    titleRow(ws3,'fintrack — Evolución Patrimonial',nColsPat);
    subtitleRow(ws3,nColsPat);
    ws3.addRow([]);
    var hd3=['Año','Mes'];
    accounts.forEach(function(a){hd3.push(a.name+' (€)');});
    hd3.push('Total (€)');
    var h3=ws3.addRow(hd3);
    h3.height=20;
    h3.eachCell(function(cell){cell.style=hdrStyle(C.dark,C.white,10,true,'center');});
    var patMap={};
    patrimony.forEach(function(p){if(p&&p.account_id)patMap[p.account_id+'@'+p.year+'-'+p.month]=Number(p.amount)||0;});
    var patYrs=[...new Set(patrimony.map(function(p){return p.year;}))].sort();
    var prevPYr=null;
    patYrs.forEach(function(yr){
      for(var m=1;m<=12;m++){
        var ymKey=yr+'-'+m;
        var has=accounts.some(function(a){return (a.id+'@'+ymKey) in patMap;});
        if(!has)continue;
        var row=[yr,MONTHS[m-1]];var tot=0;
        accounts.forEach(function(a){var v=patMap[a.id+'@'+ymKey]||0;row.push(v);tot+=v;});
        row.push(tot);
        var isNew=prevPYr!==yr;prevPYr=yr;
        var bg3=isNew?C.greenLight:C.white;
        var r3=ws3.addRow(row);r3.height=18;
        r3.getCell(1).style=dataStyle(bg3,C.text,'center',null,isNew);
        r3.getCell(2).style=dataStyle(bg3,C.text,'left');
        for(var ai=0;ai<accounts.length;ai++){r3.getCell(3+ai).style=dataStyle(bg3,C.green,'right',moneyFmt);r3.getCell(3+ai).numFmt=moneyFmt;}
        r3.getCell(3+accounts.length).style=dataStyle(bg3,C.blue,'right',moneyFmt,true);r3.getCell(3+accounts.length).numFmt=moneyFmt;
      }
    });
  }

  // ── SHEET 4: CATEGORIAS ───────────────────────────────────────
  var ws4=wb.addWorksheet('Categorías');
  ws4.columns=[{width:24},{width:48},{width:26},{width:14}];
  titleRow(ws4,'fintrack — Categorías y Presupuestos',4);
  subtitleRow(ws4,4);
  ws4.addRow([]);
  var h4=ws4.addRow(['Categoría','Subcategorías','Presupuesto mensual (€)','Color hex']);
  h4.height=20;h4.eachCell(function(cell){cell.style=hdrStyle(C.dark,C.white,10,true,'center');});
  categories.forEach(function(c,i){
    var bg=i%2===0?C.white:C.light;
    var r4=ws4.addRow([c.name,(c.subcats||[]).join(', '),budgetForCat(c.id)||'',c.color]);
    r4.height=18;
    r4.getCell(1).style=dataStyle(bg,C.text,'left',null,true);
    r4.getCell(2).style=dataStyle(bg,C.text2,'left');
    var bud=budgetForCat(c.id);
    r4.getCell(3).style=dataStyle(bg,bud?C.amber:C.text3,'right',bud?moneyFmt:null,!!bud);
    if(bud)r4.getCell(3).numFmt=moneyFmt;
    r4.getCell(4).style=dataStyle(bg,C.text3,'center');
  });

  // ── DOWNLOAD ──────────────────────────────────────────────────
  wb.xlsx.writeBuffer().then(function(buffer){
    var blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='fintrack_'+range.label.replace(/[^0-9a-zA-Z]+/g,'_')+'.xlsx';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }).catch(function(e){alert('Error al generar Excel: '+e.message);});
}


