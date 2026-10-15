'use strict';
/* Run before styles/body so a saved dark theme never flashes the light editor. */
window.HiNoteTheme=(()=>{
  const root=document.documentElement,key='hinote-ui-theme';
  const valid=value=>value==='light'||value==='dark';
  let current='light',timer=null,context=null;
  try{const saved=localStorage.getItem(key);if(valid(saved))current=saved;}catch(_){}
  try{const native=window.AndroidBridge?.getTheme?.();if(valid(native))current=native;}catch(_){}
  root.dataset.theme=current;
  function syncButton(){
    const button=document.getElementById('themeToggle');if(!button)return;
    const dark=current==='dark';button.setAttribute('aria-label',dark?'Tema oscuro. Cambiar a claro':'Tema claro. Cambiar a oscuro');
    button.title=dark?'Cambiar a tema claro':'Cambiar a tema oscuro';
  }
  function apply(theme,animate=false){
    if(!valid(theme))return false;
    clearTimeout(timer);
    if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){root.classList.add('themeChanging');timer=setTimeout(()=>root.classList.remove('themeChanging'),320);}
    else root.classList.remove('themeChanging');
    current=theme;root.dataset.theme=theme;syncButton();
    try{localStorage.setItem(key,theme);}catch(_){}
    try{window.AndroidBridge?.setTheme?.(theme);}catch(_){}
    return true;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('themeToggle');
    button.addEventListener('pointerdown',e=>{context=window.StudioUI?.fieldContext?.();if(context)e.preventDefault();});
    button.addEventListener('keydown',()=>context=null);
    button.addEventListener('click',()=>{
      apply(current==='dark'?'light':'dark',true);
      // The pointer keeps the existing field focused; do not reset its IME or caret.
      if(context&&document.activeElement!==context.field)window.StudioUI?.resumeField?.(context);
      context=null;
    });
    apply(current);
  },{once:true});
  return {apply,get current(){return current;}};
})();
