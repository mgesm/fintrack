'use strict';
// Color helpers for the tinted-glass donut
function donutRgb(hex){hex=(hex||'#8E8E93').replace('#','');if(hex.length===3)hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);return [isNaN(r)?140:r,isNaN(g)?140:g,isNaN(b)?150:b];}
function donutRgba(hex,a){var c=donutRgb(hex);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
function donutShadeA(hex,p,a){var c=donutRgb(hex),r=Math.round(c[0]*(1-p)),g=Math.round(c[1]*(1-p)),b=Math.round(c[2]*(1-p));return 'rgba('+r+','+g+','+b+','+a+')';}
function donutSector(ctx,cx,cy,ro,ri,a0,a1){ctx.beginPath();ctx.arc(cx,cy,ro,a0,a1,false);ctx.arc(cx,cy,ri,a1,a0,true);ctx.closePath();}
function donutEdgeGlow(ctx,cx,cy,g){
  // brillo DESIGUAL alrededor del anillo (luz que se concentra y se apaga, como el ::before de las tarjetas)
  if(!ctx.createConicGradient)return 'rgba(255,255,255,'+(g*0.5)+')';
  var cg=ctx.createConicGradient(-Math.PI*0.75,cx,cy);
  cg.addColorStop(0.00,'rgba(255,255,255,0)');
  cg.addColorStop(0.05,'rgba(255,255,255,'+g+')');
  cg.addColorStop(0.15,'rgba(255,255,255,0)');
  cg.addColorStop(0.34,'rgba(255,255,255,'+(g*0.25)+')');
  cg.addColorStop(0.52,'rgba(255,255,255,'+g+')');
  cg.addColorStop(0.66,'rgba(255,255,255,0)');
  cg.addColorStop(0.85,'rgba(255,255,255,'+(g*0.4)+')');
  cg.addColorStop(1.00,'rgba(255,255,255,0)');
  return cg;
}
// Native canvas doughnut — tinted liquid glass crystals, no external chart library
function drawDonut(canvas,entries,total,size,opts){
  size=size||190;opts=opts||{};
  var dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.style.width=size+'px';canvas.style.height=size+'px';
  canvas.width=Math.round(size*dpr);canvas.height=Math.round(size*dpr);
  var ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  var cx=size/2,cy=size/2,ring=Math.max(20,size*0.135),radius=cx-ring/2-2;
  var ro=radius+ring/2,ri=radius-ring/2;
  ctx.clearRect(0,0,size,size);
  // pista base muy tenue
  donutSector(ctx,cx,cy,ro,ri,0,Math.PI*2);ctx.fillStyle='rgba(140,140,150,0.06)';ctx.fill();
  if(!total||!entries.length)return;
  var glow=donutEdgeGlow(ctx,cx,cy,0.65);
  var start=-Math.PI/2,gap=entries.length>1?0.05:0;
  var bW=Math.max(1.4,size*0.0075); // grosor de borde proporcional
  entries.forEach(function(e){
    var seg=(e.value/total)*Math.PI*2,a0=start+gap/2,a1=start+seg-gap/2;if(a1<a0)a1=a0;
    var dim=(opts.activeId&&opts.activeId!==e.id),act=(opts.activeId===e.id);
    var fill=act?0.30:(dim?0.10:0.18);
    // relleno cristal tintado
    donutSector(ctx,cx,cy,ro,ri,a0,a1);ctx.fillStyle=donutRgba(e.color,fill);ctx.fill();
    // refracción: degradado blanco vertical muy sutil
    donutSector(ctx,cx,cy,ro,ri,a0,a1);
    var lg=ctx.createLinearGradient(0,cy-ro,0,cy+ro);
    lg.addColorStop(0,'rgba(255,255,255,0.14)');lg.addColorStop(0.5,'rgba(255,255,255,0)');lg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=lg;ctx.fill();
    // borde oscuro siguiendo el contorno del cristal
    donutSector(ctx,cx,cy,ro,ri,a0,a1);
    ctx.strokeStyle=donutShadeA(e.color,0.28,act?0.9:0.7);ctx.lineWidth=bW;ctx.lineJoin='round';ctx.stroke();
    // brillo DESIGUAL en cantos exterior e interior (liquid glass)
    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,ro-bW/2,a0+0.02,a1-0.02);
    ctx.strokeStyle=glow;ctx.lineWidth=bW+0.6;ctx.lineCap='round';ctx.stroke();
    ctx.globalAlpha=0.5;
    ctx.beginPath();ctx.arc(cx,cy,ri+bW/2,a0+0.02,a1-0.02);
    ctx.strokeStyle=glow;ctx.lineWidth=bW;ctx.lineCap='round';ctx.stroke();
    ctx.restore();
    start+=seg;
  });
}
function donutHit(canvas,ev,entries,total,size){
  if(!total)return null;
  var rect=canvas.getBoundingClientRect();
  var x=ev.clientX-rect.left,y=ev.clientY-rect.top,cx=rect.width/2,cy=rect.height/2;
  var dx=x-cx,dy=y-cy,dist=Math.sqrt(dx*dx+dy*dy);
  var ring=Math.max(20,size*0.135),radius=cx-ring/2-2;
  if(dist<radius-ring/2-8||dist>radius+ring/2+8)return null;
  var a=Math.atan2(dy,dx)+Math.PI/2;if(a<0)a+=Math.PI*2;
  var acc=0;
  for(var i=0;i<entries.length;i++){var seg=(entries[i].value/total)*Math.PI*2;if(a>=acc&&a<acc+seg)return entries[i].id;acc+=seg;}
  return null;
}
var _lastDonutExps=null,_lastDonutEntries=null;
function donutEntries(items){
  if(items===_lastDonutExps)return _lastDonutEntries;
  var bycat={};
  (items||[]).forEach(function(t){
    if(!t||t.is_balance_adjustment)return;
    if(t.type==='expense'){
      var imp=txExpenseImpact(t);
      if(imp>0)bycat[t.category]=(bycat[t.category]||0)+imp;
    }
  });
  var entries=Object.keys(bycat).filter(function(id){return bycat[id]>0;}).sort(function(a,b){return bycat[b]-bycat[a];})
    .map(function(id){
      return {id:id,color:catById(id).color,value:bycat[id]};
    });
  _lastDonutExps=items;_lastDonutEntries=entries;
  return entries;
}
function initDonutController(cfg){
  var canvas=cfg.canvas;if(!canvas)return;
  var entries=cfg.entries||[],chartTotal=cfg.chartTotal||0,size=cfg.size||190;
  function catLabel(id){
    if(cfg.allowBalanceAdjName&&id==='__balance_adjustment')return 'Actualización de saldo';
    return catById(id).name;
  }
  function refresh(){
    var actId=cfg.getActiveId();
    drawDonut(canvas,entries,chartTotal,size,{activeId:actId});
    if(actId){
      var a=entries.filter(function(e){return e.id===actId;})[0];
      if(a){
        cfg.setCenter((chartTotal?Math.round(a.value/chartTotal*100):0)+'%',fmtPrivacy(a.value),capitalize(catLabel(actId)));
        return;
      }
    }
    cfg.setCenter(cfg.emptyLabel,cfg.emptyAmtText,'');
  }
  refresh();
  if(cfg.hoverEnabled){
    canvas.onmousemove=function(ev){
      if(cfg.getActiveId())return;
      var id=donutHit(canvas,ev,entries,chartTotal,size);
      if(id){
        var a=entries.filter(function(e){return e.id===id;})[0];
        cfg.setCenter(Math.round(a.value/chartTotal*100)+'%',fmtPrivacy(a.value),capitalize(catLabel(id)));
      } else cfg.setCenter(cfg.emptyLabel,cfg.emptyAmtText,'');
      canvas.style.cursor=id?'pointer':'default';
    };
    canvas.onmouseleave=function(){if(!cfg.getActiveId())cfg.setCenter(cfg.emptyLabel,cfg.emptyAmtText,'');};
  }
  canvas.onclick=function(ev){
    if(cfg.skipIfDragged&&_chartWasDragged)return;
    var id=donutHit(canvas,ev,entries,chartTotal,size);
    if(cfg.toggleAlways){
      ev.stopPropagation();
      cfg.setActiveId((id&&cfg.getActiveId()===id)?null:(id||null));
      refresh();
    } else if(id){
      ev.stopPropagation();
      cfg.setActiveId((cfg.getActiveId()===id)?null:id);
      refresh();
    }
  };
}
function renderDonut(exps,total){
  var canvas=document.getElementById('donutCanvas');if(!canvas)return;
  var sig=(isPrivacyMode()?'1':'0')+'|'+total.toFixed(2)+'|'+(exps||[]).filter(function(t){return t&&t.type==='expense'&&!t.is_balance_adjustment;}).map(function(t){return (t.category||'')+':'+(Number(t.amount)||0).toFixed(2);}).join(',');
  if(sig===_donutSig&&canvas.dataset.drawn)return;
  _donutSig=sig;canvas.dataset.drawn='1';
  var entries=donutEntries(exps);
  var chartTotal=entries.reduce(function(s,e){return s+e.value;},0);
  initDonutController({
    canvas:canvas,entries:entries,chartTotal:chartTotal,size:190,
    emptyLabel:'gastos',
    emptyAmtText:total?fmtPrivacy(total):(isPrivacyMode()?'••••••':'0 €'),
    skipIfDragged:true,hoverEnabled:false,toggleAlways:false,
    getActiveId:function(){return activeCatId;},
    setActiveId:function(v){activeCatId=v;},
    setCenter:setCenter
  });
}
var _fitCenterCanvas=null,_fitGen=0;
try{if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){_fitGen++;var da=document.getElementById('dcAmt');if(da)fitCenterText(da,132,21);});}catch(e){}
function fitCenterText(el,maxWidth,baseSize){
  if(!el)return;
  var text=el.textContent;
  if(el._fitText===text&&el._fitWidth===maxWidth&&el._fitGen===_fitGen)return;
  el._fitText=text;el._fitWidth=maxWidth;el._fitGen=_fitGen;
  if(!_fitCenterCanvas)_fitCenterCanvas=document.createElement('canvas');
  var ctx=_fitCenterCanvas.getContext('2d');
  var cs=getComputedStyle(el);var fam=cs.fontFamily;var wght=cs.fontWeight||'700';
  var size=baseSize;
  while(size>8){
    ctx.font=wght+' '+size+'px '+fam;
    if(ctx.measureText(text).width<=maxWidth)break;
    size-=1;
  }
  el.style.fontSize=size+'px';el.style.maxWidth=Math.max(96,maxWidth)+'px';el.style.whiteSpace='nowrap';
}
function setCenter(p,a,c){document.getElementById('dcPct').textContent=p;var da=document.getElementById('dcAmt');da.textContent=a;fitCenterText(da,132,21);document.getElementById('dcCat').textContent=c;requestAnimationFrame(function(){fitCenterText(da,132,21);});}
function setFlipHeight(innerId){
  innerId=innerId||'homeFlipInner';
  var inner=document.getElementById(innerId);if(!inner)return;
  var flipped=inner.classList.contains('flipped');
  if(!flipped&&(innerId==='homeFlipInner'||innerId==='dtFlipInner')){
    inner.style.height='';
    return;
  }
  var face=inner.querySelector(flipped?'.flip-back':'.flip-front');
  if(face&&face.offsetHeight>0){
    inner.style.height=face.offsetHeight+'px';
  }
}
function toggleFlip(innerId){
  var inner=document.getElementById(innerId);if(!inner)return;
  var willBeFlipped=!inner.classList.contains('flipped');
  var curFace=inner.querySelector(willBeFlipped?'.flip-front':'.flip-back');
  var nextFace=inner.querySelector(willBeFlipped?'.flip-back':'.flip-front');
  if(curFace&&nextFace){
    var startH=curFace.offsetHeight;
    var targetH=nextFace.offsetHeight;
    if(startH>0&&targetH>0&&Math.abs(startH-targetH)>2){
      inner.style.height=startH+'px';
      requestAnimationFrame(function(){
        inner.style.height=targetH+'px';
      });
    } else if(targetH>0){
      inner.style.height=targetH+'px';
    }
  }
  inner.classList.toggle('flipped');
  if(!willBeFlipped&&(innerId==='homeFlipInner'||innerId==='dtFlipInner')){
    setTimeout(function(){
      if(!inner.classList.contains('flipped'))inner.style.height='';
    },380);
  }
}
function toggleSubcats(e,id,innerId){
  if(e&&e.stopPropagation)e.stopPropagation();
  var el=document.getElementById('subcatList_'+id);
  var btn=document.getElementById('subcatToggle_'+id);
  if(!el)return;
  var isHidden=(el.style.display==='none'||!el.style.display);
  el.style.display=isHidden?'flex':'none';
  if(btn){
    var chev=btn.querySelector('.subcat-chevron-icon');
    if(chev)chev.style.transform=isHidden?'rotate(180deg)':'rotate(0deg)';
    btn.classList.toggle('expanded',isHidden);
  }
  if(innerId)setFlipHeight(innerId);
}
var _chartDragStart=null,_chartWasDragged=false;
document.addEventListener('touchstart',function(e){
  var card=e.target.closest&&e.target.closest('.flip-card');
  if(card&&e.touches&&e.touches.length===1){
    _chartDragStart={x:e.touches[0].clientX,y:e.touches[0].clientY};
    _chartWasDragged=false;
  }
},{passive:true});
document.addEventListener('touchmove',function(e){
  if(_chartDragStart&&e.touches&&e.touches.length===1){
    var dx=e.touches[0].clientX-_chartDragStart.x;
    var dy=e.touches[0].clientY-_chartDragStart.y;
    if(Math.hypot(dx,dy)>7){
      _chartWasDragged=true;
    }
  }
},{passive:true});
document.addEventListener('touchend',function(){
  setTimeout(function(){_chartDragStart=null;_chartWasDragged=false;},180);
},{passive:true});

function onFrontClick(ev){
  if(_chartWasDragged)return;
  var hit=ev.target.closest('button, a, input, select, textarea, [data-action]');
  if(hit&&hit!==ev.currentTarget&&hit!==ev.target.closest('.flip-face'))return;
  toggleFlip('homeFlipInner');
}
function onBackClick(ev){
  if(_chartWasDragged)return;
  var hit=ev.target.closest('.hm-cell, .heatmap-detail, .heatmap-head, button, a, input, select, textarea, [data-action]');
  if(hit&&hit!==ev.target.closest('.flip-face'))return;
  toggleFlip('homeFlipInner');
}
function dtOnFrontClick(ev){
  var hit=ev.target.closest('button, a, input, select, textarea, [data-action]');
  if(hit&&hit!==ev.target.closest('.flip-face'))return;
  toggleFlip('dtFlipInner');
}
function dtOnBackClick(ev){
  var hit=ev.target.closest('.hm-cell, .heatmap-detail, .heatmap-head, button, a, input, select, textarea, [data-action]');
  if(hit&&hit!==ev.target.closest('.flip-face'))return;
  toggleFlip('dtFlipInner');
}

var catEditMode=false;
function toggleCatEditMode(){
  catEditMode=!catEditMode;
  refreshTab();
}

function onCatFrontClick(ev,innerId,catId){
  if(_chartWasDragged)return;
  if(catEditMode)return;
  var hit=ev.target.closest('button, a, input, textarea, select, [data-action], .budget-icon-btn, .subcat-toggle-pill, .cat-drag-handle, .cat-name-editable, .subcat-del-btn');
  if(hit&&hit!==ev.target.closest('.flip-face'))return;
  var prefix=IS_DESKTOP?'dt':'';
  var canvas=document.getElementById('catChart_'+prefix+catId);
  toggleFlip(innerId);
  if(canvas&&!canvas._drawnCatSig){
    requestAnimationFrame(function(){
      drawCategoryHistoryChart(canvas,catId);
    });
  }
}

function onCatBackClick(ev,innerId){
  if(_chartWasDragged)return;
  var hit=ev.target.closest('canvas, #chartTip, button, a, input, select, [data-action]');
  if(hit&&hit!==ev.target.closest('.flip-face'))return;
  toggleFlip(innerId);
}

function drawCategoryHistoryChart(canvas,catId){
  if(!canvas)return;
  var c=categories.find(function(item){return item.id===catId;});
  if(!c)return;
  var isInc=isIncomeCat(c.id);
  var monthly={};
  ensureTxIndices();
  var yearTxs=_txByYearStr[String(viewYear)]||[];
  yearTxs.forEach(function(t){
    if(t.category!==catId)return;
    if(isTxExcludedFromCalc(t))return;
    var m=parseInt(String(t.date).slice(5,7),10)-1;
    if(m>=0&&m<12){
      var a=isInc?txIncomeImpact(t):txExpenseImpact(t);
      if(a>0)monthly[m]=(monthly[m]||0)+a;
    }
  });
  var data=[];
  for(var m=0;m<12;m++)data.push(monthly[m]||0);
  drawLineChart(canvas,[{label:capitalize(c.name),color:c.color,bold:true,data:data}],null);
  canvas._drawnCatSig=true;
}
var HM_MOBILE={grid:'heatmapGrid',detail:'heatmapDetail',title:'hmTitle',tot:'hmTot',inner:'homeFlipInner'};
var HM_DESKTOP={grid:'dtHeatmapGrid',detail:'dtHeatmapDetail',title:'dtHmTitle',tot:'dtHmTot',inner:'dtFlipInner'};
var hmSelDay=null;
var _lastHmExps=null,_lastHmByDay=null;
function renderHeatmap(exps,cfg){
  cfg=cfg||HM_MOBILE;
  var grid=document.getElementById(cfg.grid);if(!grid)return;
  var dow=grid.parentNode?grid.parentNode.querySelector('.heatmap-dow'):null;
  if(homeAnnualMode){
    if(dow)dow.style.display='none';
    var tEl2=document.getElementById(cfg.title);if(tEl2)tEl2.textContent='Resumen Anual '+viewYear;
    var toEl2=document.getElementById(cfg.tot);if(toEl2)toEl2.textContent='';
    grid.innerHTML='';
    var b2=document.getElementById(cfg.detail);
    if(b2){
      var yTxs=getYearTx().filter(function(t){return !t.is_balance_adjustment;});
      var yExp=yTxs.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+txExpenseImpact(t);},0);
      var yBalExp=yTxs.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+txBalanceExpenseImpact(t);},0);
      var yInc=yTxs.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+txIncomeImpact(t);},0);
      var ySav=yInc-yBalExp,savRate=yInc>0?Math.round((ySav/yInc)*100):0,privHm=isPrivacyMode();
      b2.innerHTML='<div class="annual-flip-kpi" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:6px 0;">'
        +'<div class="annual-kpi-card"><small>Gastos</small><strong style="color:var(--red);">'+(privHm?'••••••':('−'+fmt(yExp)))+'</strong></div>'
        +'<div class="annual-kpi-card"><small>Ingresos</small><strong style="color:var(--green);">'+(privHm?'••••••':('+'+fmt(yInc)))+'</strong></div>'
        +'<div class="annual-kpi-card"><small>Ahorro</small><strong style="color:'+(ySav>=0?'var(--green)':'var(--red)')+';">'+(privHm?'••••••':((ySav>=0?'+':'')+fmt(ySav)))+'</strong></div>'
        +'<div class="annual-kpi-card"><small>Tasa ahorro</small><strong style="color:var(--brand-green);">'+savRate+' %</strong></div>'
        +'</div>';
    }
    setFlipHeight(cfg.inner);
    return;
  }
  if(dow)dow.style.display='';
  // group expenses of the viewed month by day-of-month (cached by array reference)
  var byDay;
  if(exps===_lastHmExps){byDay=_lastHmByDay;}
  else{byDay={};exps.forEach(function(t){var dt=new Date(t.date+'T12:00:00');if(dt.getFullYear()===viewYear&&dt.getMonth()===viewMonth){var d=dt.getDate();byDay[d]=(byDay[d]||0)+txExpenseImpact(t);}});_lastHmExps=exps;_lastHmByDay=byDay;}
  var daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  var firstDow=(new Date(viewYear,viewMonth,1).getDay()+6)%7; // Mon=0
  var max=0;for(var k in byDay)if(byDay[k]>max)max=byDay[k];
  var tot=exps.reduce(function(s,t){return s+txExpenseImpact(t);},0);
  var privHm2=isPrivacyMode();
  var tEl=document.getElementById(cfg.title);if(tEl)tEl.textContent='Gasto diario';
  var toEl=document.getElementById(cfg.tot);if(toEl)toEl.textContent=tot?(privHm2?'total ••••••':'total '+fmtShort(tot)):'';
  var html='';
  for(var i=0;i<firstDow;i++)html+='<div class="hm-cell empty"></div>';
  for(var d=1;d<=daysInMonth;d++){
    var v=byDay[d]||0;var sel=(hmSelDay===d)?' sel':'';
    if(!v){html+='<div class="hm-cell zero'+sel+'" data-hd="'+d+'"><span class="hmd" style="color:var(--text3)">'+d+'</span></div>';}
    else{var t=v/max;var a=(0.20+t*0.72).toFixed(2);var dark=t>0.55;
      html+='<div class="hm-cell'+sel+'" data-hd="'+d+'" style="background:'+accentRgba(a)+';color:'+(dark?'var(--bg)':'var(--text)')+'"><span class="hmd">'+d+'</span><span class="hma">'+(privHm2?'••':Math.round(v))+'</span></div>';}
  }
  grid.innerHTML=html;
  grid.querySelectorAll('.hm-cell[data-hd]').forEach(function(el){
    el.onclick=function(){var d=parseInt(el.getAttribute('data-hd'),10);hmSelDay=(hmSelDay===d)?null:d;renderHeatmapDetail(exps,cfg);grid.querySelectorAll('.hm-cell').forEach(function(c){c.classList.remove('sel');});if(hmSelDay)el.classList.add('sel');};
  });
  renderHeatmapDetail(exps,cfg);
  setFlipHeight(cfg.inner);
}
function renderHeatmapDetail(exps,cfg){
  cfg=cfg||HM_MOBILE;
  var box=document.getElementById(cfg.detail);if(!box)return;
  if(!hmSelDay){box.innerHTML='<div class="hm-det-empty">Toca un día para ver sus gastos</div>';setFlipHeight(cfg.inner);return;}
  var items=exps.filter(function(t){var d=new Date(t.date+'T12:00:00');return d.getFullYear()===viewYear&&d.getMonth()===viewMonth&&d.getDate()===hmSelDay;}).sort(function(a,b){return b.amount-a.amount;});
  var tot=items.reduce(function(s,t){return s+txExpenseImpact(t);},0);
  var dayName=new Date(viewYear,viewMonth,hmSelDay).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'short'});
  var h='<div class="hm-det-top"><span class="hm-det-day">'+dayName+'</span><span class="hm-det-tot">'+(isPrivacyMode()?'••••••':('−'+fmt(tot)))+'</span></div>';
  if(!items.length)h+='<div class="hm-det-empty">Sin gastos este día</div>';
  else h+=items.map(function(t){
    var cat=txDisplayCategory(t);
    return '<div class="hm-det-row hm-det-row-btn" data-action="hm-edit-tx" data-id="'+t.id+'">'
      +'<span class="d" style="background:'+cat.color+'"></span>'
      +'<span class="n">'+capitalize(htmlEscape(cat.name))+'</span>'
      +'<span class="nt">'+htmlEscape(t.note||t.subcategory||'')+'</span>'
      +'<span class="hm-edit-icon" style="display:inline-flex;align-items:center;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>'
      +'</div>';
  }).join('');
  box.innerHTML=h;
  setFlipHeight(cfg.inner);
}
function hmEditTx(id){
  // Flip card back to front first, then open edit modal
  var flipId=IS_DESKTOP?'dtFlipInner':'homeFlipInner';
  var inner=document.getElementById(flipId);
  if(inner&&inner.classList.contains('flipped'))inner.classList.remove('flipped');
  setTimeout(function(){editTx(id);},IS_DESKTOP?0:380);
}
function accentRgb(){var v=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();var h=v.replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];if(/^[0-9a-fA-F]{6}$/.test(h))return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];return [61,186,138];}
function accentRgba(a){var c=accentRgb();return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
function renderLegend(exps){
  var entries=donutEntries(exps);
  document.getElementById('legend').innerHTML=entries.map(function(e){
    var name=catById(e.id).name;
    return '<div class="leg-item"><span class="leg-dot" style="background:'+e.color+'"></span>'+capEsc(name)+'</div>';
  }).join('');
}
document.getElementById('prevMonth').onclick=function(){if(homeAnnualMode){viewYear--;}else if(viewMonth===0){viewMonth=11;viewYear--;}else viewMonth--;activeCatId=null;hmSelDay=null;filterDateFrom='';filterDateTo='';saveUiState();refreshTab();};
document.getElementById('nextMonth').onclick=function(){if(homeAnnualMode){viewYear++;}else if(viewMonth===11){viewMonth=0;viewYear++;}else viewMonth++;activeCatId=null;hmSelDay=null;filterDateFrom='';filterDateTo='';saveUiState();refreshTab();};

// ── NATIVE MINI-CHARTS (no external library) ───────────────────
function chartCssVar(name,fallback){var v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v||fallback;}
function chartSetup(canvas,cssH){
  if(!canvas)return null;
  canvas.setAttribute('role','img');
  if(!canvas.getAttribute('aria-label'))canvas.setAttribute('aria-label','Gráfico financiero mensual. Consulta el resumen mensual situado junto al gráfico.');
  var dpr=Math.min(window.devicePixelRatio||1,3);
  canvas.style.width='100%';canvas.style.height=cssH+'px';
  var card=canvas.closest?canvas.closest('.cat-flip-card, .flip-card, .chart-card'):null;
  var cssW=canvas.clientWidth||(card&&card.clientWidth?(card.clientWidth-36):0)||(canvas.parentNode&&canvas.parentNode.clientWidth)||320;
  canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);
  var ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx:ctx,w:cssW,h:cssH};
}
function niceNum(x,round){
  if(x<=0)return 1;
  var exp=Math.floor(Math.log10(x)),f=x/Math.pow(10,exp),nf;
  if(round){nf=f<1.5?1:f<3?2:f<7?5:10;}else{nf=f<=1?1:f<=2?2:f<=5?5:10;}
  return nf*Math.pow(10,exp);
}
function axisTicks(min,max,count){
  if(min===max){max=min+1;}
  var range=niceNum(max-min,false),step=niceNum(range/(count-1),true);
  var nmin=Math.floor(min/step)*step,nmax=Math.ceil(max/step)*step,ticks=[];
  for(var v=nmin;v<=nmax+step*0.5;v+=step)ticks.push(roundMoney(v));
  return {min:nmin,max:nmax,ticks:ticks};
}
function fmtAxis(v){var a=Math.abs(v);return a>=1000?(v/1000).toFixed(a%1000?1:0).replace('.0','')+'k':String(Math.round(v));}
function drawBarRect(ctx,x,y,w,h,color){
  if(h<0.6)h=0.6;var r=Math.min(3,w/2,h/2);
  ctx.fillStyle=color;ctx.beginPath();
  ctx.moveTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);ctx.closePath();ctx.fill();
}
function drawBarChart(canvas,inc,exp,sav){
  var priv=isPrivacyMode();
  var sig=(priv?'1':'0')+'|'+(inc||[]).join(',')+';'+(exp||[]).join(',')+';'+(sav||[]).join(',');
  // Al volver a Anual se crea un canvas nuevo con el mismo id: debe dibujarse
  // aunque sus datos coincidan con los del canvas que ya fue eliminado.
  if(canvas._barSig===sig)return;
  canvas._barSig=sig;
  var s=chartSetup(canvas,200);if(!s)return;
  var ctx=s.ctx,W=s.w,H=s.h,padL=40,padR=10,padT=12,padB=22;
  var plotH=H-padT-padB,plotW=W-padL-padR;
  var maxBar=Math.max(1,Math.max.apply(null,inc.concat(exp)));
  var dataMax=Math.max(maxBar,Math.max.apply(null,sav),0),dataMin=Math.min(0,Math.min.apply(null,sav));
  var ax=axisTicks(dataMin,dataMax,5),y0=ax.min,y1=ax.max;
  function Y(v){return padT+plotH-((v-y0)/(y1-y0))*plotH;}
  var tick=chartCssVar('--text3','#8E8E93'),grid='rgba(142,142,147,0.16)';
  ctx.font='10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
  ax.ticks.forEach(function(t){var y=Y(t);ctx.strokeStyle=(t===0)?'rgba(142,142,147,0.4)':grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();ctx.fillStyle=tick;ctx.fillText(priv?'••••':fmtAxis(t),padL-6,y);});
  var slot=plotW/12,barW=Math.min(slot*0.30,13),gap=2,yz=Y(0);
  ctx.textAlign='center';ctx.textBaseline='top';
  for(var m=0;m<12;m++){
    var cxc=padL+slot*m+slot/2,yi=Y(inc[m]),ye=Y(exp[m]);
    drawBarRect(ctx,cxc-barW-gap/2,Math.min(yi,yz),barW,Math.abs(yz-yi),'rgba(52,199,89,0.82)');
    drawBarRect(ctx,cxc+gap/2,Math.min(ye,yz),barW,Math.abs(yz-ye),'rgba(255,59,48,0.76)');
    ctx.fillStyle=tick;ctx.fillText(MONTHS_S[m],cxc,H-padB+5);
  }
  var savCol=chartCssVar('--amber','#FF9500');
  ctx.strokeStyle=savCol;ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath();
  for(var m2=0;m2<12;m2++){var x=padL+slot*m2+slot/2,y=Y(sav[m2]);if(m2===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.stroke();
  for(var m3=0;m3<12;m3++){var x3=padL+slot*m3+slot/2,y3=Y(sav[m3]);ctx.beginPath();ctx.arc(x3,y3,3,0,Math.PI*2);ctx.fillStyle=savCol;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.stroke();}
  canvas._chart={type:'bar',padL:padL,slot:slot,inc:inc,exp:exp,sav:sav};
  attachChartTip(canvas);
}
function drawLineChart(canvas,series,labels){
  // Cada serie es un objeto ({ label, color, data }), no un array. La firma
  // debe construirse a partir de sus datos para evitar un .join inexistente.
  var priv=isPrivacyMode();
  var sig=(priv?'1':'0')+'|'+(series||[]).map(function(s){return (s&&s.data?s.data:[]).join(',');}).join(';');
  // La firma se guarda en este canvas, no por su id reutilizable entre vistas.
  if(canvas._lineSig===sig)return;
  canvas._lineSig=sig;
  var s=chartSetup(canvas,200);if(!s)return;
  var ctx=s.ctx,W=s.w,H=s.h,padL=40,padR=10,padT=12,padB=22;
  var plotH=H-padT-padB,plotW=W-padL-padR;
  var n=labels?labels.length:12;
  if(!n)n=12;
  var all=[];series.forEach(function(se){se.data.forEach(function(v){if(v!==null&&!isNaN(v))all.push(v);});});
  if(!all.length)all=[0,10];
  var ax=axisTicks(Math.min.apply(null,all.concat(0)),Math.max.apply(null,all),5),y0=ax.min,y1=ax.max;
  var slot=plotW/n;function X(m){return padL+slot*m+slot/2;}function Y(v){return padT+plotH-((v-y0)/(y1-y0))*plotH;}
  var tick=chartCssVar('--text3','#8E8E93'),grid='rgba(142,142,147,0.16)';
  ctx.font='10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
  ax.ticks.forEach(function(t){var y=Y(t);ctx.strokeStyle=(t===0)?'rgba(142,142,147,0.4)':grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();ctx.fillStyle=tick;ctx.fillText(priv?'••••':fmtAxis(t),padL-6,y);});
  ctx.textAlign='center';ctx.textBaseline='top';
  for(var mm=0;mm<n;mm++){
    if(labels){if(!labels[mm])continue;ctx.fillStyle=tick;ctx.fillText(labels[mm],X(mm),H-padB+5);}
    else{ctx.fillStyle=tick;ctx.fillText(MONTHS_S[mm],X(mm),H-padB+5);}
  }
  ctx.lineJoin='round';ctx.lineCap='round';
  series.forEach(function(se){
    ctx.strokeStyle=se.color;ctx.lineWidth=se.bold?2.5:2;ctx.beginPath();var started=false;
    for(var m=0;m<n;m++){var v=se.data[m];if(v===null||isNaN(v))continue;var x=X(m),y=Y(v);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}
    ctx.stroke();
    for(var m2=0;m2<n;m2++){var v2=se.data[m2];if(v2===null||isNaN(v2))continue;ctx.beginPath();ctx.arc(X(m2),Y(v2),3,0,Math.PI*2);ctx.fillStyle=se.color;ctx.fill();}
  });
  canvas._chart={type:'line',padL:padL,slot:slot,series:series,labels:labels,count:n};
  attachChartTip(canvas);
}
function getChartTip(){var t=document.getElementById('chartTip');if(!t){t=document.createElement('div');t.id='chartTip';t.style.cssText='position:fixed;z-index:300;pointer-events:none;opacity:0;transition:opacity .12s;background:var(--bg2);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);border:1px solid var(--card-border);box-shadow:var(--shadow-sm);border-radius:16px;padding:8px 10px;font-size:11px;font-family:var(--font);color:var(--text);min-width:130px';document.body.appendChild(t);}return t;}
function chartTipRow(color,label,val){return '<div style="display:flex;align-items:center;gap:6px;padding:1px 0"><span style="width:8px;height:8px;border-radius:2px;background:'+htmlEscape(color)+';flex-shrink:0"></span><span style="flex:1;color:var(--text2)">'+htmlEscape(label)+'</span><span style="font-weight:600;font-family:var(--mono)">'+(val===null||val===undefined||isNaN(val)?'—':(isPrivacyMode()?'••••••':fmt(val)))+'</span></div>';}
var _chartTipHideTimer=null;
function scheduleHideChartTip(delay){
  clearTimeout(_chartTipHideTimer);
  _chartTipHideTimer=setTimeout(hideChartTip,delay||0);
}
function hideChartTip(){clearTimeout(_chartTipHideTimer);var t=document.getElementById('chartTip');if(t)t.style.opacity='0';}
function attachChartTip(canvas){
  var meta=canvas._chart;
  canvas.tabIndex=0;
  canvas.style.touchAction='pan-y';
  function show(ev){
    clearTimeout(_chartTipHideTimer);
    var rect=canvas.getBoundingClientRect(),x=ev.clientX-rect.left;
    var m=Math.floor((x-meta.padL)/meta.slot);
    var count=meta.count||12;
    if(m<0||m>=count){hideChartTip();return;}
    var title=meta.labels?meta.labels[m]:capitalize(MONTHS[m]);
    var tip=getChartTip(),html='<div style="font-weight:700;margin-bottom:4px">'+title+'</div>';
    if(meta.type==='bar'){html+=chartTipRow('#34C759','Ingresos',meta.inc[m])+chartTipRow('#FF3B30','Gastos',meta.exp[m])+chartTipRow('#FF9500','Ahorro',meta.sav[m]);}
    else{meta.series.forEach(function(se){html+=chartTipRow(se.color,se.label,se.data[m]);});}
    tip.innerHTML=html;tip.style.opacity='1';
    var tx=ev.clientX-tip.offsetWidth/2;
    var ty=ev.clientY-tip.offsetHeight-16;
    if(ty<8)ty=ev.clientY+24;
    if(tx<8)tx=8;
    if(tx+tip.offsetWidth>window.innerWidth-8)tx=window.innerWidth-tip.offsetWidth-8;
    tip.style.left=tx+'px';tip.style.top=ty+'px';
  }
  canvas.onpointermove=show;
  canvas.onpointerdown=function(ev){
    clearTimeout(_chartTipHideTimer);
    ev.stopPropagation();
    show(ev);
  };
  canvas.onpointerleave=function(ev){
    if(ev.pointerType==='touch')scheduleHideChartTip(1800);
    else hideChartTip();
  };
  canvas.onpointerup=function(ev){
    if(ev.pointerType==='touch')scheduleHideChartTip(1800);
    else hideChartTip();
  };
  canvas.onpointercancel=hideChartTip;
  canvas.onkeydown=function(ev){
    if(['ArrowLeft','ArrowRight','Home','End'].indexOf(ev.key)===-1)return;
    ev.preventDefault();var count=meta.count||12,idx=(canvas._chartKeyIndex==null?0:canvas._chartKeyIndex);
    if(ev.key==='ArrowLeft')idx=Math.max(0,idx-1);else if(ev.key==='ArrowRight')idx=Math.min(count-1,idx+1);else if(ev.key==='Home')idx=0;else idx=count-1;
    canvas._chartKeyIndex=idx;var rect=canvas.getBoundingClientRect();show({clientX:rect.left+meta.padL+meta.slot*idx+meta.slot/2,clientY:rect.top+10});
  };
}

