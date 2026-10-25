'use strict';
document.getElementById('aboutBtn').addEventListener('click',()=>{
  if(typeof window.AndroidBridge?.openAbout==='function')AndroidBridge.openAbout();
  else toast('La versión, privacidad y licencias están disponibles en Acerca de en la app Android.');
});
