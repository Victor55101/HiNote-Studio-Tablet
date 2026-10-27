'use strict';
// The original input connection remains the text model/IME. Only its visual
// surface changes; native composing text is never intercepted or reconstructed.
window.ProEditor = (() => {
  const enabled=!!window.AndroidBridge?.isProEditor?.();
  let active=false,bank=null,engine=null,plan=null,profile=null,ticket=0,pending=false,frame=0,manualClassic=false,gesture=null;
  const touches=new Map();let pair=null,lastCaretKey=null;
  const cache=new Map(),$p=id=>document.getElementById(id);
  let lastLayoutMs=0,lastPaintMs=0;
  function requestLibrary(){
    if(pending&&profile===activeProfile)return;
    profile=activeProfile;pending=true;bank=null;active=false;cache.clear();
    $p('proHint').textContent='Preparando tu escritura…';
    AndroidBridge.requestLiveLibrary(profile,++ticket);
  }
  window.onProLibrary=(id,raw,error)=>{
    if(id!==ticket)return;pending=false;
    if(error){$p('proHint').textContent='No se pudo cargar la escritura: '+error;setActive(false);return;}
    try{bank=JSON.parse(raw);if(bank.profile!==activeProfile){requestLibrary();return;}engine=ProLayout.create(bank);changed();}
    catch(e){$p('proHint').textContent=e.message;setActive(false);}
  };
  function setActive(value){
    active=value;document.body.classList.toggle('proUnified',value);
    $p('proMode').textContent=value?'Vista clásica':'Editor unificado';
    $p('proMode').setAttribute('aria-pressed',String(value));
    $p('refreshBtn').classList.toggle('proHidden',value);
    if(value){clearTimeout(refreshTimer);autoRefreshPending=false;}
  }
  function changed(){
    if(!enabled)return;
    if(profile!==activeProfile){requestLibrary();return;}
    if(!bank)return;
    const doc=serializeDocument(false),objects=doc.paragraphs.some(p=>p.type&&p.type!=='text');
    if(manualClassic||objects){
      const was=active;setActive(false);plan=null;
      $p('proHint').textContent=objects?'Esta nota contiene tablas, fórmulas, gráficas o PDF. Sus herramientas siguen disponibles en la vista clásica.':'Vista clásica · Puedes volver al editor unificado con notas de texto.';
      if(was){autoRefreshPending=true;scheduleAutoPreview();}
      return;
    }
    const start=performance.now();
    try{plan=engine.layout(doc,settings());lastLayoutMs=performance.now()-start;setActive(true);}
    catch(e){setActive(false);plan=null;$p('proHint').textContent=e.message;return;}
    composition={...(composition||{}),page_count:plan.pages.length,layout:{page_width:1000,page_height:1600,grid_step:bank.grid}};
    currentPage=Math.min(currentPage,ImageEditor.count()-1);followCaret();showPage();
    $p('proHint').textContent='Toca para escribir · Mantén pulsado para seleccionar · Los cambios se dibujan al escribir';
    $p('warnings').replaceChildren(...plan.warnings.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $p('warningPanel').classList.toggle('hidden',!plan.warnings.length);$p('warningCount').textContent=`${plan.warnings.length} avisos de escritura`;
  }
  function exportPlan(){
    if(!active||!plan)return null;
    return {format:'hinote-live-v1',pages:plan.pages.map(p=>p.items.map(c=>[c.line,c.offset,c.v,+c.x.toFixed(6),+c.y.toFixed(6)]))};
  }
  function glyphImage(c){
    const st=c.style,key=JSON.stringify([c.ch,c.v,c.scale,!!st.italic,!!st.bold,st.thickness||0,st.color||'#000000',st.opacity??100]);
    if(cache.has(key)){const a=cache.get(key);cache.delete(key);cache.set(key,a);return a;}
    const b=c.glyph.bbox,s=c.scale,slant=st.italic?.2:0,pad=16;
    const left=(b[0]-Math.max(0,b[3])*slant)*s-pad,top=b[1]*s-pad,right=(b[2]-Math.min(0,b[1])*slant)*s+pad,bottom=b[3]*s+pad;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil((right-left)*2);canvas.height=Math.ceil((bottom-top)*2);
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.translate(-left,-top);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=ctx.fillStyle=st.color||'#000000';ctx.globalAlpha=(st.opacity??100)/100;
    for(const [nativeWidth,pts] of c.glyph.strokes){
      const width=(st.thickness?st.thickness/3:nativeWidth)*(st.bold?1.5:1)/(2/3),xy=p=>[(p[0]-slant*p[1])*s,p[1]*s];
      if(pts.length===1){const p=pts[0],[x,y]=xy(p);ctx.beginPath();ctx.arc(x,y,width*(.8+Math.max(.1,p[2])*1.2)/2,0,Math.PI*2);ctx.fill();}
      for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];ctx.lineWidth=width*(.8+Math.max(.1,(a[2]+b[2])/2)*1.2);ctx.beginPath();ctx.moveTo(...xy(a));ctx.lineTo(...xy(b));ctx.stroke();}
    }
    const result={canvas,left,top,width:right-left,height:bottom-top};cache.set(key,result);
    while(cache.size>512)cache.delete(cache.keys().next().value);
    return result;
  }
  function paint(){
    frame=0;if(!active||!plan)return;const start=performance.now(),canvas=$p('previewCanvas'),resolution=previewResolution();
    if(canvas.width!==675*resolution||canvas.height!==1080*resolution){canvas.width=675*resolution;canvas.height=1080*resolution;}
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(.675*resolution,.675*resolution);
    for(const c of plan.pages[currentPage]?.items||[]){const g=glyphImage(c);ctx.drawImage(g.canvas,c.x+g.left,c.y+g.top,g.width,g.height);
      if(c.style.underline){ctx.strokeStyle=c.style.color||'#000000';ctx.globalAlpha=(c.style.opacity??100)/100;ctx.lineWidth=1.2*(c.style.bold?1.5:1);ctx.beginPath();ctx.moveTo(c.x+c.left,c.y+9*c.scale);ctx.lineTo(c.x+c.right,c.y+9*c.scale);ctx.stroke();ctx.globalAlpha=1;}}
    ctx.restore();lastPaintMs=performance.now()-start;selection();
  }
  function showPage(){
    if(!active)return;ImageEditor.pageChanged();ImageEditor.render();
    $p('pageBadge').textContent=`Página ${currentPage+1}/${ImageEditor.count()}`;
    $p('prevPage').disabled=currentPage<=0;$p('nextPage').disabled=currentPage>=ImageEditor.count()-1;
    if(!exporting&&!saveRequested){$p('status').textContent='Edición en vivo';$p('viewState').textContent='Edición en vivo';$p('viewState').classList.add('current');}
    cancelAnimationFrame(frame);frame=requestAnimationFrame(paint);
  }
  function carets(){return (plan?.pages[currentPage]?.rows||[]).flatMap(r=>r.carets);}
  function caretAt(point){return carets().find(c=>c.line===point.line&&c.offset===point.offset);}
  function followCaret(){
    const mark=liveBookmark();if(!mark||document.activeElement!==editor)return;
    const point=mark.backward?mark.start:mark.end;
    const index=plan.pages.findIndex(p=>p.rows.some(r=>r.carets.some(c=>c.line===point.line&&c.offset===point.offset)));
    if(index>=0)currentPage=index;
  }
  function selection(){
    if(!active)return;const canvas=$p('proSelection'),resolution=previewResolution();
    canvas.width=675*resolution;canvas.height=1080*resolution;const ctx=canvas.getContext('2d');ctx.scale(.675*resolution,.675*resolution);
    const mark=bookmark();$p('proCaret').hidden=true;if(!mark)return;
    const cmp=(a,b)=>a.line-b.line||a.offset-b.offset;
    if(!collapsed(mark)){
      ctx.fillStyle='rgba(15,119,151,.22)';
      for(const row of plan.pages[currentPage]?.rows||[]){const cs=row.carets.filter(c=>cmp(c,mark.start)>=0&&cmp(c,mark.end)<=0);if(cs.length>1)ctx.fillRect(Math.min(...cs.map(c=>c.x)),row.top,Math.max(2,Math.max(...cs.map(c=>c.x))-Math.min(...cs.map(c=>c.x))),Math.max(48,row.y-row.top+10));}
    }else if(document.activeElement===editor&&editor.isContentEditable){
      const c=caretAt(mark.start);if(c){const caret=$p('proCaret');caret.hidden=false;caret.style.left=`${c.x*.675*zoom}px`;caret.style.top=`${(c.y-44)*.675*zoom}px`;caret.style.height=`${52*.675*zoom}px`;}
    }
    $p('proCopy').hidden=collapsed(mark);
    const focus=mark.backward?mark.start:mark.end,focusCaret=caretAt(focus),focusKey=`${currentPage}:${focus.line}:${focus.offset}`;
    if(focusCaret&&focusKey!==lastCaretKey&&document.activeElement===editor){
      const wrap=$p('previewWrap'),bounds=wrap.getBoundingClientRect(),shell=$p('canvasShell').getBoundingClientRect();
      const top=shell.top+(focusCaret.y-48)*.675*zoom,bottom=shell.top+(focusCaret.y+12)*.675*zoom;
      if(bottom>bounds.bottom-24)wrap.scrollTop+=bottom-bounds.bottom+24;
      else if(top<bounds.top+24)wrap.scrollTop+=top-bounds.top-24;
    }lastCaretKey=focusKey;
    // Keep native input UI anchored near the visual caret, without moving its DOM.
    const c=caretAt(mark.backward?mark.start:mark.end);if(c){const box=$p('canvasShell').getBoundingClientRect();editor.style.setProperty('--pro-input-left',`${Math.max(0,box.left+c.x*.675*zoom)}px`);editor.style.setProperty('--pro-input-top',`${Math.max(0,box.top+(c.y-40)*.675*zoom)}px`);}
  }
  function hit(event){
    const b=$p('canvasShell').getBoundingClientRect(),x=(event.clientX-b.left)/(.675*zoom),y=(event.clientY-b.top)/(.675*zoom),rows=plan.pages[currentPage]?.rows||[];
    let row=rows.reduce((best,r)=>!best||Math.abs(r.y-20-y)<Math.abs(best.y-20-y)?r:best,null);
    return row?.carets.reduce((best,c)=>!best||Math.abs(c.x-x)<Math.abs(best.x-x)?c:best,null)||{line:readLines().length-1,offset:lineText(readLines().at(-1)).length};
  }
  function move(a,b=a){const cmp=a.line-b.line||a.offset-b.offset,backward=cmp>0;restoreSelection({start:backward?b:a,end:backward?a:b,backward});selection();}
  function pointerDown(e){
    if(!active||!editor.isContentEditable||e.button>0||e.target.closest('button')||ImageEditor.hitAt(e))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.pointerType==='touch'){
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(touches.size===2){const [a,b]=[...touches.values()];if(gesture)clearTimeout(gesture.timer);gesture=null;pair={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};$p('previewWrap').setPointerCapture(e.pointerId);return;}
    }
    const point=hit(e);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,start:point,moved:false,touch:e.pointerType==='touch',drag:e.pointerType!=='touch',scrollX:$p('previewWrap').scrollLeft,scrollY:$p('previewWrap').scrollTop};
    $p('previewWrap').setPointerCapture(e.pointerId);
    if(gesture.drag){move(e.shiftKey?(bookmark()?.start||point):point,point);$p('previewWrap').setPointerCapture(e.pointerId);}
    else gesture.timer=setTimeout(()=>{if(!gesture||gesture.moved)return;const text=lineText(readLines()[point.line]),before=text.slice(0,point.offset).match(/[\p{L}\p{N}]+$/u)?.[0]?.length||0,after=text.slice(point.offset).match(/^[\p{L}\p{N}]+/u)?.[0]?.length||0;gesture.drag=true;gesture.start={line:point.line,offset:point.offset-before};move(gesture.start,{line:point.line,offset:point.offset+after});},450);
  }
  function init(){
    if(!enabled)return;
    document.body.classList.add('proEdition');document.querySelector('.titlewrap h1').textContent='HiNote Studio Pro';
    const bar=document.createElement('div');bar.className='proBar';bar.innerHTML='<div><strong>Tu documento</strong><span id="proHint" role="status">Preparando tu escritura…</span></div><button class="btn" id="proCopy" hidden>Copiar selección</button><button class="btn" id="proMode" aria-pressed="false">Editor unificado</button>';
    bar.firstElementChild.prepend($p('noteTitle'));
    $p('previewWrap').before(bar);$p('proCopy').onclick=()=>{resumeEditor();if(!document.execCommand('copy'))toast('Usa Ctrl+C para copiar la selección');};
    $p('proMode').onclick=()=>{manualClassic=active||!manualClassic;changed();if(!active)drawCurrent();else applyZoom();};
    const selectionCanvas=document.createElement('canvas');selectionCanvas.id='proSelection';selectionCanvas.setAttribute('aria-hidden','true');$p('canvasShell').append(selectionCanvas);
    const caret=document.createElement('div');caret.id='proCaret';caret.hidden=true;caret.setAttribute('aria-hidden','true');$p('canvasShell').append(caret);
    const heading=document.querySelector('.previewCard>.cardhead h2');heading.textContent='Documento';
    $p('previewWrap').addEventListener('pointerdown',pointerDown,true);
    $p('previewWrap').addEventListener('pointermove',e=>{
      if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pair&&touches.size===2){const [a,b]=[...touches.values()];zoom=Math.max(.25,Math.min(2,pair.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pair.distance)));applyZoom();e.preventDefault();e.stopImmediatePropagation();return;}
      const g=gesture;if(!g||g.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>10){g.moved=true;clearTimeout(g.timer);}
      if(g.drag){e.preventDefault();e.stopImmediatePropagation();move(g.start,hit(e));}
      else if(g.touch&&g.moved){$p('previewWrap').scrollTop=g.scrollY+g.y-e.clientY;$p('previewWrap').scrollLeft=g.scrollX+g.x-e.clientX;}
    },true);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])$p('previewWrap').addEventListener(type,e=>{
      const wasPair=!!pair;touches.delete(e.pointerId);if(touches.size<2)pair=null;
      if(wasPair){gesture=null;e.stopImmediatePropagation();return;}
      const g=gesture;if(!g||g.id!==e.pointerId)return;clearTimeout(g.timer);gesture=null;
      if(type==='pointerup'&&!g.moved&&!g.drag){e.preventDefault();AndroidBridge.beginTouchKeyboard?.();move(g.start);AndroidBridge.requestTouchKeyboard?.();}
      e.stopImmediatePropagation();
    },true);
    editor.addEventListener('input',e=>{if(active&&(ime||e.isComposing))changed();});
    document.addEventListener('selectionchange',()=>{if(!active)return;const previous=currentPage;followCaret();if(previous!==currentPage)showPage();else requestAnimationFrame(selection);});
    editor.addEventListener('keydown',e=>{
      if(!active||ime||e.isComposing||e.ctrlKey||e.metaKey||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      const mark=bookmark();if(!mark)return;const current=caretAt(mark.backward?mark.start:mark.end);if(!current)return;
      const rows=plan.pages.flatMap(p=>p.rows),index=rows.findIndex(r=>r.carets.includes(current));let target;
      if(e.key==='Home'||e.key==='End'){target=e.key==='Home'?rows[index]?.carets[0]:rows[index]?.carets.at(-1);}
      else {const row=rows[index+(e.key==='ArrowUp'?-1:1)];target=row?.carets.reduce((a,c)=>!a||Math.abs(c.x-current.x)<Math.abs(a.x-current.x)?c:a,null);}
      if(target){e.preventDefault();e.stopImmediatePropagation();move(e.shiftKey?(mark.backward?mark.end:mark.start):target,target);followCaret();showPage();}
    },true);
    window.addEventListener('resize',()=>{if(active)showPage();});
    document.addEventListener('focusout',()=>requestAnimationFrame(selection));
    clearTimeout(refreshTimer);requestLibrary();
  }
  init();
  return {get active(){return active;},get enabled(){return enabled;},changed,showPage,exportPlan,selection,reload:()=>{if(enabled)requestLibrary();},
    metrics:()=>({layoutMs:lastLayoutMs,paintMs:lastPaintMs,cacheSize:cache.size,pages:plan?.pages.length||0}),
    testPlan:()=>plan};
})();
