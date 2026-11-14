var CACHE_NAME='fintrack-cache-v206';
var CACHE_PREFIX='fintrack-cache-';
var CRITICAL_PRECACHE=['./','./index.html','./styles.css','./manifest.json','./supabase-js.min.js','./js/theme-init.js','./js/core.js','./js/accounting.js','./js/recurring.js','./js/sync.js','./js/investments.js','./js/charts.js','./js/export.js','./js/ui.js','./js/bootstrap.js'];
var OPTIONAL_PRECACHE=['./icon-192.png','./icon-512.png','./fonts/inter-latin-wght-normal.woff2','./vendor/jspdf.umd.min.js','./vendor/exceljs.min.js'];
var PRECACHE=CRITICAL_PRECACHE.concat(OPTIONAL_PRECACHE);

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
    // El app shell completo es atómico para evitar desajuste entre index.html, CSS y módulos JS.
    return cache.addAll(CRITICAL_PRECACHE).then(function(){
      return Promise.all(OPTIONAL_PRECACHE.map(function(u){
        return cache.add(u).catch(function(){});
      }));
    });
  }));
});

self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
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
    var navFetch=fetch(e.request).then(function(networkRes){
      if(networkRes&&networkRes.status===200){
        var resClone=networkRes.clone();
        caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,resClone);});
      }
      return networkRes;
    });
    navFetch.catch(function(){});
    e.respondWith(
      Promise.race([
        navFetch,
        new Promise(function(_,reject){
          setTimeout(function(){reject(new Error('Navigation network timeout'));},1200);
        })
      ]).catch(function(){
        return caches.match(e.request,{ignoreSearch:true}).then(function(cached){
          if(cached)return cached;
          return caches.match('./index.html').then(function(idx){
            return idx||caches.match('./');
          });
        });
      })
    );
    return;
  }
  var network=fetch(e.request);
  e.waitUntil(network.then(function(networkRes){
    if(networkRes&&networkRes.status===200)return caches.open(CACHE_NAME).then(function(cache){return cache.put(e.request,networkRes.clone());});
  }).catch(function(){}));
  e.respondWith(
    caches.match(e.request,{ignoreSearch:true}).then(function(cached){
      return cached||network.catch(function(){return cached;});
    })
  );
});
