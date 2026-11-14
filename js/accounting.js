'use strict';
var _catExclusionsCache=null;
function getCategoryExpenseExclusions(){
  if(_catExclusionsCache)return _catExclusionsCache;
  var map={};
  try{
    var rawGlobal=localStorage.getItem('ft_cat_exclusions');
    if(rawGlobal){
      var parsedG=JSON.parse(rawGlobal);
      if(parsedG&&typeof parsedG==='object')Object.assign(map,parsedG);
    }
    if(currentUser&&currentUser.id){
      var rawUser=localStorage.getItem('ft_cat_exclusions_'+currentUser.id);
      if(rawUser){
        var parsedU=JSON.parse(rawUser);
        if(parsedU&&typeof parsedU==='object')Object.assign(map,parsedU);
      }
      if(currentUser.user_metadata&&currentUser.user_metadata.category_exclusions){
        Object.assign(map,currentUser.user_metadata.category_exclusions);
      }
    }
  }catch(e){}
  _catExclusionsCache=map;
  return _catExclusionsCache;
}
function saveCategoryExpenseExclusions(map){
  _catExclusionsCache=map||{};
  try{
    var s=JSON.stringify(_catExclusionsCache);
    localStorage.setItem('ft_cat_exclusions',s);
    if(currentUser&&currentUser.id){
      localStorage.setItem('ft_cat_exclusions_'+currentUser.id,s);
    }
  }catch(e){}
  try{saveLocalCache();}catch(e){}
  try{
    if(currentUser&&sb&&sb.auth&&typeof sb.auth.updateUser==='function'){
      sb.auth.updateUser({data:{category_exclusions:_catExclusionsCache}}).catch(function(){});
    }
  }catch(e){}
}
var _catIconsCache=null;
function getCategoryCustomIcons(){
  if(_catIconsCache)return _catIconsCache;
  var map={};
  try{
    var rawGlobal=localStorage.getItem('ft_cat_icons');
    if(rawGlobal){
      var parsedG=JSON.parse(rawGlobal);
      if(parsedG&&typeof parsedG==='object')Object.assign(map,parsedG);
    }
    if(currentUser&&currentUser.id){
      var rawUser=localStorage.getItem('ft_cat_icons_'+currentUser.id);
      if(rawUser){
        var parsedU=JSON.parse(rawUser);
        if(parsedU&&typeof parsedU==='object')Object.assign(map,parsedU);
      }
      if(currentUser.user_metadata&&currentUser.user_metadata.category_icons){
        Object.assign(map,currentUser.user_metadata.category_icons);
      }
    }
  }catch(e){}
  _catIconsCache=map;
  return _catIconsCache;
}
function saveCategoryCustomIcons(map){
  _catIconsCache=map||{};
  try{
    var s=JSON.stringify(_catIconsCache);
    localStorage.setItem('ft_cat_icons',s);
    if(currentUser&&currentUser.id){
      localStorage.setItem('ft_cat_icons_'+currentUser.id,s);
    }
  }catch(e){}
  try{saveLocalCache();}catch(e){}
  try{
    if(currentUser&&sb&&sb.auth&&typeof sb.auth.updateUser==='function'){
      sb.auth.updateUser({data:{category_icons:_catIconsCache}}).catch(function(){});
    }
  }catch(e){}
}
function applyCategoryCustomIcons(){
  var iconMap=getCategoryCustomIcons();
  var updated=false;
  (categories||[]).forEach(function(c){
    if(!c)return;
    if(iconMap[c.id]){
      c.icon=iconMap[c.id];
    } else if(c.icon){
      iconMap[c.id]=c.icon;
      updated=true;
    }
  });
  if(updated){
    saveCategoryCustomIcons(iconMap);
  }
}
function getCategoryCalcMode(catId,dateOrYm){
  if(!catId)return 0;
  var ym=typeof dateOrYm==='string'?dateOrYm.slice(0,7):monthKey(viewYear,viewMonth);
  var map=getCategoryExpenseExclusions();
  var val=map[catId+'|'+ym];
  if(val===true||val===2||val==='2'||val==='all')return 2;
  if(val===1||val==='1'||val==='balance')return 1;
  return 0;
}
function isCategoryExcludedFromExpense(catId,dateOrYm){
  var m=getCategoryCalcMode(catId,dateOrYm);
  return m===1||m===2;
}
function cycleCategoryCalcMode(catId,ym){
  var current=getCategoryExpenseExclusions();
  var map=Object.assign({},current);
  var targetYm=ym||monthKey(viewYear,viewMonth);
  var key=catId+'|'+targetYm;
  var curMode=getCategoryCalcMode(catId,targetYm);
  var nextMode=(curMode+1)%3;
  if(nextMode===0)delete map[key];
  else map[key]=nextMode;
  saveCategoryExpenseExclusions(map);
  var toastMsgs=[
    'Categoría: cuenta en todo',
    'Categoría: solo en balance (fuera de gastos)',
    'Categoría: no computa en gastos ni balance'
  ];
  showSuccessToast(toastMsgs[nextMode]);
  refreshTab();
}
function toggleCategoryExpenseExclusion(catId,ym){
  cycleCategoryCalcMode(catId,ym);
}
function getCatCalcPillContent(mode){
  if(mode===1){
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg> Solo en balance';
  }
  if(mode===2){
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> No computa';
  }
  return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Cuenta en todo';
}
function catById(id){
  if(!id)return {name:'',color:'#8E8E93',icon:'otros',subcats:[]};
  var c=categories.find(function(item){return item.id===id;});
  if(c){
    if(!c.icon){
      var iconMap=getCategoryCustomIcons();
      if(iconMap[c.id])c.icon=iconMap[c.id];
    }
    return c;
  }
  return {name:'(cat. eliminada)',color:'#8E8E93',icon:'otros',subcats:[],ghost:true};
}
function txDisplayCategory(t){
  if(t&&t.is_balance_adjustment)return {name:'Actualización de saldo',color:t.type==='expense'?'#FF3B30':'#34C759',icon:'balance',subcats:[]};
  if(t&&t.type==='transfer')return {name:'Transferencia',color:'#2563EB',icon:'transfer',subcats:[]};
  return catById(t&&t.category);
}
function getTxCalcMode(t){
  if(!t)return 0;
  if(Array.isArray(t.tags)){
    if(t.tags.includes('_no_calc'))return 2;
    if(t.tags.includes('_no_expense'))return 1;
  }
  if(t.exclude_from_calc===2||t.exclude_from_calc==='2'||t.exclude_from_calc==='all'||t.exclude_from_calc===true)return 2;
  if(t.exclude_from_calc===1||t.exclude_from_calc==='1'||t.exclude_from_calc==='expense'||t.exclude_from_calc==='balance')return 1;
  return 0;
}
function getEffectiveTxCalcMode(t){
  var m=getTxCalcMode(t);
  if(m!==0)return m;
  if(t&&t.category){
    var catM=getCategoryCalcMode(t.category,t.date);
    if(catM!==0)return catM;
  }
  return 0;
}
function isTxExcludedFromExpense(t){
  if(!t)return false;
  var m=getEffectiveTxCalcMode(t);
  return m===1||m===2;
}
function isTxExcludedFromBalance(t){
  if(!t)return false;
  var m=getEffectiveTxCalcMode(t);
  return m===2;
}
function isTxExcludedFromCalc(t){
  return isTxExcludedFromExpense(t);
}
function roundToDecimals(n,dec){
  n=Number(n);
  if(!Number.isFinite(n)||n===0)return 0;
  dec=dec==null?2:dec;
  var sign=n<0?-1:1;
  var abs=Math.abs(n);
  if(abs>=1e15){var f=Math.pow(10,dec);var rf=Math.round(abs*f)/f;return rf===0?0:sign*rf;}
  var fixed=abs.toFixed(dec+6).replace(/0+$/,'').replace(/\.$/,'');
  if(!fixed||fixed==='0')return 0;
  var shifted=Number(Math.round(Number(fixed+'e+'+dec))+'e-'+dec);
  return (!Number.isFinite(shifted)||shifted===0)?0:sign*shifted;
}
function roundMoney(n){
  return roundToDecimals(n,2);
}
function parseSingleNumericToken(tok,allowThousands3){
  if(!tok)return NaN;
  var sign=1;
  if(tok[0]==='-'){sign=-1;tok=tok.slice(1);}
  else if(tok[0]==='+'){tok=tok.slice(1);}
  if(!tok||!/^[0-9.,]+$/.test(tok)||!/\d/.test(tok))return NaN;
  var lastComma=tok.lastIndexOf(',');
  var lastDot=tok.lastIndexOf('.');
  if(lastComma>-1&&lastDot>-1){
    if(lastComma>lastDot){
      tok=tok.replace(/\./g,'').replace(/,/g,'.');
    }else{
      tok=tok.replace(/,/g,'');
    }
  }else if(lastComma>-1){
    var cParts=tok.split(',');
    if(cParts.length>2){
      if(/^\d{1,3}(,\d{3})+$/.test(tok))tok=cParts.join('');
      else return NaN;
    }else{
      tok=tok.replace(',','.');
    }
  }else if(lastDot>-1){
    var dParts=tok.split('.');
    if(dParts.length>2){
      if(/^\d{1,3}(\.\d{3})+$/.test(tok))tok=dParts.join('');
      else return NaN;
    }else if(allowThousands3&&dParts.length===2&&dParts[1].length===3&&dParts[0].length>=1&&dParts[0].length<=3&&Number(dParts[0])>0){
      tok=dParts.join('');
    }
  }
  if((tok.match(/\./g)||[]).length>1)return NaN;
  var n=Number(tok);
  return Number.isFinite(n)?sign*n:NaN;
}
function evaluateMathExpression(expr,allowThousands3){
  if(expr==null)return NaN;
  var s=String(expr).trim().replace(/[\s\u00A0€$£]/g,'').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');
  if(!s)return NaN;
  var tokens=[],i=0,len=s.length;
  while(i<len){
    var ch=s[i];
    if(/[0-9.,]/.test(ch)){
      var j=i;
      while(j<len&&/[0-9.,]/.test(s[j]))j++;
      var numVal=parseSingleNumericToken(s.slice(i,j),allowThousands3);
      if(!Number.isFinite(numVal))return NaN;
      tokens.push({t:'num',v:numVal});
      i=j;
      continue;
    }
    if(ch==='('||ch===')'||ch==='+'||ch==='-'||ch==='*'||ch==='/'){
      var prev=tokens.length?tokens[tokens.length-1]:null;
      var expectUnary=!prev||prev.t==='op'||prev.t==='uop'||prev.t==='lp';
      if(ch==='('){
        if(prev&&(prev.t==='num'||prev.t==='rp'))return NaN;
        tokens.push({t:'lp'});
      }else if(ch===')'){
        if(!prev||prev.t==='op'||prev.t==='uop'||prev.t==='lp')return NaN;
        tokens.push({t:'rp'});
      }else if((ch==='-'||ch==='+')&&expectUnary){
        if(ch==='-')tokens.push({t:'uop',v:'u-'});
      }else{
        if(expectUnary)return NaN;
        tokens.push({t:'op',v:ch});
      }
      i++;
      continue;
    }
    return NaN;
  }
  if(!tokens.length)return NaN;
  var out=[],ops=[],prec={'+':1,'-':1,'*':2,'/':2,'u-':3};
  for(var ti=0;ti<tokens.length;ti++){
    var tk=tokens[ti];
    if(tk.t==='num'){out.push(tk);}
    else if(tk.t==='uop'){ops.push(tk);}
    else if(tk.t==='op'){
      while(ops.length){
        var top=ops[ops.length-1];
        if(top.t==='lp')break;
        if((prec[top.v]||0)>=(prec[tk.v]||0))out.push(ops.pop());
        else break;
      }
      ops.push(tk);
    }else if(tk.t==='lp'){ops.push(tk);}
    else if(tk.t==='rp'){
      var foundLp=false;
      while(ops.length){
        var p=ops.pop();
        if(p.t==='lp'){foundLp=true;break;}
        out.push(p);
      }
      if(!foundLp)return NaN;
    }
  }
  while(ops.length){
    var rem=ops.pop();
    if(rem.t==='lp')return NaN;
    out.push(rem);
  }
  var st=[];
  for(var oi=0;oi<out.length;oi++){
    var node=out[oi];
    if(node.t==='num'){st.push(node.v);}
    else if(node.t==='uop'){
      if(!st.length)return NaN;
      st.push(-st.pop());
    }else{
      if(st.length<2)return NaN;
      var b=st.pop(),a=st.pop(),r=NaN;
      if(node.v==='+')r=a+b;
      else if(node.v==='-')r=a-b;
      else if(node.v==='*')r=a*b;
      else if(node.v==='/'){if(Math.abs(b)<1e-15)return NaN;r=a/b;}
      if(!Number.isFinite(r))return NaN;
      st.push(r);
    }
  }
  return st.length===1&&Number.isFinite(st[0])?st[0]:NaN;
}
function evalMathExpr(val){
  return evaluateMathExpression(val,true);
}
function parseNumberInput(val,dec,allowThousands3){
  if(val==null)return NaN;
  if(typeof val==='number')return Number.isFinite(val)?roundToDecimals(val,dec):NaN;
  var s=String(val).trim().replace(/[\s\u00A0€$£]/g,'').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');
  if(!s)return NaN;
  var res=/[+*\/()]|.-/.test(s)?evaluateMathExpression(s,allowThousands3):parseSingleNumericToken(s,allowThousands3);
  return Number.isFinite(res)?roundToDecimals(res,dec):NaN;
}
function parseCurrencyInput(val){
  return parseNumberInput(val,2,true);
}
function parseUnitsInput(val,dec){
  return parseNumberInput(val,dec==null?6:dec,false);
}
function parsePriceInput(val,dec){
  return parseNumberInput(val,dec==null?4:dec,false);
}
function calcPeriodTotals(txs){
  var inc=0,exp=0,balInc=0,balExp=0,uncompExp=0,exclExp=0;
  (txs||[]).forEach(function(t){
    if(!t||t.is_balance_adjustment)return;
    var amt=roundMoney(t.amount);
    if(t.type==='expense'){
      var m=getEffectiveTxCalcMode(t);
      if(m===0){
        exp=roundMoney(exp+amt);
        balExp=roundMoney(balExp+amt);
      }else if(m===1){
        uncompExp=roundMoney(uncompExp+amt);
        balExp=roundMoney(balExp+amt);
      }else if(m===2){
        exclExp=roundMoney(exclExp+amt);
      }
    }else if(t.type==='income'){
      var mi=getEffectiveTxCalcMode(t);
      if(mi===0){
        inc=roundMoney(inc+amt);
        balInc=roundMoney(balInc+amt);
      }else if(mi===1){
        balInc=roundMoney(balInc+amt);
      }
    }
  });
  var bal=roundMoney(balInc-balExp);
  var sRate=balInc>0?Math.round(((balInc-balExp)/balInc)*100):0;
  return {
    income: inc,
    expense: exp,
    balIncome: balInc,
    balExpense: balExp,
    balance: bal,
    savingsRate: sRate,
    uncomputedExpense: uncompExp,
    excludedExpense: exclExp
  };
}
function txExpenseImpact(t){
  if(!t)return 0;
  if(t.is_balance_adjustment)return 0;
  if(t.type!=='expense')return 0;
  if(isTxExcludedFromExpense(t))return 0;
  return Number(t.amount);
}
function txBalanceExpenseImpact(t){
  if(!t)return 0;
  if(t.is_balance_adjustment)return 0;
  if(t.type!=='expense')return 0;
  if(isTxExcludedFromBalance(t))return 0;
  return Number(t.amount);
}
function txIncomeImpact(t){
  if(!t)return 0;
  if(t.is_balance_adjustment)return 0;
  if(t.type!=='income')return 0;
  if(isTxExcludedFromExpense(t))return 0;
  return Number(t.amount);
}
function txBalanceIncomeImpact(t){
  if(!t)return 0;
  if(t.is_balance_adjustment)return 0;
  if(t.type!=='income')return 0;
  if(isTxExcludedFromBalance(t))return 0;
  return Number(t.amount);
}
var _monthTxCache={},_yearTxCache={};
var _txIndexVersion=-1,_txIndexLength=-1;
var _txByAccount={},_txByMonthStr={},_txByYearStr={},_txNormById={};

function invalidateTxIndices(){
  _txIndexVersion=-1;
  _txIndexLength=-1;
  _monthTxCache={};
  _yearTxCache={};
  _txByAccount={};
  _txByMonthStr={};
  _txByYearStr={};
  _txNormById={};
}

function ensureTxIndices(){
  if(_txIndexVersion===txVersion&&_txIndexLength===transactions.length)return;
  _txByAccount={};_txByMonthStr={};_txByYearStr={};_txNormById={};
  for(var i=0;i<transactions.length;i++){
    var t=transactions[i];
    if(t&&t.id){
      var uTags=Array.isArray(t.tags)?t.tags.filter(function(g){return g&&g!=='_no_calc'&&g!=='_no_expense';}).map(normStr).join(' '):'';
      _txNormById[t.id]=(t.note?normStr(t.note):'')+' '+(t.subcategory?normStr(t.subcategory):'')+(uTags?' '+uTags:'');
    }
    var d=t.date;
    if(d&&typeof d==='string'){
      var ym=d.slice(0,7);
      var y=d.slice(0,4);
      if(!_txByMonthStr[ym])_txByMonthStr[ym]=[];
      _txByMonthStr[ym].push(t);
      if(!_txByYearStr[y])_txByYearStr[y]=[];
      _txByYearStr[y].push(t);
    }
    if(!t.is_balance_adjustment){
      var a1=t.account_id,a2=t.to_account_id;
      if(a1){
        if(!_txByAccount[a1])_txByAccount[a1]=[];
        _txByAccount[a1].push(t);
      }
      if(a2&&a2!==a1){
        if(!_txByAccount[a2])_txByAccount[a2]=[];
        _txByAccount[a2].push(t);
      }
      if(!a1&&t.type!=='transfer'&&accounts.length===1){
        var sa=accounts[0].id;
        if(!_txByAccount[sa])_txByAccount[sa]=[];
        _txByAccount[sa].push(t);
      }
    }
  }
  _txIndexVersion=txVersion;
  _txIndexLength=transactions.length;
}

function scheduleTxIndexing(){
  if(typeof requestIdleCallback==='function'){
    requestIdleCallback(function(){ensureTxIndices();},{timeout:250});
  }else{
    setTimeout(ensureTxIndices,0);
  }
}

function getMonthTx(){
  ensureTxIndices();
  var ym=viewYear+'-'+pad(viewMonth+1);
  return _txByMonthStr[ym]||[];
}
function getYearTx(){
  ensureTxIndices();
  var y=String(viewYear);
  return _txByYearStr[y]||[];
}
function lastDayOfMonthStr(yr,mo){var d=new Date(yr,mo,0);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function isLockedAdjust(p){var id=(p&&typeof p==='object')?p.id:p;return typeof id==='string'&&id.indexOf('anchor_')===0;}
var _historyCache={};
function isTxAfterReset(t,reset,baseDate){
  if(!t||t.is_balance_adjustment||!t.date)return false;
  if(!reset)return t.date>baseDate;
  if(t.date>baseDate)return true;
  if(t.date<baseDate)return false;
  if(reset.created_at&&t.created_at)return String(t.created_at)>String(reset.created_at);
  return false;
}
function accountTheoreticalFromLastRealReset(accountId,dateStr){
  // Un ajuste fija el saldo real de partida para el periodo posterior. Su
  // transacción asociada se ignora por completo: no modifica este cálculo.
  var reset=accountHistory(accountId).filter(function(p){
    var d=p.reset_date||lastDayOfMonthStr(p.year,p.month);
    return d<dateStr;
  }).pop();
  var base=reset?Number(reset.amount):0;
  var baseDate=reset?(reset.reset_date||lastDayOfMonthStr(reset.year,reset.month)):'0000-01-01';
  ensureTxIndices();
  var pool=_txByAccount[accountId]||[];
  var live=pool.filter(function(t){
    return accountTouchesAccount(t,accountId)&&isTxAfterReset(t,reset,baseDate)&&t.date<=dateStr;
  }).reduce(function(sum,t){return sum+accountTxDelta(t,accountId);},0);
  return roundMoney(base+live);
}
function snapshotTheoreticalAmount(snapshot,accountId){
  if(!snapshot)return 0;
  if(snapshot.theoretical_amount!=null&&typeof snapshot.theoretical_amount==='number')return snapshot.theoretical_amount;
  return accountTheoreticalFromLastRealReset(accountId,snapshot.reset_date||lastDayOfMonthStr(snapshot.year,snapshot.month));
}
function accountHistory(accountId){
  if(_historyCache[accountId])return _historyCache[accountId];
  return _historyCache[accountId]=patrimony.filter(function(p){return p.account_id===accountId;}).sort(function(a,b){
    var da=a.reset_date||lastDayOfMonthStr(a.year,a.month),db=b.reset_date||lastDayOfMonthStr(b.year,b.month);
    if(da!==db)return da.localeCompare(db);
    if(a.created_at&&b.created_at&&a.created_at!==b.created_at)return String(a.created_at).localeCompare(String(b.created_at));
    return (a.id||'').localeCompare(b.id||'');
  });
}
function accountLatestReset(accountId,yr,mo){
  var cutoff=(mo===12)?(yr+1)+'-01-01':yr+'-'+pad(mo+1)+'-01';
  var candidates=accountHistory(accountId).filter(function(p){
    var d=p.reset_date||lastDayOfMonthStr(p.year,p.month);
    return d<cutoff;
  });
  if(!candidates.length)return null;
  return candidates[candidates.length-1];
}
function accountTxDelta(t,accountId){
  // Los ajustes automáticos cuentan en los totales, no en el saldo teórico.
  if(t.is_balance_adjustment)return 0;
  if(t.type==='transfer'){
    var d=0;
    if(t.account_id===accountId)d-=Number(t.amount);
    if(t.to_account_id===accountId)d+=Number(t.amount);
    return d;
  }
  if(!(t.account_id===accountId||(!t.account_id&&accounts.length===1)))return 0;
  return t.type==='expense'?-Number(t.amount):Number(t.amount);
}
function accountTouchesAccount(t,accountId){return !t.is_balance_adjustment&&(t.account_id===accountId||t.to_account_id===accountId||(!t.account_id&&t.type!=='transfer'&&accounts.length===1));}
function accountCalcBalance(accountId,yr,mo){
  var cutoff=(mo===12)?(yr+1)+'-01-01':yr+'-'+pad(mo+1)+'-01';
  var reset=accountLatestReset(accountId,yr,mo);
  var base=reset?Number(reset.amount):0;
  var baseDate=reset?(reset.reset_date||lastDayOfMonthStr(reset.year,reset.month)):'0000-01-01';
  ensureTxIndices();
  var pool=_txByAccount[accountId]||[];
  var live=pool.filter(function(t){return accountTouchesAccount(t,accountId)&&isTxAfterReset(t,reset,baseDate)&&t.date<cutoff;}).reduce(function(s,t){return s+accountTxDelta(t,accountId);},0);
  return roundMoney(base+live);
}
function accountCalcBalanceAsOf(accountId,dateStr){
  var hist=accountHistory(accountId).filter(function(p){var d=p.reset_date||lastDayOfMonthStr(p.year,p.month);return d<=dateStr;});
  var reset=hist.length?hist[hist.length-1]:null;
  var base=reset?Number(reset.amount):0;
  var baseDate=reset?(reset.reset_date||lastDayOfMonthStr(reset.year,reset.month)):'0000-01-01';
  ensureTxIndices();
  var pool=_txByAccount[accountId]||[];
  var live=pool.filter(function(t){return accountTouchesAccount(t,accountId)&&isTxAfterReset(t,reset,baseDate)&&t.date<=dateStr;}).reduce(function(s,t){return s+accountTxDelta(t,accountId);},0);
  return roundMoney(base+live);
}
function accountCalcTheoreticalAsOf(accountId,dateStr){
  return accountTheoreticalFromLastRealReset(accountId,dateStr);
}
var _rbCache={};
function clearBalanceCache(){_rbCache={};_historyCache={};}
function accountRealBalanceAtDate(accountId,dateStr){
  var key=accountId+'@'+dateStr;
  if(key in _rbCache)return _rbCache[key];
  var hist=accountHistory(accountId).filter(function(p){var d=p.reset_date||lastDayOfMonthStr(p.year,p.month);return d<=dateStr;});
  var v=hist.length?Number(hist[hist.length-1].amount):null;
  _rbCache[key]=v;return v;
}
async function applyBalanceAdjustment(accountId,overrideDate,overrideReal){
  var date=overrideDate,real=overrideReal;
  if(date===undefined||real===undefined){
    var dateInp=document.getElementById('adjdate_'+accountId),amtInp=document.getElementById('adjamount_'+accountId);
    if(dateInp)date=dateInp.value;
    if(amtInp)real=parseCurrencyInput(amtInp.value);
  }
  if(!date||isNaN(real))return;
  var sameDateSnap=accountHistory(accountId).find(function(p){return (p.reset_date||lastDayOfMonthStr(p.year,p.month))===date;});
  if(sameDateSnap&&!isLockedAdjust(sameDateSnap)){
    transactions=transactions.filter(function(t){return t.balance_adjustment_patrimony_id!==sameDateSnap.id;});
    patrimony=patrimony.filter(function(p){return p.id!==sameDateSnap.id;});
    if(isOffline){
      queueOp({type:'delete',table:'transactions',id:'txbal_'+sameDateSnap.id});
      queueOp({type:'delete',table:'patrimony',id:sameDateSnap.id});
    }else{
      try{await sb.rpc('delete_fintrack_balance_adjustment',{snapshot_id:sameDateSnap.id});}catch(delErr){}
    }
  }
  var laterExists=accountHistory(accountId).some(function(p){return (p.reset_date||lastDayOfMonthStr(p.year,p.month))>date;});
  if(laterExists&&!confirm('Ya existe un ajuste posterior a esta fecha. Este nuevo ajuste no afectará al saldo actual mostrado, solo al histórico. ¿Continuar?'))return;
  var yr=parseInt(date.slice(0,4)),mo=parseInt(date.slice(5,7));
  var theoretical=accountCalcTheoreticalAsOf(accountId,date);
  var diff=roundMoney(real-theoretical);
  setSync('syncing');var s=document.getElementById('patStatus');if(s){s.textContent='guardando...';s.className='status-msg';}
  // El snapshot guarda el saldo real observado y su desfase frente al teórico.
  // En fechas posteriores pasa a ser el nuevo punto de partida, pero el
  // movimiento de actualización nunca entra en el saldo teórico.
  var nowIso=new Date().toISOString();
  var item={id:'p'+accountId+Date.now()+Math.random().toString(36).slice(2,6),account_id:accountId,year:yr,month:mo,amount:real,theoretical_amount:theoretical,reset_date:date,user_id:currentUser.id};
  var adjustment=null;
  if(Math.abs(diff)>0.005){
    var adjustmentType=diff<0?'expense':'income';
    adjustment={id:'txbal_'+item.id,type:adjustmentType,amount:roundMoney(Math.abs(diff)),category:balanceAdjustmentCategorySpec(adjustmentType).id,subcategory:null,note:'Actualización de saldo',date:date,recurring:false,recur_interval:null,recur_end_date:null,recur_series_id:null,recur_anchor_date:null,tags:[],account_id:accountId,to_account_id:null,is_balance_adjustment:true,balance_adjustment_patrimony_id:item.id,user_id:currentUser.id};
  }
  if(isOffline){
    var localItem=Object.assign({},item,{created_at:nowIso});
    var localAdj=adjustment?Object.assign({},adjustment,{created_at:nowIso}):null;
    patrimony.push(localItem);if(!queueOp({type:'insert',table:'patrimony',data:item})){patrimony.pop();return;}
    if(localAdj){transactions.unshift(localAdj);if(!queueOp({type:'insert',table:'transactions',data:adjustment})){transactions.shift();patrimony.pop();return;}}
    saveLocalCache();setSync('err');if(s){s.textContent='guardado (pendiente de sincronizar)';s.className='status-msg status-ok';}refreshTab();return;
  }
  var r;
  try{
    var rpcRes=await withLoadTimeout(sb.rpc('save_fintrack_balance_adjustment',{snapshot:item,adjustment:adjustment}),8000,'Tiempo de espera al guardar el saldo real');
    if(rpcRes.error)throw new Error(rpcRes.error.message||'No se pudo guardar el saldo real');
    r=(rpcRes.data&&typeof rpcRes.data==='object')?rpcRes.data:{patrimony:item,transaction:adjustment};
  }catch(saveError){
    var localItemFb=Object.assign({},item,{created_at:nowIso});
    var localAdjFb=adjustment?Object.assign({},adjustment,{created_at:nowIso}):null;
    if(!patrimony.some(function(p){return p.id===item.id;})){patrimony.push(localItemFb);queueOp({type:'insert',table:'patrimony',data:item});}
    if(localAdjFb&&!transactions.some(function(t){return t.id===adjustment.id;})){transactions.unshift(localAdjFb);queueOp({type:'insert',table:'transactions',data:adjustment});}
    saveLocalCache();setSync('err');if(s){s.textContent='guardado localmente · pendiente de sincronizar';s.className='status-msg status-ok';}refreshTab();return;
  }
  var saved=r.patrimony||Object.assign({},item,{created_at:nowIso});
  if(!saved.created_at)saved.created_at=nowIso;
  patrimony.push(saved);
  if(r.transaction){
    if(!r.transaction.created_at)r.transaction.created_at=nowIso;
    transactions.unshift(r.transaction);
  }
  clearBalanceCache();invalidateTxIndices();txVersion++;saveLocalCache();setSync('ok');
  var diffMsg=Math.abs(diff)>=0.005?(diff>0?'+':'')+fmt(diff)+' de desfase':'sin desfase';
  showSuccessToast('Saldo actualizado · '+diffMsg);
  refreshTab();
}

function balanceAdjustmentCategorySpec(type){
  return type==='income'
    ?{id:'cat_balance_adjustment_income',name:'Ajuste de saldo (ingreso)',color:'#34C759',kind:'income'}
    :{id:'cat_balance_adjustment_expense',name:'Ajuste de saldo (gasto)',color:'#FF3B30',kind:'expense'};
}
