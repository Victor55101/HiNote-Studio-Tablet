/* Present only when the native V34 Pruebas build enables the diagnostic bridge. */
const NotesProbeUI=(()=>{
  let enabled=false,busy=false,ticket=0,pending=0,pageWork=false,opened=false;
  const el=id=>document.getElementById(id);
  function status(message){el('probeStatus').textContent=message;}
  function controlsLocal(){el('notesProbeDialog').querySelectorAll('button,select,textarea').forEach(node=>node.disabled=busy);}
  function observations(){return {png_paste:el('probePngResult').value,hinote_paste:el('probeHinoteResult').value,shared_page:el('probeShareResult').value,notes:el('probeObservations').value.slice(0,2000)};}
  function request(action,args={}){
    if(!enabled||busy)return;
    if(!window.AndroidBridge?.requestProbeAction){status('El diagnóstico requiere HiNote Studio Pruebas para Android.');return;}
    pageWork=action.startsWith('page-');
    if(pageWork){
      if(exporting||folderBusy||ImageEditor.isBusy()||CalibrationUI.isBusy()||NotebookUI.isBusy()||TableEditor.isOpen()||MathGraphEditor.isOpen()){status('Termina la edición u operación actual antes de probar esta página.');return;}
      saveDraft();clearTimeout(refreshTimer);clearTimeout(qualityTimer);revision++;composing=false;AndroidBridge.invalidateCompose(revision);
      args={document:serializeDocument(),settings:settings(),images:JSON.parse(ImageEditor.exportJSON()),pages:ImageEditor.state().minimumPages,page:currentPage,title:el('noteTitle').value||'Prueba',grid:el('gridCheck').checked};
      exporting=true;controls();
    }
    busy=true;pending=++ticket;controlsLocal();status(pageWork?'Preparando únicamente la página seleccionada con los cambios actuales…':'Preparando la prueba…');
    try{AndroidBridge.requestProbeAction(action,JSON.stringify(args),pending);}catch(error){finish(null,error.message);}
  }
  function finish(raw,error){
    const wasPage=pageWork;busy=false;pending=0;pageWork=false;if(wasPage){exporting=false;controls();}
    try{if(error)throw Error(error);const result=JSON.parse(raw||'{}');if(result.report)el('probeReport').textContent=JSON.stringify(result.report,null,2);status(result.message||'Prueba completada.');}catch(error){status(error.message);}
    controlsLocal();
  }
  window.onNotesProbeResult=(id,raw,error)=>{if(id===pending)finish(raw,error);};
  function open(){
    if(!enabled||opened||exporting||folderBusy||ImageEditor.isBusy()||CalibrationUI.isBusy()||NotebookUI.isBusy()||TableEditor.isOpen()||MathGraphEditor.isOpen())return;
    saveDraft();clearTimeout(refreshTimer);clearTimeout(qualityTimer);opened=true;el('notesProbeDialog').classList.remove('hidden');document.querySelector('.app').inert=true;
    el('probePageNumber').textContent=`Página a probar: ${currentPage+1}. Puedes cambiarla en la previsualización antes de abrir este panel.`;
    el('probeClose').focus();request('report');
  }
  function close(){if(busy)return;opened=false;el('notesProbeDialog').classList.add('hidden');document.querySelector('.app').inert=false;controls();el('openNotesProbe').focus();}
  window.onNotesProbeShared=()=>{if(!enabled)return;if(!opened)open();status('Notes envió contenido mediante Compartir. Pulsa Examinar lo compartido.');};
  function init(){
    try{enabled=window.AndroidBridge?.isNotesProbe?.()===true;}catch(error){enabled=false;}
    if(!enabled)return;
    const style=document.createElement('style');style.textContent=`.probeSections{display:grid;grid-template-columns:1fr 1fr;gap:16px}.probeSection{border:1px solid #dbe1e8;border-radius:14px;padding:16px;background:#fff}.probeSection h3{margin:0 0 10px}.probeSection p,.probeSection ol{font-size:14px;color:#526079;line-height:1.5}.probeSection button{margin:4px 4px 4px 0}.probeResults{display:flex;flex-wrap:wrap;gap:12px}.probeResults label{display:grid;gap:6px;flex:1;min-width:220px}.probeResults select{max-width:100%}#probeObservations{width:100%;margin-top:12px;min-height:66px}#probeReport{white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto;background:#f3f6fa;padding:12px;font-size:12px}#probeStatus{flex-shrink:0}#notesProbeDialog .notebookBody{overflow:auto}@media(max-width:850px){.probeSections{grid-template-columns:1fr}}`;document.head.append(style);
    const options=`<option>No probado</option><option>No aparece Pegar</option><option>No pega el contenido de HiNote</option><option>Pega como imagen</option><option>Pega como trazos editables</option><option>Abre un cuaderno separado</option>`;
    const button=document.createElement('button');button.className='btn';button.id='openNotesProbe';button.textContent='Pruebas Huawei Notes';button.onclick=open;el('saveDirect').parentElement.append(button);
    const dialog=document.createElement('div');dialog.id='notesProbeDialog';dialog.className='notebookDialog hidden';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','notesProbeTitle');
    dialog.innerHTML=`<section class="notebookCard"><div class="notebookHeading"><div><h2 id="notesProbeTitle">Pruebas de copiado con Huawei Notes</h2><p>V34 Pruebas · Incluye las correcciones de la V34</p></div><button class="btn" id="probeClose">Cerrar</button></div><p class="mathMessage" id="probeStatus" role="status"></p><div class="notebookBody"><p class="notebookNotice">Tu prueba indica que Notes conserva el copiado del lazo por separado del texto de Android. Aquí comprobamos las rutas públicas disponibles. El pegado de trazos editables entre las dos apps sigue sin estar confirmado.</p><div class="probeSections"><section class="probeSection"><h3>1. Portapapeles después del lazo</h3><ol><li>Pulsa Preparar PRUEBA-A.</li><li>En Notes dibuja tres rayas, selecciónalas con el lazo y pulsa Copiar.</li><li>Regresa aquí y pulsa Examinar copiado.</li><li>Copia PRUEBA-B aquí y comprueba si Notes todavía pega sus rayas.</li></ol><button class="btn accent" id="probeSeedA">Preparar PRUEBA-A</button><button class="btn" id="probeInspect">Examinar copiado</button><button class="btn" id="probeSeedB">Copiar PRUEBA-B</button></section><section class="probeSection"><h3>2. Compartir desde Notes</h3><p>Selecciona las tres rayas con el lazo, pulsa Compartir y busca <strong>HiNote Studio Pruebas</strong>. Al regresar pulsa el botón de abajo. El informe mostrará si Notes comparte una imagen, una URI u otro formato accesible.</p><button class="btn" id="probeInspectShare">Examinar lo compartido</button></section><section class="probeSection"><h3>3. Pegar esta página en Notes</h3><p id="probePageNumber"></p><p>Prueba primero PNG como control: será una imagen. Después prueba el archivo .hinote mediante el portapapeles público. En Notes mantén pulsada una zona vacía y pulsa Pegar. Usa el lazo para comprobar si cada trazo se puede seleccionar por separado.</p><button class="btn" id="probeCopyPng">Copiar página PNG (control)</button><button class="btn accent" id="probeCopyHinote">Probar página .hinote en portapapeles</button></section><section class="probeSection"><h3>4. Compartir esta página</h3><p>Envía un .hinote que contiene solo esta página mediante Compartir de Android. Si Notes abre otro cuaderno, el archivo es compatible con la importación; todavía falta comprobar el pegado directo en tu cuaderno actual.</p><button class="btn" id="probeSharePage">Compartir página .hinote</button></section></div><h3>Registrar lo que ocurrió</h3><div class="probeResults"><label>Prueba PNG<select id="probePngResult">${options}</select></label><label>Portapapeles .hinote<select id="probeHinoteResult">${options}</select></label><label>Compartir .hinote<select id="probeShareResult">${options}</select></label></div><textarea id="probeObservations" maxlength="2000" placeholder="Describe qué apareció en Notes y si pudiste seleccionar los trazos por separado" aria-label="Observaciones de las pruebas"></textarea><button class="btn" id="probeRecord">Registrar resultado</button><details><summary>Ver informe técnico</summary><pre id="probeReport"></pre></details></div><div class="notebookActions"><small class="notebookNotice">El informe queda guardado entre sesiones. Usa Guardar informe para enviarlo con los resultados.</small><button class="btn primary" id="probeSaveReport">Guardar informe .json</button></div></section>`;
    document.body.append(dialog);el('probeClose').onclick=close;
    for(const [id,action]of [['probeSeedA','seed-a'],['probeSeedB','seed-b'],['probeInspect','inspect'],['probeInspectShare','inspect-share'],['probeCopyPng','page-png'],['probeCopyHinote','page-hinote'],['probeSharePage','page-share']])el(id).onclick=()=>request(action);
    el('probeRecord').onclick=()=>request('observations',observations());el('probeSaveReport').onclick=()=>request('save-report',observations());
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const focus=[...dialog.querySelectorAll('button,select,textarea,summary')].filter(node=>!node.disabled&&node.getClientRects().length);const index=focus.indexOf(document.activeElement);if(focus.length&&((event.shiftKey&&index===0)||(!event.shiftKey&&index===focus.length-1))){event.preventDefault();focus[event.shiftKey?focus.length-1:0].focus();}}});
    try{if(AndroidBridge.hasProbeShare?.())open();}catch(error){}
  }
  init();return {isEnabled:()=>enabled,isOpen:()=>opened};
})();
