'use strict';
function recurrenceSeriesKey(t){
  if(t&&t.recur_series_id)return t.recur_series_id;
  var interval=(t&&t.recur_interval)||'monthly';
  var anchor=(t&&t.recur_anchor_date)||'';
  // Los datos antiguos no tenían id de serie. Incluir nota, subcategoría y
  // ancla evita fusionar cuotas legítimas que sólo comparten importe/categoría.
  return 'legacy|'+(t&&t.type||'')+'|'+(t&&t.category||'')+'|'+(t&&t.account_id||'')+'|'+Number(t&&t.amount||0)+'|'+interval+'|'+anchor+'|'+(t&&t.subcategory||'')+'|'+(t&&t.note||'');
}
function isRecurrenceExcluded(seriesKey,date){
  return recurrenceExclusions.some(function(x){return x.recur_series_id===seriesKey&&x.skipped_date===date;});
}
function monthKey(y,m){return y+'-'+pad(m+1);}
function isAutoSubBudgetCat(catId){var c=categories.find(function(c){return c.id===catId;});return !!(c&&c.name&&c.name.trim().toLowerCase()==='suscripciones');}
var INCOME_CAT_NAMES=['sueldo','ingresos'];
function isIncomeCat(catId){
  var c=categories.find(function(c){return c.id===catId;});
  if(c&&c.kind)return c.kind==='income';
  if(c&&c.name&&INCOME_CAT_NAMES.indexOf(c.name.trim().toLowerCase())!==-1)return true;
  var hasIncome=transactions.some(function(t){return t.category===catId&&t.type==='income';});
  var hasExpense=transactions.some(function(t){return t.category===catId&&t.type==='expense';});
  return hasIncome&&!hasExpense;
}
function autoRecurBudgetBreakdown(catId,year,month){
  var seriesMap={};
  transactions.forEach(function(t){
    if(!t.recurring||t.type!=='expense'||t.category!==catId||isTxExcludedFromExpense(t))return;
    var interval=t.recur_interval||'monthly';
    var key=recurrenceSeriesKey(t);
    (seriesMap[key]=seriesMap[key]||[]).push(t);
  });
  var total=0,items=[];
  Object.keys(seriesMap).forEach(function(key){
    var group=seriesMap[key];
    var root=group[0];
    group.forEach(function(t){if(new Date(t.date+'T12:00:00')<new Date(root.date+'T12:00:00'))root=t;});
    var interval=root.recur_interval||'monthly';
    var rootDate=new Date(root.date+'T12:00:00');
    var monthStart=new Date(year,month,1,12,0,0);
    var monthEnd=new Date(year,month+1,0,12,0,0);
    var monthEndStr=monthEnd.getFullYear()+'-'+pad(monthEnd.getMonth()+1)+'-'+pad(monthEnd.getDate());
    if(rootDate>monthEnd)return;
    var capGroup=group.filter(function(t){return t.date<=monthEndStr;});
    var latestCandidate=capGroup.length?capGroup[0]:group[0];
    capGroup.forEach(function(t){if(new Date(t.date+'T12:00:00')>new Date(latestCandidate.date+'T12:00:00'))latestCandidate=t;});
    var interval=latestCandidate.recur_interval||root.recur_interval||'monthly';
    var anchorSource=latestCandidate.recur_anchor_date||latestCandidate.date||root.recur_anchor_date||root.date;
    var anchorDay=parseInt(anchorSource.slice(8,10),10);
    var latestEndSource=group[0];
    group.forEach(function(t){if(new Date(t.date+'T12:00:00')>new Date(latestEndSource.date+'T12:00:00'))latestEndSource=t;});
    var effectiveEndDate=latestCandidate.recur_end_date||latestEndSource.recur_end_date||root.recur_end_date;
    var endDate=effectiveEndDate?new Date(effectiveEndDate+'T12:00:00'):null;
    if(endDate&&endDate<monthStart)return;
    var occ=rootDate,guard=0,count=0;
    while(occ<=monthEnd&&guard<5000){
      var occDate=occ.getFullYear()+'-'+pad(occ.getMonth()+1)+'-'+pad(occ.getDate());
      if(occ>=monthStart&&occ<=monthEnd&&(!endDate||occ<=endDate)&&!isRecurrenceExcluded(key,occDate))count++;
      occ=addInterval(occ,interval,anchorDay);
      guard++;
    }
    var latest=latestCandidate;
    var unitAmount=Number(latest.amount!=null?latest.amount:root.amount);
    if(count>0){
      var amt=roundMoney(unitAmount*count);
      total=roundMoney(total+amt);
      items.push({label:latest.note||root.note||(latest.subcategory?capitalize(latest.subcategory):(root.subcategory?capitalize(root.subcategory):'Gasto recurrente')),amount:amt,count:count});
    }
  });
  items.sort(function(a,b){return b.amount-a.amount;});
  return {total:roundMoney(total),items:items};
}
function autoRecurBudgetForCat(catId,year,month){return autoRecurBudgetBreakdown(catId,year,month).total;}
function budgetForCat(catId,year,month){
  var yr=(year!==undefined)?year:viewYear,mo=(month!==undefined)?month:viewMonth;
  var my=monthKey(yr,mo);
  var b=budgets.find(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});
  if(b)return b.amount;
  if(isAutoSubBudgetCat(catId))return autoRecurBudgetForCat(catId,yr,mo);
  return 0;
}
function hasManualBudget(catId,year,month){
  var yr=(year!==undefined)?year:viewYear,mo=(month!==undefined)?month:viewMonth;
  var my=monthKey(yr,mo);
  return budgets.some(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});
}
function budgetNoteForCat(catId,year,month){
  var yr=(year!==undefined)?year:viewYear,mo=(month!==undefined)?month:viewMonth;
  var my=monthKey(yr,mo);
  var b=budgets.find(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});
  return (b&&b.note)||'';
}
async function resetBudgetToAuto(catId){
  var my=monthKey(viewYear,viewMonth);
  var existing=budgets.find(function(b){return b.category_id===catId&&!b.is_total&&b.month_year===my;});
  if(!existing)return;
  setSync('syncing');
  budgets=budgets.filter(function(b){return b.id!==existing.id;});
  if(isOffline){
    queueOp({type:'delete',table:'budgets',id:existing.id});
    saveLocalCache();setSync('err');refreshTab();return;
  }
  try{
    var r=await sb.from('budgets').delete().eq('id',existing.id);
    if(r.error)throw r.error;
    saveLocalCache();setSync('ok');refreshTab();
  }catch(err){
    queueOp({type:'delete',table:'budgets',id:existing.id});
    saveLocalCache();setSync('err');refreshTab();
  }
}
function budgetForCatRange(catId,from,to){
  var y1=+from.slice(0,4),m1=+from.slice(5,7)-1,y2=+to.slice(0,4),m2=+to.slice(5,7)-1;
  var total=0,y=y1,m=m1;
  while(y<y2||(y===y2&&m<=m2)){total+=budgetForCat(catId,y,m);m++;if(m>11){m=0;y++;}}
  return total;
}
function totalBudget(year,month){
  var yr=(year!==undefined)?year:viewYear,mo=(month!==undefined)?month:viewMonth;
  var ym=monthKey(yr,mo);
  return categories.reduce(function(s,c){
    if(c.archived||isIncomeCat(c.id)||isCategoryExcludedFromExpense(c.id,ym))return s;
    return s+budgetForCat(c.id,yr,mo);
  },0);
}
function addInterval(d,interval,anchorDay){
  var nd=new Date(d.getTime());
  if(interval==='weekly'){nd.setDate(nd.getDate()+7);return nd;}
  if(interval==='biweekly'){nd.setDate(nd.getDate()+14);return nd;}
  var targetDay=anchorDay||nd.getDate();
  nd.setDate(1);
  if(interval==='yearly')nd.setFullYear(nd.getFullYear()+1);
  else if(interval==='quarterly')nd.setMonth(nd.getMonth()+3);
  else if(interval==='semiannual')nd.setMonth(nd.getMonth()+6);
  else nd.setMonth(nd.getMonth()+1);
  var dim=new Date(nd.getFullYear(),nd.getMonth()+1,0).getDate();
  nd.setDate(Math.min(targetDay,dim));
  return nd;
}
async function processRecurring(){
  var uid=currentUser.id;
  var recurring=transactions.filter(function(t){return t.recurring&&typeof t.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.date);});
  var created=0,failures=[];
  var today=new Date();today.setHours(23,59,59,999);
  var processed={};
  for(var ri=0;ri<recurring.length;ri++){
    var t=recurring[ri];
    var interval=t.recur_interval||'monthly';
    // Prefer the real series id; only fall back to the old composite-field key
    // for legacy rows created before recur_series_id existed.
    var seriesKey=recurrenceSeriesKey(t);
    if(processed[seriesKey])continue;
    processed[seriesKey]=true;
    var related=recurring.filter(function(tx){
      var txInterval=tx.recur_interval||'monthly';
      if(t.recur_series_id)return tx.recur_series_id===t.recur_series_id;
      return !tx.recur_series_id&&tx.category===t.category&&tx.type===t.type&&tx.account_id===t.account_id&&Math.abs(tx.amount-t.amount)<0.01&&txInterval===interval&&(tx.subcategory||'')===(t.subcategory||'')&&(tx.note||'')===(t.note||'');
    });
    var root=related[0];
    related.forEach(function(tx){if(new Date(tx.date+'T12:00:00')<new Date(root.date+'T12:00:00'))root=tx;});
    var latest=related[0];
    related.forEach(function(tx){if(new Date(tx.date+'T12:00:00')>new Date(latest.date+'T12:00:00'))latest=tx;});
    if(!root.recur_series_id){
      var oldSeriesKey=seriesKey,legacySeriesId='rsL_'+root.id;
      related.forEach(function(tx){tx.recur_series_id=legacySeriesId;tx.recur_anchor_date=root.date;});
      recurrenceExclusions.filter(function(x){return x.recur_series_id===oldSeriesKey;}).forEach(function(x){x.recur_series_id=legacySeriesId;});
      if(isOffline){
        related.forEach(function(tx){queueOp({type:'update',table:'transactions',id:tx.id,data:{recur_series_id:legacySeriesId,recur_anchor_date:root.date}});});
        recurrenceExclusions.filter(function(x){return x.recur_series_id===legacySeriesId;}).forEach(function(x){queueOp({type:'update',table:'recurrence_exclusions',id:x.id,data:{recur_series_id:legacySeriesId}});});
        offlineQueue.forEach(function(op){if(op.table==='recurrence_exclusions'&&op.data&&op.data.recur_series_id===oldSeriesKey){op.data.recur_series_id=legacySeriesId;}});
      }else{
        var migrated=await Promise.all(related.map(function(tx){return sb.from('transactions').update({recur_series_id:legacySeriesId,recur_anchor_date:root.date}).eq('id',tx.id);}));
        if(migrated.some(function(x){return x.error;})){setSync('err');continue;}
        var oldExclusions=recurrenceExclusions.filter(function(x){return x.recur_series_id===legacySeriesId;});
        await Promise.all(oldExclusions.map(function(x){return sb.from('recurrence_exclusions').update({recur_series_id:legacySeriesId}).eq('id',x.id);}));
      }
      root.recur_series_id=legacySeriesId;root.recur_anchor_date=root.date;seriesKey=legacySeriesId;processed[legacySeriesId]=true;
    }
    var orderedRelated=related.slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
    var activeAnchor=(root.recur_anchor_date||root.date);
    var activeInterval=root.recur_interval||interval;
    var activeEndStr=latest.recur_end_date||root.recur_end_date||null;
    var endDate=activeEndStr?new Date(activeEndStr+'T12:00:00'):null;
    var occ=new Date(root.date+'T12:00:00'),relIdx=0,guard=0;
    var curRef=root;
    while(occ<=today&&guard<1200){
      guard++;
      var occDateStr=occ.getFullYear()+'-'+pad(occ.getMonth()+1)+'-'+pad(occ.getDate());
      while(relIdx<orderedRelated.length&&orderedRelated[relIdx].date<=occDateStr){
        curRef=orderedRelated[relIdx];
        if(curRef.recur_interval)activeInterval=curRef.recur_interval;
        if(curRef.recur_anchor_date)activeAnchor=curRef.recur_anchor_date;
        if(curRef.recur_end_date)endDate=new Date(curRef.recur_end_date+'T12:00:00');
        relIdx++;
      }
      if(endDate&&occ>endDate)break;
      var stepAnchorDay=parseInt(String(activeAnchor).slice(8,10),10)||parseInt(String(occDateStr).slice(8,10),10);
      var next=addInterval(occ,activeInterval,stepAnchorDay);
      if(next>today||(endDate&&next>endDate))break;
      var newDate=next.getFullYear()+'-'+pad(next.getMonth()+1)+'-'+pad(next.getDate());
      var dup=transactions.find(function(tx){
        if(root.recur_series_id)return tx.recur_series_id===root.recur_series_id&&tx.date===newDate;
        return tx.category===root.category&&tx.type===root.type&&tx.account_id===root.account_id&&Math.abs(tx.amount-root.amount)<0.01&&(tx.recur_interval||'monthly')===activeInterval&&tx.date===newDate;
      });
      var queuedDup=(offlineQueue||[]).some(function(op){
        if(!op||op.table!=='transactions'||op.type!=='insert'||!op.data)return false;
        if(root.recur_series_id)return op.data.recur_series_id===root.recur_series_id&&op.data.date===newDate;
        return op.data.date===newDate&&op.data.category===root.category&&op.data.type===root.type&&op.data.account_id===root.account_id&&Math.abs(Number(op.data.amount||0)-Number(root.amount||0))<0.01;
      });
      var isVoided=(transactionVoids||[]).some(function(v){
        var vd=v&&v.transaction_data;
        if(!vd||vd.date!==newDate)return false;
        if(root.recur_series_id&&vd.recur_series_id)return vd.recur_series_id===root.recur_series_id;
        return vd.category===root.category&&vd.type===root.type&&vd.account_id===root.account_id&&Math.abs(Number(vd.amount||0)-Number(root.amount||0))<0.01;
      });
      if(!dup&&!queuedDup&&!isVoided&&!isRecurrenceExcluded(seriesKey,newDate)){
        var refTx=curRef||latest||root;
        var baseAmount=roundMoney(refTx.amount!=null?refTx.amount:root.amount);
        var newTx={id:'tx'+Date.now()+Math.random().toString(36).slice(2,6),type:refTx.type||root.type,amount:baseAmount,category:refTx.category||root.category,subcategory:refTx.subcategory||root.subcategory||null,note:refTx.note||root.note||null,date:newDate,recurring:true,recur_interval:activeInterval,recur_end_date:refTx.recur_end_date||latest.recur_end_date||root.recur_end_date||null,tags:refTx.tags||root.tags||[],account_id:refTx.account_id||root.account_id||null,to_account_id:null,recur_series_id:root.recur_series_id||null,recur_anchor_date:activeAnchor||root.date,user_id:uid,created_at:new Date().toISOString()};
        if(isOffline){
          transactions.unshift(newTx);
          queueOp({type:'insert',table:'transactions',data:sanitizeRemoteTxPayload(newTx)});
          created++;
        }else{
          try{
            var r=await sb.rpc('create_fintrack_recurring_occurrence',{payload:sanitizeRemoteTxPayload(newTx)});
            // Un fallo de red puede llegar después de que Supabase haya guardado la
            // cuota. Antes de reintentarlo comprobamos la serie y la fecha para no
            // duplicarla; si no existe, usamos una inserción normal como recuperación.
            if(r.error||!r.data){
              var existing=await sb.from('transactions').select('*').eq('user_id',uid).eq('recur_series_id',newTx.recur_series_id).eq('date',newDate).limit(1);
              if(existing.error)throw existing.error;
              if(existing.data&&existing.data.length)r={data:existing.data[0]};
              else{
                var fallback=await sb.from('transactions').insert(sanitizeRemoteTxPayload(newTx)).select();
                if(fallback.error)throw fallback.error;
                r={data:fallback.data&&fallback.data[0]};
              }
            }
            if(!r.data)throw new Error('La recurrencia no devolvió una transacción');
            var already=transactions.some(function(x){return x.id===r.data.id;});
            if(!already){transactions.unshift(r.data);created++;}
          }catch(recurrenceError){
            failures.push(newDate+' · '+(root.note||catById(root.category).name||'gasto recurrente'));
            console.error('No se pudo generar una recurrencia',recurrenceError);
          }
        }
      }
      occ=next;
    }
  }
  if(created>0){
    if(typeof invalidateTxIndices==='function')invalidateTxIndices();
    txVersion++;
    if(isOffline){
      saveLocalCache();
      setSync('err');
    }
  }
  if(failures.length){
    setSync('err');
    showSuccessToast('No se pudieron registrar '+failures.length+' recurrencia(s). Reintenta sincronizar.');
    throw new Error('Recurrencias pendientes: '+failures.join(', '));
  }
  return created;
}
