'use strict';
// Evita zoom accidental por pellizco en dispositivos táctiles sin interferir con el zoom de accesibilidad en escritorio.
['gesturestart','gesturechange','gestureend'].forEach(function(type){
  document.addEventListener(type,function(e){e.preventDefault();},{passive:false});
});
document.addEventListener('touchmove',function(e){
  if(e.touches&&e.touches.length>1)e.preventDefault();
},{passive:false});

if('serviceWorker' in navigator){
  var _swRefreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(_swRefreshing)return;
    // SW-06: Solo recargar cuando el usuario confirma explícitamente la actualización; nunca interrumpir edición en curso.
    if(window.__ftUserRequestedSwUpdate){
      _swRefreshing=true;
      window.location.reload();
    }
  });
  var _pendingUpdateTimer=null;
  function notifySwUpdateAvailable(worker){
    if(!worker)return;
    var activeEdit=document.querySelector('.modal-bg.visible,.asset-sheet,.investment-trade-modal');
    if(activeEdit){
      clearTimeout(_pendingUpdateTimer);
      _pendingUpdateTimer=setTimeout(function(){notifySwUpdateAvailable(worker);},2500);
      return;
    }
    if(typeof showUndoToast==='function'){
      showUndoToast('Nueva versión disponible',function(){
        window.__ftUserRequestedSwUpdate=true;
        worker.postMessage({type:'SKIP_WAITING'});
      },'Actualizar');
    }
  }
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('serviceworker.js').then(function(reg){
      if(!reg)return;
      if(reg.waiting&&navigator.serviceWorker.controller){
        notifySwUpdateAvailable(reg.waiting);
      }
      reg.addEventListener('updatefound',function(){
        var nw=reg.installing;
        if(!nw)return;
        nw.addEventListener('statechange',function(){
          if(nw.state==='installed'&&navigator.serviceWorker.controller){
            notifySwUpdateAvailable(nw);
          }
        });
      });
      reg.update();
    }).catch(function(){});
  });
}
