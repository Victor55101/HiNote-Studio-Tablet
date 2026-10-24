'use strict';
document.getElementById('privacyBtn').addEventListener('click',()=>{
  if(typeof window.AndroidBridge?.openPrivacy==='function')AndroidBridge.openPrivacy();
  else toast('Privacidad y licencias están disponibles en la app Android.');
});
