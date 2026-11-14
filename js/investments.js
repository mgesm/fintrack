'use strict';
function investmentPositionsAsOf(accountId,dateStr){
  var ops=(investmentOperations||[]).filter(function(o){
    if(accountId&&o.investment_account_id&&o.investment_account_id!==accountId&&o.cash_account_id!==accountId)return false;
    return !dateStr||o.operation_date<=dateStr;
  }).sort(function(a,b){
    var d=String(a.operation_date).localeCompare(String(b.operation_date));
    if(d!==0)return d;
    var sideRank=(a.side==='buy'?0:1)-(b.side==='buy'?0:1);
    if(sideRank!==0)return sideRank;
    return String(a.created_at||a.id||'').localeCompare(String(b.created_at||b.id||''));
  });
  var bySymbol={};
  ops.forEach(function(o){
    var key=o.symbol;
    if(!bySymbol[key])bySymbol[key]={symbol:key,units:0,cost:0};
    var p=bySymbol[key],u=Number(o.units),a=Number(o.amount);
    if(o.side==='buy'){
      p.units+=u;
      p.cost+=a;
    }else if(p.units>0){
      p.cost-=p.cost*(u/p.units);
      p.units-=u;
      if(p.units<=0.0000001){p.units=0;p.cost=0;}
    }
  });
  return Object.keys(bySymbol).map(function(k){return bySymbol[k];}).filter(function(p){return p.units>0.0000001;});
}
function investmentRealizedGain(accountId){
  var ops=(investmentOperations||[]).filter(function(o){
    if(accountId&&o.investment_account_id&&o.investment_account_id!==accountId&&o.cash_account_id!==accountId)return false;
    return true;
  }).sort(function(a,b){
    var d=String(a.operation_date).localeCompare(String(b.operation_date));
    if(d!==0)return d;
    var sideRank=(a.side==='buy'?0:1)-(b.side==='buy'?0:1);
    if(sideRank!==0)return sideRank;
    return String(a.created_at||a.id||'').localeCompare(String(b.created_at||b.id||''));
  });
  var bySymbol={},realized=0;
  ops.forEach(function(o){
    var key=o.symbol;
    if(!bySymbol[key])bySymbol[key]={units:0,cost:0};
    var p=bySymbol[key],u=Number(o.units),a=Number(o.amount);
    if(!Number.isFinite(u)||!Number.isFinite(a))return;
    if(o.side==='buy'){
      p.units+=u;
      p.cost+=a;
    }else if(p.units>0){
      var ratio=Math.min(1,u/p.units);
      var costSold=p.cost*ratio;
      realized+=(a-costSold);
      p.cost-=costSold;
      p.units-=u;
      if(p.units<=0.0000001){p.units=0;p.cost=0;}
    }
  });
  return roundMoney(realized);
}
function investmentPortfolioValueAsOf(accountId,dateStr){
  var pos=investmentPositionsAsOf(accountId,dateStr);
  var isCurrentOrFuture=!dateStr||dateStr>=todayStr().slice(0,7);
  if(!pos.length){
    var hasPastOps=(investmentOperations||[]).some(function(o){
      if(accountId&&o.investment_account_id&&o.investment_account_id!==accountId&&o.cash_account_id!==accountId)return false;
      return !dateStr||o.operation_date<=dateStr;
    });
    return hasPastOps?0:null;
  }
  return pos.reduce(function(total,p){
    var q=_quoteCache[String(p.symbol||'').toUpperCase()];
    var price=Number(q&&(q.data?(q.data.price||q.data.close||q.data.regularMarketPrice):(q.price||q.close||q.regularMarketPrice)));
    var val=(isCurrentOrFuture&&Number.isFinite(price)&&price>0)?(p.units*price):p.cost;
    return total+val;
  },0);
}
function assetRangeConfig(range){return {d:{interval:'5min',outputsize:78},m:{interval:'1day',outputsize:31},m6:{interval:'1day',outputsize:183},ytd:{interval:'1day',outputsize:366},y:{interval:'1day',outputsize:366},y5:{interval:'1week',outputsize:261}}[range]||{interval:'1day',outputsize:31};}
function assetGraph(values){
  values=(values||[]).slice().sort(function(a,b){return String(a.datetime||a.date||'').localeCompare(String(b.datetime||b.date||''));});
  var nums=(values||[]).map(function(v){return Number(v.close);}).filter(Number.isFinite);
  if(nums.length<2)return '<div class="search-status">No hay histórico disponible para este periodo.</div>';
  var min=Math.min.apply(null,nums),max=Math.max.apply(null,nums),span=max-min,flat=span<1e-9;
  var coords=nums.map(function(v,i){return [(i/(nums.length-1)*320).toFixed(1),flat?'50.0':(94-(v-min)/span*78).toFixed(1)];});
  var pts=coords.map(function(p){return p.join(',');}).join(' '),area='0,100 '+pts+' 320,100';
  var up=nums[nums.length-1]>=nums[0],color=up?'#34C759':'#FF5A52';
  return '<div class="asset-chart-caption"><span>Mín. '+min.toLocaleString('es-ES',{maximumFractionDigits:2})+'</span><span>Máx. '+max.toLocaleString('es-ES',{maximumFractionDigits:2})+'</span></div><div class="asset-chart-tooltip"></div><svg data-values="'+encodeURIComponent(JSON.stringify(values||[]))+'" viewBox="0 0 320 100" preserveAspectRatio="none"><defs><linearGradient id="assetFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".18"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs><path d="M0 20H320M0 50H320M0 80H320" stroke="currentColor" opacity=".08" stroke-width=".7" vector-effect="non-scaling-stroke"/><polygon points="'+area+'" fill="url(#assetFill)"/><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.6" vector-effect="non-scaling-stroke" shape-rendering="geometricPrecision" stroke-linecap="round" stroke-linejoin="round"/><line class="asset-chart-guide" x1="0" x2="0" y1="0" y2="100" stroke="'+color+'" stroke-width=".8" vector-effect="non-scaling-stroke" opacity="0"/><circle class="asset-chart-dot" cx="0" cy="0" r="3.5" fill="var(--bg2)" stroke="'+color+'" stroke-width="1.8" vector-effect="non-scaling-stroke" opacity="0"/></svg>';
}
function inspectAssetGraph(svg,event){
  var chart=svg.parentElement,tip=chart.querySelector('.asset-chart-tooltip'),guide=svg.querySelector('.asset-chart-guide'),dot=svg.querySelector('.asset-chart-dot'),values;
  try{values=svg._assetValues||(svg._assetValues=JSON.parse(decodeURIComponent(svg.dataset.values||'')));}catch(e){return;}
  var points=values.filter(function(v){return Number.isFinite(Number(v.close));});if(points.length<2)return;
  var nums=points.map(function(v){return Number(v.close);}),min=Math.min.apply(null,nums),max=Math.max.apply(null,nums),span=max-min,flat=span<1e-9,rect=svg.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),i=Math.round(ratio*(points.length-1)),value=nums[i],x=i/(points.length-1)*320,y=flat?50:(94-(value-min)/span*78),raw=String(points[i].datetime||points[i].date||''),isoStr=raw.length===10?(raw+'T12:00:00'):raw.replace(' ','T'),date=raw?new Date(isoStr).toLocaleString('es-ES',{day:'2-digit',month:'short',year:raw.length>10?undefined:'numeric',hour:raw.length>10?'2-digit':undefined,minute:raw.length>10?'2-digit':undefined}):'Sin fecha';
  var pctX=Math.max(14,Math.min(86,x/320*100)),topPx=Math.max(24,Math.min(130,y/100*142+22));
  guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.setAttribute('opacity','1');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('opacity','1');tip.innerHTML=value.toLocaleString('es-ES',{maximumFractionDigits:2})+'<small>'+htmlEscape(date)+'</small>';tip.style.left=pctX+'%';tip.style.top=topPx+'px';tip.style.opacity='1';chart.classList.add('is-inspecting');
}
function clearAssetGraph(svg){var chart=svg.parentElement,tip=chart.querySelector('.asset-chart-tooltip'),guide=svg.querySelector('.asset-chart-guide'),dot=svg.querySelector('.asset-chart-dot');if(guide)guide.setAttribute('opacity','0');if(dot)dot.setAttribute('opacity','0');if(tip)tip.style.opacity='0';chart.classList.remove('is-inspecting');}
var ASSET_LOGO_DOMAINS={VWCE:'vanguard.co.uk',VWRL:'vanguard.co.uk',EUNL:'ishares.com',IUSA:'ishares.com',IWDA:'blackrock.com',CSPX:'ishares.com',VUSA:'vanguard.co.uk',VGWL:'vanguard.co.uk',MEUD:'amundi.com',DBXD:'xtrackers.com',SPY:'ssga.com',GLD:'ssga.com','IE00BYX5MX67':'fidelity.com','LU1829220216':'amundi.com','IE00B4L5Y983':'ishares.com'};
function decorateAssetLogo(el,symbol){if(!el||el.dataset.logoReady)return;symbol=String(symbol||'').toUpperCase();el.dataset.logoReady='1';var fallback=htmlEscape(symbol.slice(0,1)||'•');var parqetUrl='https://assets.parqet.com/logos/symbol/'+encodeURIComponent(symbol);el.innerHTML='<img src="'+parqetUrl+'" alt="" referrerpolicy="no-referrer"><span class="logo-fallback">'+fallback+'</span>';var img=el.querySelector('img');img.onerror=function(){var domain=ASSET_LOGO_DOMAINS[symbol];if(domain){img.onerror=function(){el.classList.add('logo-fallback-only');img.remove();};img.src='https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://'+encodeURIComponent(domain)+'&size=128';}else{el.classList.add('logo-fallback-only');img.remove();}};}
function decorateInvestmentLogos(root){(root||document).querySelectorAll('.search-result i:not([data-logo-ready]),.asset-logo:not([data-logo-ready]),.position i:not([data-logo-ready])').forEach(function(el){var parent=el.closest('.search-result'),symbol=parent&&parent.dataset.symbol;if(!symbol&&el.closest('.asset-sheet')){symbol=((el.closest('.asset-sheet').querySelector('.asset-type')||{}).textContent||'').split(' · ')[0];}if(!symbol&&el.closest('.position')){symbol=((el.closest('.position').querySelector('small')||{}).textContent||'').split(' · ')[0];}decorateAssetLogo(el,symbol);});}
document.addEventListener('pointermove',function(e){var svg=e.target.closest&&e.target.closest('.asset-sheet-chart svg');if(svg)inspectAssetGraph(svg,e);});
document.addEventListener('pointerdown',function(e){var svg=e.target.closest&&e.target.closest('.asset-sheet-chart svg');if(svg){svg.setPointerCapture&&svg.setPointerCapture(e.pointerId);inspectAssetGraph(svg,e);}});
document.addEventListener('pointerleave',function(e){var svg=e.target.closest&&e.target.closest('.asset-sheet-chart svg');if(svg&&e.pointerType!=='touch')clearAssetGraph(svg);},true);
document.addEventListener('pointerup',function(e){var svg=e.target.closest&&e.target.closest('.asset-sheet-chart svg');if(svg&&e.pointerType==='touch')clearAssetGraph(svg);});
function refreshAssetPeriodChange(sheet){
  var svg=sheet&&sheet.querySelector('.asset-sheet-chart svg'),change=sheet&&sheet.querySelector('#assetChange'),data=sheet&&sheet.querySelector('#assetData');if(!svg||!change)return;
  var values;try{values=svg._assetValues||(svg._assetValues=JSON.parse(decodeURIComponent(svg.dataset.values||'')));}catch(e){return;}
  var nums=values.map(function(v){return Number(v.close);}).filter(Number.isFinite);if(nums.length<2)return;
  var pct=(nums[nums.length-1]-nums[0])/nums[0]*100,label=(sheet.querySelector('#assetRanges button.active')||{}).textContent||'período',text=(pct>=0?'+':'')+pct.toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
  if(change.dataset.periodValue!==text){change.dataset.periodValue=text;change.textContent=text;change.classList.toggle('negative',pct<0);}
}
var assetHistoryCache={};
function investmentPrefsKey(name){return 'ft_invest_'+name+'_'+(currentUser?currentUser.id:'guest');}
function portfolioValueHidden(){try{return localStorage.getItem(investmentPrefsKey('privacy'))==='1';}catch(e){return false;}}
function togglePortfolioValue(){try{localStorage.setItem(investmentPrefsKey('privacy'),portfolioValueHidden()?'0':'1');}catch(e){}refreshTab();}
function portfolioValueText(value){return portfolioValueHidden()?'••••••':value;}
function recentAssets(){try{var values=JSON.parse(localStorage.getItem(investmentPrefsKey('recent_assets'))||'[]');return Array.isArray(values)?values.slice(0,3):[];}catch(e){return [];}}
function rememberRecentAsset(name,type,symbol){try{var row={name:name,type:type||'Producto',symbol:symbol};var values=recentAssets().filter(function(x){return x&&x.symbol!==symbol;});values.unshift(row);localStorage.setItem(investmentPrefsKey('recent_assets'),JSON.stringify(values.slice(0,3)));}catch(e){}}

function investmentUnits(symbol){var u=investmentOperations.filter(function(o){return o.symbol===symbol;}).reduce(function(total,o){return total+(o.side==='buy'?1:-1)*Number(o.units);},0);return u>0.0000001?u:0;}
function getAssetPositionDisplay(sym,quotePrice){
  var pos=investmentPositionList().find(function(p){return p.symbol===sym;});
  if(!pos||pos.units<=0.0000001)return '0 €';
  var hasQuote=Number.isFinite(quotePrice)&&quotePrice>0;
  var val=hasQuote?(pos.units*quotePrice):pos.cost;
  if(portfolioValueHidden())return '••••••';
  if(hasQuote&&pos.cost){
    var posPct=(val-pos.cost)/pos.cost*100;
    var sign=posPct>=0?'+':'';
    return fmt(val)+' <small style="font-weight:700;color:'+(posPct<0?'var(--red)':'var(--brand-green)')+'">('+sign+posPct.toFixed(2)+'%)</small>';
  }
  return fmt(val);
}
function openInvestmentTradeModal(side){
  var asset=assetDetailState;if(!asset)return;
  var cashAccounts=accounts.filter(function(a){return !a.is_investment;});if(!cashAccounts.length){alert('Crea primero una cuenta desde Cuentas para poder operar.');return;}
  var lastTrigger=document.activeElement;
  var available=investmentUnits(asset.symbol),modal=document.createElement('div');modal.className='investment-trade-modal';
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','tradeModalTitle');
  modal.innerHTML='<div class="investment-trade-card"><div class="investment-trade-head"><div><div class="investment-trade-kicker">'+htmlEscape(asset.symbol)+' · '+htmlEscape(asset.type||'Producto')+'</div><h3 id="tradeModalTitle">'+ (side==='buy'?'Comprar ':'Vender ')+htmlEscape(asset.name)+'</h3></div><button class="investment-trade-close" type="button" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="investment-trade-mode"><button class="active" data-mode="money">Por importe</button><button data-mode="units">Por participaciones</button></div><label class="investment-trade-field"><span id="tradeAmountLabel">Importe a '+(side==='buy'?'invertir':'retirar')+'</span><input id="tradeAmount" inputmode="decimal" type="text" placeholder="0,00"></label><label class="investment-trade-field"><span>Precio por participación</span><input id="tradePrice" inputmode="decimal" type="text" placeholder="Consultando precio de mercado…"></label><label class="investment-trade-field"><span>Cuenta '+(side==='buy'?'de origen':'de destino')+'</span><select id="tradeAccount">'+cashAccounts.map(function(a){return '<option value="'+htmlEscape(a.id)+'">'+htmlEscape(a.name)+'</option>';}).join('')+'</select></label><label class="investment-trade-field"><span>Fecha de la operación</span><input id="tradeDate" type="date" value="'+todayStr()+'"></label><div class="investment-trade-summary" id="tradeSummary">Cargando cotización actual…</div><button class="investment-trade-submit '+(side==='sell'?'sell':'')+'" type="button">'+(side==='buy'?'Confirmar compra':'Confirmar venta')+'</button></div>';
  document.body.appendChild(modal);lockBodyScroll();var mode='money',amount=modal.querySelector('#tradeAmount'),price=modal.querySelector('#tradePrice'),summary=modal.querySelector('#tradeSummary');
  function trapFocus(container,e){
  if(e.key!=='Tab')return;
  var focusables=container.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if(!focusables.length)return;
  var first=focusables[0],last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function closeModal(){
    window.removeEventListener('keydown',onModalKeyDown);
    modal.remove();
    unlockBodyScroll();
    if(lastTrigger&&typeof lastTrigger.focus==='function')try{lastTrigger.focus();}catch(e){}
  }
  function onModalKeyDown(e){if(e.key==='Escape'){e.preventDefault();closeModal();}else if(e.key==='Tab'){trapFocus(modal,e);}}
  window.addEventListener('keydown',onModalKeyDown);
  function update(){var v=mode==='money'?parseCurrencyInput(amount.value):parseUnitsInput(amount.value,6),p=parsePriceInput(price.value,4),units=mode==='money'?roundToDecimals(v/p,6):v,total=mode==='money'?roundMoney(v):roundMoney(v*p);var dispStr=portfolioValueHidden()?'••••••':available.toLocaleString('es-ES',{maximumFractionDigits:6});if(v>0&&p>0&&units>0)summary.textContent=(mode==='money'?(portfolioValueHidden()?'••••••':units.toLocaleString('es-ES',{maximumFractionDigits:6}))+' participaciones':(portfolioValueHidden()?'••••••':fmt(total)))+(side==='sell'?' · disponibles: '+dispStr:'');else summary.textContent='Introduce el importe y el precio ejecutado.';}
  modal.querySelectorAll('[data-mode]').forEach(function(b){b.onclick=function(){mode=b.dataset.mode;modal.querySelectorAll('[data-mode]').forEach(function(x){x.classList.toggle('active',x===b);});modal.querySelector('#tradeAmountLabel').textContent=mode==='money'?'Importe a '+(side==='buy'?'invertir':'retirar'):'Participaciones';amount.placeholder=mode==='money'?'0,00':'0,000000';update();};});
  amount.oninput=update;
  price.oninput=function(){price.dataset.userEdited='1';update();};
  modal.querySelector('.investment-trade-close').onclick=function(){closeModal();};modal.onclick=function(e){if(e.target===modal)closeModal();};
  getCachedQuote(asset.symbol,180000).then(function(q){var p=Number(q&&(q.price||q.close||q.regularMarketPrice));if(Number.isFinite(p)&&p>0){if(!price.dataset.userEdited){price.value=p;update();}}else if(!amount.value){summary.textContent='Introduce el importe y el precio ejecutado.';}}).catch(function(){if(!amount.value)summary.textContent='Introduce el importe y el precio ejecutado.';});
  modal.querySelector('.investment-trade-submit').onclick=async function(){var v=mode==='money'?parseCurrencyInput(amount.value):parseUnitsInput(amount.value,6),p=parsePriceInput(price.value,4),units=mode==='money'?roundToDecimals(v/p,6):v,total=mode==='money'?roundMoney(v):roundMoney(v*p),date=modal.querySelector('#tradeDate').value,accountId=modal.querySelector('#tradeAccount').value;if(!date||!Number.isFinite(units)||units<=0||!Number.isFinite(p)||p<=0||!Number.isFinite(total)||total<=0){summary.textContent='Revisa importe, precio y fecha.';return;}if(side==='sell'&&units>available+0.0000001){summary.textContent='No puedes vender más participaciones de las que tienes ('+available.toLocaleString('es-ES',{maximumFractionDigits:6})+').';return;}this.disabled=true;this.textContent='Guardando…';var r=await sb.rpc('record_investment_operation',{p_side:side,p_symbol:asset.symbol,p_product_name:asset.name,p_product_type:asset.type||null,p_units:units,p_unit_price:p,p_amount:total,p_operation_date:date,p_cash_account_id:accountId});if(r.error){summary.textContent='No se pudo guardar: '+r.error.message;this.disabled=false;this.textContent=side==='buy'?'Confirmar compra':'Confirmar venta';return;}closeModal();closeAssetSheet();await loadData();showSuccessToast(side==='buy'?'Compra registrada':'Venta registrada');};
}
document.addEventListener('click',function(e){var button=e.target.closest&&e.target.closest('.asset-actions .buy,.asset-actions .sell');if(button){e.preventDefault();openInvestmentTradeModal(button.classList.contains('buy')?'buy':'sell');}});
function closeAssetSheet(sheet){
  assetDetailState=null;
  saveUiState();
  if(window._currentAssetKeyDownHandler){
    window.removeEventListener('keydown',window._currentAssetKeyDownHandler);
    window._currentAssetKeyDownHandler=null;
  }
  if(window._currentAssetOutsideClickHandler){
    document.removeEventListener('pointerdown',window._currentAssetOutsideClickHandler,true);
    window._currentAssetOutsideClickHandler=null;
  }
  if(sheet)sheet.remove();
  else{
    var existing=document.querySelector('.asset-sheet');
    if(existing)existing.remove();
  }
  unlockBodyScroll();
}
function initAssetSheetDragToDismiss(sheet){
  if(!sheet||IS_DESKTOP)return;
  var drag=null;
  sheet.addEventListener('touchstart',function(e){
    if(IS_DESKTOP||!e.touches||!e.touches[0])return;
    if(e.target.closest('.asset-sheet-chart'))return;
    var tag=e.target.tagName?e.target.tagName.toLowerCase():'';
    if(tag==='input'||tag==='select'||tag==='textarea')return;
    var isHandle=!!e.target.closest('.asset-sheet-handle,.asset-sheet-top');
    if(!isHandle&&sheet.scrollTop>2)return;
    var t=e.touches[0];
    drag={id:t.identifier,startY:t.clientY,startX:t.clientX,dy:0,active:false,isHandle:isHandle};
  },{passive:true});
  sheet.addEventListener('touchmove',function(e){
    if(!drag)return;
    var t=null;for(var i=0;i<e.touches.length;i++)if(e.touches[i].identifier===drag.id){t=e.touches[i];break;}
    if(!t)return;
    var dy=t.clientY-drag.startY,dx=t.clientX-drag.startX;
    if(!drag.active){
      if(dy<0||Math.abs(dx)>Math.abs(dy)){drag=null;return;}
      if(dy>(drag.isHandle?6:12)){drag.active=true;sheet.style.transition='none';}
    }
    if(drag.active){
      drag.dy=Math.max(0,dy);
      sheet.style.transform='translateY('+drag.dy+'px)';
      if(e.cancelable)e.preventDefault();
    }
  },{passive:false});
  function onEnd(){
    if(!drag)return;
    var active=drag.active,dy=drag.dy;
    drag=null;
    if(!active)return;
    sheet.style.transition='transform 0.24s cubic-bezier(0.22,1,0.36,1)';
    if(dy>90){
      sheet.style.transform='translateY(100%)';
      setTimeout(function(){closeAssetSheet(sheet);},180);
    }else{
      sheet.style.transform='';
    }
  }
  sheet.addEventListener('touchend',onEnd);
  sheet.addEventListener('touchcancel',onEnd);
}
async function openAssetSheet(name,type,symbol){
  rememberRecentAsset(name,type,symbol);
  assetDetailState={name:name,type:type,symbol:symbol,range:(assetDetailState&&assetDetailState.symbol===symbol&&assetDetailState.range)||'m'};
  saveUiState();
  var el=document.querySelector('.invest-wrap');
  if(!el)return;
  var existing=document.querySelector('.asset-sheet');
  if(existing)existing.remove();
  el.insertAdjacentHTML('beforeend','<div class="asset-sheet" role="dialog" aria-modal="true" aria-label="Detalle del producto"><div class="asset-sheet-handle"></div><div class="asset-sheet-top"><div class="asset-sheet-label">Detalle del producto</div><button class="asset-sheet-close" aria-label="Cerrar" data-action="close-asset-sheet"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="asset-identity"><div class="asset-logo">'+htmlEscape(symbol.slice(0,1))+'</div><div><h2>'+htmlEscape(name)+'</h2><div class="asset-type">'+htmlEscape(symbol)+' · '+htmlEscape(type)+'</div></div></div><div class="asset-price-row"><div class="asset-price" id="assetPrice">Cargando…</div><div class="asset-change" id="assetChange">—</div></div><div class="asset-sheet-chart" id="assetChart"><div class="search-status">Cargando gráfica…</div></div><div class="asset-range" id="assetRanges">'+[['d','1D'],['m','1M'],['m6','6M'],['ytd','YTD'],['y','1A'],['y5','5A']].map(function(x){return '<button data-range="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div><div class="asset-data" id="assetData"><div><small>Último cierre</small><strong>—</strong></div><div><small>Variación diaria</small><strong>—</strong></div><div><small>Volumen</small><strong>—</strong></div><div><small>Tu posición</small><strong>'+getAssetPositionDisplay(symbol)+'</strong></div></div><div class="asset-actions"><button class="sell">Vender</button><button class="buy">Comprar</button></div></div>');
  var sheet=document.querySelector('.asset-sheet')||el.lastElementChild;
  lockBodyScroll();
  decorateInvestmentLogos(sheet);
  initAssetSheetDragToDismiss(sheet);
  function onSheetKeyDown(e){
    if(e.key==='Escape'){
      e.preventDefault();
      closeAssetSheet(sheet);
    }
  }
  window._currentAssetKeyDownHandler=onSheetKeyDown;
  window.addEventListener('keydown',onSheetKeyDown);
  function onOutsideClick(e){
    if(sheet&&!sheet.contains(e.target)&&!e.target.closest('.investment-trade-modal')){
      closeAssetSheet(sheet);
    }
  }
  window._currentAssetOutsideClickHandler=onOutsideClick;
  setTimeout(function(){
    document.addEventListener('pointerdown',onOutsideClick,true);
  },50);
  async function loadRange(range){
    sheet.querySelectorAll('#assetRanges button').forEach(function(b){b.classList.toggle('active',b.dataset.range===range);});
    var chart=sheet.querySelector('#assetChart'),key=symbol+'_'+range,cached=assetHistoryCache[key];
    if(cached&&Date.now()-cached.time<300000){chart.innerHTML=cached.html;refreshAssetPeriodChange(sheet);return;}
    chart.innerHTML='<div class="search-status">Cargando gráfica…</div>';
    var cfg=assetRangeConfig(range),hist=await sb.functions.invoke('market-data',{body:{action:'history',symbol:symbol,interval:cfg.interval,outputsize:cfg.outputsize}}),data=hist.data&&hist.data.data,vals=(data&&data.values)||[];
    if(range==='ytd'){
      var ytdStart=new Date().getFullYear()+'-01-01';
      vals=vals.filter(function(v){var d=String(v.datetime||v.date||'').slice(0,10);return d>=ytdStart;});
    }
    var html=assetGraph(vals);
    assetHistoryCache[key]={time:Date.now(),html:html};
    if(document.contains(sheet)){chart.innerHTML=html;refreshAssetPeriodChange(sheet);}
  }
  sheet.querySelectorAll('#assetRanges button').forEach(function(b){
    b.onclick=function(){assetDetailState.range=b.dataset.range;saveUiState();loadRange(b.dataset.range);};
  });
  var quotePromise=getCachedQuote(symbol,300000);
  loadRange((assetDetailState&&assetDetailState.range)||'m');
  var q=await quotePromise;
  if(q&&document.contains(sheet)){
    var p=Number(q.price||q.close||q.regularMarketPrice),pc=Number(q.percent_change||0),price=(Number.isFinite(p)&&p>0)?p.toLocaleString('es-ES',{style:'currency',currency:q.currency||'USD'}):'—',change=(pc>=0?'+':'')+pc.toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
    var backupBadge=q.is_backup_nav?'<span class="invest-backup-badge" style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:2px 7px;border-radius:999px;background:rgba(255,149,0,0.12);color:#B25E09;font-size:10px;font-weight:700;">NAV de respaldo'+(q.nav_date?' · '+htmlEscape(q.nav_date):'')+'</span>':'';
    sheet.querySelector('#assetPrice').textContent=price;
    sheet.querySelector('#assetChange').textContent=change;
    sheet.querySelector('#assetChange').classList.toggle('negative',pc<0);
    sheet.querySelector('#assetData').innerHTML='<div><small>Último cierre'+backupBadge+'</small><strong>'+price+'</strong></div><div><small>Variación diaria</small><strong class="'+(pc<0?'negative':'positive')+'">'+change+'</strong></div><div><small>Volumen</small><strong>'+(q.volume?Number(q.volume).toLocaleString('es-ES'):'—')+'</strong></div><div><small>Tu posición</small><strong>'+getAssetPositionDisplay(symbol,p)+'</strong></div>';
    refreshAssetPeriodChange(sheet);
  }
}
function renderSearchResults(container,items){
  if(!items.length){container.innerHTML='<div class="search-status">No se han encontrado productos.</div>';return;}
  container.innerHTML=items.slice(0,8).map(function(item){var name=htmlEscape(item.instrument_name||item.symbol||'Producto'),symbol=htmlEscape(item.symbol||''),type=htmlEscape(item.instrument_type||item.type||'Producto de inversión');return '<button class="search-result" data-symbol="'+symbol+'" data-name="'+name+'" data-type="'+type+'"><i>'+symbol.slice(0,1)+'</i><span><strong>'+name+'</strong><small>'+symbol+' · '+type+'</small></span></button>';}).join('');
  decorateInvestmentLogos(container);
  container.querySelectorAll('.search-result').forEach(function(button){button.onclick=function(){container.innerHTML='';container.hidden=true;openAssetSheet(this.dataset.name,this.dataset.type,this.dataset.symbol);};});
}
function investmentPositionList(){
  var bySymbol={};
  var ops=investmentOperations.slice().sort(function(a,b){
    var d=String(a.operation_date).localeCompare(String(b.operation_date));
    if(d!==0)return d;
    var sideRank=(a.side==='buy'?0:1)-(b.side==='buy'?0:1);
    if(sideRank!==0)return sideRank;
    return String(a.created_at||a.id||'').localeCompare(String(b.created_at||b.id||''));
  });
  ops.forEach(function(o){
    var key=o.symbol;
    if(!bySymbol[key])bySymbol[key]={symbol:key,name:o.product_name||key,type:o.product_type||'Producto',units:0,cost:0};
    var p=bySymbol[key],u=Number(o.units),a=Number(o.amount);
    if(o.side==='buy'){
      p.units+=u;
      p.cost+=a;
    }else if(p.units>0){
      p.cost-=p.cost*(u/p.units);
      p.units-=u;
      if(p.units<=0.0000001){p.units=0;p.cost=0;}
    }
  });
  return Object.keys(bySymbol).map(function(k){return bySymbol[k];}).filter(function(p){return p.units>0.0000001;});
}
function normalizeAssetType(raw){
  if(!raw)return 'Otros';
  var t=String(raw).toLowerCase().trim();
  if(t.indexOf('etf')!==-1||t.indexOf('exchange traded fund')!==-1||t.indexOf('exchange-traded fund')!==-1)return 'ETFs';
  if(t.indexOf('fondo')!==-1||t.indexOf('fund')!==-1)return 'Fondos';
  if(t.indexOf('acci')!==-1||t.indexOf('stock')!==-1||t.indexOf('equity')!==-1||t.indexOf('share')!==-1)return 'Acciones';
  if(t.indexOf('cripto')!==-1||t.indexOf('crypto')!==-1||t.indexOf('btc')!==-1||t.indexOf('bitcoin')!==-1||t.indexOf('eth')!==-1||t.indexOf('digital currency')!==-1)return 'Cripto';
  if(t.indexOf('bono')!==-1||t.indexOf('bond')!==-1||t.indexOf('renta fija')!==-1)return 'Renta fija';
  return 'Otros';
}
var ASSET_TYPE_COLORS={
  'Acciones':'#007AFF',
  'Fondos':'#34C759',
  'ETFs':'#5856D6',
  'Cripto':'#FF9500',
  'Renta fija':'#30B0C7',
  'Otros':'#8E8E93'
};
function renderAssetAllocationHtml(positions,validQuotes){
  if(!positions||!positions.length)return '';
  var qMap={};
  if(validQuotes&&validQuotes.length){
    validQuotes.forEach(function(r){if(r&&r.p)qMap[r.p.symbol]=r.value;});
  }
  var groups={},total=0;
  positions.forEach(function(p){
    var type=normalizeAssetType(p.type);
    var val=qMap[p.symbol]!=null?qMap[p.symbol]:p.cost;
    if(val<0)val=0;
    groups[type]=(groups[type]||0)+val;
    total+=val;
  });
  if(total<=0)return '';
  var sorted=Object.keys(groups).sort(function(a,b){return groups[b]-groups[a];});
  var segs=sorted.map(function(type){
    var pct=(groups[type]/total)*100;
    var col=ASSET_TYPE_COLORS[type]||'#8E8E93';
    return '<div class="invest-alloc-seg" style="width:'+pct.toFixed(1)+'%;background:'+col+'" title="'+htmlEscape(type)+': '+pct.toFixed(1)+'%"></div>';
  }).join('');
  var legend=sorted.map(function(type){
    var pct=(groups[type]/total)*100;
    var col=ASSET_TYPE_COLORS[type]||'#8E8E93';
    var amt=portfolioValueHidden()?'••••••':fmt(groups[type]);
    return '<div class="invest-alloc-item"><span class="invest-alloc-dot" style="background:'+col+'"></span><span>'+htmlEscape(type)+'</span><strong>'+pct.toFixed(1)+'%</strong><small>('+amt+')</small></div>';
  }).join('');
  return '<div class="invest-allocation"><div class="invest-alloc-head"><span>Distribución de cartera</span><small>Por tipo de activo</small></div><div class="invest-alloc-bar">'+segs+'</div><div class="invest-alloc-legend">'+legend+'</div></div>';
}
function fetchQuotesStaggered(positions){
  if(positions.length<=8){
    return Promise.all(positions.map(function(p){
      return getCachedQuote(p.symbol,300000).then(function(q){
        var price=Number(q&&(q.price||q.close||q.regularMarketPrice));
        return (Number.isFinite(price)&&price>0)?{p:p,value:p.units*price,price:price}:null;
      }).catch(function(){return null;});
    }));
  }
  var results=new Array(positions.length),chunkSize=6,idx=0;
  function runChunk(){
    if(idx>=positions.length)return Promise.resolve(results);
    var start=idx,end=Math.min(positions.length,idx+chunkSize);idx=end;
    var slice=[];
    for(var i=start;i<end;i++)slice.push(i);
    return Promise.all(slice.map(function(posIdx){
      var p=positions[posIdx];
      return getCachedQuote(p.symbol,300000).then(function(q){
        var price=Number(q&&(q.price||q.close||q.regularMarketPrice));
        results[posIdx]=(Number.isFinite(price)&&price>0)?{p:p,value:p.units*price,price:price}:null;
      }).catch(function(){results[posIdx]=null;});
    })).then(function(){
      if(idx>=positions.length)return results;
      return new Promise(function(res){setTimeout(function(){res(runChunk());},120);});
    });
  }
  return runChunk();
}
function refreshInvestmentMarketValue(){
  var wrap=document.querySelector('.invest-wrap'),positions=investmentPositionList();if(!wrap)return;
  var totalEl=wrap.querySelector('.portfolio-card>strong'),stats=wrap.querySelectorAll('.invest-stats strong');
  if(!positions.length){if(totalEl)totalEl.textContent=portfolioValueText('—');return;}
  if(totalEl)totalEl.textContent=portfolioValueHidden()?'••••••':'Actualizando…';
  if(stats[2])stats[2].textContent=portfolioValueText(String(positions.length));
  var posEl=wrap.querySelector('.positions');
  fetchQuotesStaggered(positions).then(function(rows){
    if(!document.contains(wrap))return;
    var valid=rows.filter(Boolean);
    var value=positions.reduce(function(s,p,i){return s+(rows[i]?rows[i].value:p.cost);},0);
    var cost=positions.reduce(function(s,p){return s+p.cost;},0);
    var pct=cost?(value-cost)/cost*100:0;
    if(totalEl)totalEl.textContent=portfolioValueText(valid.length?fmt(value):fmt(cost));
    if(stats[0])stats[0].textContent=portfolioValueText(fmt(cost));
    if(stats[1])stats[1].textContent=portfolioValueHidden()?'••••••':(valid.length?(pct>=0?'+':'')+pct.toLocaleString('es-ES',{maximumFractionDigits:2})+' %':'—');
    if(posEl&&valid.length){
      var rowEls=posEl.querySelectorAll('.position');
      positions.forEach(function(p,i){
        var row=rowEls[i],r=rows[i];if(!row||!r)return;
        var valEl=row.querySelector('.position-value'),sparkEl=row.querySelector('.position-spark');
        if(valEl){
          var valStr=portfolioValueHidden()?'••••••':fmt(r.value);
          var posPct=p.cost?(r.value-p.cost)/p.cost*100:0;
          var posPctStr=(posPct>=0?'+':'')+posPct.toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
          var isNeg=posPct<0;
          valEl.innerHTML='<strong>'+valStr+'</strong><b style="color:'+(isNeg?'var(--red)':'var(--brand-green)')+';font-weight:700">'+posPctStr+'</b>';
          if(sparkEl){
            sparkEl.style.color=isNeg?'var(--red)':'var(--brand-green)';
            sparkEl.style.transform=isNeg?'rotate(16deg) scaleY(-1)':'rotate(-16deg)';
          }
        }
      });
    }
    var allocEl=wrap.querySelector('.invest-allocation');
    if(allocEl&&valid.length){
      var newHtml=renderAssetAllocationHtml(positions,valid);
      if(newHtml)allocEl.outerHTML=newHtml;
    }
  });
}
function renderInvestmentOperations(wrap){
  if(!wrap)return;var rows=investmentOperations.slice().sort(function(a,b){return String(b.operation_date).localeCompare(String(a.operation_date));}),html='<section class="invest-operations"><div class="invest-operations-head"><h3>Operaciones</h3><small>'+rows.length+' '+(rows.length===1?'movimiento':'movimientos')+'</small></div>';
  if(!rows.length)html+='<div class="invest-empty" style="padding:18px"><small>Tus compras y ventas aparecerán aquí.</small></div>';
  else html+=rows.map(function(o){var buy=o.side==='buy',date=new Date(o.operation_date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}),units=Number(o.units).toLocaleString('es-ES',{maximumFractionDigits:6}),account=accNameById(o.cash_account_id);var valStr=portfolioValueHidden()?'••••••':fmt(o.amount);var unitsStr=portfolioValueHidden()?'••••••':(units+' part.');return '<div class="invest-operation-row" data-operation-id="'+htmlEscape(o.id)+'"><div class="invest-operation-side '+(buy?'':'sell')+'" style="display:flex;align-items:center;justify-content:center;">'+(buy?'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>':'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>')+'</div><div class="invest-operation-main"><strong>'+htmlEscape(o.product_name||o.symbol)+'</strong><small>'+htmlEscape(o.symbol)+' · '+date+' · '+htmlEscape(account)+'</small></div><div class="invest-operation-value">'+valStr+'<small>'+unitsStr+'</small></div><button class="invest-operation-delete" title="Eliminar operación" data-operation-id="'+htmlEscape(o.id)+'"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';}).join('');
  html+='</section>';var portfolio=wrap.querySelector('.portfolio-card');if(portfolio)portfolio.insertAdjacentHTML('afterend',html);wrap.querySelectorAll('.invest-operation-delete').forEach(function(button){button.onclick=function(){deleteInvestmentOperation(this.dataset.operationId);};});wrap.querySelectorAll('.invest-operation-row').forEach(function(row){row.onclick=function(e){if(!e.target.closest('.invest-operation-delete'))openInvestmentOperationEdit(this.dataset.operationId);};});
}
function openInvestmentOperationEdit(id){if(portfolioValueHidden()){showUndoToast('Desactiva el modo privado para ver o editar operaciones de inversión');return;}var o=investmentOperations.find(function(x){return x.id===id;});if(!o)return;assetDetailState={name:o.product_name,type:o.product_type||'Producto',symbol:o.symbol};openInvestmentTradeModal(o.side);var m=document.querySelector('.investment-trade-modal');if(!m)return;var amount=m.querySelector('#tradeAmount'),price=m.querySelector('#tradePrice'),account=m.querySelector('#tradeAccount'),date=m.querySelector('#tradeDate'),submit=m.querySelector('.investment-trade-submit'),summary=m.querySelector('#tradeSummary');amount.value=o.amount;price.value=o.unit_price;price.dataset.userEdited='1';account.value=o.cash_account_id;date.value=o.operation_date;amount.dispatchEvent(new Event('input'));submit.textContent='Guardar cambios';submit.onclick=async function(){var isUnitsMode=m.querySelector('[data-mode="units"]')&&m.querySelector('[data-mode="units"]').classList.contains('active');var v=isUnitsMode?parseUnitsInput(amount.value,6):parseCurrencyInput(amount.value),p=parsePriceInput(price.value,4),units=isUnitsMode?v:roundToDecimals(v/p,6),total=isUnitsMode?roundMoney(v*p):roundMoney(v),d=date.value,acc=account.value;if(!d||!Number.isFinite(total)||total<=0||!Number.isFinite(p)||p<=0||!Number.isFinite(units)||units<=0){if(summary)summary.textContent='Revisa importe, precio y fecha.';else alert('Revisa los datos');return;}submit.disabled=true;submit.textContent='Guardando…';var r=await sb.rpc('update_fintrack_investment_operation',{p_operation_id:o.id,p_side:o.side,p_symbol:o.symbol,p_product_name:o.product_name,p_product_type:o.product_type||null,p_units:units,p_unit_price:p,p_amount:total,p_operation_date:d,p_cash_account_id:acc});if(r.error){if(summary)summary.textContent='No se pudo guardar: '+r.error.message;else alert('No se pudo guardar: '+r.error.message);submit.disabled=false;submit.textContent='Guardar cambios';return;}var closeBtn=m.querySelector('.investment-trade-close');if(closeBtn)closeBtn.click();else m.remove();assetDetailState=null;saveUiState();await loadData();showSuccessToast('Operación actualizada');};}
async function deleteInvestmentOperation(id){
  var op=investmentOperations.find(function(x){return x.id===id;});if(!op)return;if(!confirm('¿Eliminar esta '+(op.side==='buy'?'compra':'venta')+'? También se eliminará el traspaso asociado y se recalculará el saldo de la cuenta.'))return;
  var r=await sb.rpc('delete_investment_operation',{p_operation_id:id});if(r.error){alert('No se pudo eliminar la operación: '+r.error.message);return;}investmentOperations=investmentOperations.filter(function(x){return x.id!==id;});transactions=transactions.filter(function(t){return t.id!==op.transaction_id;});saveLocalCache();await loadData();showSuccessToast('Operación eliminada');
}
function renderInvestmentsTab(el){
  var rawPositions=investmentPositionList(),positions=rawPositions.map(function(p){var units=p.units.toLocaleString('es-ES',{maximumFractionDigits:6});return [p.name,p.symbol+' · '+(portfolioValueHidden()?'••••••':units)+' part.',portfolioValueText(fmt(p.cost)),'Coste',p.symbol.slice(0,1)];}),recent=recentAssets(),recentChips=recent.length?recent.map(function(p){return '<button class="invest-chip" data-symbol="'+htmlEscape(p.symbol)+'" data-name="'+htmlEscape(p.name)+'" data-type="'+htmlEscape(p.type||'Producto')+'">'+htmlEscape(p.name)+'<span>'+htmlEscape(p.symbol)+'</span></button>';}).join(''):'<div class="search-status">Los tres últimos productos que abras aparecerán aquí.</div>';
  var allocHtml=rawPositions.length?renderAssetAllocationHtml(rawPositions,null):'';
  setTimeout(refreshInvestmentMarketValue,0);
  el.innerHTML='<div class="invest-wrap"><section class="portfolio-card"><span style="display:inline-flex;align-items:center;">Valor de cartera <button type="button" class="invest-privacy-btn" data-action="toggle-portfolio-value" aria-label="Ocultar o mostrar valor de cartera" style="border:0;background:transparent;color:inherit;font-size:15px;cursor:pointer;min-width:44px;min-height:44px;margin:-12px 0 -12px 2px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;">'+getPrivacyEyeSvg(portfolioValueHidden(),15)+'</button></span><strong>'+portfolioValueText('—')+'</strong></section><div class="invest-stats"><div><small>Invertido</small><strong>—</strong></div><div><small>Rentabilidad</small><strong>—</strong></div><div><small>Posiciones</small><strong>0</strong></div></div>'+allocHtml+'<div class="invest-explore"><div class="invest-explore-label">Explorar mercados</div><input class="invest-search" placeholder="Buscar acción, ETF o fondo" autocomplete="off"><div class="search-results" hidden></div><div class="invest-explore-label" style="margin-top:14px">Últimos visitados</div><div class="invest-chips">'+recentChips+'</div></div><div class="invest-section-head"><h3>Tu cartera</h3><small>'+portfolioValueText(String(rawPositions.length))+' posiciones</small></div><section class="positions">'+positions.map(function(p){return '<div class="position"><i>'+htmlEscape(p[4])+'</i><div class="position-main"><strong>'+htmlEscape(p[0])+'</strong><small>'+htmlEscape(p[1])+'</small></div><div class="position-value"><strong>'+p[2]+'</strong><b>'+htmlEscape(p[3])+'</b></div></div>';}).join('')+'</section></div>';
  var wrap=el.querySelector('.invest-wrap'),positionsEl=el.querySelector('.positions');renderInvestmentOperations(wrap);var operationsEl=wrap&&wrap.querySelector('.invest-operations'),portfolioHead=wrap&&wrap.querySelector('.invest-section-head'),statsEl=wrap&&wrap.querySelector('.invest-stats'),explore=wrap&&wrap.querySelector('.invest-explore'),allocEl=wrap&&wrap.querySelector('.invest-allocation');if(operationsEl&&portfolioHead&&statsEl&&positionsEl&&explore){if(allocEl){statsEl.insertAdjacentElement('afterend',allocEl);allocEl.insertAdjacentElement('afterend',portfolioHead);}else{statsEl.insertAdjacentElement('afterend',portfolioHead);}portfolioHead.insertAdjacentElement('afterend',positionsEl);explore.insertAdjacentElement('afterend',operationsEl);}if(!positions.length&&positionsEl)positionsEl.innerHTML='<div class="invest-empty"><i style="display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></i><strong>Aún no tienes inversiones</strong><small>Busca un producto para consultar sus datos y realizar tu primera compra.</small></div>';else if(positionsEl)positionsEl.querySelectorAll('.position').forEach(function(row,i){row.onclick=function(){var p=rawPositions[i];if(p)openAssetSheet(p.name,p.type,p.symbol);};});
  if(wrap){var search=wrap.querySelector('.invest-search'),results=wrap.querySelector('.search-results'),timer,requestId=0;search.oninput=function(){clearTimeout(timer);var q=this.value.trim(),id=++requestId;if(q.length<2){results.hidden=true;results.innerHTML='';return;}results.hidden=false;results.innerHTML='<div class="search-status">Buscando productos…</div>';timer=setTimeout(async function(){var r=await sb.functions.invoke('market-data',{body:{action:'search',query:q}});if(id!==requestId)return;var items=r.data&&r.data.data&&r.data.data.data||[];if(r.error){results.innerHTML='<div class="search-status">No se pudo realizar la búsqueda.</div>';return;}renderSearchResults(results,items);},280);};wrap.querySelectorAll('.invest-chip').forEach(function(chip){chip.onclick=function(){openAssetSheet(this.dataset.name,this.dataset.type,this.dataset.symbol);};});}
  if(wrap)decorateInvestmentLogos(wrap);
  if(assetDetailState)openAssetSheet(assetDetailState.name,assetDetailState.type,assetDetailState.symbol);
}

