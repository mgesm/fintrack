'use strict';
(function(){
  var saved=localStorage.getItem('ft_theme');
  if(saved==='light'||saved==='dark')document.documentElement.setAttribute('data-theme',saved);
})();
