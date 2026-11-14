'use strict';
window.addEventListener('online',function(){isOffline=false;_queueRetryCount=0;document.getElementById('offlineBanner').classList.remove('show');setSync('syncing');loadData();});
window.addEventListener('offline',function(){isOffline=true;document.getElementById('offlineBanner').classList.add('show');setSync('err');});
var isProcessingOfflineQueue=false, offlineQueuePromise=null, _queueRetryCount=0, _queueRetryTimer=null, _syncIssuesCache=[], _queueWriteGen=0;
function withOfflineSyncLock(uid,fn){
  if(typeof navigator!=='undefined'&&navigator.locks&&typeof navigator.locks.request==='function'){
    return navigator.locks.request('fintrack_sync_'+(uid||'anon'),fn);
  }
  return fn();
}
async function saveEncryptedLsJson(storageKey,data){
  var json=JSON.stringify(data);
  try{
    var key=await secureCacheKey();
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,new TextEncoder().encode(json));
    localStorage.setItem(storageKey,JSON.stringify({__enc:1,iv:cacheBytesToB64(iv),data:cacheBytesToB64(new Uint8Array(cipher))}));
    return true;
  }catch(e){
    return false;
  }
}
async function loadEncryptedLsJson(storageKey,fallback){
  var raw=null;
  try{raw=localStorage.getItem(storageKey);}catch(e){}
  if(!raw)return fallback;
  try{
    var parsed=JSON.parse(raw);
    if(parsed&&parsed.__enc===1&&parsed.iv&&parsed.data){
      var key=await secureCacheKey();
      var plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:cacheB64ToBytes(parsed.iv)},key,cacheB64ToBytes(parsed.data));
      return JSON.parse(new TextDecoder().decode(plain));
    }
    if(Array.isArray(parsed)){
      saveEncryptedLsJson(storageKey,parsed).catch(function(){});
      return parsed;
    }
  }catch(e){}
  return fallback;
}
function persistOfflineQueue(){
  var qKey=queueKey(),snapshot=offlineQueue.slice(),gen=++_queueWriteGen;
  return saveEncryptedLsJson(qKey,snapshot).then(function(ok){
    if(gen!==_queueWriteGen)return;
    if(!ok){console.warn('No se pudo cifrar ft_queue local en reposo');}
  });
}
function processOfflineQueue(){
  if(offlineQueuePromise)return offlineQueuePromise;
  if(!currentUser||!offlineQueue.length)return Promise.resolve();
  clearTimeout(_queueRetryTimer);_queueRetryTimer=null;
  var uid=currentUser.id;
  offlineQueuePromise=withOfflineSyncLock(uid,async function(){
    var persisted=await loadEncryptedLsJson(queueKey(),null);
    if(Array.isArray(persisted)&&persisted.length===0&&offlineQueue.length&&!_queueWriteGen){
      offlineQueue=[];
    }else if(Array.isArray(persisted)&&persisted.length&&!offlineQueue.length){
      offlineQueue=persisted;
    }
    if(!offlineQueue.length)return;
    isProcessingOfflineQueue=true;
    setSync('syncing');
    var batch=offlineQueue.slice();
    var processedOps=new Set();
    var failed=[];
    var abortedTransient=false;
    try{
      for(var i=0;i<batch.length;i++){
        var op=batch[i];
        var res=null;
        var networkDown=false;
        try{
          if(!navigator.onLine){networkDown=true;}
          else if(op.type==='insert'){
            var conflictTarget='id';
            if(op.table==='transaction_voids')conflictTarget='user_id,transaction_id';
            else if(op.table==='recurrence_exclusions')conflictTarget='user_id,recur_series_id,skipped_date';
            res=await sb.from(op.table).upsert(op.table==='transactions'?sanitizeRemoteTxPayload(op.data):op.data,{onConflict:conflictTarget});
          }
          else if(op.type==='update')res=await sb.from(op.table).update(op.table==='transactions'?sanitizeRemoteTxPayload(op.data):op.data).eq('id',op.id);
          else if(op.type==='delete')res=await sb.from(op.table).delete().eq('id',op.id);
        }catch(e){
          res=null;
          if(!navigator.onLine||(e&&(e.name==='TypeError'||(e.message&&e.message.includes('fetch'))))){
            networkDown=true;
          }
        }
        if(networkDown){
          abortedTransient=true;
          for(var j=i;j<batch.length;j++)failed.push(batch[j]);
          break;
        }
        if(res&&res.error){
          var errCode=res.error.code?String(res.error.code):'';
          if(errCode==='23505'){
            processedOps.add(op);console.warn('Operación offline ya procesada remotamente:',op);
          }else if(errCode&&(errCode.startsWith('23')||errCode==='42501'||errCode==='P0001')){
            addSyncIssue(op,res.error.message||res.error.details);
            processedOps.add(op);
          }else{
            abortedTransient=true;
            for(var j2=i;j2<batch.length;j2++)failed.push(batch[j2]);
            break;
          }
        }else if(res){
          processedOps.add(op);
          if(op.type==='insert'&&op.table==='recurrence_exclusions'&&!isRecurrenceExcluded(op.data.recur_series_id,op.data.skipped_date))recurrenceExclusions.push(op.data);
        }else{
          abortedTransient=true;
          for(var j3=i;j3<batch.length;j3++)failed.push(batch[j3]);
          break;
        }
      }
      offlineQueue=offlineQueue.filter(function(op){return !processedOps.has(op);});
      await persistOfflineQueue();
      if(!offlineQueue.length){_queueRetryCount=0;}
      else if(processedOps.size>0&&!abortedTransient){_queueRetryCount=0;}
      setSync(offlineQueue.length?'err':'ok');
    }finally{
      isProcessingOfflineQueue=false;
      offlineQueuePromise=null;
      if(offlineQueue.length&&navigator.onLine){
        _queueRetryCount=Math.min(_queueRetryCount+1,6);
        var baseMs=Math.min(60000,Math.pow(2,_queueRetryCount)*1000);
        var jitterMs=Math.round(baseMs*(0.7+Math.random()*0.6));
        _queueRetryTimer=setTimeout(processOfflineQueue,jitterMs);
      }
    }
  });
  return offlineQueuePromise;
}

// ── BANDEJA DE SINCRONIZACIÓN OFFLINE & DEAD-LETTER QUEUE ─────────
function syncIssuesKey(){return 'ft_sync_issues_'+(currentUser?currentUser.id:'anon');}
function getSyncIssues(){return _syncIssuesCache.slice();}
function saveSyncIssues(list){
  _syncIssuesCache=Array.isArray(list)?list.slice():[];
  saveEncryptedLsJson(syncIssuesKey(),_syncIssuesCache).catch(function(){});
}
function addSyncIssue(op, err){
  var list=getSyncIssues();
  list.push({id:'iss_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),op:op,error:err?(err.message||String(err)):'Error desconocido',date:new Date().toISOString()});
  saveSyncIssues(list);
  updateSyncTrayBadge();
}
function clearSyncIssues(){saveSyncIssues([]);updateSyncTrayBadge();}
function updateSyncTrayBadge(){
  var count=offlineQueue.length + getSyncIssues().length;
  var badges=document.querySelectorAll('.sync-tray-count-badge');
  badges.forEach(function(b){
    b.textContent=count>0?count:'';
    b.style.display=count>0?'inline-flex':'none';
  });
}
function openSyncTray(){
  var issues=getSyncIssues();
  var qLen=offlineQueue.length;
  var total=qLen+issues.length;
  var overlay=document.createElement('div');
  overlay.className='critical-confirm-bg';
  overlay.style.zIndex='2100';
  var itemsHtml='';
  if(!total){
    itemsHtml='<div style="text-align:center;padding:30px 10px;color:var(--text3);font-size:14px;"><div style="margin-bottom:12px;color:var(--brand-green);"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>Todos tus datos están perfectamente sincronizados.</div>';
  } else {
    itemsHtml='<div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:12px 0;">';
    offlineQueue.forEach(function(op,i){
      var desc=op.data?(op.data.note||op.data.concept||op.data.name||op.table):op.table;
      var amt=op.data&&op.data.amount?fmt(op.data.amount):'';
      itemsHtml+='<div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;font-size:13px;"><div><strong>'+htmlEscape(op.type.toUpperCase())+' · '+htmlEscape(desc)+'</strong><br><small style="color:var(--text3);">Pendiente de conexión</small></div><div style="color:var(--amber);font-weight:700;">'+amt+'</div></div>';
    });
    issues.forEach(function(iss,i){
      var desc=iss.op&&iss.op.data?(iss.op.data.note||iss.op.data.concept||iss.op.table):'Operación';
      itemsHtml+='<div style="background:rgba(255,59,48,0.08);border:1px solid rgba(255,59,48,0.25);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;"><div style="display:flex;justify-content:space-between;"><strong style="color:var(--red);">Incidencia de sincronización</strong><small style="color:var(--text3);">'+new Date(iss.date).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})+'</small></div><div style="color:var(--text);margin-top:2px;">'+htmlEscape(desc)+'</div><div style="color:var(--red);font-size:11px;margin-top:4px;">'+htmlEscape(iss.error)+'</div></div>';
    });
    itemsHtml+='</div>';
  }
  overlay.innerHTML='<div class="critical-confirm-card" role="dialog" aria-modal="true">'
    +'<div class="critical-confirm-handle"></div>'
    +'<div class="critical-confirm-kicker" style="color:var(--brand-green)">Estado de sincronización</div>'
    +'<h3 style="font-size:20px;letter-spacing:-.4px;margin:5px 0;">Bandeja de operaciones ('+total+')</h3>'
    +itemsHtml
    +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">'
    +(total>0?'<button type="button" id="btnRetrySyncTray" style="background:var(--accent-grad);border:none;color:#fff;border-radius:20px;padding:12px;font:700 14px var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Reintentar sincronización ahora</button>':'')
    +(total>0?'<button type="button" id="btnExportSyncRescue" style="background:var(--bg3);border:1px solid var(--card-border);color:var(--text);border-radius:20px;padding:12px;font:700 13px var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar JSON de rescate</button>':'')
    +(issues.length>0?'<button type="button" id="btnClearSyncIssues" style="background:rgba(255,59,48,0.12);border:none;color:var(--red);border-radius:20px;padding:11px;font:700 13px var(--font);cursor:pointer;">Limpiar incidencias resueltas</button>':'')
    +'<button type="button" id="btnCloseSyncTray" style="background:none;border:none;color:var(--text3);padding:10px;font:600 13px var(--font);cursor:pointer;">Cerrar</button>'
    +'</div></div>';
  document.body.appendChild(overlay);
  lockBodyScroll();
  function onSyncKeyDown(e){if(e.key==='Escape'){e.preventDefault();close();}}
  window.addEventListener('keydown',onSyncKeyDown);
  function close(){window.removeEventListener('keydown',onSyncKeyDown);overlay.remove();unlockBodyScroll();}
  var rBtn=overlay.querySelector('#btnRetrySyncTray');if(rBtn)rBtn.onclick=async function(){this.disabled=true;this.textContent='Sincronizando…';await loadData(true);close();showSuccessToast('Sincronización completada');};
  var eBtn=overlay.querySelector('#btnExportSyncRescue');if(eBtn)eBtn.onclick=function(){var rescue={queue:offlineQueue,issues:getSyncIssues(),exported_at:new Date().toISOString()};var blob=new Blob([JSON.stringify(rescue,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fintrack_sync_rescue_'+todayStr()+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);};
  var cBtn=overlay.querySelector('#btnClearSyncIssues');if(cBtn)cBtn.onclick=function(){clearSyncIssues();close();showSuccessToast('Incidencias limpiadas');};
  overlay.querySelector('#btnCloseSyncTray').onclick=close;
  overlay.onclick=function(e){if(e.target===overlay)close();};
}
function queueKey(){return 'ft_queue_'+(currentUser?currentUser.id:'anon');}
function queueOp(op){
  offlineQueue.push(op);
  try{
    localStorage.setItem(queueKey()+'_probe','1');
    localStorage.removeItem(queueKey()+'_probe');
    persistOfflineQueue();
    updateSyncTrayBadge();
    return true;
  }catch(e){
    offlineQueue.pop();
    setSync('err');
    showSuccessToast('No hay espacio local para guardar este cambio');
    return false;
  }
}
var ftRealtimeChannel=null,ftRealtimeTimer=null;
function subscribeRealtime(){
  if(!currentUser||!sb.channel)return;
  if(ftRealtimeChannel){try{sb.removeChannel(ftRealtimeChannel);}catch(e){}}
  var uid=currentUser.id;
  ftRealtimeChannel=sb.channel('fintrack-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'categories',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'accounts',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'budgets',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'patrimony',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'recurrence_exclusions',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'transaction_voids',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).on('postgres_changes',{event:'*',schema:'public',table:'investment_operations',filter:'user_id=eq.'+uid},scheduleRemoteRefresh).subscribe();
}
function scheduleRemoteRefresh(){
  if(isOffline||offlineQueue.length||loadDataInFlight)return;
  clearTimeout(ftRealtimeTimer);ftRealtimeTimer=setTimeout(function(){if(currentUser&&!isOffline&&!offlineQueue.length&&!loadDataInFlight)loadData(true);},500);
}

function switchAuthTab(m){
  authMode=m;
  document.getElementById('tabLogin').classList.toggle('active',m==='login');
  document.getElementById('tabRegister').classList.toggle('active',m==='register');
  document.getElementById('tabLogin').setAttribute('aria-selected',m==='login'?'true':'false');
  document.getElementById('tabRegister').setAttribute('aria-selected',m==='register'?'true':'false');
  document.getElementById('authSubmitBtn').textContent=m==='login'?'Entrar':'Crear cuenta';
  var p2=document.getElementById('pass2Wrap');if(p2)p2.style.display=m==='register'?'block':'none';
  var fp=document.getElementById('forgotPassWrap');if(fp)fp.style.display=m==='register'?'none':'block';
  document.getElementById('authMsg').textContent='';
  // Move auth tab pill
  var pill=document.getElementById('authTabPill');
  var tab=document.getElementById(m==='login'?'tabLogin':'tabRegister');
  if(pill&&tab){
    var parent=tab.parentElement;
    var parentRect=parent.getBoundingClientRect();
    var tabRect=tab.getBoundingClientRect();
    pill.style.left=(tabRect.left-parentRect.left)+'px';
    pill.style.width=tabRect.width+'px';
  }
}
function showAuthForm(){document.getElementById('authForm').style.display='block';document.getElementById('magicSent').style.display='none';}
function loginLockRemaining(){
  try{var d=JSON.parse(localStorage.getItem('ft_login_throttle')||'{}');
    if(d.until&&Date.now()<d.until)return Math.ceil((d.until-Date.now())/1000);}catch(e){}
  return 0;
}
function recordLoginFail(){
  var d={};try{d=JSON.parse(localStorage.getItem('ft_login_throttle')||'{}');}catch(e){}
  d.fails=(d.fails||0)+1;
  if(d.fails>=5){d.until=Date.now()+Math.min(15*60,Math.pow(2,d.fails-5)*30)*1000;} // exp backoff, cap 15 min
  localStorage.setItem('ft_login_throttle',JSON.stringify(d));
}
function clearLoginThrottle(){localStorage.removeItem('ft_login_throttle');}
async function submitAuth(){
  var email=document.getElementById('authEmail').value.trim(),pass=document.getElementById('authPass').value,msg=document.getElementById('authMsg');
  if(!email||!pass){msg.textContent='completa email y contraseña';msg.className='auth-msg err';return;}
  var lock=loginLockRemaining();
  if(authMode==='login'&&lock){var m=Math.ceil(lock/60);msg.textContent='Demasiados intentos. Espera '+(lock>60?m+' min':lock+' s')+'.';msg.className='auth-msg err';return;}
  msg.textContent='...';msg.className='auth-msg';
  if(authMode==='login'){
    var r=await sb.auth.signInWithPassword({email:email,password:pass});
    if(r.error){recordLoginFail();var rem=loginLockRemaining();msg.textContent=(r.error.message==='Invalid login credentials'?'Email o contraseña incorrectos':r.error.message)+(rem?' · bloqueado '+(rem>60?Math.ceil(rem/60)+' min':rem+' s'):'');msg.className='auth-msg err';}
    else{clearLoginThrottle();}
  } else {
    var p2=document.getElementById('authPass2').value;
    if(pass!==p2){msg.textContent='las contraseñas no coinciden';msg.className='auth-msg err';return;}
    if(pass.length<10){msg.textContent='usa al menos 10 caracteres';msg.className='auth-msg err';return;}
    var r=await sb.auth.signUp({email:email,password:pass});
    if(r.error){msg.textContent=r.error.message;msg.className='auth-msg err';}
    else if(r.data.user&&!r.data.session){msg.textContent='revisa tu email para confirmar la cuenta';msg.className='auth-msg ok';}
    else{msg.textContent='accediendo...';msg.className='auth-msg ok';}
  }
}
async function sendMagicLink(){
  var email=document.getElementById('authEmail').value.trim(),msg=document.getElementById('authMsg');
  if(!email){msg.textContent='introduce tu email primero';msg.className='auth-msg err';return;}
  msg.textContent='enviando...';msg.className='auth-msg';
  var r=await sb.auth.signInWithOtp({email:email,options:{emailRedirectTo:window.location.href}});
  if(r.error){msg.textContent=r.error.message;msg.className='auth-msg err';}
  else{document.getElementById('authForm').style.display='none';document.getElementById('magicSent').style.display='block';document.getElementById('magicEmail').textContent=email;}
}
async function sendPasswordReset(){
  var email=document.getElementById('authEmail').value.trim(),msg=document.getElementById('authMsg');
  if(!email){msg.textContent='introduce tu email primero';msg.className='auth-msg err';return;}
  msg.textContent='enviando...';msg.className='auth-msg';
  var r=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
  if(r.error){msg.textContent=r.error.message;msg.className='auth-msg err';}
  else{msg.textContent='revisa tu email para restablecer la contraseña';msg.className='auth-msg ok';}
}
function showResetPasswordForm(){
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('authScreen').style.display='flex';
  ['appHeader','mainChart','bottomNav'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
  var tc=document.getElementById('tabContent');if(tc)tc.style.display='none';
  var dt=document.getElementById('dtLayout');if(dt)dt.style.display='none';
  document.getElementById('authForm').style.display='none';
  document.getElementById('magicSent').style.display='none';
  document.getElementById('resetPassForm').style.display='block';
}
async function submitNewPassword(){
  var p1=document.getElementById('resetPass1').value,p2=document.getElementById('resetPass2').value,msg=document.getElementById('resetPassMsg');
  if(!p1||p1.length<6){msg.textContent='mínimo 6 caracteres';msg.className='auth-msg err';return;}
  if(p1!==p2){msg.textContent='las contraseñas no coinciden';msg.className='auth-msg err';return;}
  msg.textContent='...';msg.className='auth-msg';
  var r=await sb.auth.updateUser({password:p1});
  if(r.error){msg.textContent=r.error.message;msg.className='auth-msg err';}
  else{msg.textContent='contraseña actualizada';msg.className='auth-msg ok';inPasswordRecovery=false;setTimeout(function(){showApp();},1200);}
}
// PIN/biometric lock disabled
function uiStateKey(){return 'ft_uistate'+(currentUser?'_'+currentUser.id:'');}
function saveUiState(){
  try{
    localStorage.setItem(uiStateKey(),JSON.stringify({
      vy:viewYear,
      vm:viewMonth,
      tab:activeTab,
      ham:homeAnnualMode?1:0,
      cy:typeof chartYear==='number'?chartYear:viewYear,
      asv:window._annualSubView||'charts',
      asset:assetDetailState,
      ts:Date.now()
    }));
  }catch(e){}
}
function restoreUiState(){
  activeTab=0;assetDetailState=null;
  try{
    var isColdStart = !sessionStorage.getItem('ft_session_active');
    sessionStorage.setItem('ft_session_active', '1');
    var raw=localStorage.getItem(uiStateKey());if(!raw)return;
    var s=JSON.parse(raw);
    if(typeof s.vy==='number'&&s.vy>=1970&&s.vy<=3000)viewYear=s.vy;
    if(typeof s.vm==='number'&&s.vm>=0&&s.vm<=11)viewMonth=s.vm;
    if(typeof s.ham==='number')homeAnnualMode=(s.ham===1);
    if(typeof s.cy==='number'&&s.cy>=1970&&s.cy<=3000)chartYear=s.cy;
    if(typeof s.asv==='string'&&(s.asv==='charts'||s.asv==='stats'))window._annualSubView=s.asv;
    if(isColdStart){
      // Al cerrarse la app por completo, debe arrancar siempre en Inicio
      activeTab=0;
    } else {
      // Reanudación / vuelta a la app: mantener exactamente lo que estábamos haciendo
      if(typeof s.tab==='number'&&s.tab>=0&&s.tab<=5)activeTab=s.tab;
      if(s.asset&&typeof s.asset.symbol==='string')assetDetailState=s.asset;
    }
  }catch(e){}
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){saveUiState();}
  else if(document.visibilityState==='visible'){
    if(currentUser&&!isOffline&&!offlineQueue.length&&!loadDataInFlight)loadData();
  }
});
window.addEventListener('pagehide',saveUiState);
var LOAD_MIN_MS=300,LOAD_REMOTE_TIMEOUT_MS=10000,loadStartTs=0;
function hideLoading(){
  var ov=document.getElementById('loadingOverlay');if(!ov)return;
  var wait=Math.max(0,LOAD_MIN_MS-(Date.now()-loadStartTs));
  setTimeout(function(){ov.classList.add('hidden');},wait);
}
// Nunca dejar la interfaz bloqueada si una petición de red queda pendiente.
// Los datos ya guardados localmente siguen siendo utilizables mientras vuelve la conexión.
function withLoadTimeout(promise,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;done=true;
      reject(new Error(label||'Tiempo de espera agotado al sincronizar'));
    },ms||LOAD_REMOTE_TIMEOUT_MS);
    Promise.resolve(promise).then(function(value){
      if(done)return;done=true;clearTimeout(timer);resolve(value);
    },function(error){
      if(done)return;done=true;clearTimeout(timer);reject(error);
    });
  });
}
var _numbersAnimated=false;
function shouldAnimateNumbers(){if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return false;if(_numbersAnimated)return false;_numbersAnimated=true;return true;}
function countUp(el,endVal,formatFn,ms){
  if(!el||!el.isConnected)return;
  ms=ms||900;
  if(el._countRAF)cancelAnimationFrame(el._countRAF);
  var startTs=null;
  function step(ts){
    if(!el||!el.isConnected){if(el)el._countRAF=null;return;}
    if(!startTs)startTs=ts;
    var p=Math.min((ts-startTs)/ms,1);
    var eased=1-Math.pow(1-p,3);
    el.textContent=formatFn(endVal*eased);
    if(p<1)el._countRAF=requestAnimationFrame(step);else{el.textContent=formatFn(endVal);el._countRAF=null;}
  }
  el._countRAF=requestAnimationFrame(step);
}
function showApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('offlineBanner').classList.toggle('show',isOffline);
  _numbersAnimated=false;
  var isColdStart=!sessionStorage.getItem('ft_session_active');
  var loadingAlready=loadDataInFlight;
  if(!loadingAlready&&isColdStart){
    loadStartTs=Date.now();
    document.getElementById('loadingOverlay').classList.remove('hidden');
  } else if(!isColdStart){
    document.getElementById('loadingOverlay').classList.add('hidden');
  }
  // PIN/biometric lock disabled — clear any previously stored credentials
  try{localStorage.removeItem('ft_pin');localStorage.removeItem('ft_bio');}catch(e){}
  if(typeof navigator!=='undefined'&&navigator.storage&&typeof navigator.storage.persist==='function'){
    navigator.storage.persist().catch(function(){});
  }
  try{
    restoreUiState();
    var accent=localStorage.getItem('ft_accent');if(accent)setAccent(accent);
    offlineQueue=[];
    IS_DESKTOP=window.innerWidth>=768;
    if(IS_DESKTOP){
      document.getElementById('dtLayout').style.display='flex';
      ['appHeader','mainChart','bottomNav','tabContent'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
      document.getElementById('fabBtn').classList.add('fab-hidden');
      if(currentUser){var em=currentUser.email||'';var av=document.getElementById('dtAvatar');if(av)av.textContent=em[0]?em[0].toUpperCase():'?';var de=document.getElementById('dtEmail');if(de)de.textContent=activeTab===5?em:maskEmail(em);}
    } else {
      document.getElementById('dtLayout').style.display='none';
      document.getElementById('appHeader').style.display='flex';
      document.getElementById('mainChart').style.display=(activeTab===0)?'block':'none';
      document.getElementById('bottomNav').style.display='flex';
      document.getElementById('tabContent').style.display='flex';
      document.getElementById('fabBtn').classList.toggle('fab-hidden',activeTab!==0&&activeTab!==1&&activeTab!==2);
      for(var _bi=0;_bi<5;_bi++){var _bn=document.getElementById('bn'+_bi);if(_bn)_bn.classList.toggle('active',_bi===activeTab);}
      updatePeriodToolbar();
      setTimeout(function(){movePill(activeTab);},100);
    }
  }catch(initUiError){
    console.error('Error preparando interfaz inicial en showApp',initUiError);
  }
  Promise.all([
    loadEncryptedLsJson(queueKey(),[]).catch(function(){return [];}),
    loadEncryptedLsJson(syncIssuesKey(),[]).catch(function(){return [];})
  ]).then(function(pair){
    offlineQueue=Array.isArray(pair[0])?pair[0]:[];
    _syncIssuesCache=Array.isArray(pair[1])?pair[1]:[];
    updateSyncTrayBadge();
    if(!loadingAlready)loadData();
  });
  try{subscribeRealtime();}catch(rtError){}
}
function showAuth(){
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('authScreen').style.display='flex';
  ['appHeader','mainChart','bottomNav'].forEach(function(id){document.getElementById(id).style.display='none';});
  document.getElementById('tabContent').style.display='none';
  document.getElementById('fabBtn').classList.add('fab-hidden');
  // Init auth tab pill position
  setTimeout(function(){
    var pill=document.getElementById('authTabPill');
    var tab=document.getElementById('tabLogin');
    if(pill&&tab){
      var parent=tab.parentElement;
      var parentRect=parent.getBoundingClientRect();
      var tabRect=tab.getBoundingClientRect();
      pill.style.left=(tabRect.left-parentRect.left)+'px';
      pill.style.width=tabRect.width+'px';
    }
  },50);
}

var loadDataInFlight=false,loadDataPromise=null,loadGeneration=0;
function isActiveLoad(uid,generation){return !!(currentUser&&currentUser.id===uid&&loadGeneration===generation);}
var secureCacheKeyPromise=null,secureCacheDbPromise=null;
function secureCacheStorageKey(uid){return 'ft_cache_secure_'+uid;}
function cacheBytesToB64(bytes){var out='';for(var i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(out);}
function cacheB64ToBytes(value){var bin=atob(value),bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}
function secureCacheDatabase(){
  if(secureCacheDbPromise)return secureCacheDbPromise;
  secureCacheDbPromise=new Promise(function(resolve,reject){
    if(!window.indexedDB)return reject(new Error('IndexedDB no disponible'));
    var req=indexedDB.open('fintrack-secure-cache',2);
    req.onupgradeneeded=function(){
      var db=req.result;
      if(!db.objectStoreNames.contains('keys'))db.createObjectStore('keys');
      if(!db.objectStoreNames.contains('payloads'))db.createObjectStore('payloads');
    };
    req.onsuccess=function(){resolve(req.result);};
    req.onerror=function(){secureCacheDbPromise=null;reject(req.error||new Error('No se pudo abrir el almacén seguro'));};
  });
  return secureCacheDbPromise;
}
var _ephemeralCacheKey=null;
async function secureCacheKey(){
  if(secureCacheKeyPromise)return secureCacheKeyPromise;
  secureCacheKeyPromise=(async function(){
    try{
      if(!window.crypto||!crypto.subtle)throw new Error('Cifrado local no disponible');
      try{
        var db=await secureCacheDatabase();
        var stored=await new Promise(function(resolve,reject){
          var r=db.transaction('keys','readonly').objectStore('keys').get('device-key');
          r.onsuccess=function(){resolve(r.result);};
          r.onerror=function(){reject(r.error);};
        });
        if(stored)return stored;
        var key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
        await new Promise(function(resolve,reject){
          var r=db.transaction('keys','readwrite').objectStore('keys').put(key,'device-key');
          r.onsuccess=function(){resolve();};
          r.onerror=function(){reject(r.error);};
        });
        return key;
      }catch(idbErr){
        // SW-05: Si IndexedDB no está disponible (modo privado estricto / error de cuota), usar clave de sesión no persistente en disco
        if(_ephemeralCacheKey)return _ephemeralCacheKey;
        var sJwk=null;
        try{sJwk=sessionStorage.getItem('ft_session_cache_jwk');}catch(se){}
        if(sJwk){
          _ephemeralCacheKey=await crypto.subtle.importKey('jwk',JSON.parse(sJwk),{name:'AES-GCM'},false,['encrypt','decrypt']);
          return _ephemeralCacheKey;
        }
        var sessKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
        try{
          var exported=await crypto.subtle.exportKey('jwk',sessKey);
          sessionStorage.setItem('ft_session_cache_jwk',JSON.stringify(exported));
        }catch(se2){}
        _ephemeralCacheKey=sessKey;
        return sessKey;
      }
    }catch(err){
      secureCacheKeyPromise=null;
      throw err;
    }
  })();
  return secureCacheKeyPromise;
}
async function saveSecureLocalCache(uid,payload){
  try{
    var key=await secureCacheKey(),iv=crypto.getRandomValues(new Uint8Array(12)),raw=new TextEncoder().encode(JSON.stringify(payload)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,raw);
    var idbEnvelope={version:2,iv:iv,data:cipher,timestamp:Date.now()};
    try{
      var db=await secureCacheDatabase();
      await new Promise(function(resolve,reject){
        var tx=db.transaction('payloads','readwrite');
        var r=tx.objectStore('payloads').put(idbEnvelope,uid);
        r.onsuccess=function(){resolve();};
        r.onerror=function(){reject(r.error);};
      });
      localStorage.removeItem(secureCacheStorageKey(uid));
    }catch(idbErr){
      var b64Envelope={version:1,iv:cacheBytesToB64(iv),data:cacheBytesToB64(new Uint8Array(cipher)),timestamp:Date.now()};
      var serialized=JSON.stringify(b64Envelope);
      if(serialized.length<2500000){
        try{localStorage.setItem(secureCacheStorageKey(uid),serialized);}catch(lsErr){}
      }else{
        console.warn('Payload excesivo para localStorage fallback; conservado en memoria');
      }
    }
    localStorage.removeItem('ft_cache_'+uid);
  }catch(err){
    console.warn('No se pudo cifrar la caché local',err);
  }
}
async function readSecureLocalCache(uid){
  var envelope=null;
  try{
    var db=await secureCacheDatabase();
    envelope=await new Promise(function(resolve){
      var tx=db.transaction('payloads','readonly');
      var r=tx.objectStore('payloads').get(uid);
      r.onsuccess=function(){resolve(r.result);};
      r.onerror=function(){resolve(null);};
    });
  }catch(e){}
  if(!envelope){
    var stored=localStorage.getItem(secureCacheStorageKey(uid));
    if(stored){
      try{envelope=JSON.parse(stored);}catch(e){localStorage.removeItem(secureCacheStorageKey(uid));}
    }
  }
  if(envelope){
    try{
      var key=await secureCacheKey();
      var ivBytes=(envelope.iv instanceof Uint8Array||envelope.iv instanceof ArrayBuffer)?envelope.iv:cacheB64ToBytes(envelope.iv);
      var cipherBytes=(envelope.data instanceof Uint8Array||envelope.data instanceof ArrayBuffer)?envelope.data:cacheB64ToBytes(envelope.data);
      var plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:ivBytes},key,cipherBytes);
      var decrypted=JSON.parse(new TextDecoder().decode(plain));
      return decrypted;
    }catch(e){
      try{
        var db2=await secureCacheDatabase();
        var tx2=db2.transaction('payloads','readwrite');
        tx2.objectStore('payloads').delete(uid);
      }catch(idbE){}
      localStorage.removeItem(secureCacheStorageKey(uid));
      return null;
    }
  }
  var legacy=localStorage.getItem('ft_cache_'+uid);
  if(!legacy)return null;
  try{
    var parsed=JSON.parse(legacy);
    await saveSecureLocalCache(uid,parsed);
    return parsed;
  }catch(e){
    if(e&&e.name==='SyntaxError')localStorage.removeItem('ft_cache_'+uid);
    return null;
  }
}
function clearSecureCacheIndexedDB(uid){
  try{
    secureCacheDatabase().then(function(db){
      if(db.objectStoreNames.contains('payloads')){
        var tx=db.transaction('payloads','readwrite');
        tx.objectStore('payloads').delete(uid);
      }
    }).catch(function(){});
  }catch(e){}
}
function currentCachePayload(){return {transactions:transactions,categories:categories,accounts:accounts,patrimony:patrimony,budgets:budgets,recurrenceExclusions:recurrenceExclusions,transactionVoids:transactionVoids,investmentOperations:investmentOperations,categoryExclusions:getCategoryExpenseExclusions(),categoryIcons:getCategoryCustomIcons()};}
function reconcileOfflineQueueIntoMemory(){
  if(!offlineQueue||!offlineQueue.length)return;
  function applyOp(arr,op){
    arr=arr||[];
    if(op.type==='insert'&&op.data){
      if(!arr.some(function(x){return x&&x.id===op.data.id;}))arr.unshift(op.data);
    }else if(op.type==='update'&&op.id&&op.data){
      var uIdx=arr.findIndex(function(x){return x&&x.id===op.id;});
      if(uIdx>=0)arr[uIdx]=Object.assign({},arr[uIdx],op.data);
    }else if(op.type==='delete'&&op.id){
      arr=arr.filter(function(x){return x&&x.id!==op.id;});
    }
    return arr;
  }
  offlineQueue.forEach(function(op){
    if(!op||!op.table)return;
    if(op.table==='transactions')transactions=applyOp(transactions,op);
    else if(op.table==='categories')categories=applyOp(categories,op);
    else if(op.table==='accounts')accounts=applyOp(accounts,op);
    else if(op.table==='budgets')budgets=applyOp(budgets,op);
    else if(op.table==='patrimony')patrimony=applyOp(patrimony,op);
    else if(op.table==='recurrence_exclusions')recurrenceExclusions=applyOp(recurrenceExclusions,op);
    else if(op.table==='transaction_voids')transactionVoids=applyOp(transactionVoids,op);
    else if(op.table==='investment_operations')investmentOperations=applyOp(investmentOperations,op);
  });
}
async function loadData(force){
  if(!currentUser)return false;
  if(loadDataInFlight)return false;
  if(!force&&!isOffline&&offlineQueue.length===0&&transactions.length>0&&(Date.now()-_lastRemoteSyncTs<25000)){
    return true;
  }
  var uid=currentUser.id,generation=++loadGeneration,loadSucceeded=false;
  loadDataInFlight=true;
  setSync(isOffline?'err':'syncing');
  try{
    var cd=await readSecureLocalCache(currentUser.id);
    if(cd){
      transactions=cd.transactions||[];
      transactions.forEach(function(t){if(t.exclude_from_calc===undefined)t.exclude_from_calc=!!(Array.isArray(t.tags)&&t.tags.includes('_no_calc'));});
      categories=cd.categories||[];
      accounts=cd.accounts||[];
      patrimony=cd.patrimony||[];
      budgets=cd.budgets||[];
      recurrenceExclusions=cd.recurrenceExclusions||[];
      transactionVoids=cd.transactionVoids||[];
      investmentOperations=cd.investmentOperations||[];
      var localEx=getCategoryExpenseExclusions();
      var merged=Object.assign({},cd.categoryExclusions||{},localEx||{});
      saveCategoryExpenseExclusions(merged);
      var localIcons=getCategoryCustomIcons();
      var mergedIcons=Object.assign({},cd.categoryIcons||{},localIcons||{});
      saveCategoryCustomIcons(mergedIcons);
      applyCategoryCustomIcons();
    }
    reconcileOfflineQueueIntoMemory();
  }catch(e){}
  try{
    if(isOffline)return false;
    // Confirmar primero los cambios locales: la lectura remota posterior ya los incorpora.
    if(offlineQueue.length)await withLoadTimeout(processOfflineQueue(),LOAD_REMOTE_TIMEOUT_MS,'La cola offline ha tardado demasiado');
    if(!isActiveLoad(uid,generation))return false;
    async function fetchAllTableRows(table, orderConfig){
      var all=[], pageSize=1000, from=0, more=true;
      while(more){
        var q=sb.from(table).select('*').eq('user_id',uid);
        if(orderConfig){
          if(Array.isArray(orderConfig)){
            orderConfig.forEach(function(o){ q=q.order(o.col, {ascending: o.asc!==false}); });
          }else if(typeof orderConfig==='string'){
            q=q.order(orderConfig, {ascending: true});
          }else if(orderConfig.col){
            q=q.order(orderConfig.col, {ascending: orderConfig.asc!==false});
          }
        }
        q=q.order('id', {ascending: true});
        var r=await q.range(from, from+pageSize-1);
        if(r.error) throw r.error;
        var batch=r.data||[];
        all=all.concat(batch);
        if(batch.length<pageSize) more=false;
        else from+=pageSize;
      }
      return {data:all, error:null};
    }
    var res=await withLoadTimeout(Promise.all([
      sb.from('categories').select('*').eq('user_id',uid).order('position'),
      fetchAllTableRows('transactions', {col:'date', asc:false}),
      sb.from('accounts').select('*').eq('user_id',uid).order('position'),
      fetchAllTableRows('patrimony', [{col:'year', asc:true}, {col:'month', asc:true}]),
      fetchAllTableRows('budgets', null),
      fetchAllTableRows('recurrence_exclusions', null),
      fetchAllTableRows('transaction_voids', null),
      fetchAllTableRows('investment_operations', {col:'operation_date', asc:false})
    ]),LOAD_REMOTE_TIMEOUT_MS,'La sincronización inicial ha tardado demasiado');
    if(!isActiveLoad(uid,generation))return false;
    var failedRead=res.find(function(x){return x&&x.error;});
    if(failedRead)throw failedRead.error;
    categories=res[0].data||[];transactions=res[1].data||[];accounts=res[2].data||[];
    applyCategoryCustomIcons();
    transactions.forEach(function(t){if(t.exclude_from_calc===undefined)t.exclude_from_calc=!!(Array.isArray(t.tags)&&t.tags.includes('_no_calc'));});
    patrimony=res[3].data||[];budgets=res[4].data||[];recurrenceExclusions=res[5].data||[];transactionVoids=res[6].data||[];investmentOperations=res[7].data||[];
    reconcileOfflineQueueIntoMemory();
    // Repara movimientos de actualización que falten en ajustes antiguos o
    // que quedaron a medias por una caída de red.
    try{var repaired=await withLoadTimeout(sb.rpc('repair_fintrack_balance_adjustments'),5000,'reparación de ajustes');if(!repaired.error&&repaired.data&&repaired.data.length){transactions=transactions.concat(repaired.data);transactions.forEach(function(t){if(t.exclude_from_calc===undefined)t.exclude_from_calc=!!(Array.isArray(t.tags)&&t.tags.includes('_no_calc'));});}}catch(repairError){}
    
    if(categories.length===0){var cd2=DEFAULT_CATS.map(function(c){return Object.assign({},c,{user_id:uid});});var ins=await withLoadTimeout(sb.from('categories').insert(cd2).select(),LOAD_REMOTE_TIMEOUT_MS,'La creación de categorías iniciales ha tardado demasiado');if(ins.error)throw ins.error;categories=ins.data||cd2;applyCategoryCustomIcons();}
    if(!isActiveLoad(uid,generation))return false;
    // Vaciar la cola offline ANTES de generar recurrencias: si se canceló una
    // serie sin red, el update de "recurring:false" debe aplicarse primero
    // para que processRecurring no regenere la serie ya cancelada.
    await withLoadTimeout(processRecurring(),LOAD_REMOTE_TIMEOUT_MS,'Las recurrencias han tardado demasiado');
    if(!isActiveLoad(uid,generation))return false;
    saveLocalCache();_lastRemoteSyncTs=Date.now();setSync('ok');loadSucceeded=true;
  }catch(e){setSync('err');}
  finally{
    loadDataInFlight=false;loadDataPromise=null;
    hideLoading();
    if(isActiveLoad(uid,generation)){
      try{if(IS_DESKTOP){if(typeof dtRender==='function')dtRender();}else{render();}}catch(renderError){setSync('err');}
      try{scheduleAutoBackup();}catch(backupError){}
    }
  }
  return loadSucceeded;
}
var txVersion=0;
var _saveCacheTimer=null;
function saveLocalCache(){
  txVersion++;_donutSig='';_barSig={};_lineSig={};
  clearBalanceCache();
  if(typeof invalidateTxIndices==='function'){invalidateTxIndices();scheduleTxIndexing();}
  document.querySelectorAll('canvas[data-drawn]').forEach(function(cv){cv.removeAttribute('data-drawn');});
  if(!currentUser)return;
  if(_saveCacheTimer)clearTimeout(_saveCacheTimer);
  _saveCacheTimer=setTimeout(function(){
    saveSecureLocalCache(currentUser.id,currentCachePayload()).catch(function(error){console.warn('No se pudo cifrar la caché local',error);});
  },200);
}
function scheduleAutoBackup(){
  if(!currentUser)return;
  if(localStorage.getItem('ft_auto_backup_'+currentUser.id)!=='enabled')return;
  var last=localStorage.getItem('ft_last_backup_'+currentUser.id);
  var now=new Date();
  if((!last||(now-new Date(last))>7*24*60*60*1000)&&transactions.length>0)downloadBackupNow();
}
async function downloadBackupNow(){
  if(!currentUser)return;
  var now=new Date();
  var json=JSON.stringify({version:4,transactions:transactions,categories:categories,accounts:accounts,patrimony:patrimony,budgets:budgets,recurrenceExclusions:recurrenceExclusions,transactionVoids:transactionVoids,investmentOperations:investmentOperations,categoryExclusions:getCategoryExpenseExclusions(),categoryIcons:getCategoryCustomIcons()},null,2);
  var blob,filename='fintrack_autobackup_'+now.toISOString().slice(0,10)+'.json';
  if(typeof CompressionStream==='function'){
    try{
      var stream=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      blob=await new Response(stream).blob();
      filename+='.gz';
    }catch(err){
      blob=new Blob([json],{type:'application/json'});
    }
  }else{
    blob=new Blob([json],{type:'application/json'});
  }
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=filename;a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  // La descarga puede bloquearse: la fecha sólo se guarda tras la activación
  // explícita o una acción manual del usuario.
  localStorage.setItem('ft_last_backup_'+currentUser.id,now.toISOString());
  refreshTab();
}
async function loadLatestCommitTime(){var el=document.getElementById('appPublishedAt');if(!el)return;try{var r=await fetch('https://api.github.com/repos/mgesm/fintrack/commits/main',{headers:{Accept:'application/vnd.github+json'}});var d=await r.json(),date=d&&d.commit&&d.commit.committer&&d.commit.committer.date;if(!date)throw 0;el.textContent=new Date(date).toLocaleString('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});}catch(e){el.textContent=APP_PUBLISHED_AT;}}
var _isExplicitSignOut=false,_preserveQueueOnSignOut=false;
function resetAppState(uid,preserveQueue){
  if(uid){
    localStorage.removeItem('ft_cache_'+uid);
    localStorage.removeItem(secureCacheStorageKey(uid));
    if(!preserveQueue)localStorage.removeItem('ft_queue_'+uid);
    localStorage.removeItem('ft_sync_issues_'+uid);
    localStorage.removeItem('ft_uistate_'+uid);
    localStorage.removeItem('ft_invest_recent_assets_'+uid);
    localStorage.removeItem('ft_invest_portfolio_hidden_'+uid);
    localStorage.removeItem('ft_default_account_'+uid);
    localStorage.removeItem('ft_last_backup_'+uid);
    localStorage.removeItem('ft_auto_backup_'+uid);
    try{clearSecureCacheIndexedDB(uid);}catch(e){}
  }
  localStorage.removeItem('ft_quote_cache_v1');
  localStorage.removeItem('ft_last_uid');
  localStorage.removeItem('ft_last_email');
  try{sessionStorage.removeItem('ft_session_cache_jwk');sessionStorage.removeItem('ft_session_active');}catch(e){}
  secureCacheKeyPromise=null;_ephemeralCacheKey=null;
  if(ftRealtimeChannel&&sb.removeChannel){try{sb.removeChannel(ftRealtimeChannel);}catch(e){}ftRealtimeChannel=null;}
  clearTimeout(ftRealtimeTimer);clearTimeout(_queueRetryTimer);_queueRetryCount=0;
  clearBalanceCache();_quoteCache={};_quoteInFlight={};_syncIssuesCache=[];
  _catIconsCache=null;_catExclusionsCache=null;assetHistoryCache={};assetDetailState=null;
  _lastDonutExps=null;_lastDonutEntries=null;_lastHmExps=null;_lastHmByDay=null;
  _donutSig='';_barSig={};_lineSig={};
  searchQuery='';filterType='all';filterCat='';filterAccount='';sortOrder='date-desc';filterDateFrom='';filterDateTo='';searchScope='month';
  homeAnnualMode=false;activeTab=0;activeCatId=null;dtActiveCat=null;hmSelDay=null;
  editingTxId=null;txTags=[];isRecurring=false;loadGeneration++;loadDataInFlight=false;loadDataPromise=null;
  transactions=[];categories=[];accounts=[];patrimony=[];budgets=[];recurrenceExclusions=[];transactionVoids=[];investmentOperations=[];
  if(!preserveQueue)offlineQueue=[];
  _monthTxCache={};_yearTxCache={};
  if(typeof invalidateTxIndices==='function')invalidateTxIndices();
  txVersion++;
}
async function signOut(){
  var uid = currentUser ? currentUser.id : '';
  if(offlineQueue.length&&!isOffline){await processOfflineQueue();}
  var keepQueue=false;
  if(offlineQueue.length){
    if(!confirm('Hay '+offlineQueue.length+' cambio(s) pendientes. Aceptar: cerrar sesión y conservarlos para cuando vuelvas a entrar. Cancelar: seguir en la app.'))return;
    keepQueue=true;
  }
  _preserveQueueOnSignOut=keepQueue;
  _isExplicitSignOut=true;
  resetAppState(uid,keepQueue);
  currentUser=null;
  try{await sb.auth.signOut();}catch(e){}
  finally{_isExplicitSignOut=false;_preserveQueueOnSignOut=false;}
  showAuth();
}
async function forceSync(){
  var status=document.getElementById('syncStatusMsg');
  if(isOffline){if(status){status.textContent='sin conexión · los cambios se guardarán al reconectar';status.className='status-msg status-err';}return;}
  if(loadDataInFlight){if(status){status.textContent='la sincronización ya está en curso';status.className='status-msg';}return;}
  if(status){status.textContent='sincronizando...';status.className='status-msg';}setSync('syncing');
  var ok=await loadData(true);
  status=document.getElementById('syncStatusMsg')||status;
  if(status){status.textContent=ok?'Sincronizado':'No se ha podido sincronizar · reintenta';status.className='status-msg '+(ok?'status-ok':'status-err');}
}
async function clearLocalCacheAndResync(){
  var status=document.getElementById('syncStatusMsg');
  if(isOffline){if(status){status.textContent='sin conexión · no se puede resincronizar';status.className='status-msg status-err';}return;}
  if(loadDataInFlight){if(status){status.textContent='la sincronización ya está en curso';status.className='status-msg';}return;}
  if(offlineQueue.length){
    var ok=confirm('Hay '+offlineQueue.length+' cambio(s) pendientes en la cola local. Se intentarán enviar a la nube antes de borrar la caché. ¿Continuar?');
    if(!ok)return;
    await processOfflineQueue();
  }
  if(status){status.textContent='limpiando caché y resincronizando...';status.className='status-msg';}
  setSync('syncing');
  if(currentUser){
    try{
      localStorage.removeItem(secureCacheStorageKey(currentUser.id));
      localStorage.removeItem('ft_cache_'+currentUser.id);
      clearSecureCacheIndexedDB(currentUser.id);
    }catch(e){}
  }
  _lastRemoteSyncTs=0;
  _quoteCache={};clearBalanceCache();if(typeof invalidateTxIndices==='function')invalidateTxIndices();
  var ok=await loadData(true);
  status=document.getElementById('syncStatusMsg')||status;
  if(status){
    status.textContent=ok?'Caché limpiada y datos resincronizados':'Error al sincronizar tras limpiar caché';
    status.className='status-msg '+(ok?'status-ok':'status-err');
  }
  if(ok)showSuccessToast('Caché local limpiada y resincronizada');
}
async function clearTxs(){
  var accepted=await confirmCriticalAction({title:'Borrar movimientos',description:'Se descargará una copia previa y se eliminarán todos los movimientos, exclusiones y anulaciones. Esta acción no se puede deshacer.',counts:{movimientos:transactions.length},phrase:'BORRAR',approveLabel:'Borrar movimientos'});
  if(!accepted)return;
  try{exportJSON();}catch(e){showSuccessToast('No se pudo descargar la copia previa');return;}
  setSync('syncing');
  var cleared=await sb.rpc('clear_fintrack_data');
  if(cleared.error){setSync('err');return;}
  transactions=[];recurrenceExclusions=[];transactionVoids=[];saveLocalCache();setSync('ok');refreshTab();
}

