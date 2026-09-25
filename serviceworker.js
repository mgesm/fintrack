var CACHE_NAME='fintrack-cache-v188';
var CACHE_PREFIX='fintrack-cache-';
var PRECACHE=['./','./index.html','./manifest.json','./supabase-js.min.js','./icon-192.png','./icon-512.png','./vendor/jspdf.umd.min.js','./vendor/exceljs.min.js','./fonts/inter-latin-wght-normal.woff2'];

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
    // index.html es crítico: si falla, que falle la instalación. El resto es best-effort.
    return cache.add('./index.html').then(function(){
      return Promise.all(PRECACHE.filter(function(u){return u!=='./index.html';}).map(function(u){
        return cache.add(u).catch(function(){});
      }));
    });
  }));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k.indexOf(CACHE_PREFIX)===0&&k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url=new URL(e.request.url);
  if(url.origin!==location.origin){
    return;
  }
  if(e.request.mode==='navigate'){
    e.respondWith(
      Promise.race([
        fetch(e.request).then(function(networkRes){
          if(networkRes&&networkRes.status===200){
            var resClone=networkRes.clone();
            caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,resClone);});
          }
          return networkRes;
        }),
        new Promise(function(_,reject){
          setTimeout(function(){reject(new Error('Navigation network timeout'));},2500);
        })
      ]).catch(function(){
        return caches.match('./index.html');
      })
    );
    return;
  }
  var network=fetch(e.request);
  e.waitUntil(network.then(function(networkRes){
    if(networkRes&&networkRes.status===200)return caches.open(CACHE_NAME).then(function(cache){return cache.put(e.request,networkRes.clone());});
  }).catch(function(){}));
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached||network.catch(function(){return cached;});
    })
  );
});
