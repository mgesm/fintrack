'use strict';
function toggleHomeAnnual(){homeAnnualMode=!homeAnnualMode;hmSelDay=null;activeCatId=null;dtActiveCat=null;filterDateFrom='';filterDateTo='';refreshTab();}
function getDashboardTx(){
  if(filterDateFrom||filterDateTo){
    var txs=transactions.slice();
    if(filterDateFrom)txs=txs.filter(function(t){return t.date>=filterDateFrom;});
    if(filterDateTo)txs=txs.filter(function(t){return t.date<=filterDateTo;});
    return txs;
  }
  if(homeAnnualMode)return getYearTx();
  return getMonthTx();
}

function render(){
  clearBalanceCache();
  updatePrivacyIcons();
  document.getElementById('monthLabel').textContent=homeAnnualMode?(''+viewYear):(capitalize(MONTHS[viewMonth])+' '+viewYear);
  var hab=document.getElementById('homeAnnualBtn');if(hab)hab.classList.toggle('active',homeAnnualMode);
  var hmb=document.getElementById('homeMonthlyBtn');if(hmb)hmb.classList.toggle('active',!homeAnnualMode);
  var txs=getDashboardTx();
  var exps=txs.filter(function(t){return !t.is_balance_adjustment&&txExpenseImpact(t)>0;});
  var totals=calcPeriodTotals(txs);
  var tExp=totals.expense;
  var tBalExp=totals.balExpense;
  var tInc=totals.income;
  var tBalInc=totals.balIncome;
  var bal=totals.balance;
  var incEl=document.getElementById('totalInc'),expEl=document.getElementById('totalExp'),bel=document.getElementById('totalBal');
  bel.style.color=bal>=0?'var(--green-text)':'var(--red)';
  if(isPrivacyMode()){
    [incEl,expEl,bel].forEach(function(e){if(e&&e._countRAF){cancelAnimationFrame(e._countRAF);e._countRAF=null;}});
    incEl.textContent='••••••';expEl.textContent='••••••';bel.textContent='••••••';
  } else {
    var balStr=(bal<0?'−':'')+fmtShort(Math.abs(bal));
    if(shouldAnimateNumbers()){
      countUp(incEl,tInc,fmtShort);
      countUp(expEl,tExp,fmtShort);
      countUp(bel,Math.abs(bal),function(n){return (bal<0?'−':'')+fmtShort(n);});
    } else {
      [incEl,expEl,bel].forEach(function(e){if(e&&e._countRAF){cancelAnimationFrame(e._countRAF);e._countRAF=null;}});
      incEl.textContent=fmtShort(tInc);expEl.textContent=fmtShort(tExp);bel.textContent=balStr;
    }
  }
  var tb=totalBudget();
  var tbEl=document.getElementById('totalBudgetBar');
  if(tb>0&&!homeAnnualMode){
    var pct=Math.max(0,Math.min(Math.round(tExp/tb*100),100));
    var col=tExp/tb*100>=100?'var(--red)':budgetGradientColor(tExp/tb*100);
    tbEl.innerHTML='<div class="budget-total-bar"><div class="btb-top"><span class="btb-label">Presupuesto mensual</span><span class="btb-value" style="color:'+col+'">'+(isPrivacyMode()?'•••••• / ••••••':(fmt(tExp)+' / '+fmt(tb)))+'</span></div><div class="btb-bar-bg"><div class="btb-bar-fill" style="background:'+col+';width:'+pct+'%"></div></div></div>';
  } else tbEl.innerHTML='';
  renderBalanceAdjustmentNote(txs,'balanceAdjustmentNote');
  renderUncomputedExpensesNote(txs,'uncomputedExpensesNote');
  if(!IS_DESKTOP){
    if(activeTab===0){
      renderDonut(txs,tExp);
      renderLegend(txs);
      renderHeatmap(exps);
      animateTabEntrance(document.getElementById('mainChart'),'.summary-hero,.summary,.flip-card,#totalBudgetBar');
      setFlipHeight('homeFlipInner');
    }
    renderTab();
  }
}

function quickFilterKpi(type){
  filterType = (filterType === type) ? 'all' : type;
  var sel = document.getElementById('filterType');
  if(sel) sel.value = filterType;
  document.querySelectorAll('.filter-chip[data-type]').forEach(function(chip){
    chip.classList.toggle('active', chip.dataset.type === filterType);
  });
  if(!IS_DESKTOP && activeTab === 0){
    switchTab(1);
  }
  renderTxList();
  showSuccessToast(filterType === 'all' ? 'Mostrando todos los movimientos' : ('Filtrado por: ' + (filterType==='income'?'Ingresos':'Gastos')));
}
function renderBalanceAdjustmentNote(txs,id){
  var el=document.getElementById(id);if(!el)return;
  var net=txs.reduce(function(s,t){return s+(t.is_balance_adjustment?(t.type==='expense'?Number(t.amount):-Number(t.amount)):0);},0);
  el.textContent=Math.abs(net)>0.005?'Actualización de gastos: '+(isPrivacyMode()?'••••••':((net<0?'−':'+')+fmt(Math.abs(net)))):'';
  el.style.color=net<0?'var(--green)':'var(--red)';
}
function renderUncomputedExpensesNote(txs,id){
  var el=document.getElementById(id);if(!el)return;
  var uncomputed=(txs||[]).reduce(function(s,t){
    if(t&&t.type==='expense'&&!t.is_balance_adjustment&&getEffectiveTxCalcMode(t)===1){
      return s+(Number(t.amount)||0);
    }
    return s;
  },0);
  el.textContent=uncomputed>0.005?'Gastos no computados: '+(isPrivacyMode()?'••••••':fmt(uncomputed)):'';
}
function switchTab(i){
  var prev=activeTab;
  hideChartTip();
  try{
    document.querySelectorAll('.flip-inner.flipped').forEach(function(el){
      el.classList.remove('flipped');
      el.querySelectorAll('.flip-face').forEach(function(face){
        face.style.transition='none';
        if(face.classList.contains('flip-back')) face.style.visibility='hidden';
        if(face.classList.contains('flip-front')) face.style.visibility='visible';
      });
      el.querySelectorAll('.flip-face').forEach(function(face){
        face.style.transition='';
        face.style.visibility='';
      });
      if(typeof setFlipHeight==='function')setFlipHeight(el.id);
    });
  }catch(e){}
  activeTab=i;
  saveUiState();
  searchQuery='';filterType='all';filterCat='';filterAccount='';sortOrder='date-desc';filterDateFrom='';filterDateTo='';
  function updateDom(){
    if(IS_DESKTOP){
      document.querySelectorAll('.dt-nav-item').forEach(function(btn){btn.classList.toggle('active',parseInt(btn.getAttribute('data-tab'))===i);});
      var sBtn=document.querySelector('.dt-sidebar-btn');if(sBtn)sBtn.classList.toggle('active',i===5);
      var dtMain=document.getElementById('dtMain');if(dtMain)dtMain.scrollTop=0;
      if(typeof dtRender==='function')dtRender();
    } else {
      for(var j=0;j<5;j++){
        var bn=document.getElementById('bn'+j);
        if(bn){
          var isActive=(j===i);
          bn.classList.toggle('active',isActive);
          bn.setAttribute('aria-selected',isActive?'true':'false');
        }
      }
      document.getElementById('mainChart').style.display=(i===0)?'block':'none';
      if(i===0)setFlipHeight('homeFlipInner');
      document.getElementById('fabBtn').classList.toggle('fab-hidden',i!==0&&i!==1&&i!==2);
      updatePeriodToolbar();
      movePill(i);
      renderTab();
      window.scrollTo(0,0);
    }
  }
  if(document.startViewTransition&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.startViewTransition(function(){updateDom();});
  } else {
    var prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!IS_DESKTOP&&!prefersReduced){
      var el=document.getElementById('tabContent');
      var dir=i>prev?1:-1;
      if(el){el.style.transition='none';el.style.opacity='0';el.style.transform='translateX('+(dir*18)+'px)';}
      updateDom();
      if(el){
        requestAnimationFrame(function(){requestAnimationFrame(function(){
          el.style.transition='opacity 0.22s ease, transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)';
          el.style.opacity='1';el.style.transform='translateX(0)';
        });});
      }
    } else {
      updateDom();
    }
  }
}

function movePill(i){
  var pill=document.getElementById('bnavPill');
  var nav=document.getElementById('bottomNav');
  if(!pill||!nav)return;
  var btn=document.getElementById('bn'+i);
  if(!btn||nav.style.display==='none'||btn.offsetWidth===0){pill.style.opacity='0';return;}
  pill.style.opacity='1';
  var navRect=nav.getBoundingClientRect();
  var btnRect=btn.getBoundingClientRect();
  pill.style.left=(btnRect.left-navRect.left)+'px';
  pill.style.width=btnRect.width+'px';
}
window.addEventListener('resize',function(){
  if(!IS_DESKTOP&&typeof activeTab==='number')movePill(activeTab);
},{passive:true});
window.addEventListener('orientationchange',function(){
  setTimeout(function(){
    if(!IS_DESKTOP&&typeof activeTab==='number')movePill(activeTab);
  },120);
});
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(function(){
    movePill(activeTab);
    var apill=document.getElementById('authTabPill');
    var atab=document.getElementById('tabLogin')&&document.getElementById('tabLogin').classList.contains('active')?document.getElementById('tabLogin'):document.getElementById('tabRegister');
    if(apill&&atab&&atab.classList.contains('active')){
      var prect=atab.parentElement.getBoundingClientRect();
      var trect=atab.getBoundingClientRect();
      apill.style.left=(trect.left-prect.left)+'px';
      apill.style.width=trect.width+'px';
    }
  });
}
function refreshTab(){if(IS_DESKTOP){dtRender();}else{render();}enableKeyboardControls();}
function renderTab(){
  var el=document.getElementById('tabContent');
  if(activeTab===0)renderTxTab(el);
  else if(activeTab===1)renderCatTab(el);
  else if(activeTab===2)renderPatTab(el);
  else if(activeTab===3)renderAnnualTab(el);
  else if(activeTab===4)renderInvestmentsTab(el);
  else renderSettingsTab(el);
}

// EVENT DELEGATION — handles all static and dynamic interactions without inline handlers
document.addEventListener('click',function(e){
  var btn=e.target.closest('[data-action]');
  if(!btn)return;
  var action=btn.getAttribute('data-action');
  var id=btn.getAttribute('data-id');
  var sub=btn.getAttribute('data-sub');
  var mode=btn.getAttribute('data-mode');
  if(action==='edit-tx')editTx(id);
  else if(action==='edit-tx-row'){if(!e.target.closest('.tx-btn'))editTx(id);}
  else if(action==='del-tx')requestDeleteTx(id);
  else if(action==='hm-edit-tx')hmEditTx(id);
  else if(action==='del-cat')deleteCat(id);
  else if(action==='archive-cat')archiveCat(id);
  else if(action==='rename-cat')promptRenameCat(id);
  else if(action==='show-subform'){var pfx=IS_DESKTOP?'dt':'';var f=document.getElementById('subform_'+pfx+id);f.style.display=f.style.display==='none'?'block':'none';if(f.style.display==='block')document.getElementById('subinput_'+pfx+id).focus();setFlipHeight(catFlipId(id));}
  else if(action==='show-colorform'){openCatStyleModal(id);}
  else if(action==='set-cat-color')saveCatColor(id,sub);
  else if(action==='set-cat-icon')saveCatIcon(id,sub);
  else if(action==='toggle-cat-exclude')toggleCategoryExpenseExclusion(id);
  else if(action==='toggle-cat-edit')toggleCatEditMode();
  else if(action==='cat-flip-front')onCatFrontClick(e,btn.getAttribute('data-inner'),id);
  else if(action==='cat-flip-back')onCatBackClick(e,btn.getAttribute('data-inner'));
  else if(action==='toggle-flip')toggleFlip(btn.getAttribute('data-inner'));
  else if(action==='toggle-subcats')toggleSubcats(e,id,btn.getAttribute('data-inner'));
  else if(action==='open-budget-modal'){e.stopPropagation();openBudgetModal(id);}
  else if(action==='add-cat')addCat();
  else if(action==='show-acc-colorform'){var f=document.getElementById('acc_colorform_'+id);if(f)f.style.display=f.style.display==='none'?'block':'none';}
  else if(action==='set-acc-color')saveAccountColor(id,sub);
  else if(action==='show-budgetform')openBudgetModal(id);
  else if(action==='add-subcat')addSubcat(id);
  else if(action==='save-budget')saveBudget(id);
  else if(action==='reset-budget-auto')resetBudgetToAuto(id);
  else if(action==='del-subcat')deleteSubcat(id,decodeURIComponent(sub));
  else if(action==='del-acc')deleteAccount(id);
  else if(action==='set-default-acc')setDefaultAccount(id);
  else if(action==='del-adjust')deleteAdjustment(id);
  else if(action==='toggle-acc-card'){if(!e.target.closest('button,input,select,a'))toggleAccCard(id);}
  else if(action==='open-adjust-modal'){e.stopPropagation();openAdjustModal(id);}
  else if(action==='add-account')addAccount();
  else if(action==='filter-type'){filterType=id;refreshTab();}
  else if(action==='set-tx-type'){
    setTxType(mode);
    document.querySelectorAll('.filter-chip[data-action="set-tx-type"]').forEach(function(ch){
      ch.classList.toggle('active',ch.getAttribute('data-mode')===mode);
    });
  }
  else if(action==='toggle-search-scope')toggleSearchScope();
  else if(action==='toggle-filters')toggleFilters();
  else if(action==='clear-all-filters')clearAllFilters();
  else if(action==='clear-date-range'){filterDateFrom='';filterDateTo='';refreshTab();}
  else if(action==='clear-date-range-ui')clearDateRange();
  else if(action==='show-adjustform'){var f=document.getElementById('adjustform_'+id);f.style.display=f.style.display==='none'?'flex':'none';}
  else if(action==='toggle-hist'){toggleAccCard(id);}
  else if(action==='apply-adjust')applyBalanceAdjustment(id);
  else if(action==='remove-tag'){txTags.splice(parseInt(id,10),1);renderTagsInput();}
  else if(action==='tx-more'){appendTxPage();}
  else if(action==='bio-unlock'){if(typeof bioUnlock==='function')bioUnlock();}
  else if(action==='switch-auth-tab')switchAuthTab(mode);
  else if(action==='submit-auth')submitAuth();
  else if(action==='send-password-reset')sendPasswordReset();
  else if(action==='send-magic-link')sendMagicLink();
  else if(action==='show-auth-form')showAuthForm();
  else if(action==='submit-new-password')submitNewPassword();
  else if(action==='brand-tap')handleBrandTap(e);
  else if(action==='open-month-modal')openMonthModal();
  else if(action==='open-settings')openSettings();
  else if(action==='set-home-annual'){if((mode==='annual')!==homeAnnualMode)toggleHomeAnnual();}
  else if(action==='toggle-home-annual')toggleHomeAnnual();
  else if(action==='quick-filter-kpi')quickFilterKpi(mode);
  else if(action==='toggle-privacy')togglePrivacyMode();
  else if(action==='home-flip-front')onFrontClick(e);
  else if(action==='home-flip-back')onBackClick(e);
  else if(action==='dt-flip-front')dtOnFrontClick(e);
  else if(action==='dt-flip-back')dtOnBackClick(e);
  else if(action==='switch-tab'){var tab=parseInt(btn.getAttribute('data-tab'),10);if(!isNaN(tab))switchTab(tab);}
  else if(action==='open-modal')openModal();
  else if(action==='close-modal')closeModal();
  else if(action==='set-modal-type')setType(mode);
  else if(action==='cycle-tx-calc')cycleTxCalcMode();
  else if(action==='swap-transfer-accounts')swapTransferAccounts();
  else if(action==='toggle-recurring')toggleRecurring();
  else if(action==='toggle-tx-tags')toggleTxTagsDrawer();
  else if(action==='save-tx')saveTx();
  else if(action==='confirm-recur-del')confirmRecurringDelete(mode);
  else if(action==='close-recur-del')closeRecurringDeleteDialog();
  else if(action==='run-export')runExport(mode);
  else if(action==='close-adjust-modal')closeAdjustModal();
  else if(action==='save-adjust-modal')saveAdjustModal();
  else if(action==='reset-budget-modal')resetBudgetFromModal();
  else if(action==='close-budget-modal')closeBudgetModal();
  else if(action==='save-budget-modal')saveBudgetModal();
  else if(action==='picker-year')changePickerYear(parseInt(btn.getAttribute('data-delta'),10)||0);
  else if(action==='picker-whole-year')selectPickerWholeYear();
  else if(action==='picker-cur-month')jumpToCurrentMonth();
  else if(action==='select-picker-month')selectPickerMonth(parseInt(id,10));
  else if(action==='close-cat-style-modal')closeCatStyleModal();
  else if(action==='sign-out')signOut();
  else if(action==='chart-year'){chartYear+=(parseInt(btn.getAttribute('data-delta'),10)||0);switchTab(3);}
  else if(action==='set-annual-view')setAnnualView(mode);
  else if(action==='close-asset-sheet')closeAssetSheet(btn.closest('.asset-sheet'));
  else if(action==='toggle-portfolio-value')togglePortfolioValue();
  else if(action==='open-sync-tray')openSyncTray();
  else if(action==='force-sync')forceSync();
  else if(action==='clear-local-cache')clearLocalCacheAndResync();
  else if(action==='set-theme')setTheme(mode);
  else if(action==='open-export-modal')openExportModal(mode||undefined);
  else if(action==='send-monthly-report')sendMonthlyReportEmail();
  else if(action==='export-json')exportJSON();
  else if(action==='download-backup')downloadBackupNow();
  else if(action==='trigger-import-json'){var inp=document.getElementById('importJSONFile');if(inp)inp.click();}
  else if(action==='restore-backup')restoreLatestBackup();
  else if(action==='clear-txs')clearTxs();
});
document.addEventListener('change',function(e){
  var el=e.target.closest('[data-change]');
  if(!el)return;
  var act=el.getAttribute('data-change');
  if(act==='tx-cat')onTxCatChange();
  else if(act==='export-scope')onExportScopeChange();
  else if(act==='adjust-date')onAdjustDateChange();
  else if(act==='tx-sort'){sortOrder=el.value;updateFilterCount();renderTxList();}
  else if(act==='tx-filter-cat'){filterCat=el.value;updateFilterCount();renderTxList();}
  else if(act==='tx-filter-acc'){filterAccount=el.value;updateFilterCount();renderTxList();}
  else if(act==='tx-date-from'){filterDateFrom=el.value;updateFilterCount();renderTxList();}
  else if(act==='tx-date-to'){filterDateTo=el.value;updateFilterCount();renderTxList();}
  else if(act==='import-json-file')importJSONFile(el);
});
document.addEventListener('input',function(e){
  var el=e.target.closest('[data-input]');
  if(!el)return;
  var act=el.getAttribute('data-input');
  if(act==='tx-search')onTxSearchInput(el);
  else if(act==='adjust-amount')onAdjustAmountInput();
});
document.addEventListener('pointerdown',function(e){
  var el=e.target.closest('[data-pointerdown]');
  if(!el)return;
  var act=el.getAttribute('data-pointerdown');
  if(act==='cat-drag')catDragStart(e,el.getAttribute('data-id'),el);
});

// SWIPE-TO-DELETE (mobile tx items)
var txSwipe=null;
document.addEventListener('touchstart',function(e){
  if(IS_DESKTOP)return;
  if(txSwipe&&txSwipe.dragging)return; // ignore a second finger while one swipe is already active
  var wrap=e.target.closest('.tx-swipe-wrap[data-swipe-id]');
  if(!wrap)return;
  var item=wrap.querySelector('.tx-item');
  var bg=wrap.querySelector('.tx-delete-bg');
  var t=e.changedTouches[0];
  txSwipe={id:t.identifier,wrap:wrap,item:item,bg:bg,startX:t.clientX,startY:t.clientY,dx:0,dragging:false,threshold:(item?item.offsetWidth:320)*0.38};
},{passive:true});
function txSwipeFindTouch(e){for(var i=0;i<e.touches.length;i++)if(e.touches[i].identifier===txSwipe.id)return e.touches[i];return null;}
document.addEventListener('touchmove',function(e){
  if(!txSwipe)return;
  var t=txSwipeFindTouch(e);if(!t)return;
  var dx=t.clientX-txSwipe.startX,dy=t.clientY-txSwipe.startY;
  if(!txSwipe.dragging){
    if(Math.abs(dy)>Math.abs(dx) || Math.abs(dy)>14){txSwipe=null;return;}
    if(Math.abs(dx)>14 && Math.abs(dx)>Math.abs(dy)*1.8)txSwipe.dragging=true;
  } else if(Math.abs(dy)>Math.abs(dx)*1.4 && Math.abs(dy)>14){
    // gesture turned into a vertical scroll after all — bail out
    txSwipe.item.style.transform='';txSwipe.bg.style.opacity=0;txSwipe=null;return;
  }
  if(txSwipe.dragging){
    if(dx>0)dx=0;
    txSwipe.dx=dx;
    txSwipe.item.style.transition='none';
    txSwipe.item.style.transform='translateX('+dx+'px)';
    txSwipe.bg.style.opacity=Math.min(1,Math.abs(dx)/80);
    var threshold=txSwipe.threshold;
    if(!txSwipe.vibrated&&Math.abs(dx)>=threshold){
      txSwipe.vibrated=true;
    }else if(txSwipe.vibrated&&Math.abs(dx)<threshold){
      txSwipe.vibrated=false;
    }
    e.preventDefault();
  }
},{passive:false});
document.addEventListener('touchend',function(e){
  if(!txSwipe)return;
  var ended=false;for(var i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===txSwipe.id)ended=true;
  if(!ended)return;
  var item=txSwipe.item,dx=txSwipe.dx,dragging=txSwipe.dragging,wrap=txSwipe.wrap,bg=txSwipe.bg,threshold=txSwipe.threshold;
  if(dragging){
    e.preventDefault();
    item.style.transition='transform 0.25s ease';
    bg.style.transition='opacity 0.25s ease';
    if(dx<-threshold){
      item.style.transform='translateX(-120%)';
      bg.style.opacity=1;
      wrap.style.transition='max-height 0.25s ease 0.12s, margin 0.25s ease 0.12s, opacity 0.22s ease 0.12s, padding 0.25s ease 0.12s';
      wrap.style.maxHeight='0px';
      wrap.style.opacity='0';
      wrap.style.marginTop='0px';
      wrap.style.marginBottom='0px';
      wrap.style.paddingTop='0px';
      wrap.style.paddingBottom='0px';
      wrap.style.overflow='hidden';
      var id=wrap.getAttribute('data-swipe-id');
      setTimeout(function(){requestDeleteTx(id);},300);
    } else {
      item.style.transform='translateX(0)';
      bg.style.opacity=0;
    }
  }
  txSwipe=null;
},{passive:false});
document.addEventListener('touchcancel',function(e){
  if(!txSwipe)return;
  var ended=false;for(var i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===txSwipe.id)ended=true;
  if(!ended)return;
  if(txSwipe.item){
    txSwipe.item.style.transition='transform 0.25s ease';
    txSwipe.item.style.transform='translateX(0)';
  }
  if(txSwipe.bg){
    txSwipe.bg.style.transition='opacity 0.25s ease';
    txSwipe.bg.style.opacity=0;
  }
  txSwipe=null;
},{passive:true});

// TRANSACTIONS TAB
function applySort(txs){
  return txs.slice().sort(function(a,b){
    if(sortOrder==='date-desc')return (b.date<a.date? -1 : (b.date>a.date? 1 : 0));
    if(sortOrder==='date-asc')return (a.date<b.date? -1 : (a.date>b.date? 1 : 0));
    if(sortOrder==='amount-desc')return b.amount-a.amount;
    if(sortOrder==='amount-asc')return a.amount-b.amount;
    if(sortOrder==='cat'){
      var catA=a.type==='transfer'?'Transferencia':(txDisplayCategory(a).name||'');
      var catB=b.type==='transfer'?'Transferencia':(txDisplayCategory(b).name||'');
      return catA.localeCompare(catB);
    }
    return 0;
  });
}
function activeFilterCount(){var n=0;if(filterType!=='all')n++;if(filterCat)n++;if(filterAccount)n++;if(filterDateFrom||filterDateTo)n++;if(sortOrder!=='date-desc')n++;if(searchScope==='all')n++;return n;}
function clearAllFilters(){
  searchQuery='';searchScope='month';
  filterType='all';filterCat='';filterAccount='';
  sortOrder='date-desc';filterDateFrom='';filterDateTo='';
  txLimit=TX_PAGE_SIZE;
  refreshTab();
}
function renderTxTab(el){
  // Controls are built once here; the list re-renders independently so the
  // native date pickers / search input are never destroyed mid-interaction.
  var catOptions='<option value="">Todas</option>'+categories.map(function(c){return '<option value="'+c.id+'"'+(filterCat===c.id?' selected':'')+'>'+capEsc(c.name)+(c.archived?' (archivada)':'')+'</option>';}).join('');
  var afc=activeFilterCount();
  var showClear=(afc>0||!!(searchQuery&&searchQuery.trim()));
  el.innerHTML='<div class="search-bar">'
    +'<input type="text" id="txSearchInput" class="search-input" placeholder="'+(searchScope==='all'?'Buscar en todo el historial...':'Buscar en este mes...')+'" value="'+htmlEscape(searchQuery)+'" data-input="tx-search">'
    +'<button type="button" class="search-scope-btn'+(searchScope==='all'?' active':'')+'" data-action="toggle-search-scope" title="Alternar búsqueda entre este mes y todo el historial">'+(searchScope==='all'?'Todo':'Mes')+'</button>'
    +'</div>'
    +'<div class="tx-filters-bar">'
    +'<button class="tx-filters-toggle'+(filtersOpen?' open':'')+'" id="txFiltersToggle" data-action="toggle-filters">'
    +'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>'
    +'<span>Filtros</span>'+(afc?'<span class="tx-filters-count">'+afc+'</span>':'')
    +'<svg class="tx-filters-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
    +'</button>'
    +'<button type="button" class="tx-filters-clear-btn" id="txClearFiltersBtn" data-action="clear-all-filters" style="display:'+(showClear?'inline-flex':'none')+';"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Limpiar</button>'
    +'</div>'
    +'<div class="tx-filter-panel'+(filtersOpen?' open':'')+'" id="txFilterPanel">'
    +'<div class="filter-row">'
    +'<button class="filter-chip'+(filterType==='all'?' active':'')+'" data-action="set-tx-type" data-mode="all">Todos</button>'
    +'<button class="filter-chip'+(filterType==='expense'?' active':'')+'" data-action="set-tx-type" data-mode="expense">Gastos</button>'
    +'<button class="filter-chip'+(filterType==='income'?' active':'')+'" data-action="set-tx-type" data-mode="income">Ingresos</button>'
    +'<button class="filter-chip'+(filterType==='transfer'?' active':'')+'" data-action="set-tx-type" data-mode="transfer">Transferencias</button>'
    +'<select class="sort-select" id="txSortSelect" data-change="tx-sort">'
    +'<option value="date-desc"'+(sortOrder==='date-desc'?' selected':'')+'>Fecha (reciente)</option>'
    +'<option value="date-asc"'+(sortOrder==='date-asc'?' selected':'')+'>Fecha (antigua)</option>'
    +'<option value="amount-desc"'+(sortOrder==='amount-desc'?' selected':'')+'>Importe (mayor)</option>'
    +'<option value="amount-asc"'+(sortOrder==='amount-asc'?' selected':'')+'>Importe (menor)</option>'
    +'<option value="cat"'+(sortOrder==='cat'?' selected':'')+'>Categoría</option>'
    +'</select>'
    +'<select class="sort-select" id="filterCatSelect"'+(filterType==='transfer'?' disabled style="opacity:0.4;cursor:not-allowed;"':'')+' data-change="tx-filter-cat">'+catOptions+'</select>'
    +'<select class="sort-select" id="filterAccSelect" data-change="tx-filter-acc"><option value="">Todas las cuentas</option>'+accounts.map(function(a){return '<option value="'+htmlEscape(a.id)+'"'+(filterAccount===a.id?' selected':'')+'>'+htmlEscape(a.name)+'</option>';}).join('')+'</select>'
    +'</div>'
    +'<div class="filter-row date-range-row">'
    +'<input type="date" id="txDateFrom" class="date-range-input" value="'+filterDateFrom+'" data-change="tx-date-from" title="desde">'
    +'<span class="date-range-sep">–</span>'
    +'<input type="date" id="txDateTo" class="date-range-input" value="'+filterDateTo+'" data-change="tx-date-to" title="hasta">'
    +'<button class="date-range-clear" data-action="clear-date-range-ui" aria-label="Limpiar rango de fechas" style="display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
    +'</div>'
    +'</div>'
    +'<div id="txListWrap"></div>';
  renderTxList();
}
function toggleSearchScope(){
  searchScope=searchScope==='all'?'month':'all';
  var inp=document.getElementById('txSearchInput'),btn=document.querySelector('.search-scope-btn');
  if(inp)inp.placeholder=searchScope==='all'?'Buscar en todo el historial...':'Buscar en este mes...';
  if(btn){btn.classList.toggle('active',searchScope==='all');btn.textContent=searchScope==='all'?'Todo':'Mes';}
  updateFilterCount();renderTxList();
}
var _txLastGroupKey='';
function getFilteredSortedTx(){
  ensureTxIndices();
  var txs=(searchScope==='all'||filterDateFrom||filterDateTo)?transactions.slice():(homeAnnualMode?getYearTx():getMonthTx());
  if(filterDateFrom)txs=txs.filter(function(t){return t.date>=filterDateFrom;});
  if(filterDateTo)txs=txs.filter(function(t){return t.date<=filterDateTo;});
  if(filterType!=='all')txs=txs.filter(function(t){return t.type===filterType;});
  if(filterCat)txs=txs.filter(function(t){return t.category===filterCat;});
  if(filterAccount)txs=txs.filter(function(t){return t.account_id===filterAccount||t.to_account_id===filterAccount;});
  if(searchQuery){
    var rawQ=searchQuery.trim();
    var relMatch=rawQ.match(/^([><]=?)\s*(\d+(?:[.,]\d+)?)$/);
    if(relMatch){
      var op=relMatch[1], targetVal=parseFloat(relMatch[2].replace(',','.'));
      txs=txs.filter(function(t){
        var amt=Number(t.amount)||0;
        if(op==='>')return amt>targetVal;
        if(op==='>=')return amt>=targetVal;
        if(op==='<')return amt<targetVal;
        if(op==='<=')return amt<=targetVal;
        return true;
      });
    } else {
      var tokens=normStr(rawQ).split(/\s+/).filter(Boolean);
      var qClean=normStr(rawQ).replace(/[\s€]/g,'');
      var qNum=rawQ.replace(/[\s€]/g,'').replace(',','.');
      var isNumSearch=/^\d+(\.\d+)?$/.test(qNum);
      var catNameMap={};categories.forEach(function(c){catNameMap[c.id]=c&&c.name?normStr(c.name):'';});
      var accNameMap={};accounts.forEach(function(a){accNameMap[a.id]=a&&a.name?normStr(a.name):'';});
      txs=txs.filter(function(t){
        var baseNorm=_txNormById[t.id];
        if(baseNorm===undefined){
          var nS=t.note?normStr(t.note):'',sS=t.subcategory?normStr(t.subcategory):'';
          var tgS=(t.tags||[]).filter(function(g){return g!=='_no_calc'&&g!=='_no_expense';}).map(normStr).join(' ');
          baseNorm=nS+' '+sS+(tgS?' '+tgS:'');
        }
        var catStr=t.is_balance_adjustment?'actualizacion de saldo':(catNameMap[t.category]||'');
        var accStr=t.type==='transfer'
          ?((accNameMap[t.account_id]||'')+' '+(accNameMap[t.to_account_id]||'')+' transferencia traspaso')
          :(t.account_id?(accNameMap[t.account_id]||''):'');
        var fullText=catStr+' '+baseNorm+' '+accStr;
        var allTokensMatch=tokens.every(function(tok){return fullText.includes(tok);});
        if(allTokensMatch)return true;
        var hideAmount=isPrivacyMode()||(portfolioValueHidden()&&(isAccountInvestment(t.account_id)||isAccountInvestment(t.to_account_id)));
        if(!hideAmount){
          if(isNumSearch&&(String(t.amount).includes(qNum)||Number(t.amount).toFixed(2).includes(qNum)))return true;
          var fVal=fmt(t.amount).replace(/[\s€]/g,'').toLowerCase();
          if(fVal.includes(qClean))return true;
        }
        return false;
      });
    }
  }
  return applySort(txs);
}
function txGroupKeyForDate(dateStr){
  var d=new Date(dateStr+'T12:00:00');
  return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:(searchScope==='all'||homeAnnualMode)?'numeric':undefined});
}
function renderTxList(){
  var wrap=document.getElementById('txListWrap');if(!wrap)return;
  var txs=getFilteredSortedTx();
  var sig=[searchQuery,filterType,filterCat,filterAccount,sortOrder,filterDateFrom,filterDateTo,viewMonth,viewYear,homeAnnualMode,searchScope].join('|');
  if(sig!==txLimitSig){txLimit=TX_PAGE_SIZE;txLimitSig=sig;}
  var totalCount=txs.length;
  var shown=txs.slice(0,txLimit);
  var needsGroup=sortOrder==='date-desc'||sortOrder==='date-asc';
  var txHtml='';
  _txLastGroupKey='';
  if(needsGroup){
    var groups={},orderKeys=[];
    shown.forEach(function(t){
      var key=txGroupKeyForDate(t.date);
      if(!groups[key]){groups[key]=[];orderKeys.push(key);}
      groups[key].push(t);
    });
    if(orderKeys.length)_txLastGroupKey=orderKeys[orderKeys.length-1];
    txHtml=orderKeys.map(function(key){return '<div class="tx-group-label">'+capitalize(key)+'</div><div class="tx-group-card">'+groups[key].map(buildTxItem).join('')+'</div>';}).join('');
  } else if(shown.length){
    txHtml='<div class="tx-group-card">'+shown.map(buildTxItem).join('')+'</div>';
  }
  if(totalCount>txLimit)txHtml+='<button class="tx-more-btn" data-action="tx-more">Ver más ('+(totalCount-txLimit)+')</button>';
  var isFiltered=!!(searchQuery || filterType!=='all' || filterCat || filterAccount || filterDateFrom || filterDateTo);
  var emptyMsg=isFiltered
    ? renderEmptyState('Sin coincidencias', 'No hay movimientos que coincidan con la búsqueda o filtros.', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>')
    : renderEmptyState('Sin movimientos', 'No hay gastos ni ingresos registrados en este periodo.', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>');
  wrap.innerHTML=txHtml||emptyMsg;
}
function appendTxPage(){
  var wrap=document.getElementById('txListWrap');if(!wrap){txLimit+=TX_PAGE_SIZE;refreshTab();return;}
  var txs=getFilteredSortedTx();
  var prevLimit=txLimit;
  txLimit+=TX_PAGE_SIZE;
  var chunk=txs.slice(prevLimit,txLimit);
  var oldBtn=wrap.querySelector('.tx-more-btn');if(oldBtn)oldBtn.remove();
  if(!chunk.length)return;
  var needsGroup=sortOrder==='date-desc'||sortOrder==='date-asc';
  if(needsGroup){
    var groups={},orderKeys=[];
    chunk.forEach(function(t){
      var key=txGroupKeyForDate(t.date);
      if(!groups[key]){groups[key]=[];orderKeys.push(key);}
      groups[key].push(t);
    });
    if(orderKeys.length&&orderKeys[0]===_txLastGroupKey){
      var cards=wrap.querySelectorAll('.tx-group-card');
      var lastCard=cards[cards.length-1];
      if(lastCard){
        lastCard.insertAdjacentHTML('beforeend',groups[orderKeys[0]].map(buildTxItem).join(''));
        orderKeys.shift();
      }
    }
    if(orderKeys.length){
      _txLastGroupKey=orderKeys[orderKeys.length-1];
      wrap.insertAdjacentHTML('beforeend',orderKeys.map(function(key){return '<div class="tx-group-label">'+capitalize(key)+'</div><div class="tx-group-card">'+groups[key].map(buildTxItem).join('')+'</div>';}).join(''));
    }
  } else {
    var card=wrap.querySelector('.tx-group-card');
    if(card)card.insertAdjacentHTML('beforeend',chunk.map(buildTxItem).join(''));
    else wrap.insertAdjacentHTML('beforeend','<div class="tx-group-card">'+chunk.map(buildTxItem).join('')+'</div>');
  }
  if(txs.length>txLimit){
    wrap.insertAdjacentHTML('beforeend','<button class="tx-more-btn" data-action="tx-more">Ver más ('+(txs.length-txLimit)+')</button>');
  }
}
function toggleFilters(){
  filtersOpen=!filtersOpen;
  var p=document.getElementById('txFilterPanel'),t=document.getElementById('txFiltersToggle');
  if(p)p.classList.toggle('open',filtersOpen);
  if(t)t.classList.toggle('open',filtersOpen);
}
function setTxType(tp){
  filterType=tp;
  if(tp==='transfer')filterCat='';
  var sel=document.getElementById('filterCatSelect');
  if(sel){
    sel.disabled=(tp==='transfer');
    sel.style.opacity=(tp==='transfer'?'0.4':'1');
    sel.style.cursor=(tp==='transfer'?'not-allowed':'pointer');
    if(tp==='transfer')sel.value='';
  }
  updateFilterCount();renderTxList();
}
function clearDateRange(){
  filterDateFrom='';filterDateTo='';
  var f=document.getElementById('txDateFrom'),t=document.getElementById('txDateTo');
  if(f)f.value='';if(t)t.value='';
  updateFilterCount();renderTxList();
}
function updateFilterCount(){
  var n=activeFilterCount();
  var clearBtn=document.getElementById('txClearFiltersBtn');
  if(clearBtn){
    var hasQ=!!(searchQuery&&searchQuery.trim());
    clearBtn.style.display=(n>0||hasQ)?'inline-flex':'none';
  }
  var t=document.getElementById('txFiltersToggle');if(!t)return;
  var old=t.querySelector('.tx-filters-count');if(old)old.remove();
  if(!n)return;
  var span=document.createElement('span');span.className='tx-filters-count';span.textContent=n;
  t.insertBefore(span,t.querySelector('.tx-filters-chev'));
}
var _txSearchTimer=null;
function onTxSearchInput(input){
  searchQuery=input.value;
  if(_txSearchTimer)clearTimeout(_txSearchTimer);
  _txSearchTimer=setTimeout(function(){
    updateFilterCount();
    renderTxList();
  },160);
}
function accNameById(id){var a=accounts.find(function(a){return a.id===id;});return a?capitalize(a.name):'?';}
function isAccountInvestment(accId){var a=accounts.find(function(acc){return acc.id===accId;});return !!(a&&(a.is_investment||/inversi[oó]n/i.test(a.name)));}
function buildTxItem(t){
  if(t.type==='transfer'){
    var rec='';
    var delBtn=IS_DESKTOP?'<div class="tx-actions"><button class="tx-btn edit" data-action="edit-tx" data-id="'+t.id+'" title="Editar" aria-label="Editar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="tx-btn del" data-action="del-tx" data-id="'+t.id+'" title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>':'';
    var hideTra=isPrivacyMode()||(portfolioValueHidden()&&(isAccountInvestment(t.account_id)||isAccountInvestment(t.to_account_id)));
    var traAmtStr=hideTra?'••••••':fmtHtml(t.amount);
    return '<div class="tx-swipe-wrap"'+(IS_DESKTOP?'':' data-swipe-id="'+t.id+'"')+'><div class="tx-delete-bg"><span class="tx-delete-x" style="display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></div>'
      +'<div class="tx-item" data-action="edit-tx-row" data-id="'+t.id+'">'
      +'<div style="width:34px;height:34px;border-radius:12px;background:rgba(0,122,255,0.16);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--blue);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>'
      +'<div class="tx-info"><div class="tx-top"><span class="tx-cat">'+htmlEscape(accNameById(t.account_id))+'<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin:0 4px;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'+htmlEscape(accNameById(t.to_account_id))+'</span></div>'
      +(t.note?'<div class="tx-note">'+hlText(t.note,searchQuery)+'</div>':'')+'</div>'
      +'<div class="tx-right"><span class="tx-amount" style="color:var(--blue)">'+traAmtStr+'</span>'+rec
      +delBtn+'</div></div></div>';
  }
  var c=txDisplayCategory(t);var sign=t.is_balance_adjustment?(t.type==='expense'?'−':'+'):(t.type==='expense'?'−':'+');var col=t.type==='expense'?'var(--red)':'var(--green)';
  var sub=t.subcategory?'<span class="tx-subcat">'+capitalize(htmlEscape(t.subcategory))+'</span>':'';
  var txMode=getEffectiveTxCalcMode(t);
  var noCalcBadge='';
  if(txMode===1){
    noCalcBadge='<span class="tx-no-calc-badge tx-bal-only-badge" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--amber);background:rgba(255,159,10,0.1);border:1px solid rgba(255,159,10,0.3);border-radius:20px;padding:1px 6px;margin-left:4px;vertical-align:middle;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg>Solo balance</span>';
  } else if(txMode===2){
    noCalcBadge='<span class="tx-no-calc-badge" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--text3);background:var(--bg3);border:1px solid var(--separator2);border-radius:20px;padding:1px 6px;margin-left:4px;vertical-align:middle;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>No computa</span>';
  }
  var rec=t.recurring?'<div class="tx-recurring-badge" style="display:inline-flex;align-items:center;gap:3px;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Recurrente</div>':'';
  var delBtn=IS_DESKTOP?'<div class="tx-actions"><button class="tx-btn edit" data-action="edit-tx" data-id="'+t.id+'" title="Editar" aria-label="Editar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="tx-btn del" data-action="del-tx" data-id="'+t.id+'" title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>':'';
  var hideTx=isPrivacyMode()||(portfolioValueHidden()&&isAccountInvestment(t.account_id));
  var txAmtStr=hideTx?'••••••':(sign+fmtHtml(t.amount));
  return '<div class="tx-swipe-wrap"'+(IS_DESKTOP?'':' data-swipe-id="'+t.id+'"')+'><div class="tx-delete-bg"><span class="tx-delete-x" style="display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></div>'
    +'<div class="tx-item" data-action="edit-tx-row" data-id="'+t.id+'">'
    +'<div style="width:34px;height:34px;border-radius:12px;background:'+c.color+'22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
    +catIconSvg(c,17)
    +'</div>'
    +'<div class="tx-info"><div class="tx-top"><span class="tx-cat">'+hlText(capitalize(c.name),searchQuery)+'</span>'+sub+noCalcBadge+'</div>'
    +(t.note?'<div class="tx-note">'+hlText(t.note,searchQuery)+'</div>':'')+'</div>'
    +'<div class="tx-right"><span class="tx-amount" style="color:'+col+'">'+txAmtStr+'</span>'+rec
    +delBtn+'</div></div></div>';
}

// CATEGORIES TAB
function catFlipId(id){return 'catFlipInner_'+(IS_DESKTOP?'dt':'')+id;}
var catDrag=null;
function catDragStart(e,id,handleEl){
  e.preventDefault();e.stopPropagation();
  var handle=handleEl||e.currentTarget;
  var card=handle.closest('.cat-flip-card');if(!card)return;
  var list=card.parentNode;
  var cards=Array.prototype.slice.call(list.querySelectorAll('.cat-flip-card'));
  catDrag={id:id,card:card,list:list,cards:cards,startY:e.clientY,handle:handle,pointerId:e.pointerId};
  card.classList.add('cat-dragging');
  try{document.body.style.userSelect='none';}catch(err){}
  try{handle.setPointerCapture(e.pointerId);}catch(err){}
  handle.addEventListener('pointermove',catDragMove);
  handle.addEventListener('pointerup',catDragEnd);
  handle.addEventListener('pointercancel',catDragEnd);
  handle.addEventListener('lostpointercapture',catDragEnd);
}
function catDragMove(e){
  if(!catDrag)return;
  if(!document.body.contains(catDrag.card)){catDragEnd();return;}
  var dy=e.clientY-catDrag.startY;
  catDrag.card.style.transform='translateY('+dy+'px)';
  var cardRect=catDrag.card.getBoundingClientRect();
  var cardMid=cardRect.top+cardRect.height/2;
  for(var i=0;i<catDrag.cards.length;i++){
    var c=catDrag.cards[i];
    if(c===catDrag.card)continue;
    var r=c.getBoundingClientRect();
    if(cardMid>r.top&&cardMid<r.bottom){
      var idx=catDrag.cards.indexOf(c),curIdx=catDrag.cards.indexOf(catDrag.card);
      if(idx<curIdx)catDrag.list.insertBefore(catDrag.card,c);
      else catDrag.list.insertBefore(catDrag.card,c.nextSibling);
      catDrag.cards=Array.prototype.slice.call(catDrag.list.querySelectorAll('.cat-flip-card'));
      catDrag.startY=e.clientY;
      catDrag.card.style.transform='';
      break;
    }
  }
}
async function catDragEnd(){
  if(!catDrag)return;
  var handle=catDrag.handle;
  handle.removeEventListener('pointermove',catDragMove);
  handle.removeEventListener('pointerup',catDragEnd);
  handle.removeEventListener('pointercancel',catDragEnd);
  handle.removeEventListener('lostpointercapture',catDragEnd);
  try{handle.releasePointerCapture(catDrag.pointerId);}catch(err){}
  var wasDetached=!document.body.contains(catDrag.card);
  catDrag.card.style.transform='';
  catDrag.card.classList.remove('cat-dragging');
  try{document.body.style.userSelect='';}catch(err){}
  if(wasDetached||!document.body.contains(catDrag.list)){catDrag=null;return;}
  var order=Array.prototype.slice.call(catDrag.list.querySelectorAll('.cat-flip-card')).map(function(c){return c.getAttribute('data-cat-id');});
  catDrag=null;
  var changed=order.some(function(id,i){var cat=categories.find(function(c){return c.id===id;});return cat&&(cat.position||0)!==i;});
  var previousPositions=categories.map(function(c){return {id:c.id,position:c.position};});
  order.forEach(function(id,i){var cat=categories.find(function(c){return c.id===id;});if(cat)cat.position=i;});
  categories.sort(function(a,b){return (a.position||0)-(b.position||0);});
  if(!changed)return;
  saveLocalCache();setSync('syncing');
  if(isOffline){
    order.forEach(function(id,i){queueOp({type:'update',table:'categories',id:id,data:{position:i}});});
    saveLocalCache();setSync('err');refreshTab();return;
  }
  try{
    var results=await Promise.all(order.map(function(id,i){return sb.from('categories').update({position:i}).eq('id',id);}));
    if(results.some(function(result){return result&&result.error;}))throw new Error('No se ha podido guardar el nuevo orden');
    setSync('ok');
  }catch(e){
    order.forEach(function(id,i){queueOp({type:'update',table:'categories',id:id,data:{position:i}});});
    saveLocalCache();setSync('err');
  }
  refreshTab();
}
function renderCatTab(el,prefix){
  prefix=prefix||'';
  var curYm=monthKey(viewYear,viewMonth);
  var dashTxs=getDashboardTx();
  var exps=dashTxs.filter(function(t){return t.type==='expense';});
  var incs=dashTxs.filter(function(t){return t.type==='income';});
  // Cache bycat totals — compute once, not per-category in forEach
  var bycat={},bysubcat={},bycatInc={},bysubcatInc={};
  exps.forEach(function(t){var a=txExpenseImpact(t);if(a>0){bycat[t.category]=(bycat[t.category]||0)+a;if(t.subcategory){var k=t.category+'||'+t.subcategory;bysubcat[k]=(bysubcat[k]||0)+a;}}});
  incs.forEach(function(t){var a=txIncomeImpact(t);if(a>0){bycatInc[t.category]=(bycatInc[t.category]||0)+a;if(t.subcategory){var k=t.category+'||'+t.subcategory;bysubcatInc[k]=(bysubcatInc[k]||0)+a;}}});
  var totalExp=Object.values(bycat).reduce(function(a,b){return a+b;},0)||1;
  var totalInc=Object.values(bycatInc).reduce(function(a,b){return a+b;},0)||1;
  var activeCats=categories.filter(function(c){return !c.archived;});
  var archivedCats=categories.filter(function(c){return c.archived;});

  var html='<div class="cat-head-row">'
    +'<div class="section-title">Presupuesto y gastos '+(homeAnnualMode?'del año '+viewYear:'del mes')+'</div>'
    +'<button type="button" class="cat-edit-mode-btn'+(catEditMode?' active':'')+'" data-action="toggle-cat-edit">'
    +(catEditMode?'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Listo':'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar')
    +'</button>'
    +'</div><div id="catDragList">';

  if(!activeCats.length){
    html+=renderEmptyState('Sin categorías activas', 'Crea una categoría para organizar tus presupuestos.', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h7"/></svg>');
  } else {
  activeCats.forEach(function(c){
    var isInc=isIncomeCat(c.id);
    var catMode=(homeAnnualMode||isInc)?0:getCategoryCalcMode(c.id,curYm);
    var isExcluded=!homeAnnualMode&&!isInc&&isCategoryExcludedFromExpense(c.id,curYm);
    var amt=roundMoney(isInc?(bycatInc[c.id]||0):(bycat[c.id]||0));
    var pctDenom=isInc?totalInc:totalExp;
    var budget=isInc?0:roundMoney(homeAnnualMode?budgetForCatRange(c.id,viewYear+'-01',viewYear+'-12'):budgetForCat(c.id));
    var formBudget=isInc?0:budgetForCat(c.id);
    var budgetNote=isInc?'':budgetNoteForCat(c.id);
    var autoBreakdown=(!isInc&&isAutoSubBudgetCat(c.id)&&!hasManualBudget(c.id)&&!homeAnnualMode)?autoRecurBudgetBreakdown(c.id,viewYear,viewMonth):null;
    var maxBar=budget>0?Math.max(budget,amt):pctDenom||1;
    var pctBar=Math.max(0,Math.min(Math.round(amt/maxBar*100),100));
    var budgetPctBar=budget>0?Math.max(0,Math.min(Math.round(budget/maxBar*100),100)):0;

    var statusText='', alertClass='cat-status-badge';
    var amtColor='var(--text)';
    var isOverBudget=budget>0&&amt>budget;
    var isWarnBudget=budget>0&&!isOverBudget&&amt>=roundMoney(budget*0.8);
    if(catMode===1){
      statusText='Solo en balance este mes';
      alertClass+=' cat-status-bal-only';
      amtColor='var(--text3)';
    } else if(catMode===2){
      statusText='No computa este mes';
      alertClass+=' cat-status-excluded';
      amtColor='var(--text3)';
    } else if(budget>0){
      var diff=roundMoney(amt-budget);
      var used=Math.round(amt/budget*100);
      var privCat=isPrivacyMode();
      if(isOverBudget){
        statusText=privCat?('Excedido ('+used+'% usado)'):('Excedido en '+fmt(diff)+' ('+used+'% usado)');
        alertClass+=' budget-alert-over';
        amtColor='var(--red)';
      } else if(isWarnBudget){
        statusText=privCat?('•••••• ('+used+'% usado)'):('Quedan '+fmt(roundMoney(budget-amt))+' ('+used+'% usado)');
        alertClass+=' budget-alert-warn';
        amtColor='var(--amber)';
      } else {
        statusText=privCat?('•••••• ('+used+'% usado)'):('Quedan '+fmt(roundMoney(budget-amt))+' ('+used+'% usado)');
        alertClass+=' budget-alert-ok';
        amtColor=(amt>0?'var(--text)':'var(--text4)');
      }
    } else if(amt>0){
      statusText=Math.round(amt/pctDenom*100)+'% del gasto total';
      amtColor='var(--text)';
    } else {
      amtColor='var(--text4)';
    }

    var subcatHtml='';
    (c.subcats||[]).forEach(function(s){
      var sk=c.id+'||'+s,sa=(isInc?bysubcatInc:bysubcat)[sk]||0;
      subcatHtml+='<div class="subcat-row">'
        +'<div style="width:6px;height:6px;border-radius:50%;background:'+c.color+';opacity:0.75;flex-shrink:0"></div>'
        +'<span style="flex:1;font-size:13px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+capEsc(s)+'</span>'
        +(catEditMode?'<button type="button" class="subcat-del-btn" data-action="del-subcat" data-id="'+c.id+'" data-sub="'+encodeURIComponent(s)+'" aria-label="Eliminar subcategoría" title="Eliminar subcategoría"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
          :'<span style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text3);font-variant-numeric:tabular-nums;">'+(sa>0?(isPrivacyMode()?'••••••':fmt(sa)):'—')+'</span>')
        +'</div>';
    });

    var innerId='catFlipInner_'+prefix+c.id;

    if(catEditMode){
      // ── MODO EDICIÓN: Limpio, sin importes ni barras. Con drag, renombrado directo y gestión.
      html+='<div class="cat-flip-card" data-cat-id="'+c.id+'">'
        +'<div class="cat-row cat-editing">'
        +'<div class="cat-row-top">'
        +'<span class="cat-drag-handle" data-pointerdown="cat-drag" data-id="'+c.id+'" title="Arrastra para ordenar" style="display:inline-flex;align-items:center;justify-content:center;cursor:grab;"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="8.5" cy="6" r="1.5"/><circle cx="15.5" cy="6" r="1.5"/><circle cx="8.5" cy="12" r="1.5"/><circle cx="15.5" cy="12" r="1.5"/><circle cx="8.5" cy="18" r="1.5"/><circle cx="15.5" cy="18" r="1.5"/></svg></span>'
        +'<div class="cat-icon-badge" style="background:'+c.color+'22;cursor:pointer;" data-action="show-colorform" data-id="'+c.id+'" title="Cambiar icono o color">'+catIconSvg(c,20)+'</div>'
        +'<div class="cat-info-col">'
        +'<div class="cat-title-row">'
        +'<span class="cat-name-editable" data-action="rename-cat" data-id="'+c.id+'" title="Toca para renombrar">'
        +'<span class="cat-name-text">'+capEsc(c.name)+'</span>'
        +'<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text3);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        +'</span>'
        +'</div>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:4px;margin-left:auto;">'
        +'<button class="arch-btn-sm" data-action="archive-cat" data-id="'+c.id+'" title="'+(c.archived?'Restaurar':'Archivar')+'" aria-label="Archivar categoría">'
        +(c.archived?'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>':'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>')+'</button>'
        +'<button class="del-btn-sm" data-action="del-cat" data-id="'+c.id+'" aria-label="Eliminar categoría" title="Eliminar categoría"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
        +'</div>'
        +'</div>'
        +(subcatHtml?'<div class="subcat-list">'+subcatHtml+'</div>':'')
        +'<div class="cat-edit-tools">'
        +'<button type="button" class="cat-edit-tool-btn" data-action="show-subform" data-id="'+c.id+'"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Subcategoría</button>'
        +(isInc?'':'<button type="button" class="cat-edit-tool-btn cat-calc-pill'+(catMode===1?' is-bal-only':(catMode===2?' is-excluded':''))+'" data-action="toggle-cat-exclude" data-id="'+c.id+'" title="Cambiar modo de cómputo">'+getCatCalcPillContent(catMode)+'</button>')
        +'</div>'
        +'<div id="subform_'+prefix+c.id+'" style="display:none;margin-top:6px">'
        +'<div class="form-row"><input type="text" class="add-input" id="subinput_'+prefix+c.id+'" placeholder="Nombre de la subcategoría...">'
        +'<button class="add-btn" data-action="add-subcat" data-id="'+c.id+'">Añadir</button></div></div>'
        +'</div></div>';
    } else {
      // ── MODO NORMAL: Ultra-limpio, interactivo (tap para ver histórico), con botón de presupuesto que gusta al usuario
      var barColor = isExcluded ? 'var(--separator2)' : (isOverBudget ? 'var(--red)' : (isWarnBudget ? 'var(--amber)' : c.color));
      html+='<div class="flip-card cat-flip-card" data-cat-id="'+c.id+'"><div class="flip-inner" id="'+innerId+'">'
        +'<div class="cat-row flip-face flip-front" data-action="cat-flip-front" data-inner="'+innerId+'" data-id="'+c.id+'">'
        +'<div class="cat-row-top">'
        +'<div class="cat-icon-badge" style="background:'+c.color+'22;">'+catIconSvg(c,20)+'</div>'
        +'<div class="cat-info-col">'
        +'<div class="cat-title-row"><span class="cat-name-text">'+capEsc(c.name)+'</span></div>'
        +(statusText?'<span class="cat-sub-text '+alertClass+'">'+statusText+'</span>':'')
        +'</div>'
        +'<div class="cat-finance-col">'
        +'<span class="cat-amount-text" style="color:'+amtColor+';font-weight:'+(budget>0&&amt>=budget*0.8?'700':'600')+';">'+(isPrivacyMode()?'••••••':(amt>0?fmt(amt):'0 €'))+'</span>'
        +'</div>'
        +'</div>'
        +'<div class="cat-bar-bg">'
        +'<div class="cat-bar-fill" style="background:'+barColor+';width:'+pctBar+'%;"></div>'
        +(budget>0?'<div class="cat-budget-marker" style="left:'+budgetPctBar+'%"></div>':'')
        +'</div>'
        +(subcatHtml?'<div class="subcat-list" id="subcatList_'+prefix+c.id+'" style="display:none;">'+subcatHtml+'</div>':'')
        +'<div class="cat-normal-footer">'
        +(c.subcats&&c.subcats.length>0?'<button type="button" class="subcat-toggle-pill" id="subcatToggle_'+prefix+c.id+'" data-action="toggle-subcats" data-id="'+prefix+c.id+'" data-inner="'+innerId+'" aria-label="Ver '+c.subcats.length+' subcategorías" title="Desplegar subcategorías"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg><span>'+c.subcats.length+(c.subcats.length===1?' subcategoría':' subcategorías')+'</span><svg class="subcat-chevron-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>':'<div></div>')
        +(isInc?'<div></div>':'<button type="button" class="add-sub-btn budget-icon-btn" data-action="open-budget-modal" data-id="'+c.id+'" title="Presupuesto" aria-label="Presupuesto"><span class="budget-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5h14a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z"/><path d="M3.5 7.5v-1a2 2 0 0 1 2-2h10l2 3"/><path d="M15.5 14h3"/></svg></span>'+(budget>0?'<span class="budget-badge">'+(isPrivacyMode()?'••••••':fmt(budget))+'</span>':'')+'</button>')
        +'</div>'
        +'</div>'
        +'<div class="flip-face flip-back chart-card" data-action="cat-flip-back" data-inner="'+innerId+'">'
        +'<div class="cat-chart-head">'
        +'<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
        +'<div class="cat-icon-badge" style="width:30px;height:30px;border-radius:9px;background:'+c.color+'22;">'+catIconSvg(c,16)+'</div>'
        +'<span style="font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+capEsc(c.name)+' ('+viewYear+')</span>'
        +'</div>'
        +'<button type="button" class="cat-chart-back-btn" data-action="toggle-flip" data-inner="'+innerId+'"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Volver</button>'
        +'</div>'
        +'<canvas id="catChart_'+prefix+c.id+'"></canvas>'
        +'</div>'
        +'</div></div>';
    }
  });
  }

  html+='<div class="section-title" style="margin-top:12px">Nueva categoría</div>'
    +'</div>'+'<div class="add-cat-form"><div class="form-row"><input type="text" class="add-input" id="newCatInput" maxlength="80" placeholder="Nombre..."><select class="add-input" id="newCatKind" aria-label="Tipo de categoría" style="max-width:112px"><option value="expense">Gasto</option><option value="income">Ingreso</option></select><button class="add-btn" data-action="add-cat">Añadir</button></div></div>';

  if(archivedCats.length){
    html+='<div class="section-title" style="margin-top:16px;opacity:0.5">Archivadas</div>';
    archivedCats.forEach(function(ac){
      html+='<div class="cat-flip-card cat-arch-card" data-cat-id="'+ac.id+'" style="opacity:0.55">'
        +'<div class="cat-row"><div class="cat-row-top">'
        +'<div class="cat-icon-badge" style="width:34px;height:34px;background:'+ac.color+'22;border-radius:10px;">'+catIconSvg(ac,16)+'</div>'
        +'<span style="flex:1;font-size:14px;font-weight:600;color:var(--text2)">'+capEsc(ac.name)+'</span>'
        +'<button class="arch-btn-sm" data-action="archive-cat" data-id="'+ac.id+'" title="Restaurar" style="color:var(--accent);display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>'
        +'<button class="del-btn-sm" data-action="del-cat" data-id="'+ac.id+'" aria-label="Eliminar categoría" style="display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
        +'</div></div></div>';
    });
  }
  el.innerHTML=html;
  animateTabEntrance(el,'.cat-head-row,.cat-flip-card,.cat-arch-card,.add-cat-form');

  if(!catEditMode){
    activeCats.forEach(function(c){
      var canvas=document.getElementById('catChart_'+prefix+c.id);
      if(canvas) drawCategoryHistoryChart(canvas,c.id);
      setFlipHeight('catFlipInner_'+prefix+c.id);
    });
  }
}

// PATRIMONY TAB
function animateTabEntrance(el,selector){
  if(!el||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches))return;
  if(document.startViewTransition)return;
  var nodes=Array.prototype.slice.call(el.querySelectorAll(selector));
  if(!nodes.length)return;
  nodes.forEach(function(node){
    node.style.animation='none';
    node.style.opacity='0';
    node.style.transform='translateY(8px)';
  });
  requestAnimationFrame(function(){
    nodes.forEach(function(node,index){
      node.style.animation='ft-tab-enter .32s cubic-bezier(.2,.75,.25,1) '+Math.min(index,5)*.035+'s both';
      node.addEventListener('animationend',function cleanAnim(){
        node.removeEventListener('animationend',cleanAnim);
        node.style.animation='';
        node.style.opacity='';
        node.style.transform='';
      },{once:true});
    });
  });
}
function buildAccHistHtml(accId){
  var a=accounts.find(function(x){return x.id===accId;});if(!a)return '';
  var hist=accountHistory(accId);if(!hist.length)return '';
  var hideAcc=isPrivacyMode()||(!!a.is_investment&&portfolioValueHidden());
  return '<div class="pat-hist-table">'
    +hist.slice().reverse().map(function(p){
      var th=isLockedAdjust(p)?null:snapshotTheoreticalAmount(p,a.id);
      var d=th===null?(p.amount-0):(p.amount-th);
      var desfaseClass=th===null?'diff-zero':(Math.abs(d)>=0.005?(d>0?'diff-pos':'diff-neg'):'diff-zero');
      var desfaseStr=th===null?'—':((Math.abs(d)>=0.005?(d>0?'+':'')+fmt(d):'sin desfase'));
      var dateFormatted=new Date((p.reset_date||(p.year+'-'+pad(p.month)+'-01'))+'T12:00:00').toLocaleDateString('es-ES');
      var realAmt=hideAcc?'••••••':fmt(p.amount);
      var theorAmt=hideAcc?'••••••':(th===null?'—':fmt(th));
      var delOrLock=isLockedAdjust(p)
        ?'<span class="pat-hist-lock" title="Saldo inicial fijo · no se puede eliminar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>'
        :'<button class="pat-hist-del" data-action="del-adjust" data-id="'+p.id+'" title="eliminar ajuste" aria-label="Eliminar ajuste"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      return '<div class="pat-hist-row">'
        +'<div class="pat-hist-line1"><span><strong>'+dateFormatted+'</strong> · Real: '+realAmt+'</span>'+delOrLock+'</div>'
        +'<div class="pat-hist-line2"><span>Teórico: '+theorAmt+'</span><span class="'+desfaseClass+'">'+(hideAcc?'••••••':('Desfase: '+desfaseStr))+'</span></div>'
        +'</div>';
    }).join('')
    +'</div>';
}
function toggleAccCard(id){
  var h=document.getElementById('histtable_'+id);if(!h)return;
  var open=h.style.display!=='none';
  if(!open&&h.getAttribute('data-rendered')!=='1'){
    h.innerHTML=buildAccHistHtml(id);
    h.setAttribute('data-rendered','1');
  }
  h.style.display=open?'none':'block';
  var card=document.getElementById('acccard_'+id);if(card)card.classList.toggle('expanded',!open);
}
function defAccKey(){return 'ft_default_account'+(currentUser?'_'+currentUser.id:'');}
function getDefaultAccountId(){
  try{
    var v=localStorage.getItem(defAccKey());
    if(v&&accounts.some(function(a){return a.id===v;}))return v;
  }catch(e){}
  if(!accounts||!accounts.length)return '';
  var def=accounts.find(function(a){return a.is_default;});
  if(def)return def.id;
  var nonInv=accounts.find(function(a){return !a.is_investment;});
  if(nonInv)return nonInv.id;
  return accounts[0].id;
}
function setDefaultAccount(id){try{if(getDefaultAccountId()===id)localStorage.removeItem(defAccKey());else localStorage.setItem(defAccKey(),id);}catch(e){}refreshTab();}
function renderPatTab(el){
  var yr=viewYear,mo=viewMonth+1;
  var defAccId=getDefaultAccountId();
  var hidePat=isPrivacyMode();
  var totalPat=accounts.reduce(function(sum,a){return sum+((hidePat&&a.is_investment)?0:accountCalcBalance(a.id,yr,mo));},0);
  var accRows=accounts.map(function(a){
    var calc=accountCalcBalance(a.id,yr,mo);
    var hideAcc=hidePat||(!!a.is_investment&&portfolioValueHidden());
    var calcText=hideAcc?'••••••':fmtHtml(calc);
    var reset=accountLatestReset(a.id,yr,mo);
    var resetHtml=reset?'Última actualización: '+new Date((reset.reset_date||(reset.year+'-'+pad(reset.month)+'-01'))+'T12:00:00').toLocaleDateString('es-ES')+' <span style="display:inline-flex;align-items:center;vertical-align:-1px;margin:0 3px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span> '+(hideAcc?'••••••':fmt(reset.amount)):'Sin ajustes registrados, calculado desde el inicio';
    var invSubtitleHtml='';
    if(a.is_investment){
      var invPos=investmentPositionsAsOf(a.id);
      var invCost=roundMoney(invPos.reduce(function(s,p){return s+p.cost;},0));
      var invRealized=investmentRealizedGain(a.id);
      var realCol=invRealized>=0?'var(--green)':'var(--red)';
      var realStr=hideAcc?'••••••':((invRealized>=0?'+':'−')+fmt(Math.abs(invRealized)));
      invSubtitleHtml='<div class="pat-acc-calc" style="padding-top:2px;font-size:11.5px;color:var(--text3);">Coste en cartera: '+(hideAcc?'••••••':fmt(invCost))+' · Plusvalía realizada: <span style="color:'+realCol+';font-weight:600;">'+realStr+'</span></div>';
    }
    var hist=accountHistory(a.id);
    return '<div class="pat-account" id="acccard_'+a.id+'" data-action="toggle-acc-card" data-id="'+a.id+'">'
      +'<div class="pat-account-row">'
      +'<div class="pat-acc-color" style="background:'+a.color+';cursor:pointer" data-action="show-acc-colorform" data-id="'+a.id+'" title="Cambiar color de cuenta"></div>'
      +'<span class="pat-acc-name">'+capEsc(a.name)+'</span>'
      +'<button class="pat-acc-star'+(defAccId===a.id?' on':'')+'" data-action="set-default-acc" data-id="'+a.id+'" title="'+(defAccId===a.id?'Cuenta de gastos por defecto':'Usar como cuenta de gastos por defecto')+'" style="display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="13" height="13" fill="'+(defAccId===a.id?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>'
      +'<span class="pat-acc-theoretical"'+(calc<0&&!hideAcc?' style="color:var(--red);"' : '')+'>'+calcText+'</span>'
      +'<button class="del-btn-sm" data-action="del-acc" data-id="'+a.id+'" title="Eliminar cuenta" aria-label="Eliminar cuenta" style="display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      +'</div>'
      +'<div id="acc_colorform_'+a.id+'" style="display:none;padding:0 16px 12px">'
      +'<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Color de la cuenta</div>'
      +'<div class="cat-color-palette">'
      +PALETTE.map(function(pc){
        return '<div class="cat-color-swatch'+(pc.toLowerCase()===String(a.color).toLowerCase()?' active':'')+'" style="background:'+pc+';color:'+pc+'" data-action="set-acc-color" data-id="'+a.id+'" data-sub="'+pc+'"></div>';
      }).join('')
      +'</div></div>'
      +'<div class="pat-acc-calc">'+resetHtml+'</div>'
      +invSubtitleHtml
      +'<div class="pat-acc-actions">'
      +'<button class="pat-acc-btn" data-action="open-adjust-modal" data-id="'+a.id+'" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Ajustar saldo</button>'
      +'</div>'
      +(hist.length?'<div class="pat-acc-hist-hint">Historial ('+hist.length+') · pulsa la cuenta para ver</div><div id="histtable_'+a.id+'" data-rendered="0" style="display:none"></div>':'')
      +'</div>';
  }).join('');
  var accListHtml=accounts.length?accRows:renderEmptyState('Sin cuentas', 'Añade tu primera cuenta para empezar a registrar movimientos y saldos.', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>');
  var totalPatHtml=hidePat?'••••••':((totalPat<0?'−':'')+fmtHtml(Math.abs(totalPat)));
  el.innerHTML='<div class="pat-wrap">'
    +'<div class="pat-total-card"><div class="pat-total-label">Patrimonio total — '+capitalize(MONTHS[viewMonth])+' '+viewYear+'</div><div class="pat-total-value"'+(totalPat<0&&!hidePat?' style="background:none;-webkit-background-clip:unset;background-clip:unset;color:var(--red);"' : '')+'>'+totalPatHtml+'</div></div>'
    +accListHtml
    +'<div class="section-title" style="margin-top:12px">Nueva cuenta</div>'
    +'<div class="add-cat-form"><div class="form-row"><input type="text" class="add-input" id="newAccInput" placeholder="Nombre de la cuenta..."><button class="add-btn" data-action="add-account">Añadir</button></div></div>'
    +'<div class="status-msg" id="patStatus"></div>'
    +'</div>';
  animateTabEntrance(el,'.pat-total-card,.pat-account,.section-title,.add-cat-form');
}
var _activeAdjustAccId=null;
function openAdjustModal(accountId){
  var acc=accounts.find(function(a){return a.id===accountId;});
  if(!acc)return;
  _activeAdjustAccId=accountId;
  var modal=document.getElementById('adjustModalBg');
  if(!modal)return;
  var titleEl=document.getElementById('adjustModalTitle');
  if(titleEl)titleEl.textContent='Ajustar saldo · '+capEsc(acc.name);
  var today=todayStr();
  var dateInp=document.getElementById('adjustDate');
  if(dateInp)dateInp.value=today;
  updateAdjustModalTheoretical();
  var realInp=document.getElementById('adjustRealAmount');
  if(realInp){
    realInp.value='';
    realInp.placeholder='0,00';
  }
  onAdjustAmountInput();
  var status=document.getElementById('adjustModalStatus');
  if(status){status.textContent='';status.className='modal-status';}
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden','false');
  lockBodyScroll();
  setTimeout(function(){if(realInp)realInp.focus();},120);
}

function closeAdjustModal(){
  var modal=document.getElementById('adjustModalBg');
  if(modal){
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden','true');
  }
  _activeAdjustAccId=null;
  unlockBodyScroll();
}

function updateAdjustModalTheoretical(){
  if(!_activeAdjustAccId)return 0;
  var dateInp=document.getElementById('adjustDate');
  var date=dateInp&&dateInp.value?dateInp.value:todayStr();
  var th=accountCalcTheoreticalAsOf(_activeAdjustAccId,date);
  var disp=document.getElementById('adjustTheoreticalDisplay');
  if(disp)disp.textContent=fmt(th);
  return th;
}

function onAdjustDateChange(){
  updateAdjustModalTheoretical();
  onAdjustAmountInput();
}

function onAdjustAmountInput(){
  if(!_activeAdjustAccId)return;
  var dateInp=document.getElementById('adjustDate');
  var date=dateInp&&dateInp.value?dateInp.value:todayStr();
  var th=accountCalcTheoreticalAsOf(_activeAdjustAccId,date);
  var realInp=document.getElementById('adjustRealAmount');
  var real=realInp?parseCurrencyInput(realInp.value):NaN;
  var valBadge=document.getElementById('adjustDesfaseValue');
  if(!Number.isFinite(real)){
    if(valBadge){
      valBadge.textContent='0,00 €';
      valBadge.style.color='var(--text3)';
    }
    return;
  }
  var diff=roundMoney(real-th);
  if(valBadge){
    if(Math.abs(diff)<0.005){
      valBadge.textContent='0,00 € (cuadrado)';
      valBadge.style.color='var(--brand-green)';
    } else if(diff>0){
      valBadge.textContent='+'+fmt(diff);
      valBadge.style.color='var(--green-text)';
    } else {
      valBadge.textContent='−'+fmt(Math.abs(diff));
      valBadge.style.color='var(--red)';
    }
  }
}

async function saveAdjustModal(){
  if(!_activeAdjustAccId)return;
  var dateInp=document.getElementById('adjustDate'),amtInp=document.getElementById('adjustRealAmount');
  var date=dateInp?dateInp.value:'',real=amtInp?parseCurrencyInput(amtInp.value):NaN;
  var status=document.getElementById('adjustModalStatus');
  if(!date||isNaN(real)){
    if(status){status.textContent='Introduce una fecha y un saldo válidos';status.className='modal-status status-err';}
    return;
  }
  var btn=document.getElementById('adjustSaveBtn');
  if(btn)btn.disabled=true;
  try{
    await applyBalanceAdjustment(_activeAdjustAccId,date,real);
    closeAdjustModal();
  }finally{
    if(btn)btn.disabled=false;
  }
}

var _activeBudgetCatId=null;
function openBudgetModal(catId){
  var cat=categories.find(function(c){return c.id===catId;})||catById(catId);
  if(!cat)return;
  _activeBudgetCatId=catId;

  var my=monthKey(viewYear,viewMonth);
  var manual=hasManualBudget(catId);
  var budgetVal=budgetForCat(catId,viewYear,viewMonth);
  var noteVal=budgetNoteForCat(catId,viewYear,viewMonth);

  var titleEl=document.getElementById('budgetModalTitle');
  if(titleEl)titleEl.textContent='Presupuesto · '+capEsc(cat.name);

  var monthLbl=document.getElementById('budgetModalMonthLabel');
  if(monthLbl)monthLbl.textContent='Presupuesto de '+capitalize(MONTHS[viewMonth])+(homeAnnualMode?' '+viewYear:'');

  var amtInput=document.getElementById('budgetModalAmount');
  if(amtInput){
    amtInput.value=(budgetVal>0)?budgetVal:'';
  }

  var noteInput=document.getElementById('budgetModalNote');
  if(noteInput){
    noteInput.value=noteVal||'';
  }

  var autoBox=document.getElementById('budgetModalAutoBox');
  var autoStatus=document.getElementById('budgetModalAutoStatus');
  var autoResetBtn=document.getElementById('budgetModalAutoResetBtn');
  var autoBreakdownEl=document.getElementById('budgetModalAutoBreakdown');

  if(!isIncomeCat(catId)&&isAutoSubBudgetCat(catId)&&!homeAnnualMode){
    if(autoBox)autoBox.style.display='flex';
    var breakdown=autoRecurBudgetBreakdown(catId,viewYear,viewMonth);
    if(manual){
      if(autoStatus)autoStatus.innerHTML='<span style="color:var(--amber);font-weight:600;">Fijado manualmente.</span> Dejó de recalcularse automáticamente.';
      if(autoResetBtn)autoResetBtn.style.display='inline-flex';
    }else{
      if(autoStatus)autoStatus.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Calculado automáticamente según tus gastos recurrentes de este mes.';
      if(autoResetBtn)autoResetBtn.style.display='none';
    }
    if(breakdown&&breakdown.items&&breakdown.items.length){
      if(autoBreakdownEl){
        autoBreakdownEl.innerHTML='<div style="font-weight:600;margin-top:2px;color:var(--text2);">Desglose recurrente:</div>'+breakdown.items.map(function(it){
          return '<div style="display:flex;justify-content:space-between;gap:8px"><span>'+capEsc(it.label)+(it.count>1?' x'+it.count:'')+'</span><span style="font-family:var(--mono);font-weight:600">'+fmt(it.amount)+'</span></div>';
        }).join('');
        autoBreakdownEl.style.display='flex';
      }
    }else if(autoBreakdownEl){
      autoBreakdownEl.style.display='none';
      autoBreakdownEl.innerHTML='';
    }
  }else if(autoBox){
    autoBox.style.display='none';
  }

  var status=document.getElementById('budgetModalStatus');
  if(status){status.textContent='';status.className='modal-status';}

  var modal=document.getElementById('budgetModalBg');
  if(modal){
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden','false');
    lockBodyScroll();
  }
  setTimeout(function(){if(amtInput)amtInput.focus();},120);
}

function closeBudgetModal(){
  var modal=document.getElementById('budgetModalBg');
  if(modal){
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden','true');
  }
  _activeBudgetCatId=null;
  unlockBodyScroll();
}

async function saveBudgetModal(){
  if(!_activeBudgetCatId)return;
  var catId=_activeBudgetCatId;
  var amtInput=document.getElementById('budgetModalAmount');
  var val=parseCurrencyInput(amtInput?amtInput.value:'');
  var status=document.getElementById('budgetModalStatus');
  if(!Number.isFinite(val)||val<0){
    if(status){status.textContent='Introduce un presupuesto válido (mínimo 0 €)';status.className='modal-status status-err';}
    return;
  }
  val=roundMoney(val);
  var noteInput=document.getElementById('budgetModalNote');
  var note=noteInput?(noteInput.value.trim().slice(0,200)||null):null;
  var my=monthKey(viewYear,viewMonth);
  var existing=budgets.find(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});

  var saveBtn=document.getElementById('budgetModalSaveBtn');
  if(saveBtn)saveBtn.disabled=true;

  setSync('syncing');
  try{
    if(isOffline){
      if(existing){
        existing.amount=val;existing.note=note;
        queueOp({type:'update',table:'budgets',id:existing.id,data:{amount:val,note:note}});
      }else{
        var offlineBudget={id:'b'+Date.now(),category_id:catId,amount:val,is_total:false,month_year:my,note:note,user_id:currentUser.id};
        budgets.push(offlineBudget);
        queueOp({type:'insert',table:'budgets',data:offlineBudget});
      }
      saveLocalCache();setSync('err');
      showSuccessToast('Presupuesto pendiente de sincronizar');
      closeBudgetModal();
      refreshTab();
      return;
    }

    if(existing){
      existing.amount=val;existing.note=note;
      var ru=await sb.from('budgets').update({amount:val,note:note}).eq('id',existing.id);
      if(ru.error){
        queueOp({type:'update',table:'budgets',id:existing.id,data:{amount:val,note:note}});
        saveLocalCache();setSync('err');
        showSuccessToast('Presupuesto guardado (pendiente de sincronizar)');
        closeBudgetModal();
        refreshTab();
        return;
      }
    }else{
      var nb={id:'b'+Date.now(),category_id:catId,amount:val,is_total:false,month_year:my,note:note,user_id:currentUser.id};
      var r=await sb.from('budgets').insert(nb).select();
      if(r.error){
        budgets.push(nb);
        queueOp({type:'insert',table:'budgets',data:nb});
        saveLocalCache();setSync('err');
        showSuccessToast('Presupuesto guardado (pendiente de sincronizar)');
        closeBudgetModal();
        refreshTab();
        return;
      }
      budgets.push(r.data?r.data[0]:nb);
    }

    saveLocalCache();setSync('ok');
    showSuccessToast('Presupuesto guardado');
    closeBudgetModal();
    refreshTab();
  }catch(saveErr){
    if(existing){
      queueOp({type:'update',table:'budgets',id:existing.id,data:{amount:val,note:note}});
    }else{
      var fallbackBudget={id:'b'+Date.now(),category_id:catId,amount:val,is_total:false,month_year:my,note:note,user_id:currentUser.id};
      budgets.push(fallbackBudget);
      queueOp({type:'insert',table:'budgets',data:fallbackBudget});
    }
    saveLocalCache();setSync('err');
    showSuccessToast('Presupuesto guardado (pendiente de sincronizar)');
    closeBudgetModal();
    refreshTab();
  }finally{
    if(saveBtn)saveBtn.disabled=false;
  }
}

async function resetBudgetFromModal(){
  if(!_activeBudgetCatId)return;
  var catId=_activeBudgetCatId;
  await resetBudgetToAuto(catId);
  closeBudgetModal();
  showSuccessToast('Presupuesto restaurado a automático');
}
async function addAccount(){var inp=document.getElementById('newAccInput');var name=inp.value.trim();if(!name||name.length>80)return;var acc={id:'acc'+Date.now()+Math.random().toString(36).slice(2,6),name:name,color:PALETTE[accounts.length%PALETTE.length],position:accounts.length,user_id:currentUser.id};setSync('syncing');if(isOffline){accounts.push(acc);if(!queueOp({type:'insert',table:'accounts',data:acc})){accounts.pop();return;}saveLocalCache();setSync('err');inp.value='';refreshTab();return;}var r=await sb.from('accounts').insert(acc).select();if(!r.error){accounts.push(r.data[0]||acc);saveLocalCache();setSync('ok');inp.value='';refreshTab();}else setSync('err');}
async function deleteAccount(id){
  var inUse=transactions.some(function(t){return t.account_id===id||t.to_account_id===id;});
  var inOps=(investmentOperations||[]).some(function(op){return op.cash_account_id===id||op.investment_account_id===id||op.account_id===id;});
  if(inUse||inOps){alert('No se puede eliminar: hay transacciones u operaciones de inversión asociadas a esta cuenta. Elimínalas o reasígnalas primero.');return;}
  var accName=(accounts.find(function(a){return a.id===id;})||{}).name||'esta cuenta';
  var accepted=await confirmCriticalAction({title:'Eliminar cuenta',description:'Eliminarás '+accName+'. Esta acción afecta al historial de saldo de la cuenta.',counts:{cuenta:1},phrase:'ELIMINAR',approveLabel:'Eliminar cuenta'});
  if(!accepted)return;
  var acc=accounts.find(function(a){return a.id===id;});
  var pats=patrimony.filter(function(p){return p.account_id===id;});
  setSync('syncing');
  var r=await sb.rpc('delete_fintrack_account',{target_id:id});
  if(!r.error){
    await sb.from('patrimony').delete().eq('account_id',id);
    accounts=accounts.filter(function(a){return a.id!==id;});if(filterAccount===id)filterAccount='';
    patrimony=patrimony.filter(function(p){return p.account_id!==id;});
    saveLocalCache();setSync('ok');refreshTab();
    showUndoToast('Cuenta eliminada',function(){restoreAccount(acc,pats);});
  }else setSync('err');
}
async function restoreAccount(acc,pats){
  if(!acc)return;
  setSync('syncing');
  var r=await sb.from('accounts').insert(acc).select();
  if(r.error){setSync('err');return;}
  accounts.push(r.data?r.data[0]:acc);
  if(pats.length){var r2=await sb.from('patrimony').insert(pats);if(!r2.error)patrimony=patrimony.concat(pats);}
  saveLocalCache();setSync('ok');refreshTab();
}
async function deleteAdjustment(id){
  if(isLockedAdjust(id)){alert('Este saldo inicial es fijo y no se puede eliminar.');return;}
  if(!confirm('¿Eliminar este ajuste y su actualización de saldo del historial?'))return;
  var linked=transactions.filter(function(t){return t.balance_adjustment_patrimony_id===id;});
  setSync('syncing');
  if(isOffline){
    linked.forEach(function(t){queueOp({type:'delete',table:'transactions',id:t.id});});
    if(!queueOp({type:'delete',table:'patrimony',id:id}))return;
    transactions=transactions.filter(function(t){return t.balance_adjustment_patrimony_id!==id;});
    patrimony=patrimony.filter(function(p){return p.id!==id;});
    invalidateTxIndices();clearBalanceCache();
    saveLocalCache();setSync('err');refreshTab();return;
  }
  var r=await sb.rpc('delete_fintrack_balance_adjustment',{snapshot_id:id});
  if(!r.error){
    transactions=transactions.filter(function(t){return t.balance_adjustment_patrimony_id!==id;});
    patrimony=patrimony.filter(function(p){return p.id!==id;});
    invalidateTxIndices();clearBalanceCache();
    saveLocalCache();setSync('ok');refreshTab();
  }else{setSync('err');alert('No se pudo eliminar el ajuste contable'+(r.error?': '+r.error.message:''));}
}

// ANNUAL TAB
function renderAnnualTab(el){
  // La comparativa "vs mes anterior" se ancla SIEMPRE al mes real en curso
  // (no al mes navegado en Inicio), porque el corte por "día de hoy" de los
  // gastos solo tiene sentido para el mes actual.
  var cmpNow=new Date(),cmpY=chartYear,cmpM=(chartYear===cmpNow.getFullYear()?cmpNow.getMonth():11);
  var prevM=cmpM===0?11:cmpM-1,prevY=cmpM===0?cmpY-1:cmpY;
  ensureTxIndices();
  var curTxs=_txByMonthStr[cmpY+'-'+pad(cmpM+1)]||[];
  var prevTxs=_txByMonthStr[prevY+'-'+pad(prevM+1)]||[];
  var todayDay=(cmpY===cmpNow.getFullYear()&&cmpM===cmpNow.getMonth())?cmpNow.getDate():new Date(cmpY,cmpM+1,0).getDate();
  var curDaysInMonth=new Date(cmpY,cmpM+1,0).getDate();
  var prevDaysInMonth=new Date(prevY,prevM+1,0).getDate();
  var expCutoff=Math.min(todayDay,curDaysInMonth);
  var prevExpCutoff=Math.min(todayDay,prevDaysInMonth);
  function dayOf(dateStr){return parseInt(String(dateStr).slice(8,10),10)||0;}
  var curExp=curTxs.filter(function(t){return dayOf(t.date)<=expCutoff;}).reduce(function(s,t){return s+txExpenseImpact(t);},0);
  var prevExp=prevTxs.filter(function(t){return dayOf(t.date)<=prevExpCutoff;}).reduce(function(s,t){return s+txExpenseImpact(t);},0);
  var curInc=curTxs.filter(function(t){return dayOf(t.date)<=expCutoff;}).reduce(function(s,t){return s+txIncomeImpact(t);},0);
  var prevInc=prevTxs.filter(function(t){return dayOf(t.date)<=prevExpCutoff;}).reduce(function(s,t){return s+txIncomeImpact(t);},0);
  var expDiff=curExp-prevExp,incDiff=curInc-prevInc;
  function legItem(c,l){return '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:'+c+'"></span>'+l+'</span>';}
  var hasInvAccount=accounts.some(function(a){return isAccountInvestment(a.id);});
  var hasInvOps=(investmentOperations||[]).length>0||investmentPositionList().length>0;
  var chartAccounts=accounts.slice();
  if(!hasInvAccount&&hasInvOps){
    var usedColors=accounts.map(function(a){return (a.color||'').toLowerCase();});
    var invColor=PALETTE.find(function(c){return usedColors.indexOf(c.toLowerCase())===-1;})||'#007AFF';
    chartAccounts.push({
      id:'__investments__',
      name:'Inversión',
      color:invColor,
      is_investment:true
    });
  }
  var isPriv=portfolioValueHidden();
  var visibleAccounts=chartAccounts.filter(function(a){
    return !isPriv || !(a.is_investment || a.id==='__investments__' || isAccountInvestment(a.id));
  });
  var lineLegend=visibleAccounts.length?visibleAccounts.map(function(a){return legItem(a.color,capEsc(a.name));}).join(''):legItem('#8E8E93','Sin datos');
  var incData=Array(12).fill(0),balIncData=Array(12).fill(0),expData=Array(12).fill(0),balExpData=Array(12).fill(0),savData=[];
  var yearTxs=_txByYearStr[String(chartYear)]||[];
  yearTxs.forEach(function(t){
    if(t.is_balance_adjustment)return;
    var m=parseInt(String(t.date).slice(5,7),10)-1;
    if(m>=0&&m<12){
      if(t.type==='income'){
        incData[m]+=txIncomeImpact(t);
        balIncData[m]+=txBalanceIncomeImpact(t);
      } else if(t.type==='expense'){
        expData[m]+=txExpenseImpact(t);
        balExpData[m]+=txBalanceExpenseImpact(t);
      }
    }
  });
  for(var m=0;m<12;m++)savData.push(balIncData[m]-balExpData[m]);
  var statsHtml='';
  var realNow=new Date(),realY=realNow.getFullYear(),realM=realNow.getMonth();
  // Excluye meses estrictamente futuros (transacciones adelantadas): un mes que
  // aún no ha llegado no cuenta para ninguna estadística.
  function isFutureMonth(i){return chartYear>realY||(chartYear===realY&&i>realM);}
  var monthsWithData=[];
  for(var mi=0;mi<12;mi++){if((incData[mi]>0||expData[mi]>0)&&!isFutureMonth(mi))monthsWithData.push(mi);}
  // "Meses cerrados": excluye el mes en curso Y cualquier mes futuro (año o mes
  // posterior al real), para que transacciones adelantadas no cuenten como cerradas.
  var pastMonthsWithData=monthsWithData.filter(function(i){return chartYear<realY||(chartYear===realY&&i<realM);});
  if(monthsWithData.length){
    var maxExpIdx=monthsWithData.reduce(function(a,b){return expData[b]>expData[a]?b:a;});
    var maxIncIdx=monthsWithData.reduce(function(a,b){return incData[b]>incData[a]?b:a;});
    var sumInc=monthsWithData.reduce(function(s,i){return s+incData[i];},0);
    var avgInc=sumInc/monthsWithData.length;
    var monthsLabel='sobre '+monthsWithData.length+' mes'+(monthsWithData.length===1?'':'es')+' con datos';
    var minExpHtml='',maxSavHtml='',avgExpHtml='',avgDailyTotalHtml='',savRateHtml='';
    if(pastMonthsWithData.length){
      var minExpIdx=pastMonthsWithData.reduce(function(a,b){return expData[b]<expData[a]?b:a;});
      var maxSavIdx=pastMonthsWithData.reduce(function(a,b){return savData[b]>savData[a]?b:a;});
      var sumExpPast=pastMonthsWithData.reduce(function(s,i){return s+expData[i];},0);
      var sumBalExpPast=pastMonthsWithData.reduce(function(s,i){return s+balExpData[i];},0);
      var sumBalIncPast=pastMonthsWithData.reduce(function(s,i){return s+balIncData[i];},0);
      var sumIncPast=pastMonthsWithData.reduce(function(s,i){return s+incData[i];},0);
      var avgExpPast=sumExpPast/pastMonthsWithData.length;
      var savAmount=sumBalIncPast-sumBalExpPast;
      var avgSavPast=pastMonthsWithData.length?(savAmount/pastMonthsWithData.length):0;
      var savRate=sumBalIncPast>0?savAmount/sumBalIncPast*100:null;
      var pastMonthsLabel='sobre '+pastMonthsWithData.length+' mes'+(pastMonthsWithData.length===1?'':'es')+' cerrado'+(pastMonthsWithData.length===1?'':'s');
      var daysInPastMonths=pastMonthsWithData.reduce(function(s,i){return s+new Date(chartYear,i+1,0).getDate();},0);
      var avgDailyTotal=daysInPastMonths>0?sumExpPast/daysInPastMonths:null;
      minExpHtml='<div class="stat-card"><div class="stat-label">Mes menos gastado</div><div class="stat-val" style="color:var(--red)">'+fmtPrivacy(expData[minExpIdx])+'</div><div class="stat-sub">'+capitalize(MONTHS[minExpIdx])+'</div></div>';
      maxSavHtml='<div class="stat-card"><div class="stat-label">Mes con más ahorro</div><div class="stat-val" style="color:'+(savData[maxSavIdx]>=0?'var(--green)':'var(--red)')+'">'+(isPrivacyMode()?'••••••':((savData[maxSavIdx]>=0?'+':'−')+fmt(Math.abs(savData[maxSavIdx]))))+'</div><div class="stat-sub">'+capitalize(MONTHS[maxSavIdx])+'</div></div>';
      avgExpHtml='<div class="stat-card"><div class="stat-label">Gasto medio mensual</div><div class="stat-val">'+fmtPrivacy(avgExpPast)+'</div><div class="stat-sub">'+pastMonthsLabel+'</div></div>';
      avgDailyTotalHtml=(avgDailyTotal!=null?'<div class="stat-card"><div class="stat-label">Gasto diario medio</div><div class="stat-val">'+fmtPrivacy(avgDailyTotal)+'</div><div class="stat-sub">'+pastMonthsLabel+'</div></div>':'');
      savRateHtml=(savRate!=null?'<div class="stat-card wide"><div><div class="stat-label">Tasa de ahorro media</div><div class="stat-sub">(ingresos − gastos) / ingresos</div></div><div class="stat-val" style="color:'+(savRate>=0?'var(--green)':'var(--red)')+'">'+savRate.toFixed(1).replace('.',',')+'% ('+(isPrivacyMode()?'••••••':((avgSavPast>=0?'+':'−')+fmt(Math.abs(avgSavPast))))+')</div></div>':'');
    }
    var curMonthDailyHtml='';
    if(chartYear===realY){
      var curDay=realNow.getDate();
      var curPrefix=realY+'-'+pad(realM+1);
      var curMonthPool=_txByMonthStr[curPrefix]||[];
      var curMonthExpToDate=curMonthPool.filter(function(t){return dayOf(t.date)<=curDay;}).reduce(function(s,t){return s+txExpenseImpact(t);},0);
      var avgDailyCur=curMonthExpToDate/curDay;
      curMonthDailyHtml='<div class="stat-card"><div class="stat-label">Gasto diario medio (mes en curso)</div><div class="stat-val">'+fmtPrivacy(avgDailyCur)+'</div><div class="stat-sub">sobre '+curDay+' día'+(curDay===1?'':'s')+'</div></div>';
    }
    statsHtml='<div class="stat-title">Estadísticas del año</div>'
      +'<div class="stat-grid">'
      +curMonthDailyHtml
      +avgDailyTotalHtml
      +avgExpHtml
      +'<div class="stat-card"><div class="stat-label">Ingreso medio mensual</div><div class="stat-val">'+fmtPrivacy(avgInc)+'</div><div class="stat-sub">'+monthsLabel+'</div></div>'
      +'<div class="stat-card"><div class="stat-label">Mes más gastado</div><div class="stat-val" style="color:var(--red)">'+fmtPrivacy(expData[maxExpIdx])+'</div><div class="stat-sub">'+capitalize(MONTHS[maxExpIdx])+'</div></div>'
      +minExpHtml
      +maxSavHtml
      +'<div class="stat-card"><div class="stat-label">Mes con más ingresos</div><div class="stat-val" style="color:var(--green)">'+fmtPrivacy(incData[maxIncIdx])+'</div><div class="stat-sub">'+capitalize(MONTHS[maxIncIdx])+'</div></div>'
      +savRateHtml
      +'</div>';
  }
  var prevIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var nextIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var upArrowSvg='<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><polyline points="18 15 12 9 6 15"/></svg>';
  var downArrowSvg='<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><polyline points="6 9 12 15 18 9"/></svg>';
  var annualSubView = window._annualSubView || 'charts';
  el.innerHTML='<div class="annual-wrap">'
    +'<div class="chart-year-nav"><button class="nav-btn" data-action="chart-year" data-delta="-1" aria-label="Año anterior">'+prevIcon+'</button><div class="chart-year-label">'+chartYear+'</div><button class="nav-btn" data-action="chart-year" data-delta="1" aria-label="Año siguiente">'+nextIcon+'</button></div>'
    +'<div class="annual-nav-pills">'
    +'<button class="annual-pill'+(annualSubView==='charts'?' active':'')+'" id="apCharts" data-action="set-annual-view" data-mode="charts">Evolución</button>'
    +'<button class="annual-pill'+(annualSubView==='stats'?' active':'')+'" id="apStats" data-action="set-annual-view" data-mode="stats">Estadísticas</button>'
    +'</div>'
    +'<div id="annualSecCharts" style="display:'+(annualSubView==='charts'?'block':'none')+'">'
    +'<div class="compare-grid">'
    +'<div class="compare-card"><div class="compare-label">Gastos</div><div class="compare-val" style="color:var(--red)">'+fmtPrivacy(curExp)+'</div><div class="compare-diff" style="color:'+(expDiff>0?'var(--red)':'var(--green)')+'">'+(expDiff>0?upArrowSvg:downArrowSvg)+fmtPrivacy(Math.abs(expDiff))+' · vs '+prevExpCutoff+' '+MONTHS_S[prevM]+'</div></div>'
    +'<div class="compare-card"><div class="compare-label">Ingresos</div><div class="compare-val" style="color:var(--green)">'+fmtPrivacy(curInc)+'</div><div class="compare-diff" style="color:'+(incDiff>=0?'var(--green)':'var(--red)')+'">'+(incDiff>=0?upArrowSvg:downArrowSvg)+fmtPrivacy(Math.abs(incDiff))+' · vs '+MONTHS_S[prevM]+'</div></div>'
    +'</div>'
    +'<div class="chart-card"><div class="chart-card-title">Ingresos vs gastos mensuales</div><canvas id="barChartCanvas"></canvas><div class="chart-legend">'+legItem('#34C759','Ingresos')+legItem('#FF3B30','Gastos')+legItem('#FF9500','Ahorro')+'</div></div>'
    +'<div class="chart-card"><div class="chart-card-title">Evolución del patrimonio</div><canvas id="lineChartCanvas"></canvas><div class="chart-legend">'+lineLegend+'</div></div>'
    +'</div>'
    +'<div id="annualSecStats" style="display:'+(annualSubView==='stats'?'block':'none')+'">'
    +statsHtml
    +'</div>'
    +'</div>';
  animateTabEntrance(el,'.chart-year-nav,.annual-nav-pills,.chart-card,.compare-grid,.stat-title,.stat-grid');
  drawBarChart(document.getElementById('barChartCanvas'),incData,expData,savData);
  var lineLabels=MONTHS_S.slice();
  ensureTxIndices();
  var series=visibleAccounts.map(function(a){
    var isInv=isAccountInvestment(a.id)||a.id==='__investments__'||!!a.is_investment;
    var dates=[];
    if(isInv){
      var invOps=(investmentOperations||[]).filter(function(o){return a.id==='__investments__'||o.investment_account_id===a.id||o.cash_account_id===a.id||!o.investment_account_id;});
      if(invOps.length){
        var minOp=invOps.reduce(function(min,o){return (!min||o.operation_date<min)?o.operation_date:min;},'');
        if(minOp)dates.push(minOp);
      }
      var accTxs=_txByAccount[a.id]||[];
      if(accTxs.length){
        var minTx=accTxs.reduce(function(min,t){return (!min||t.date<min)?t.date:min;},'');
        if(minTx)dates.push(minTx);
      }
      if(!dates.length&&(investmentOperations||[]).length){
        var anyOp=(investmentOperations||[]).reduce(function(min,o){return (!min||o.operation_date<min)?o.operation_date:min;},'');
        if(anyOp)dates.push(anyOp);
      }
    }else{
      var hist=accountHistory(a.id);
      var accTxs=_txByAccount[a.id]||[];
      var invOps=(investmentOperations||[]).filter(function(o){return o.cash_account_id===a.id;});
      if(hist.length){
        var d0=hist[0].reset_date||lastDayOfMonthStr(hist[0].year,hist[0].month);
        if(d0)dates.push(d0);
      }
      if(accTxs.length){
        var minTx=accTxs.reduce(function(min,t){return (!min||t.date<min)?t.date:min;},'');
        if(minTx)dates.push(minTx);
      }
      if(invOps.length){
        var minOp=invOps.reduce(function(min,o){return (!min||o.operation_date<min)?o.operation_date:min;},'');
        if(minOp)dates.push(minOp);
      }
    }
    dates.sort();
    var firstDate=dates[0]||'';
    return {
      label:capitalize(a.name),
      color:a.color,
      data:Array.from({length:12},function(_,m){
        var endOfMonth=lastDayOfMonthStr(chartYear,m+1);
        if(firstDate && endOfMonth<firstDate.slice(0,7)+'-01')return null;
        if(isInv){
          var pVal=investmentPortfolioValueAsOf(a.id==='__investments__'?null:a.id,endOfMonth);
          if(pVal!==null)return pVal;
          if(chartYear===realY&&m>=(realNow.getMonth())){
            var curVal=investmentPortfolioValueAsOf(null,todayStr());
            if(curVal!==null)return curVal;
          }
          return firstDate?0:null;
        }
        return accountCalcBalanceAsOf(a.id,endOfMonth);
      })
    };
  });
  drawLineChart(document.getElementById('lineChartCanvas'),series,lineLabels);
  window._lastAnnualIncData=incData; window._lastAnnualExpData=expData; window._lastAnnualSavData=savData; window._lastAnnualSeries=series;
}

function setAnnualView(v){
  if(v==='compare') v='charts';
  window._annualSubView=v;
  saveUiState();
  ['Charts','Stats'].forEach(function(k){
    var pill=document.getElementById('ap'+k);if(pill)pill.classList.toggle('active',v.toLowerCase()===k.toLowerCase());
    var sec=document.getElementById('annualSec'+k);if(sec)sec.style.display=(v.toLowerCase()===k.toLowerCase())?'block':'none';
  });
  if(v==='charts'){
    var bc=document.getElementById('barChartCanvas'),lc=document.getElementById('lineChartCanvas');
    if(bc)delete bc._barSig;
    if(lc)delete lc._lineSig;
    if(bc&&window._lastAnnualIncData)drawBarChart(bc,window._lastAnnualIncData,window._lastAnnualExpData,window._lastAnnualSavData);
    if(lc&&window._lastAnnualSeries)drawLineChart(lc,window._lastAnnualSeries,MONTHS_S.slice());
  }
}

// SETTINGS TAB
function renderSettingsTab(el){
  var email=currentUser?currentUser.email:'—';
  var lastBackup=currentUser?localStorage.getItem('ft_last_backup_'+currentUser.id):null;
  var curTheme=document.documentElement.getAttribute('data-theme')||'system';
  var themeOpts=[{v:'system',label:'Sistema'},{v:'light',label:'Claro'},{v:'dark',label:'Oscuro'}];

  el.innerHTML='<div class="settings-wrap" style="display:flex;flex-direction:column;gap:20px">'
    +'<div class="settings-section"><div class="settings-title">Versión y sincronización</div><div class="settings-info">fintrack <strong>'+APP_VERSION+'</strong><br><span style="font-size:12px;color:var(--text3)">Último commit: <span id="appPublishedAt">consultando…</span></span></div><div style="display:flex;flex-direction:column;gap:8px"><button class="settings-btn" data-action="open-sync-tray" style="border-radius:20px;display:flex;align-items:center;justify-content:space-between;"><span style="display:inline-flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>Bandeja de sincronización offline</span><span class="sync-tray-count-badge" style="display:none;background:var(--amber);color:#000;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;"></span><span class="btn-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button><button class="settings-btn" data-action="force-sync" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Sincronizar ahora</button><button class="settings-btn" data-action="clear-local-cache" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Limpiar caché local y resincronizar</button></div><div class="status-msg" id="syncStatusMsg"></div></div>'
    +'<div class="settings-section"><div class="settings-title">Apariencia</div><div class="theme-switch-row">'
    +themeOpts.map(function(o){return '<button class="theme-switch-btn'+(curTheme===o.v?' active':'')+'" data-action="set-theme" data-mode="'+o.v+'">'+o.label+'</button>';}).join('')
    +'</div></div>'
    +'<div class="settings-section"><div class="settings-title">Exportar datos</div><button class="settings-btn" data-action="open-export-modal" style="display:flex;align-items:center;justify-content:space-between;"><span style="display:inline-flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Exportar movimientos (PDF · Excel · CSV)</span><span class="btn-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button><button class="settings-btn" data-action="open-export-modal" data-mode="year" style="display:flex;align-items:center;justify-content:space-between;"><span style="display:inline-flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Exportar informe anual (PDF)</span><span class="btn-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button><button class="settings-btn" data-action="send-monthly-report" style="display:flex;align-items:center;justify-content:space-between;"><span style="display:inline-flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Enviar resumen mensual a mi correo</span><span class="btn-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button><button class="settings-btn" data-action="export-json" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>Exportar copia completa JSON</button></div>'
    +'<div class="settings-section"><div class="settings-title">Copia de Seguridad</div><div class="settings-info">Las copias se crean automáticamente cada cinco días y se conservan las tres últimas.'+(lastBackup?'<br>Última copia local: '+new Date(lastBackup).toLocaleDateString('es-ES'):'')+'<div id="cloudBackupStatus" style="margin-top:6px;font-size:12px;color:var(--text3)">Copia en la nube: consultando…</div></div><button class="settings-btn" data-action="download-backup" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar copia ahora</button><input id="importJSONFile" type="file" accept=".json,.json.gz,application/json,application/gzip" style="display:none" data-change="import-json-file"><button class="settings-btn" data-action="trigger-import-json" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Importar JSON</button><div class="status-msg" id="importStatus"></div><button class="settings-btn" data-action="restore-backup" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Restaurar última copia</button></div>'
    +'<div class="settings-section"><div class="settings-title">Cuenta</div><div class="settings-info">'+email+'</div><button class="settings-btn danger" data-action="sign-out" style="display:flex;align-items:center;justify-content:space-between;"><span>Cerrar sesión</span><span class="btn-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button></div>'
    +'<div class="settings-section"><div class="settings-title">Zona de peligro</div><button class="settings-btn danger" data-action="clear-txs" style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Borrar todas las transacciones</button></div>'
    +'<div style="text-align:center;padding:16px 0;font-size:11px;font-family:var(--mono);color:var(--text3)">fintrack · '+email+'</div>'
    +'</div>';
  setTimeout(function(){loadLatestCommitTime();loadCloudBackupStatus();},0);
}
async function sendMonthlyReportEmail(monthStr){
  if(!currentUser||!currentUser.email){
    alert('Debes iniciar sesión para recibir el resumen por correo');
    return;
  }
  var m=monthStr||(viewYear+'-'+pad(viewMonth+1));
  setSync('syncing');
  showSuccessToast('Enviando resumen de '+m+' a '+currentUser.email+'…');
  try{
    var sessRes=await sb.auth.getSession();
    var session=sessRes&&sessRes.data&&sessRes.data.session;
    if(!session||!session.access_token){
      var ref=await sb.auth.refreshSession();
      session=ref&&ref.data&&ref.data.session;
    }
    var token=session?session.access_token:'';
    var res=await sb.functions.invoke('monthly-report',{
      headers:token?{Authorization:'Bearer '+token}:{},
      body:{month:m,preview:false,access_token:token}
    });
    if(res.error||!res.data||res.data.ok===false){
      var errMsg=res.data&&res.data.error;
      if(!errMsg&&res.error){
        try{
          if(res.response&&typeof res.response.json==='function'){
            var ej=await res.response.json();
            errMsg=ej.error||ej.message;
          }else if(res.error.context&&typeof res.error.context.json==='function'){
            var ej2=await res.error.context.json();
            errMsg=ej2.error||ej2.message;
          }
        }catch(_){}
        if(!errMsg)errMsg=res.error.message;
      }
      alert('No se pudo enviar el resumen mensual: '+(errMsg||'Error desconocido'));
      setSync('err');
      return;
    }
    setSync('ok');
    showSuccessToast('Resumen mensual de '+m+' enviado a '+currentUser.email);
  }catch(err){
    console.error('Error al invocar monthly-report:',err);
    alert('Error al enviar el resumen mensual: '+(err.message||err));
    setSync('err');
  }
}
async function loadCloudBackupStatus(){
  var el=document.getElementById('cloudBackupStatus');if(!el||!currentUser)return;
  try{
    var r=await sb.functions.invoke('automatic-backup',{body:{action:'status'}});
    var latest=r.data&&r.data.latest;
    if(latest&&latest.status==='completed'&&latest.created_at){
      var days=Math.floor((Date.now()-new Date(latest.created_at).getTime())/(1000*60*60*24));
      el.innerHTML='<span style="color:var(--green);display:inline-flex;align-items:center;gap:4px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copia en la nube:</span> '+new Date(latest.created_at).toLocaleDateString('es-ES')+' '+(days===0?'(hoy)':days===1?'(ayer)':'(hace '+days+' días)');
    } else if(latest&&latest.status==='failed'){
      el.innerHTML='<span style="color:var(--red);display:inline-flex;align-items:center;gap:4px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Último intento en la nube falló</span> ('+new Date(latest.created_at).toLocaleDateString('es-ES')+')';
    } else {
      el.textContent='Copia en la nube: programada periódicamente';
    }
  }catch(e){
    el.textContent='Copia en la nube: automática cada 5 días';
  }
}
function backupPreviewCounts(data){return {cuentas:(data.accounts||[]).length,categorías:(data.categories||[]).length,transacciones:(data.transactions||[]).length,presupuestos:(data.budgets||[]).length,ajustes:(data.patrimony||[]).length,operaciones_de_inversión:(data.investmentOperations||[]).length};}
function confirmCriticalAction(options){
  return new Promise(function(resolve){
    var lastTrigger=document.activeElement;
    var root=document.createElement('div');
    root.className='critical-confirm-bg';
    var countHtml=Object.keys(options.counts||{}).filter(function(k){return Number(options.counts[k])>0;}).map(function(k){return '<span><b>'+Number(options.counts[k]).toLocaleString('es-ES')+'</b> '+htmlEscape(k.replace(/_/g,' '))+'</span>';}).join('');
    root.innerHTML='<div class="critical-confirm-card" role="dialog" aria-modal="true" aria-labelledby="criticalConfirmTitle"><div class="critical-confirm-handle"></div><div class="critical-confirm-kicker">Confirmación de seguridad</div><h3 id="criticalConfirmTitle">'+htmlEscape(options.title)+'</h3><p>'+htmlEscape(options.description)+'</p>'+(countHtml?'<div class="critical-confirm-counts">'+countHtml+'</div>':'')+'<label class="critical-confirm-input"><span>Escribe <b>'+htmlEscape(options.phrase)+'</b> para continuar</span><input autocomplete="off" autocapitalize="characters"></label><div class="critical-confirm-actions"><button type="button" class="critical-confirm-cancel">Cancelar</button><button type="button" class="critical-confirm-approve" disabled>'+htmlEscape(options.approveLabel)+'</button></div></div>';
    document.body.appendChild(root);
    lockBodyScroll();
    var input=root.querySelector('input'),approve=root.querySelector('.critical-confirm-approve');
    function close(value){
      window.removeEventListener('keydown',onKeyDown);
      root.remove();
      unlockBodyScroll();
      if(lastTrigger&&typeof lastTrigger.focus==='function')try{lastTrigger.focus();}catch(e){}
      resolve(value);
    }
    function onKeyDown(e){if(e.key==='Escape'){e.preventDefault();close(false);}}
    window.addEventListener('keydown',onKeyDown);
    input.oninput=function(){approve.disabled=input.value.trim().toUpperCase()!==options.phrase;};
    root.querySelector('.critical-confirm-cancel').onclick=function(){close(false);};
    approve.onclick=function(){close(true);};
    root.onclick=function(event){if(event.target===root)close(false);};
    setTimeout(function(){input.focus();},60);
  });
}
async function createSafetyBackup(reason){var result=await sb.functions.invoke('automatic-backup',{body:{reason:reason||'manual'}});if(result.error||!result.data||!result.data.ok)throw new Error((result.data&&result.data.error)||result.error&&result.error.message||'No se pudo crear la copia previa');return result.data.backup;}
async function restoreLatestBackup(){setSync('syncing');var preview=await sb.functions.invoke('restore-backup',{body:{action:'preview'}});if(preview.error||!preview.data||!preview.data.ok){alert((preview.data&&preview.data.error)||preview.error&&preview.error.message||'No se pudo preparar la vista previa');setSync('err');return;}setSync('ok');var p=preview.data.preview,accepted=await confirmCriticalAction({title:'Restaurar última copia',description:'Se sustituirán los datos actuales por la copia del '+new Date(p.created_at).toLocaleString('es-ES')+'. Antes se guardará automáticamente una copia de tu estado actual.',counts:p.counts,phrase:'RESTAURAR',approveLabel:'Restaurar copia'});if(!accepted)return;setSync('syncing');var r=await sb.functions.invoke('restore-backup',{body:{action:'restore'}});if(r.error||!r.data||!r.data.ok){alert((r.data&&r.data.error)||r.error&&r.error.message||'No se pudo restaurar la copia');setSync('err');return;}await loadData();showSuccessToast('Copia restaurada correctamente');}
// TX MODAL - CÁLCULO TRI-ESTADO
var txCalcMode=0; // 0: Computar todo, 1: Solo balance, 2: No computa
function updateTxCalcPill(mode){
  txCalcMode=(mode===1||mode===2)?mode:0;
  var btn=document.getElementById('txExcludeCalcBtn');
  var icon=document.getElementById('txCalcPillIcon');
  var label=document.getElementById('txCalcPillLabel');
  var sub=document.getElementById('txCalcPillSub');
  if(!btn)return;
  btn.setAttribute('data-mode',String(txCalcMode));
  if(txCalcMode===1){
    if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg>';
    if(label)label.textContent='Solo balance';
    if(sub)sub.textContent='Fuera de gastos';
    btn.setAttribute('title','Solo computa en balance (fuera de presupuestos y donut)');
  } else if(txCalcMode===2){
    if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
    if(label)label.textContent='No computa';
    if(sub)sub.textContent='Ni gastos ni bal.';
    btn.setAttribute('title','No computa ni en gastos ni en balance mensual');
  } else {
    if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    if(label)label.textContent='Computar todo';
    if(sub)sub.textContent='Gastos y balance';
    btn.setAttribute('title','Computa en gastos y en balance mensual');
  }
}
function setTxCalcMode(mode){
  updateTxCalcPill(mode);
}
function cycleTxCalcMode(){
  var next=(txCalcMode+1)%3;
  setTxCalcMode(next);
}
function sanitizeRemoteTxPayload(p){
  if(!p||typeof p!=='object')return p;
  var clone=Object.assign({},p);
  delete clone.exclude_from_calc;
  delete clone.created_at;
  return clone;
}
function lockBodyScroll(){
  document.body.classList.add('modal-open');
}
function unlockBodyScroll(){
  var vis=document.querySelectorAll('.modal-bg.visible, .critical-confirm-bg, .investment-trade-modal, .asset-sheet');
  if(!vis||vis.length===0){
    document.body.classList.remove('modal-open');
  }
}

var _pickerYear=2026;
function openMonthModal(){
  _pickerYear=viewYear||new Date().getFullYear();
  renderMonthPickerGrid();
  var bg=document.getElementById('monthModalBg');
  if(bg){
    bg.classList.add('visible');
    bg.setAttribute('aria-hidden','false');
    lockBodyScroll();
  }
}
function closeMonthModal(){
  var bg=document.getElementById('monthModalBg');
  if(bg){
    bg.classList.remove('visible');
    bg.setAttribute('aria-hidden','true');
    unlockBodyScroll();
  }
}
function changePickerYear(delta){
  _pickerYear+=delta;
  renderMonthPickerGrid();
}
function selectPickerMonth(mIndex){
  homeAnnualMode=false;
  viewYear=_pickerYear;
  viewMonth=mIndex;
  activeCatId=null;
  dtActiveCat=null;
  hmSelDay=null;
  filterDateFrom='';
  filterDateTo='';
  saveUiState();
  closeMonthModal();
  if(IS_DESKTOP){if(typeof dtRender==='function')dtRender();}
  else{refreshTab();}
}
function selectPickerWholeYear(){
  homeAnnualMode=true;
  viewYear=_pickerYear;
  activeCatId=null;
  dtActiveCat=null;
  hmSelDay=null;
  filterDateFrom='';
  filterDateTo='';
  saveUiState();
  closeMonthModal();
  if(IS_DESKTOP){if(typeof dtRender==='function')dtRender();}
  else{refreshTab();}
}
function jumpToCurrentMonth(){
  var now=new Date();
  _pickerYear=now.getFullYear();
  selectPickerMonth(now.getMonth());
}
function renderMonthPickerGrid(){
  var yEl=document.getElementById('pickerYearLabel');
  if(yEl)yEl.textContent=''+_pickerYear;
  var grid=document.getElementById('pickerMonthGrid');
  if(!grid)return;
  var now=new Date();
  var curY=now.getFullYear(),curM=now.getMonth();
  var html='';
  for(var i=0;i<12;i++){
    var isSel=(!homeAnnualMode&&viewYear===_pickerYear&&viewMonth===i);
    var isCurrent=(curY===_pickerYear&&curM===i);
    var cls='month-picker-btn'+(isSel?' active':'')+(isCurrent?' current-month':'');
    html+='<button type="button" class="'+cls+'" data-action="select-picker-month" data-id="'+i+'">'
      +capitalize(MONTHS_S[i])
      +'</button>';
  }
  grid.innerHTML=html;
}

var lastModalTrigger=null;
function updateTxTagsBtn(){
  var btn=document.getElementById('txTagsBtn'),lbl=document.getElementById('txTagsBtnLabel');
  var userCount=txTags.filter(function(g){return g&&g.charAt(0)!=='_';}).length;
  if(lbl)lbl.textContent=userCount?('Etiquetas ('+userCount+')'):'Etiquetas';
  var drawer=document.getElementById('txTagsDrawer');
  var isOpen=!!(drawer&&drawer.style.display!=='none');
  if(btn)btn.classList.toggle('active',userCount>0||isOpen);
}
function toggleTxTagsDrawer(){
  var drawer=document.getElementById('txTagsDrawer'),btn=document.getElementById('txTagsBtn');
  if(!drawer)return;
  var open=drawer.style.display==='none';
  drawer.style.display=open?'block':'none';
  if(btn)btn.setAttribute('aria-expanded',open?'true':'false');
  updateTxTagsBtn();
  if(open){var inp=document.getElementById('tagInput');if(inp)inp.focus();}
}
function renderQuickCatPills(){
  var wrap=document.getElementById('txQuickCatsWrap'),scroll=document.getElementById('txQuickCats');
  if(!wrap||!scroll)return;
  if(txType==='transfer'){wrap.style.display='none';scroll.innerHTML='';return;}
  var avail=categories.filter(function(c){return !c.archived&&(!c.kind||c.kind===txType);});
  if(!avail.length){wrap.style.display='none';scroll.innerHTML='';return;}
  var freq={};
  transactions.forEach(function(t){if(t&&!t.is_balance_adjustment&&t.type===txType&&t.category)freq[t.category]=(freq[t.category]||0)+1;});
  var top=avail.slice().sort(function(a,b){
    var fa=freq[a.id]||0,fb=freq[b.id]||0;
    if(fb!==fa)return fb-fa;
    return avail.indexOf(a)-avail.indexOf(b);
  }).slice(0,5);
  var sel=document.getElementById('txCat');
  var curVal=sel?sel.value:'';
  scroll.innerHTML=top.map(function(c){
    return '<button type="button" class="tx-quick-pill'+(c.id===curVal?' active':'')+'" data-cat-id="'+htmlEscape(c.id)+'" style="--pill-color:'+c.color+'">'+catIconSvg(c,14)+'<span>'+capEsc(c.name)+'</span></button>';
  }).join('');
  wrap.style.display='block';
  scroll.onclick=function(e){
    var pill=e.target.closest&&e.target.closest('.tx-quick-pill[data-cat-id]');
    if(!pill)return;
    var cid=pill.getAttribute('data-cat-id');
    var catSel=document.getElementById('txCat');
    if(catSel){catSel.value=cid;populateSubcats();updateQuickCatPillsActive();}
  };
}
function updateQuickCatPillsActive(){
  var sel=document.getElementById('txCat'),curVal=sel?sel.value:'';
  document.querySelectorAll('#txQuickCats .tx-quick-pill[data-cat-id]').forEach(function(p){
    p.classList.toggle('active',p.getAttribute('data-cat-id')===curVal);
  });
}
function openModal(){
  lastModalTrigger=document.activeElement;
  editingTxId=null;txTags=[];isRecurring=false;setTxCalcMode(0);
  document.getElementById('modalTitle').textContent='Nueva transacción';
  var _dn=new Date();document.getElementById('txDate').value=_dn.getFullYear()+'-'+pad(_dn.getMonth()+1)+'-'+pad(_dn.getDate());
  document.getElementById('txAmount').value='';document.getElementById('txNote').value='';
  document.getElementById('modalStatus').textContent='';
  document.getElementById('recurringSwitch').classList.remove('on');
  document.getElementById('recurringOptions').style.display='none';
  document.getElementById('recurInterval').value='monthly';document.getElementById('recurEndDate').value='';
  var tagsDrw=document.getElementById('txTagsDrawer');if(tagsDrw)tagsDrw.style.display='none';
  var tagsBtn=document.getElementById('txTagsBtn');if(tagsBtn)tagsBtn.setAttribute('aria-expanded','false');
  var initType=(activeTab===2)?'transfer':'expense';
  setType(initType);populateCats();populateSubcats();populateAccounts();populateTransferAccounts();renderTagsInput();updateQuickCatPillsActive();
  document.getElementById('modalBg').classList.add('visible');
  document.getElementById('modalBg').setAttribute('aria-hidden','false');
  document.getElementById('fabBtn').classList.add('open');
  lockBodyScroll();
  setTimeout(function(){document.getElementById('txAmount').focus();},300);
}
function editTx(id){
  lastModalTrigger=document.activeElement;
  var tx=transactions.find(function(t){return t.id===id;});if(!tx)return;
  if(tx.is_balance_adjustment){showUndoToast('Las actualizaciones de saldo se gestionan desde la pestaña Cuentas');return;}
  if(isAccountInvestment(tx.account_id)||isAccountInvestment(tx.to_account_id)||(Array.isArray(tx.tags)&&(tx.tags.includes('invest_operation')||tx.tags.includes('invest_buy')||tx.tags.includes('invest_sell')))||investmentOperations.some(function(op){return op.transaction_id===tx.id;})){
    showUndoToast('Las operaciones de inversión se gestionan y editan desde la pestaña Inversión');
    return;
  }
  editingTxId=id;txTags=Array.isArray(tx.tags)?tx.tags.slice():[];isRecurring=!!tx.recurring;setTxCalcMode(getTxCalcMode(tx));
  document.getElementById('modalTitle').textContent='Editar transacción';
  setType(tx.type);populateCats();
  if(tx.type==='transfer'){
    document.getElementById('txFromAccount').value=tx.account_id||'';
    document.getElementById('txToAccount').value=tx.to_account_id||'';
  } else {
    document.getElementById('txCat').value=tx.category;populateSubcats();
    if(tx.subcategory)document.getElementById('txSubcat').value=tx.subcategory;
    populateAccounts();document.getElementById('txAccount').value=tx.account_id||'';
    updateQuickCatPillsActive();
  }
  document.getElementById('txAmount').value=tx.amount;document.getElementById('txNote').value=tx.note||'';document.getElementById('txDate').value=tx.date;
  document.getElementById('recurringSwitch').classList.toggle('on',isRecurring);
  document.getElementById('recurringOptions').style.display=isRecurring?'block':'none';
  document.getElementById('recurInterval').value=tx.recur_interval||'monthly';
  document.getElementById('recurEndDate').value=tx.recur_end_date||'';
  var tagsDrw=document.getElementById('txTagsDrawer');if(tagsDrw)tagsDrw.style.display='none';
  var tagsBtn=document.getElementById('txTagsBtn');if(tagsBtn)tagsBtn.setAttribute('aria-expanded','false');
  document.getElementById('modalStatus').textContent='';renderTagsInput();
  document.getElementById('modalBg').classList.add('visible');
  document.getElementById('modalBg').setAttribute('aria-hidden','false');
  lockBodyScroll();
}
function trapFocus(container,e){
  if(e.key!=='Tab')return;
  var focusables=container.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if(!focusables.length)return;
  var first=focusables[0],last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function closeModal(){
  document.getElementById('modalBg').classList.remove('visible');document.getElementById('modalBg').setAttribute('aria-hidden','true');document.getElementById('fabBtn').classList.remove('open');if(lastModalTrigger&&document.contains(lastModalTrigger))lastModalTrigger.focus();editingTxId=null;
  unlockBodyScroll();
}
function setType(t){
  txType=t;
  document.getElementById('typeExp').className='type-btn'+(t==='expense'?' active-exp':'');
  document.getElementById('typeInc').className='type-btn'+(t==='income'?' active-inc':'');
  document.getElementById('typeTra').className='type-btn'+(t==='transfer'?' active-tra':'');
  var isTra=t==='transfer';
  document.getElementById('txCatWrap').style.display=isTra?'none':'block';
  document.getElementById('txRecurWrap').style.display=isTra?'none':'block';
  document.getElementById('txTransferWrap').style.display=isTra?'block':'none';
  var qWrap=document.getElementById('txQuickCatsWrap');if(qWrap)qWrap.style.display=isTra?'none':'block';
  var excWrap=document.getElementById('txExcludeCalcWrap');if(excWrap)excWrap.style.display=isTra?'none':'block';
  var accGrid=document.getElementById('txAccDateGrid');
  if(isTra){
    document.getElementById('txAccWrap').style.display='none';
    if(accGrid)accGrid.classList.add('single-col');
    populateTransferAccounts();
  } else {
    populateAccounts();populateCats();populateSubcats();renderQuickCatPills();
  }
}
function populateTransferAccounts(){
  var opts=accounts.map(function(a){return '<option value="'+a.id+'">'+capEsc(a.name)+'</option>';}).join('');
  var from=document.getElementById('txFromAccount'),to=document.getElementById('txToAccount');
  from.innerHTML=opts;to.innerHTML=opts;
  if(accounts.length>1)to.value=accounts[1].id;
}
function swapTransferAccounts(){
  var from=document.getElementById('txFromAccount'),to=document.getElementById('txToAccount');
  if(!from||!to)return;
  var tmp=from.value;from.value=to.value;to.value=tmp;
}
function populateCats(){
  var editing=editingTxId&&transactions.find(function(t){return t.id===editingTxId;});
  var selectedId=editing&&editing.category;
  var opts=categories.filter(function(c){var matchKind=!c.kind||c.kind===txType;return (!c.archived||c.id===selectedId)&&matchKind;}).map(function(c){return '<option value="'+c.id+'">'+capEsc(c.name)+(c.archived?' (archivada)':'')+'</option>';}).join('');
  opts+='<option value="__new_cat__">+ Nueva categoría...</option>';
  document.getElementById('txCat').innerHTML=opts;
}
function onTxCatChange(){
  var sel=document.getElementById('txCat');
  if(sel.value==='__new_cat__'){
    var name=prompt('Nombre de la nueva categoría:');
    if(name&&name.trim()){
      var newName=name.trim();
      var newCatId='cat_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      var newCat={id:newCatId,name:newName,color:'#34C759',icon:'tag',kind:txType,subcats:[],user_id:currentUser?currentUser.id:null};
      categories.push(newCat);
      if(isOffline){queueOp({type:'insert',table:'categories',data:newCat});}
      else{sb.from('categories').insert(newCat).catch(function(){queueOp({type:'insert',table:'categories',data:newCat});});}
      saveLocalCache();
      populateCats();
      sel.value=newCatId;
    } else {
      populateCats();
    }
  }
  populateSubcats();
  updateQuickCatPillsActive();
}
function populateSubcats(){
  var cat=catById(document.getElementById('txCat').value);
  var editing=editingTxId&&transactions.find(function(t){return t.id===editingTxId;});
  var subs=(cat.subcats||[]).slice();
  if(editing&&editing.category===cat.id&&editing.subcategory&&subs.indexOf(editing.subcategory)<0)subs.push(editing.subcategory);
  document.getElementById('txSubcat').innerHTML='<option value="">— Sin subcategoría</option>'+subs.map(function(s){return '<option value="'+htmlEscape(s)+'">'+capEsc(s)+'</option>';}).join('');
}
function populateAccounts(){
  var wrap=document.getElementById('txAccWrap');
  var accGrid=document.getElementById('txAccDateGrid');
  if(!accounts.length){wrap.style.display='none';if(accGrid)accGrid.classList.add('single-col');return;}
  wrap.style.display='block';
  if(accGrid)accGrid.classList.remove('single-col');
  var sel=document.getElementById('txAccount');
  var emptyOpt=accounts.length>1?'<option value="">— Selecciona cuenta</option>':'';
  sel.innerHTML=emptyOpt+accounts.map(function(a){return '<option value="'+a.id+'">'+capEsc(a.name)+'</option>';}).join('');
  if(!editingTxId){
    var def=getDefaultAccountId();
    if(def)sel.value=def;
    else if(accounts.length===1)sel.value=accounts[0].id;
  }
}
function toggleRecurring(){isRecurring=!isRecurring;document.getElementById('recurringSwitch').classList.toggle('on',isRecurring);document.getElementById('recurringOptions').style.display=isRecurring?'block':'none';}
function renderTagsInput(){
  var wrap=document.getElementById('tagsWrap');if(!wrap)return;
  var visibleCount=0;
  var chips=txTags.map(function(g,i){
    if(!g||g.charAt(0)==='_')return '';
    visibleCount++;
    return '<div class="tag-chip">'+htmlEscape(g)+'<button data-action="remove-tag" data-id="'+i+'" aria-label="Eliminar etiqueta" style="display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';
  }).join('');
  wrap.innerHTML=chips+'<input type="text" class="tags-text-input" id="tagInput" placeholder="'+(visibleCount?'':'vacaciones, regalo...')+'">';
  updateTxTagsBtn();
  document.getElementById('tagInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===','){e.preventDefault();var v=this.value.trim().toLowerCase();if(v&&v.charAt(0)!=='_'&&!txTags.includes(v)){txTags.push(v);renderTagsInput();}}
    else if(e.key==='Backspace'&&!this.value){for(var bi=txTags.length-1;bi>=0;bi--){if(txTags[bi]&&txTags[bi].charAt(0)!=='_'){txTags.splice(bi,1);renderTagsInput();break;}}}
  });
}
function showRecurEditDialog(){
  return new Promise(function(resolve){
    var overlay=document.createElement('div');
    overlay.className='critical-confirm-bg';
    overlay.style.zIndex='2000';
    overlay.innerHTML='<div class="critical-confirm-card" role="dialog" aria-modal="true">'
      +'<div class="critical-confirm-handle"></div>'
      +'<div class="critical-confirm-kicker" style="color:var(--brand-green)">Serie periódica</div>'
      +'<h3 style="font-size:20px;letter-spacing:-.4px;margin:6px 0 8px;">¿Cómo aplicar los cambios?</h3>'
      +'<p style="font-size:14px;color:var(--text2);margin-bottom:18px;line-height:1.4;">Puedes actualizar solo esta cuota o propagar los cambios a todas las futuras de la serie.</p>'
      +'<div style="display:flex;flex-direction:column;gap:8px;">'
      +'<button type="button" id="btnRecurFuture" style="background:var(--accent-grad);border:none;color:#fff;border-radius:20px;padding:13px;font:700 14px var(--font);cursor:pointer;">Esta y todas las futuras</button>'
      +'<button type="button" id="btnRecurSingle" style="background:var(--bg3);border:1px solid var(--card-border);color:var(--text);border-radius:20px;padding:13px;font:700 14px var(--font);cursor:pointer;">Solo esta transacción</button>'
      +'<button type="button" id="btnRecurCancel" style="background:none;border:none;color:var(--text3);padding:10px;font:600 13px var(--font);cursor:pointer;">Cancelar y volver</button>'
      +'</div></div>';
    document.body.appendChild(overlay);
    lockBodyScroll();
    function finish(choice){overlay.remove();unlockBodyScroll();resolve(choice);}
    overlay.querySelector('#btnRecurFuture').onclick=function(){finish('future');};
    overlay.querySelector('#btnRecurSingle').onclick=function(){finish('single');};
    overlay.querySelector('#btnRecurCancel').onclick=function(){finish('cancel');};
    overlay.onclick=function(e){if(e.target===overlay)finish('cancel');};
  });
}
async function syncRecurSeries(seriesId,editedId,fromDate,fields){
  if(!seriesId)return;
  var cleanFields=sanitizeRemoteTxPayload(fields);
  var siblings=transactions.filter(function(t){return t.recur_series_id===seriesId&&t.id!==editedId&&t.date>=fromDate;});
  siblings.forEach(function(t){Object.assign(t,cleanFields);});
  if(siblings.length)saveLocalCache();
  if(isOffline){
    siblings.forEach(function(t){queueOp({type:'update',table:'transactions',id:t.id,data:cleanFields});});
    return;
  }
  try{
    var r=await sb.from('transactions').update(cleanFields).eq('recur_series_id',seriesId).gte('date',fromDate).neq('id',editedId);
    if(r&&r.error){siblings.forEach(function(t){queueOp({type:'update',table:'transactions',id:t.id,data:cleanFields});});setSync('err');}
  }catch(ex){
    siblings.forEach(function(t){queueOp({type:'update',table:'transactions',id:t.id,data:cleanFields});});setSync('err');
  }
}
var isSaving=false;
async function saveTx(){
  if(isSaving)return;isSaving=true;
  var amount=parseCurrencyInput(document.getElementById('txAmount').value);
  var note=document.getElementById('txNote').value.trim()||null;
  var date=document.getElementById('txDate').value;
  var status=document.getElementById('modalStatus');
  if(!Number.isFinite(amount)||amount<=0){status.textContent='introduce un importe válido';status.className='modal-status status-err';isSaving=false;return;}
  amount=roundMoney(amount);
  if(!date){status.textContent='selecciona una fecha';status.className='modal-status status-err';isSaving=false;return;}
  var payload;
  if(txType==='transfer'){
    var fromAcc=document.getElementById('txFromAccount').value,toAcc=document.getElementById('txToAccount').value;
    if(!fromAcc||!toAcc||fromAcc===toAcc){status.textContent='elige dos cuentas distintas';status.className='modal-status status-err';isSaving=false;return;}
    if(!accounts.some(function(a){return a.id===fromAcc;})||!accounts.some(function(a){return a.id===toAcc;})){status.textContent='una de las cuentas ya no existe, vuelve a abrir el formulario';status.className='modal-status status-err';isSaving=false;return;}
    var existingTransferTx=editingTxId?transactions.find(function(t){return t.id===editingTxId;}):null;
    var preservedTransferTags=(existingTransferTx&&Array.isArray(existingTransferTx.tags))?existingTransferTx.tags.slice():[];
    payload={type:'transfer',amount:amount,category:'transfer',subcategory:null,note:note,date:date,recurring:false,recur_interval:null,recur_end_date:null,tags:preservedTransferTags,account_id:fromAcc,to_account_id:toAcc,exclude_from_calc:false};
  } else {
    var category=document.getElementById('txCat').value;
    if(!category){status.textContent='selecciona una categoría';status.className='modal-status status-err';isSaving=false;return;}
    var rawSub=document.getElementById('txSubcat').value||null;
    var selectedCat=catById(category);
    var subcategory=null;
    if(rawSub&&selectedCat&&Array.isArray(selectedCat.subcats)){
      var matchedSub=selectedCat.subcats.find(function(s){return s===rawSub||String(s).toLowerCase()===String(rawSub).toLowerCase();});
      if(matchedSub)subcategory=matchedSub;
      else if(editingTxId){
        var curEditTx=transactions.find(function(t){return t.id===editingTxId;});
        if(curEditTx&&curEditTx.category===category&&curEditTx.subcategory===rawSub)subcategory=rawSub;
      }
    }
    var tagVal=document.getElementById('tagInput').value.trim().toLowerCase();
    if(tagVal&&!txTags.includes(tagVal))txTags.push(tagVal);
    var recurInterval=isRecurring?document.getElementById('recurInterval').value:null;
    var recurEndDate=isRecurring?(document.getElementById('recurEndDate').value||null):null;
    if(recurEndDate&&recurEndDate<date){status.textContent='la fecha de fin no puede ser anterior al movimiento';status.className='modal-status status-err';isSaving=false;return;}
    var accWrap=document.getElementById('txAccWrap');
    var accountId=(accWrap.style.display!=='none'&&document.getElementById('txAccount').value)||null;
    if(accounts.length>1&&!accountId){
      status.textContent='selecciona una cuenta';status.className='modal-status status-err';isSaving=false;return;
    }
    if(accounts.length===1&&!accountId){
      accountId=accounts[0].id;
    }
    txTags=txTags.filter(function(g){return g!=='_no_calc'&&g!=='_no_expense';});
    if(txCalcMode===1){txTags.push('_no_expense');}
    else if(txCalcMode===2){txTags.push('_no_calc');}
    payload={type:txType,amount:amount,category:category,subcategory:subcategory,note:note,date:date,recurring:isRecurring,recur_interval:recurInterval,recur_end_date:recurEndDate,tags:txTags,account_id:accountId,to_account_id:null,exclude_from_calc:(txCalcMode===2)};
  }
  status.textContent='guardando...';status.className='modal-status';setSync('syncing');
  var queuedFallback=false;
  if(editingTxId){
    var oldTx=transactions.find(function(t){return t.id===editingTxId;});
    if(payload.recurring&&oldTx&&!oldTx.recurring&&!oldTx.recur_series_id)payload.recur_series_id='rs'+Date.now()+Math.random().toString(36).slice(2,6);
    var seriesIdForSync=payload.recur_series_id||(oldTx&&oldTx.recur_series_id);
    if(oldTx&&oldTx.recurring){
      var recurChoice=await showRecurEditDialog();
      if(recurChoice==='cancel'){
        status.textContent='';isSaving=false;setSync('ok');return;
      }
      if(recurChoice==='single'){
        if(oldTx.date&&payload.date!==oldTx.date){
          var excl={id:'rx'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,recur_series_id:seriesIdForSync||recurrenceSeriesKey(oldTx),skipped_date:oldTx.date};
          recurrenceExclusions.push(excl);
          if(isOffline){queueOp({type:'insert',table:'recurrence_exclusions',data:excl});}
          else{try{await sb.from('recurrence_exclusions').insert(excl);}catch(e){queueOp({type:'insert',table:'recurrence_exclusions',data:excl});}}
        }
        payload.recur_series_id=seriesIdForSync||oldTx.recur_series_id||null;
        payload.recur_anchor_date=payload.recurring?((oldTx&&oldTx.recur_anchor_date)||oldTx.date||payload.date):null;
      } else if(recurChoice==='future'){
        if(oldTx.date&&payload.date!==oldTx.date&&payload.recurring){
          var exclFKey=seriesIdForSync||recurrenceSeriesKey(oldTx);
          if(!isRecurrenceExcluded(exclFKey,oldTx.date)){
            var exclF={id:'rx'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,recur_series_id:exclFKey,skipped_date:oldTx.date};
            recurrenceExclusions.push(exclF);
            if(isOffline){queueOp({type:'insert',table:'recurrence_exclusions',data:exclF});}
            else{try{await sb.from('recurrence_exclusions').insert(exclF);}catch(e){queueOp({type:'insert',table:'recurrence_exclusions',data:exclF});}}
          }
        }
        var preservedAnchor=(oldTx&&payload.date!==oldTx.date)?payload.date:((oldTx&&oldTx.recur_anchor_date)||payload.date);
        payload.recur_anchor_date=payload.recurring?preservedAnchor:null;
        var seriesFields={type:payload.type,amount:payload.amount,category:payload.category,subcategory:payload.subcategory,note:payload.note,tags:payload.tags,exclude_from_calc:payload.exclude_from_calc,account_id:payload.account_id,to_account_id:payload.to_account_id,recurring:payload.recurring,recur_interval:payload.recurring?payload.recur_interval:null,recur_end_date:payload.recurring?payload.recur_end_date:null,recur_anchor_date:payload.recurring?preservedAnchor:null};
        if(!payload.recurring){
          payload.recur_series_id=null;
          seriesFields.recur_series_id=null;
          var prevD=new Date(payload.date+'T12:00:00');prevD.setDate(prevD.getDate()-1);
          var stopEndDate=prevD.getFullYear()+'-'+pad(prevD.getMonth()+1)+'-'+pad(prevD.getDate());
          var pastKey=seriesIdForSync||recurrenceSeriesKey(oldTx);
          var pastSibs=transactions.filter(function(t){return t.id!==editingTxId&&t.date<payload.date&&t.recurring&&(seriesIdForSync?t.recur_series_id===seriesIdForSync:recurrenceSeriesKey(t)===pastKey);});
          pastSibs.forEach(function(t){t.recur_end_date=stopEndDate;});
          if(pastSibs.length){
            if(isOffline){pastSibs.forEach(function(t){queueOp({type:'update',table:'transactions',id:t.id,data:{recur_end_date:stopEndDate}});});}
            else{try{await sb.from('transactions').update({recur_end_date:stopEndDate}).in('id',pastSibs.map(function(t){return t.id;}));}catch(ex){pastSibs.forEach(function(t){queueOp({type:'update',table:'transactions',id:t.id,data:{recur_end_date:stopEndDate}});});}}
          }
        }
        try{if(seriesIdForSync)await syncRecurSeries(seriesIdForSync,editingTxId,payload.date,seriesFields);}catch(ex){}
      }
    } else if(payload.recurring){
      payload.recur_anchor_date=payload.date;
    } else {
      payload.recur_anchor_date=null;
      payload.recur_series_id=null;
    }
    if(isOffline){var idx2=transactions.findIndex(function(t){return t.id===editingTxId;});if(idx2>=0)transactions[idx2]=Object.assign(transactions[idx2],payload);queueOp({type:'update',table:'transactions',id:editingTxId,data:payload});saveLocalCache();}
    else{
      try{
        var r=await sb.from('transactions').update(sanitizeRemoteTxPayload(payload)).eq('id',editingTxId).select();
        if(r.error){setSync('err');status.textContent='error: '+r.error.message;status.className='modal-status status-err';isSaving=false;return;}
        var idx=transactions.findIndex(function(t){return t.id===editingTxId;});if(idx>=0)transactions[idx]=(r.data&&r.data[0])?r.data[0]:Object.assign({},transactions[idx],payload);
      }catch(ex){
        var idx3=transactions.findIndex(function(t){return t.id===editingTxId;});if(idx3>=0)transactions[idx3]=Object.assign(transactions[idx3],payload);
        queueOp({type:'update',table:'transactions',id:editingTxId,data:payload});saveLocalCache();queuedFallback=true;
      }
    }
  } else {
    var newTxId='tx'+Date.now()+Math.random().toString(36).slice(2,6);
    var seriesId=(payload.recurring)?('rs'+Date.now()+Math.random().toString(36).slice(2,6)):null;
    var tx=Object.assign({},payload,{id:newTxId,user_id:currentUser.id,recur_series_id:seriesId,recur_anchor_date:payload.recurring?payload.date:null,created_at:new Date().toISOString()});
    if(isOffline){transactions.unshift(tx);queueOp({type:'insert',table:'transactions',data:tx});saveLocalCache();}
    else{
      try{
        var r=await sb.from('transactions').insert(sanitizeRemoteTxPayload(tx)).select();
        if(r.error){setSync('err');status.textContent='error: '+r.error.message;status.className='modal-status status-err';isSaving=false;return;}
        transactions.unshift(r.data[0]||tx);
      }catch(ex){
        transactions.unshift(tx);queueOp({type:'insert',table:'transactions',data:tx});saveLocalCache();queuedFallback=true;
      }
    }
  }
  txVersion++;invalidateTxIndices();clearBalanceCache();saveLocalCache();var pending=isOffline||queuedFallback;if(!pending)setSync('ok');else setSync('err');status.textContent=pending?'guardado (pendiente de sincronizar)':'guardado';status.className='modal-status status-ok';try{refreshTab();}catch(e){}setTimeout(function(){closeModal();isSaving=false;},600);
}
var pendingRecurringDeleteId=null;
function resetTxSwipeFor(id){
  var wrap=document.querySelector('.tx-swipe-wrap[data-swipe-id="'+id+'"]');
  if(!wrap)return;
  var item=wrap.querySelector('.tx-item'),bg=wrap.querySelector('.tx-delete-bg');
  if(item){item.style.transition='transform .25s ease';item.style.transform='translateX(0)';}
  if(bg){bg.style.transition='opacity .25s ease';bg.style.opacity=0;}
  wrap.style.transition='none';
  wrap.style.maxHeight='';wrap.style.opacity='';wrap.style.marginTop='';wrap.style.marginBottom='';wrap.style.paddingTop='';wrap.style.paddingBottom='';wrap.style.overflow='';
}
function requestDeleteTx(id){
  var tx=transactions.find(function(t){return t.id===id;});
  if(tx.is_balance_adjustment){resetTxSwipeFor(id);showUndoToast('Las actualizaciones de saldo se gestionan o eliminan desde Cuentas');return;}
  if(tx.tags&&(tx.tags.includes('invest_buy')||tx.tags.includes('invest_sell')||tx.tags.includes('invest_operation'))){
    resetTxSwipeFor(id);
    showUndoToast('Las operaciones de inversión se gestionan desde la pestaña Inversión');
    return;
  }
  if(!tx.recurring){deleteTx(id);return;}
  resetTxSwipeFor(id);
  pendingRecurringDeleteId=id;
  var dialog=document.getElementById('recurrenceDeleteBg');
  if(dialog){dialog.classList.add('visible');dialog.setAttribute('aria-hidden','false');lockBodyScroll();}
}
function closeRecurringDeleteDialog(){
  pendingRecurringDeleteId=null;
  var dialog=document.getElementById('recurrenceDeleteBg');
  if(dialog){dialog.classList.remove('visible');dialog.setAttribute('aria-hidden','true');unlockBodyScroll();}
}
async function confirmRecurringDelete(mode){
  var id=pendingRecurringDeleteId;
  var tx=transactions.find(function(t){return t.id===id;});
  closeRecurringDeleteDialog();
  if(!tx)return;
  if(mode==='future')await deleteRecurringFromHere(tx);
  else await deleteOnlyRecurringOccurrence(tx);
}
async function deleteOnlyRecurringOccurrence(tx){
  var seriesKey=recurrenceSeriesKey(tx);
  var exclusion={id:'rx'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,recur_series_id:seriesKey,skipped_date:tx.date};
  setSync('syncing');
  if(isOffline){
    recurrenceExclusions.push(exclusion);
    queueOp({type:'insert',table:'recurrence_exclusions',data:exclusion});
    saveLocalCache();
    await deleteTx(tx.id,exclusion);
    return;
  }
  try{
    if(tx.recur_series_id){
      var r=await sb.rpc('skip_fintrack_recurring_occurrence',{target_id:tx.id,series_id:seriesKey});
      if(r.error){
        await sb.from('recurrence_exclusions').insert(exclusion);
        await sb.from('transactions').delete().eq('id',tx.id);
      }
    } else {
      await sb.from('recurrence_exclusions').insert(exclusion);
      await sb.from('transactions').delete().eq('id',tx.id);
    }
    if(!isRecurrenceExcluded(seriesKey,tx.date))recurrenceExclusions.push(exclusion);
    transactionVoids.push({id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:tx.id,transaction_data:Object.assign({},tx),voided_at:new Date().toISOString()});
    transactions=transactions.filter(function(item){return item.id!==tx.id;});
    txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();saveLocalCache();setSync('ok');refreshTab();showUndoToast('Transacción eliminada',function(){undoRecurringOccurrenceDelete(tx,exclusion);});
  }catch(ex){
    var voidedOcc={id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:tx.id,transaction_data:Object.assign({},tx),voided_at:new Date().toISOString()};
    recurrenceExclusions.push(exclusion);
    transactionVoids.push(voidedOcc);
    queueOp({type:'insert',table:'recurrence_exclusions',data:exclusion});
    queueOp({type:'insert',table:'transaction_voids',data:voidedOcc});
    queueOp({type:'delete',table:'transactions',id:tx.id});
    transactions=transactions.filter(function(item){return item.id!==tx.id;});
    txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();saveLocalCache();setSync('err');refreshTab();showUndoToast('Transacción eliminada',function(){undoRecurringOccurrenceDelete(tx,exclusion);});
  }
}
async function deleteRecurringFromHere(tx){
  var seriesKey=recurrenceSeriesKey(tx);
  var all=transactions.filter(function(item){return item.recurring&&recurrenceSeriesKey(item)===seriesKey;});
  var past=all.filter(function(item){return item.date<tx.date;});
  var toDelete=all.filter(function(item){return item.date>=tx.date;});
  var stopFields={recurring:false,recur_interval:null,recur_end_date:null,recur_series_id:null};
  setSync('syncing');
  if(isOffline){
    past.forEach(function(item){Object.assign(item,stopFields);queueOp({type:'update',table:'transactions',id:item.id,data:stopFields});});
    toDelete.forEach(function(item){var v={id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:item.id,transaction_data:Object.assign({},item,stopFields),voided_at:new Date().toISOString()};transactionVoids.push(v);queueOp({type:'insert',table:'transaction_voids',data:v});queueOp({type:'delete',table:'transactions',id:item.id});});
    var deleteIds={};toDelete.forEach(function(item){deleteIds[item.id]=true;});
    transactions=transactions.filter(function(item){return !deleteIds[item.id];});
    saveLocalCache();setSync('err');refreshTab();showSuccessToast('Recurrencia eliminada');
    return;
  }
  try{
    if(!tx.recur_series_id){
      if(past.length)await sb.from('transactions').update(stopFields).in('id',past.map(function(item){return item.id;}));
      if(toDelete.length)await sb.from('transactions').delete().in('id',toDelete.map(function(item){return item.id;}));
    } else {
      var cancelled=await sb.rpc('cancel_fintrack_recurrence_from',{target_id:tx.id});
      if(cancelled.error){
        if(past.length)await sb.from('transactions').update(stopFields).in('id',past.map(function(item){return item.id;}));
        if(toDelete.length)await sb.from('transactions').delete().in('id',toDelete.map(function(item){return item.id;}));
      }
    }
    past.forEach(function(item){Object.assign(item,stopFields);});
    toDelete.forEach(function(item){transactionVoids.push({id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:item.id,transaction_data:Object.assign({},item,stopFields),voided_at:new Date().toISOString()});});
    var deleteIds={};toDelete.forEach(function(item){deleteIds[item.id]=true;});
    transactions=transactions.filter(function(item){return !deleteIds[item.id];});
    saveLocalCache();setSync('ok');refreshTab();showSuccessToast('Recurrencia eliminada');
  }catch(ex){
    past.forEach(function(item){Object.assign(item,stopFields);queueOp({type:'update',table:'transactions',id:item.id,data:stopFields});});
    toDelete.forEach(function(item){var v={id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:item.id,transaction_data:Object.assign({},item,stopFields),voided_at:new Date().toISOString()};transactionVoids.push(v);queueOp({type:'insert',table:'transaction_voids',data:v});queueOp({type:'delete',table:'transactions',id:item.id});});
    var deleteIds={};toDelete.forEach(function(item){deleteIds[item.id]=true;});
    transactions=transactions.filter(function(item){return !deleteIds[item.id];});
    saveLocalCache();setSync('err');refreshTab();showSuccessToast('Recurrencia eliminada');
  }
}
async function deleteTx(id,undoExclusion){
  var tx=transactions.find(function(t){return t.id===id;});
  if(!tx)return;
  if(tx.tags&&(tx.tags.includes('invest_buy')||tx.tags.includes('invest_sell')||tx.tags.includes('invest_operation'))){
    showUndoToast('Las operaciones de inversión se gestionan desde la pestaña Inversión');
    return;
  }
  var voided={id:'tv'+Date.now()+Math.random().toString(36).slice(2,7),user_id:currentUser.id,transaction_id:id,transaction_data:Object.assign({},tx),voided_at:new Date().toISOString()};
  setSync('syncing');
  if(isOffline){transactionVoids.push(voided);transactions=transactions.filter(function(t){return t.id!==id;});txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();queueOp({type:'insert',table:'transaction_voids',data:voided});queueOp({type:'delete',table:'transactions',id:id});saveLocalCache();}
  else{
    try{
      var r=await sb.rpc('void_fintrack_transaction',{target_id:id});
      if(!r.error){transactionVoids.push(voided);transactions=transactions.filter(function(t){return t.id!==id;});txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();saveLocalCache();setSync('ok');}
      else{throw r.error;}
    }catch(ex){
      transactionVoids.push(voided);transactions=transactions.filter(function(t){return t.id!==id;});txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();queueOp({type:'insert',table:'transaction_voids',data:voided});queueOp({type:'delete',table:'transactions',id:id});saveLocalCache();setSync('err');
    }
  }
  refreshTab();
  showUndoToast('Transacción eliminada',function(){if(undoExclusion)undoRecurringOccurrenceDelete(tx,undoExclusion);else restoreTx(tx);});
}
async function undoRecurringOccurrenceDelete(tx,exclusion){
  setSync('syncing');
  recurrenceExclusions=recurrenceExclusions.filter(function(x){
    return x.id!==exclusion.id && !(x.recur_series_id===exclusion.recur_series_id && x.skipped_date===exclusion.skipped_date);
  });
  if(isOffline){
    offlineQueue=offlineQueue.filter(function(op){
      return !(op.type==='insert'&&op.table==='recurrence_exclusions'&&op.data&&
        (op.data.id===exclusion.id || (op.data.recur_series_id===exclusion.recur_series_id && op.data.skipped_date===exclusion.skipped_date)));
    });
    persistOfflineQueue();saveLocalCache();await restoreTx(tx);return;
  }
  var query=(exclusion.recur_series_id&&exclusion.skipped_date)
    ? sb.from('recurrence_exclusions').delete().match({user_id:currentUser.id,recur_series_id:exclusion.recur_series_id,skipped_date:exclusion.skipped_date})
    : sb.from('recurrence_exclusions').delete().eq('id',exclusion.id);
  var r=await query;
  if(r.error){recurrenceExclusions.push(exclusion);saveLocalCache();setSync('err');return;}
  saveLocalCache();await restoreTx(tx);
}
async function restoreTx(tx){
  setSync('syncing');
  var voids=transactionVoids.filter(function(v){return v.transaction_id===tx.id;});
  transactionVoids=transactionVoids.filter(function(v){return v.transaction_id!==tx.id;});
  var cleanTx=sanitizeRemoteTxPayload(tx);
  if(isOffline){voids.forEach(function(v){queueOp({type:'delete',table:'transaction_voids',id:v.id});});transactions.unshift(tx);txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();queueOp({type:'insert',table:'transactions',data:cleanTx});saveLocalCache();}
  else{
    try{
      if(voids.length){var vr=await sb.from('transaction_voids').delete().eq('transaction_id',tx.id).eq('user_id',currentUser.id);if(vr.error)throw vr.error;}
      var r=await sb.from('transactions').insert(cleanTx).select();
      if(r.error)throw r.error;
      transactions.unshift(r.data[0]||tx);
      txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();
    }catch(ex){
      transactionVoids=transactionVoids.concat(voids);transactions.unshift(tx);txVersion++;if(typeof invalidateTxIndices==='function')invalidateTxIndices();clearBalanceCache();voids.forEach(function(v){queueOp({type:'delete',table:'transaction_voids',id:v.id});});queueOp({type:'insert',table:'transactions',data:cleanTx});saveLocalCache();setSync('err');refreshTab();return;
    }
  }
  saveLocalCache();setSync('ok');refreshTab();
}
var undoToastTimer=null;
function showSuccessToast(msg){
  var t=document.getElementById('undoToast');
  if(!t){t=document.createElement('div');t.id='undoToast';t.className='undo-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t);}
  t.innerHTML='<span>'+htmlEscape(msg)+'</span>';
  clearTimeout(undoToastTimer);
  document.body.classList.add('toast-visible');
  requestAnimationFrame(function(){t.classList.add('show');});
  undoToastTimer=setTimeout(function(){t.classList.remove('show');document.body.classList.remove('toast-visible');},2200);
}
function showUndoToast(msg,onUndo,btnLabel){
  var t=document.getElementById('undoToast');
  if(!t){t=document.createElement('div');t.id='undoToast';t.className='undo-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t);}
  t.innerHTML='<span>'+htmlEscape(msg)+'</span>'+(onUndo?'<button class="undo-toast-btn" id="undoToastBtn">'+htmlEscape(btnLabel||'Deshacer')+'</button>':'');
  var done=false;
  var btn=document.getElementById('undoToastBtn');
  if(btn&&onUndo){
    btn.onclick=function(){if(done)return;done=true;clearTimeout(undoToastTimer);t.classList.remove('show');document.body.classList.remove('toast-visible');onUndo();};
  }
  clearTimeout(undoToastTimer);
  document.body.classList.add('toast-visible');
  requestAnimationFrame(function(){t.classList.add('show');});
  undoToastTimer=setTimeout(function(){t.classList.remove('show');document.body.classList.remove('toast-visible');},btnLabel==='Actualizar'?12000:4000);
}

// CAT ACTIONS
async function saveBudget(catId){
  var pfx=IS_DESKTOP?'dt':'';
  var val=parseCurrencyInput(document.getElementById('budgetinput_'+pfx+catId).value);
  if(!Number.isFinite(val)||val<0){showSuccessToast('Introduce un presupuesto válido');return;}
  val=roundMoney(val);
  var noteEl=document.getElementById('budgetnote_'+pfx+catId);
  var note=noteEl?(noteEl.value.trim().slice(0,200)||null):null;
  var my=monthKey(viewYear,viewMonth);
  var existing=budgets.find(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});
  setSync('syncing');
  if(isOffline){
    if(existing){existing.amount=val;existing.note=note;queueOp({type:'update',table:'budgets',id:existing.id,data:{amount:val,note:note}});}
    else{var offlineBudget={id:'b'+Date.now(),category_id:catId,amount:val,is_total:false,month_year:my,note:note,user_id:currentUser.id};budgets.push(offlineBudget);queueOp({type:'insert',table:'budgets',data:offlineBudget});}
    document.getElementById('budgetform_'+pfx+catId).style.display='none';saveLocalCache();setSync('err');showSuccessToast('Presupuesto pendiente de sincronizar');refreshTab();return;
  }
  if(existing){var ru=await sb.from('budgets').update({amount:val,note:note}).eq('id',existing.id);if(ru.error){setSync('err');return;}existing.amount=val;existing.note=note;}
  else{var nb={id:'b'+Date.now(),category_id:catId,amount:val,is_total:false,month_year:my,note:note,user_id:currentUser.id};var r=await sb.from('budgets').insert(nb).select();if(r.error){setSync('err');return;}budgets.push(r.data?r.data[0]:nb);}
  document.getElementById('budgetform_'+pfx+catId).style.display='none';
  saveLocalCache();setSync('ok');showSuccessToast('Presupuesto guardado');refreshTab();
}
async function addCat(){var inp=document.getElementById('newCatInput');var name=inp.value.trim().toLowerCase();var kind=(document.getElementById('newCatKind')||{}).value||'expense';if(!name)return;if(name.length>80){showSuccessToast('El nombre es demasiado largo');return;}if(categories.some(function(c){return String(c.name).trim().toLocaleLowerCase()===name.toLocaleLowerCase();})){alert('Ya existe una categoría con ese nombre');return;}var cat={id:'c'+Date.now(),name:name,color:PALETTE[categories.length%PALETTE.length],subcats:[],position:categories.length,kind:kind,user_id:currentUser.id};setSync('syncing');if(isOffline){categories.push(cat);if(!queueOp({type:'insert',table:'categories',data:cat})){categories.pop();return;}saveLocalCache();inp.value='';setSync('err');refreshTab();return;}var r=await sb.from('categories').insert(cat).select();if(!r.error){categories.push(r.data[0]||cat);saveLocalCache();setSync('ok');inp.value='';refreshTab();}else setSync('err');}

async function archiveCat(id){
  var cat=categories.find(function(c){return c.id===id;});if(!cat)return;
  var newArchived=!cat.archived;
  setSync('syncing');
  if(isOffline){cat.archived=newArchived;if(queueOp({type:'update',table:'categories',id:id,data:{archived:newArchived}})){saveLocalCache();setSync('err');refreshTab();}return;}
  var r=await sb.from('categories').update({archived:newArchived}).eq('id',id);
  if(!r.error){cat.archived=newArchived;saveLocalCache();setSync('ok');refreshTab();}
  else setSync('err');
}
async function deleteCat(id){
  var catToDelete=categories.find(function(c){return c.id===id;});
  var affectedCount=transactions.filter(function(t){return t.category===id;}).length;
  var accepted=await confirmCriticalAction({title:'Eliminar categoría',description:'La categoría dejará de estar disponible. Sus movimientos existentes se conservarán sin categoría activa.',counts:{categoría:1,movimientos_afectados:affectedCount},phrase:'ELIMINAR',approveLabel:'Eliminar categoría'});
  if(!accepted)return;
  var cat=categories.find(function(c){return c.id===id;});
  var name=cat?cat.name:catById(id).name;
  var catBudgets=budgets.filter(function(b){return b.category_id===id;});
  var affectedTx=transactions.filter(function(t){return t.category===id;}).map(function(t){return {id:t.id,category:t.category,subcategory:t.subcategory};});
  setSync('syncing');
  if(isOffline){
    categories=categories.filter(function(c){return c.id!==id;});
    budgets=budgets.filter(function(b){return b.category_id!==id;});
    if(filterCat===id)filterCat='';
    catBudgets.forEach(function(b){queueOp({type:'delete',table:'budgets',id:b.id});});
    queueOp({type:'delete',table:'categories',id:id});
    saveLocalCache();setSync('err');refreshTab();
    showUndoToast('Categoría eliminada',function(){restoreCat(cat,catBudgets,affectedTx);});
    return;
  }
  var r=await sb.rpc('delete_fintrack_category',{target_id:id});
  if(!r.error){
    categories=categories.filter(function(c){return c.id!==id;});
    budgets=budgets.filter(function(b){return b.category_id!==id;});
    sb.from('budgets').delete().eq('category_id',id).then(function(){}).catch(function(){});
    // Transactions keep their category reference — catById will show them as ghost
    if(filterCat===id)filterCat='';
    saveLocalCache();setSync('ok');refreshTab();
    showUndoToast('Categoría eliminada',function(){restoreCat(cat,catBudgets,affectedTx);});
  }else setSync('err');
}
async function restoreCat(cat,catBudgets,affectedTx){
  if(!cat)return;
  setSync('syncing');
  var r=await sb.from('categories').insert(cat).select();
  if(r.error){setSync('err');return;}
  categories.push(r.data?r.data[0]:cat);
  if(catBudgets.length){var r2=await sb.from('budgets').insert(catBudgets);if(!r2.error)budgets=budgets.concat(catBudgets);}
  var groups={};
  affectedTx.forEach(function(at){var k=at.category+'||'+(at.subcategory||'');(groups[k]=groups[k]||{category:at.category,subcategory:at.subcategory,ids:[]}).ids.push(at.id);});
  for(var k in groups){
    var g=groups[k];
    await sb.from('transactions').update({category:g.category,subcategory:g.subcategory}).in('id',g.ids);
    g.ids.forEach(function(id){var tx=transactions.find(function(t){return t.id===id;});if(tx){tx.category=g.category;tx.subcategory=g.subcategory;}});
  }
  saveLocalCache();setSync('ok');refreshTab();
}
async function addSubcat(catId){var pfx=IS_DESKTOP?'dt':'';var inp=document.getElementById('subinput_'+pfx+catId);var name=inp.value.trim().toLowerCase();if(!name)return;var cat=categories.find(function(c){return c.id===catId;});if(!cat||name.length>60||(cat.subcats||[]).some(function(s){return String(s).toLowerCase()===name.toLowerCase();}))return;cat.subcats=Array.isArray(cat.subcats)?cat.subcats:[];cat.subcats.push(name);setSync('syncing');if(isOffline){if(queueOp({type:'update',table:'categories',id:catId,data:{subcats:cat.subcats}})){saveLocalCache();inp.value='';setSync('err');refreshTab();}return;}var r=await sb.from('categories').update({subcats:cat.subcats}).eq('id',catId);if(!r.error){saveLocalCache();setSync('ok');inp.value='';refreshTab();}else{setSync('err');var ix=cat.subcats.indexOf(name);if(ix>=0)cat.subcats.splice(ix,1);}}
async function deleteSubcat(catId,sub){var cat=categories.find(function(c){return c.id===catId;});if(!cat)return;if(!confirm('¿Quitar esta subcategoría de las nuevas transacciones? Los movimientos históricos conservarán su referencia.'))return;var previous=(cat.subcats||[]).slice();cat.subcats=previous.filter(function(s){return s!==sub;});setSync('syncing');if(isOffline){if(queueOp({type:'update',table:'categories',id:catId,data:{subcats:cat.subcats}})){saveLocalCache();setSync('err');refreshTab();}else{cat.subcats=previous;}return;}var r=await sb.from('categories').update({subcats:cat.subcats}).eq('id',catId);if(!r.error){saveLocalCache();setSync('ok');refreshTab();}else{setSync('err');cat.subcats=previous;}}
var _catStyleEditingId=null;
function renderCatStyleModalContent(){
  if(!_catStyleEditingId)return;
  var cat=categories.find(function(c){return c.id===_catStyleEditingId;});
  if(!cat)return;
  var title=document.getElementById('catStyleModalTitle');
  if(title)title.textContent='Estilo · '+capitalize(cat.name||'Categoría');
  var ig=document.getElementById('catStyleIconsGrid');
  if(ig){
    var curIcon=String(cat.icon||'').toLowerCase();
    ig.innerHTML=AVAILABLE_CAT_ICONS.map(function(ic){
      var act=(curIcon===ic||(!curIcon&&(cat.name||'').toLowerCase()===ic));
      return '<button type="button" class="cat-icon-swatch'+(act?' active':'')+'" data-action="set-cat-icon" data-id="'+cat.id+'" data-sub="'+ic+'" title="'+ic+'">'+catIconSvg({name:ic,icon:ic,color:cat.color},18)+'</button>';
    }).join('');
  }
  var cg=document.getElementById('catStyleColorsGrid');
  if(cg){
    cg.innerHTML=PALETTE.map(function(pc){
      return '<div class="cat-color-swatch'+(pc.toLowerCase()===String(cat.color).toLowerCase()?' active':'')+'" style="background:'+pc+';color:'+pc+'" data-action="set-cat-color" data-id="'+cat.id+'" data-sub="'+pc+'"></div>';
    }).join('');
  }
}
function openCatStyleModal(catId){
  _catStyleEditingId=catId;
  renderCatStyleModalContent();
  var bg=document.getElementById('catStyleModalBg');
  if(bg){bg.classList.add('visible');bg.setAttribute('aria-hidden','false');lockBodyScroll();}
}
function closeCatStyleModal(){
  var bg=document.getElementById('catStyleModalBg');
  if(bg){bg.classList.remove('visible');bg.setAttribute('aria-hidden','true');}
  _catStyleEditingId=null;
  unlockBodyScroll();
}
async function saveCatColor(catId,color){var cat=categories.find(function(c){return c.id===catId;});if(!cat)return;var prev=cat.color;cat.color=color;if(_catStyleEditingId===catId)renderCatStyleModalContent();setSync('syncing');if(isOffline){if(queueOp({type:'update',table:'categories',id:catId,data:{color:color}})){saveLocalCache();setSync('err');refreshTab();}else{cat.color=prev;if(_catStyleEditingId===catId)renderCatStyleModalContent();}return;}var r=await sb.from('categories').update({color:color}).eq('id',catId);if(!r.error){saveLocalCache();setSync('ok');refreshTab();}else{setSync('err');cat.color=prev;if(_catStyleEditingId===catId)renderCatStyleModalContent();}}
async function saveCatIcon(catId,iconKey){
  var cat=categories.find(function(c){return c.id===catId;});
  if(!cat)return;
  var prev=cat.icon;
  cat.icon=iconKey;
  var iconMap=getCategoryCustomIcons();
  iconMap[catId]=iconKey;
  saveCategoryCustomIcons(iconMap);
  if(_catStyleEditingId===catId)renderCatStyleModalContent();
  setSync('syncing');
  if(isOffline){
    if(queueOp({type:'update',table:'categories',id:catId,data:{icon:iconKey}})){
      saveLocalCache();setSync('err');refreshTab();showSuccessToast('Icono de categoría actualizado');
    }else{cat.icon=prev;if(_catStyleEditingId===catId)renderCatStyleModalContent();}
    return;
  }
  try{
    var r=await sb.from('categories').update({icon:iconKey}).eq('id',catId);
    if(r&&r.error){
      console.warn('Supabase categories update icon info:',r.error.message||r.error);
    }
  }catch(err){
    console.warn('Error al actualizar icono en Supabase:',err);
  }
  saveLocalCache();
  setSync('ok');
  refreshTab();
  showSuccessToast('Icono de categoría actualizado');
}
async function saveAccountColor(accountId,color){var acc=accounts.find(function(a){return a.id===accountId;});if(!acc)return;var prev=acc.color;acc.color=color;clearBalanceCache();setSync('syncing');if(isOffline){if(queueOp({type:'update',table:'accounts',id:accountId,data:{color:color}})){saveLocalCache();setSync('err');refreshTab();}else acc.color=prev;return;}var r=await sb.from('accounts').update({color:color}).eq('id',accountId);if(!r.error){saveLocalCache();setSync('ok');refreshTab();showSuccessToast('Color de cuenta actualizado');}else{setSync('err');acc.color=prev;}}
async function renameCat(id,newName){
  var cat=categories.find(function(c){return c.id===id;});if(!cat)return;
  var name=String(newName||'').trim().toLowerCase();
  if(!name||name.length>80)return;
  if(categories.some(function(c){return c.id!==id&&String(c.name).trim().toLowerCase()===name;})){
    alert('Ya existe una categoría con ese nombre');return;
  }
  var prev=cat.name;
  cat.name=name;
  setSync('syncing');
  if(isOffline){
    if(queueOp({type:'update',table:'categories',id:id,data:{name:name}})){
      saveLocalCache();setSync('err');refreshTab();
    }else{cat.name=prev;}
    return;
  }
  var r=await sb.from('categories').update({name:name}).eq('id',id);
  if(!r.error){saveLocalCache();setSync('ok');refreshTab();showSuccessToast('Categoría renombrada');}
  else{setSync('err');cat.name=prev;}
}
function promptRenameCat(id){
  var cat=categories.find(function(c){return c.id===id;});if(!cat)return;
  var currentName=cat.name;
  var n=prompt('Nuevo nombre para la categoría:',currentName);
  if(n===null)return;
  var clean=n.trim().toLowerCase();
  if(!clean||clean===currentName.toLowerCase())return;
  renameCat(id,clean);
}

// ── DESKTOP ──
// ═══════════════════════════════════════════════
// DESKTOP MODE ADDITIONS
// ═══════════════════════════════════════════════


function applyLayout(){
  if(IS_DESKTOP){
    // Vaciar el contenido de la vista móvil que se abandona para no dejar
    // ids duplicados (canvas/toggles) en el DOM al cambiar de layout.
    var mtc=document.getElementById('tabContent'); if(mtc) mtc.innerHTML='';
    ['appHeader','mainChart','bottomNav','tabContent'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.style.display='none';
    });
    var fab=document.getElementById('fabBtn'); if(fab) fab.classList.add('fab-hidden');
    var dt=document.getElementById('dtLayout'); if(dt) dt.style.display='flex';
    if(currentUser){
      var em=currentUser.email||'';
      var av=document.getElementById('dtAvatar'); if(av) av.textContent=em[0]?em[0].toUpperCase():'?';
      var de=document.getElementById('dtEmail'); if(de) de.textContent=maskEmail(em);
    }
    dtRender();
  } else {
    var dtc=document.getElementById('dtTabContent'); if(dtc) dtc.innerHTML='';
    var dt=document.getElementById('dtLayout'); if(dt) dt.style.display='none';
    document.getElementById('appHeader').style.display='flex';
    document.getElementById('mainChart').style.display=(activeTab===0)?'block':'none';
    document.getElementById('bottomNav').style.display='flex';
    document.getElementById('tabContent').style.display='flex';
    var fab=document.getElementById('fabBtn'); if(fab) fab.classList.toggle('fab-hidden',activeTab!==0&&activeTab!==1&&activeTab!==2);
    for(var j=0;j<5;j++){var bn=document.getElementById('bn'+j);if(bn)bn.classList.toggle('active',j===activeTab);}
    updatePeriodToolbar();
    render();
    movePill(activeTab);
  }
}

function dtRender(){
  if(!IS_DESKTOP) return;
  clearBalanceCache();
  updatePrivacyIcons();
  // Month labels in sidebar
  var showPeriodControls=activeTab!==3&&activeTab!==4&&activeTab!==5;
  var dtMonthNav=document.querySelector('.dt-month-nav');if(dtMonthNav)dtMonthNav.style.display=showPeriodControls?'flex':'none';
  var ml=document.getElementById('dtMonthLabel');if(ml)ml.textContent=homeAnnualMode?(''+viewYear):(capitalize(MONTHS[viewMonth])+' '+viewYear);
  var dhab=document.getElementById('dtHomeAnnualBtn');if(dhab){dhab.style.display=showPeriodControls?'flex':'none';dhab.classList.toggle('active',homeAnnualMode);}
  // Nav active state
  document.querySelectorAll('.dt-nav-item').forEach(function(btn){
    btn.classList.toggle('active',parseInt(btn.getAttribute('data-tab'))===activeTab);
  });
  var sBtn=document.querySelector('.dt-sidebar-btn');if(sBtn)sBtn.classList.toggle('active',activeTab===5);
  // Page title
  var titles=['Inicio','Categorías','Cuentas','Análisis','Inversiones','Ajustes'];
  var pt=document.getElementById('dtPageTitle');if(pt)pt.textContent=titles[activeTab]||'';
  // User info
  if(currentUser){
    var em=currentUser.email||'';
    var av=document.getElementById('dtAvatar');if(av)av.textContent=em[0]?em[0].toUpperCase():'?';
    var de=document.getElementById('dtEmail');if(de)de.textContent=activeTab===5?em:maskEmail(em);
  }
  // Compute stats
  var txs=getDashboardTx();
  var exps=txs.filter(function(t){return !t.is_balance_adjustment&&txExpenseImpact(t)>0;});
  var totals=calcPeriodTotals(txs);
  var tExp=totals.expense;
  var tBalExp=totals.balExpense;
  var tInc=totals.income;
  var tBalInc=totals.balIncome;
  var bal=totals.balance;
  var tb=totalBudget();
  var incStr=fmtPrivacy(tInc);
  var expStr=fmtPrivacy(tExp);
  var balStr=isPrivacyMode()?'••••••':((bal<0?'−':'')+fmt(Math.abs(bal)));

  // Build by-cat for donut
  var entries=donutEntries(txs);
  var legendHtml=entries.map(function(e){
    var name=e.id==='__balance_adjustment'?'Actualización de saldo':catById(e.id).name;
    return '<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text2)">'
      +'<div style="width:9px;height:9px;border-radius:50%;background:'+e.color+'"></div>'+capEsc(name)+'</div>';
  }).join('');
  // Budget bar html
  var budgetHtml='';
  if(tb>0&&!homeAnnualMode){
    var pct=Math.max(0,Math.min(Math.round(tExp/tb*100),100));
    var col=tExp/tb*100>=100?'var(--red)':budgetGradientColor(tExp/tb*100);
    budgetHtml='<div class="dt-budget-top">'
      +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">'
      +'<span style="font-size:12px;font-weight:600;color:var(--text3)">Presupuesto mensual</span>'
      +'<span style="font-family:var(--mono);font-size:13px;font-weight:700;color:'+col+'">'+(isPrivacyMode()?'•••••• / ••••••':(fmt(tExp)+' / '+fmt(tb)))+'</span></div>'
      +'<div style="height:5px;background:var(--bg4);border-radius:var(--radius-pill)"><div style="height:5px;background:'+col+';border-radius:var(--radius-pill);width:'+pct+'%;transition:width 0.4s"></div></div>'
      +'</div>';
  }
  // Only show top bar on tab 0 (Inicio)
  var showTopBar=(activeTab===0);
  // Render top bar + tab content into dt-main
  var tc=document.getElementById('dtTabContent');
  if(!tc)return;

  // Top bar HTML
  var topBarHtml=showTopBar?'<div class="dt-top-bar">'
    // Summary cards row
    +'<div class="dt-summary-row">'
    +'<div class="dt-scard t-inc" data-action="quick-filter-kpi" data-mode="income" title="Filtrar solo ingresos" style="cursor:pointer;"><span class="dt-scard-label">Ingresos</span><span class="dt-scard-value" id="dtInc" style="color:var(--green-text)">'+incStr+'</span></div>'
    +'<div class="dt-scard t-exp" data-action="quick-filter-kpi" data-mode="expense" title="Filtrar solo gastos" style="cursor:pointer;"><span class="dt-scard-label">Gastos</span><span class="dt-scard-value" id="dtExp" style="color:var(--red)">'+expStr+'</span></div>'
    +'<div class="dt-scard t-bal" data-action="toggle-privacy" title="Alternar modo privado" style="cursor:pointer;"><span class="dt-scard-label" style="display:flex;align-items:center;justify-content:space-between;width:100%;"><span>Balance</span><span id="dtBalPrivacyIcon" style="display:inline-flex;align-items:center;opacity:0.45;transition:opacity 0.2s;"></span></span><span class="dt-scard-value" id="dtBal" style="color:'+(bal>=0?'var(--green-text)':'var(--red)')+'">'+balStr+'</span></div>'
    +'</div>'
    // Donut (flips to heatmap) centered + legend below
    +'<div class="dt-flip-wrap"><div class="flip-inner" id="dtFlipInner">'
    +'<div class="dt-donut-section flip-face flip-front" data-action="dt-flip-front">'
    +'<div id="dtDonutWrap" style="position:relative;width:240px;height:240px;cursor:default;">'
    +'<canvas id="dtDonutCanvas" width="240" height="240"></canvas>'
    +'<div class="dt-donut-center">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;" id="dtDcPct">GASTOS</div>'
    +'<div class="dt-dc-amount" style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--text);letter-spacing:-0.5px;" id="dtDcAmt">'+fmtPrivacy(tExp)+'</div>'
    +'<div style="font-size:11px;color:var(--text3);max-width:100px;text-align:center;line-height:1.3;" id="dtDcCat"></div>'
    +'</div></div>'
    +'<div class="dt-legend-row">'+legendHtml+'</div><div class="balance-adjustment-note" id="dtBalanceAdjustmentNote"></div><div class="uncomputed-expenses-note" id="dtUncomputedExpensesNote"></div>'
    +'</div>'
    +'<div class="dt-donut-section flip-face flip-back" data-action="dt-flip-back">'
    +'<div class="heatmap-head"><span class="heatmap-title" id="dtHmTitle">Gasto diario</span><span class="heatmap-tot" id="dtHmTot"></span></div>'
    +'<div class="heatmap-dow"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>'
    +'<div class="heatmap-grid" id="dtHeatmapGrid"></div>'
    +'<div class="heatmap-detail" id="dtHeatmapDetail"></div>'
    +'</div>'
    +'</div></div>'
    +'</div>'+budgetHtml:'';

  // Tab content
  // Set top bar first
  tc.innerHTML=topBarHtml+'<div id="dtTabInner"></div>';
  if(showTopBar&&!isPrivacyMode()&&shouldAnimateNumbers()){
    countUp(document.getElementById('dtInc'),tInc,fmt);
    countUp(document.getElementById('dtExp'),tExp,fmt);
    countUp(document.getElementById('dtBal'),Math.abs(bal),function(n){return (bal<0?'−':'')+fmt(n);});
  }else if(showTopBar){
    var _di=document.getElementById('dtInc'),_de=document.getElementById('dtExp'),_db=document.getElementById('dtBal');
    if(_di)_di.textContent=incStr;if(_de)_de.textContent=expStr;if(_db)_db.textContent=balStr;
  }
  // Render tab content into the DOM-attached element
  var tabInner=document.getElementById('dtTabInner');
  if(tabInner){
    if(activeTab===0)renderTxTab(tabInner);
    else if(activeTab===1)renderCatTab(tabInner,'dt');
    else if(activeTab===2)renderPatTab(tabInner);
    else if(activeTab===3)renderAnnualTab(tabInner);
    else if(activeTab===4)renderInvestmentsTab(tabInner);
    else renderSettingsTab(tabInner);
  }
  // Render donut after DOM update (canvas now in DOM)
  if(showTopBar){
    var canvas=document.getElementById('dtDonutCanvas');
    if(canvas)dtRenderDonut(txs,tExp,240);
    renderBalanceAdjustmentNote(txs,'dtBalanceAdjustmentNote');
    renderUncomputedExpensesNote(txs,'dtUncomputedExpensesNote');
    renderHeatmap(exps,HM_DESKTOP);
  }
}

function dtRenderDonut(exps,total,size){
  size=size||240;
  var canvas=document.getElementById('dtDonutCanvas'); if(!canvas) return;
  var entries=donutEntries(exps);
  var chartTotal=entries.reduce(function(s,e){return s+e.value;},0);
  initDonutController({
    canvas:canvas,entries:entries,chartTotal:chartTotal,size:size,
    emptyLabel:'GASTOS',
    emptyAmtText:total?fmtPrivacy(total):'0 €',
    hoverEnabled:true,allowBalanceAdjName:true,toggleAlways:true,
    getActiveId:function(){return dtActiveCat;},
    setActiveId:function(v){dtActiveCat=v;},
    setCenter:dtSetCenter
  });
}
function dtSetCenter(p,a,c){var dp=document.getElementById('dtDcPct');var da=document.getElementById('dtDcAmt');var dc=document.getElementById('dtDcCat');if(dp)dp.textContent=p;if(da){da.textContent=a;fitCenterText(da,168,22);}if(dc)dc.textContent=c;}

// ── BOOT ──

document.getElementById('fabBtn').onclick=openModal;
function enableKeyboardControls(){
  var excBtn=document.getElementById('txExcludeCalcBtn');
  if(excBtn&&!excBtn._kbBound){
    excBtn._kbBound=true;
    excBtn.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();cycleTxCalcMode();}});
  }
  document.querySelectorAll('.type-btn,.recurring-toggle,.cat-color-swatch,.dt-nav-item').forEach(function(el){
    if(el.tabIndex<0)el.tabIndex=0;
    if(!el.getAttribute('role'))el.setAttribute('role','button');
    if(!el._ftKeyboard){el._ftKeyboard=true;el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});}
  });
}
enableKeyboardControls();
function closeTopModal(targetBg){
  var bg = targetBg;
  if(!bg){
    var visibleModals = document.querySelectorAll('.modal-bg.visible');
    if(visibleModals.length) bg = visibleModals[visibleModals.length - 1];
  }
  if(!bg) return;
  if(bg.id === 'catStyleModalBg' || (document.getElementById('catStyleModalBg') && document.getElementById('catStyleModalBg').classList.contains('visible'))) {
    closeCatStyleModal();
    return;
  }
  if(bg.id === 'monthModalBg' || (document.getElementById('monthModalBg') && document.getElementById('monthModalBg').classList.contains('visible'))) {
    closeMonthModal();
    return;
  }
  if(bg.id === 'recurrenceDeleteBg' || (document.getElementById('recurrenceDeleteBg') && document.getElementById('recurrenceDeleteBg').classList.contains('visible'))) {
    closeRecurringDeleteDialog();
    return;
  }
  if(bg.id === 'exportModalBg' || (document.getElementById('exportModalBg') && document.getElementById('exportModalBg').classList.contains('visible'))) {
    closeExportModal();
    return;
  }
  if(bg.id === 'adjustModalBg' || (document.getElementById('adjustModalBg') && document.getElementById('adjustModalBg').classList.contains('visible'))) {
    closeAdjustModal();
    return;
  }
  if(bg.id === 'budgetModalBg' || (document.getElementById('budgetModalBg') && document.getElementById('budgetModalBg').classList.contains('visible'))) {
    closeBudgetModal();
    return;
  }
  if(bg.id === 'modalBg' || (document.getElementById('modalBg') && document.getElementById('modalBg').classList.contains('visible'))) {
    closeModal();
    return;
  }
}

// Unified backdrop click for all modals
document.addEventListener('click', function(e){
  if(e.target && e.target.classList && e.target.classList.contains('modal-bg') && e.target.classList.contains('visible')){
    closeTopModal(e.target);
  }
});

// Escape key, Tab focus trapping across all modals, Ctrl+Enter, and Alt+Arrow month navigation
document.addEventListener('keydown', function(e){
  var openBg = document.querySelector('.modal-bg.visible');
  if(e.key === 'Tab' && openBg){
    var focusable = openBg.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if(focusable.length){
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }
  if(e.key === 'Escape') closeTopModal();
  if(openBg && (e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    var saveBtn = openBg.querySelector('.btn-save:not([disabled]), .investment-trade-submit:not([disabled])');
    if(saveBtn){ e.preventDefault(); saveBtn.click(); return; }
  }
  if(IS_DESKTOP && !openBg){
    if(e.altKey && e.key === 'ArrowLeft'){ e.preventDefault(); prevMonth(); return; }
    if(e.altKey && e.key === 'ArrowRight'){ e.preventDefault(); nextMonth(); return; }
  }
});

// Generalized modal drag-to-dismiss (mobile) with downward-only dismissal
(function initModalDragToDismiss(){
  var drag = null;
  document.addEventListener('touchstart', function(e){
    if(IS_DESKTOP) return;
    var bg = document.querySelector('.modal-bg.visible');
    if(!bg) return;
    var modal = bg.querySelector('.modal');
    if(!modal) return;
    var tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if(tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
    var isHandle = !!e.target.closest('.modal-handle');
    if(!isHandle && modal.scrollTop > 2) return;
    var t = e.touches[0];
    drag = {
      id: t.identifier,
      modal: modal,
      bg: bg,
      startY: t.clientY,
      startX: t.clientX,
      dy: 0,
      active: false,
      isHandle: isHandle
    };
  }, {passive: true});

  document.addEventListener('touchmove', function(e){
    if(!drag) return;
    var t = null;
    for(var i = 0; i < e.touches.length; i++){
      if(e.touches[i].identifier === drag.id) { t = e.touches[i]; break; }
    }
    if(!t) return;
    var dy = t.clientY - drag.startY;
    var dx = t.clientX - drag.startX;

    if(!drag.active){
      if(!drag.isHandle && drag.modal.scrollTop > 2){ drag = null; return; }
      if(Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10){ drag = null; return; }
      if(dy > 8){ drag.active = true; } else if(dy < -8){ drag = null; return; }
    }

    if(drag.active && dy >= 0){
      drag.dy = dy;
      drag.modal.style.transition = 'none';
      drag.modal.style.transform = 'translateY(' + dy + 'px)';
      drag.bg.style.opacity = Math.max(0.2, 1 - (dy / 380));
      if(e.cancelable) e.preventDefault();
    }
  }, {passive: false});

  function finishModalDrag(cancelled){
    if(!drag) return;
    var m = drag.modal, b = drag.bg, dy = drag.dy, active = drag.active;
    drag = null;
    if(!active) return;
    m.style.transition = 'transform 0.28s cubic-bezier(0.32,0.72,0,1)';
    b.style.transition = 'opacity 0.28s ease';
    if(!cancelled && dy > 80){
      m.style.transform = 'translateY(100%)';
      b.style.opacity = '0';
      setTimeout(function(){
        closeTopModal(b);
        m.style.transform = '';
        m.style.transition = '';
        b.style.opacity = '';
        b.style.transition = '';
      }, 260);
    } else {
      m.style.transform = '';
      b.style.opacity = '';
      setTimeout(function(){
        m.style.transition = '';
        b.style.transition = '';
      }, 280);
    }
  }

  document.addEventListener('touchend', function(e){
    if(!drag) return;
    var ended = false;
    for(var i = 0; i < e.changedTouches.length; i++){
      if(e.changedTouches[i].identifier === drag.id) ended = true;
    }
    if(ended) finishModalDrag(false);
  }, {passive: true});

  document.addEventListener('touchcancel', function(e){
    if(!drag) return;
    var ended = false;
    for(var i = 0; i < e.changedTouches.length; i++){
      if(e.changedTouches[i].identifier === drag.id) ended = true;
    }
    if(ended) finishModalDrag(true);
  }, {passive: true});
})();

// PULL TO REFRESH (Mobile)
(function initPullToRefresh(){
  var ptrIndicator = document.getElementById('ptrIndicator');
  if(!ptrIndicator) return;
  var ptrSpinner = ptrIndicator.querySelector('.ptr-spinner');
  var startY = 0;
  var startX = 0;
  var currentY = 0;
  var pulling = false;
  var eligible = false;
  var isRefreshing = false;
  var PULL_THRESHOLD = 52;

  window.addEventListener('touchstart', function(e){
    if(IS_DESKTOP || !currentUser || isRefreshing || document.body.classList.contains('modal-open')) {
      eligible = false;
      return;
    }
    if((window.scrollY || document.documentElement.scrollTop || 0) <= 2) {
      eligible = true;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      currentY = startY;
      pulling = false;
    } else {
      eligible = false;
    }
  }, {passive: true});

  window.addEventListener('touchmove', function(e){
    if(!eligible || isRefreshing || !e.touches || !e.touches[0]) return;
    currentY = e.touches[0].clientY;
    var dy = currentY - startY;
    var dx = Math.abs(e.touches[0].clientX - startX);
    if(dx > Math.abs(dy) && dy < 20) {
      eligible = false;
      pulling = false;
      ptrIndicator.classList.remove('active');
      ptrIndicator.style.transform = '';
      if(ptrSpinner) ptrSpinner.style.transform = '';
      return;
    }
    if(dy > 6 && (window.scrollY || document.documentElement.scrollTop || 0) <= 2){
      pulling = true;
      var pullProgress = Math.min(dy * 0.45, 68);
      ptrIndicator.classList.add('active');
      ptrIndicator.style.transform = 'translateX(-50%) translateY(' + (-65 + pullProgress * 1.35) + 'px)';
      if(ptrSpinner){
        var rot = Math.min(360, (pullProgress / PULL_THRESHOLD) * 360);
        ptrSpinner.style.transform = 'rotate(' + rot + 'deg)';
      }
    } else if(dy < 0){
      pulling = false;
      eligible = false;
      ptrIndicator.classList.remove('active');
      ptrIndicator.style.transform = '';
      if(ptrSpinner) ptrSpinner.style.transform = '';
    }
  }, {passive: true});

  window.addEventListener('touchend', function(){
    if(!pulling || isRefreshing){
      eligible = false;
      return;
    }
    var dy = currentY - startY;
    var pullProgress = Math.min(dy * 0.45, 68);
    eligible = false;
    pulling = false;

    if(pullProgress >= PULL_THRESHOLD && !loadDataInFlight){
      isRefreshing = true;
      ptrIndicator.classList.add('ptr-spinning');
      ptrIndicator.style.transform = 'translateX(-50%) translateY(14px)';
      forceSync().finally(function(){
        setTimeout(function(){
          isRefreshing = false;
          ptrIndicator.classList.remove('ptr-spinning');
          ptrIndicator.classList.remove('active');
          ptrIndicator.style.transform = '';
          if(ptrSpinner) ptrSpinner.style.transform = '';
        }, 320);
      });
    } else {
      ptrIndicator.classList.remove('active');
      ptrIndicator.style.transform = '';
      if(ptrSpinner) ptrSpinner.style.transform = '';
    }
  }, {passive: true});

  window.addEventListener('touchcancel', function(){
    eligible = false;
    pulling = false;
    if(!isRefreshing){
      ptrIndicator.classList.remove('active');
      ptrIndicator.classList.remove('ptr-spinning');
      ptrIndicator.style.transform = '';
      if(ptrSpinner) ptrSpinner.style.transform = '';
    }
  }, {passive: true});
})();

['monthLabel', 'dtMonthLabel'].forEach(function(id){
  var el = document.getElementById(id);
  if(el){
    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openMonthModal();
      }
    });
  }
});
document.getElementById('authEmail').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('authPass').focus();});
document.getElementById('authPass').addEventListener('keydown',function(e){if(e.key==='Enter')submitAuth();});
document.getElementById('tagsWrap').addEventListener('click',function(){document.getElementById('tagInput').focus();});
document.getElementById('dtPrevMonth').onclick=function(){if(homeAnnualMode){viewYear--;}else if(viewMonth===0){viewMonth=11;viewYear--;}else viewMonth--;dtActiveCat=null;hmSelDay=null;filterDateFrom='';filterDateTo='';saveUiState();dtRender();};
document.getElementById('dtNextMonth').onclick=function(){if(homeAnnualMode){viewYear++;}else if(viewMonth===11){viewMonth=0;viewYear++;}else viewMonth++;dtActiveCat=null;hmSelDay=null;filterDateFrom='';filterDateTo='';saveUiState();dtRender();};
var _lastAppWidth=window.innerWidth;
window.addEventListener('resize',function(){
  if(window.innerWidth===_lastAppWidth)return;
  _lastAppWidth=window.innerWidth;
  var nowDesktop=window.innerWidth>=768;
  if(!nowDesktop){
    var pill=document.getElementById('bnavPill');
    if(pill&&pill.style.width)movePill(activeTab);
  }
  if(currentUser){
    if(nowDesktop!==IS_DESKTOP){
      IS_DESKTOP=nowDesktop;
      applyLayout();
    }
    clearTimeout(window._resizeChartTimer);
    window._resizeChartTimer=setTimeout(function(){refreshTab();setFlipHeight('homeFlipInner');},200);
  } else {
    IS_DESKTOP=nowDesktop;
  }
});
var inPasswordRecovery=false;
sb.auth.onAuthStateChange(function(event,session){
  if(event==='PASSWORD_RECOVERY'){inPasswordRecovery=true;if(session&&session.user)currentUser=session.user;showResetPasswordForm();return;}
  if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){if(session&&session.user)currentUser=session.user;return;}
  if(event==='SIGNED_IN'&&inPasswordRecovery){if(session&&session.user)currentUser=session.user;return;}
  inPasswordRecovery=false;
  if(session&&session.user){
    try{localStorage.setItem('ft_last_uid',session.user.id);localStorage.setItem('ft_last_email',session.user.email||'');}catch(e){}
    var changedUser=!currentUser||currentUser.id!==session.user.id;
    if(changedUser){loadGeneration++;loadDataInFlight=false;loadDataPromise=null;_catExclusionsCache=null;}
    currentUser=session.user;
    if(event==='INITIAL_SESSION'||event==='SIGNED_IN')showApp();
  }
  else{
    var offlineUid=null;
    if(!_isExplicitSignOut&&(isOffline||navigator.onLine===false)){
      offlineUid=(currentUser&&currentUser.id)||(function(){try{return localStorage.getItem('ft_last_uid');}catch(e){return null;}})();
    }
    if(offlineUid){
      // SW-03: No forzar cierre de sesión ante fallo de refresco JWT estando sin conexión
      if(!currentUser){
        var offlineEmail='';try{offlineEmail=localStorage.getItem('ft_last_email')||'';}catch(e){}
        currentUser={id:offlineUid,email:offlineEmail||'Modo sin conexión'};
      }
      isOffline=true;
      var ob=document.getElementById('offlineBanner');if(ob)ob.classList.add('show');
      setSync('err');
      showApp();
      return;
    }
    var uidToReset=currentUser?currentUser.id:null;
    resetAppState(uidToReset,_preserveQueueOnSignOut);
    currentUser=null;showAuth();
  }
});
// Watchdog de seguridad: garantiza que loadingOverlay NUNCA atrape la UI indefinidamente
setTimeout(function(){
  var ov=document.getElementById('loadingOverlay');
  if(ov&&!ov.classList.contains('hidden')){
    console.warn('fintrack: Watchdog de arranque forzó la ocultación del loadingOverlay');
    ov.classList.add('hidden');
    if(!currentUser){showAuth();}
    else{try{if(IS_DESKTOP){if(typeof dtRender==='function')dtRender();}else{render();}}catch(e){}}
  }
},5000);

