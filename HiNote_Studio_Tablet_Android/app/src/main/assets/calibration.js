'use strict';
const CalibrationUI = (() => {
  const el=id=>document.getElementById(id);
  let busy=false,ticket=0,operation='',profiles=[],groups={},selected='original',review=null,view='found',returnFocus=null;
  function current(){return review?.detail || profiles.find(p=>p.id===selected);}
  function status(text){el('calibrationStatus').textContent=text;}
  function controls(){
    document.querySelectorAll('.calibrationCard button,.calibrationCard input,.calibrationCard select,.calibrationCard textarea').forEach(e=>e.disabled=busy||exporting||folderBusy);
    el('cancelCalibration').classList.toggle('hidden',!busy);el('cancelCalibration').disabled=!busy;
    if(busy)return;
    const p=current();
    for(const id of ['renameProfile','deleteProfile'])el(id).disabled=!p||p.protected||!!review;
    for(const id of ['useProfile','duplicateProfile','backupProfile','previewProfile','importProfile','createTemplate','profileList','restoreDeletedProfile'])el(id).disabled=!p||!!review;
    el('commitProfile').disabled=!review;el('discardProfile').disabled=!review;
    el('profileName').disabled=!p||p.protected||!!review;
    el('originalCalibration').disabled=exporting||busy;
  }
  function begin(action,args={}){
    if(busy||exporting||folderBusy||ImageEditor.isBusy())return;
    if(!window.AndroidBridge?.requestCalibration){toast('Esta función está disponible en la app Android');return;}
    saveDraft();clearTimeout(refreshTimer);revision++;composing=false;AndroidBridge.invalidateCompose(revision);
    busy=true;operation=action;ticket++;window.controls();status(action==='catalog'?'Leyendo perfiles…':'Preparando operación…');
    try{
      if(action==='import')AndroidBridge.requestCalibrationImport(JSON.stringify(args),ticket);
      else AndroidBridge.requestCalibration(action,JSON.stringify(args),ticket);
    }catch(e){result(ticket,null,e.message);}
  }
  function drawCharacters(){
    const p=current(),grid=el('characterGrid');grid.replaceChildren();if(!p)return;
    const filter=el('characterSearch').value.trim().toLowerCase();
    const list=view==='found'?p.found:p.missing;
    el('showFound').classList.toggle('accent',view==='found');el('showMissing').classList.toggle('accent',view==='missing');
    el('characterLegend').textContent=view==='found'?'Muestras propias del perfil y variantes disponibles de 8.':'Azul: disponible en Original. Ámbar: sin muestra en ninguno; se dejará espacio y se avisará.';
    for(const ch of list){
      const code='U+'+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');
      if(filter&&!ch.toLowerCase().includes(filter)&&!code.toLowerCase().includes(filter))continue;
      const chip=document.createElement('div');chip.className='characterChip'+(view==='missing'?(p.fallback.includes(ch)?' fallback':' missing'):'');
      const symbol=document.createElement('strong');symbol.textContent=ch;
      const label=document.createElement('small');label.textContent=view==='found'?`${p.variants[ch]}/8`:(p.fallback.includes(ch)?'Original':'Sin muestra');
      const point=document.createElement('small');point.textContent=code;chip.append(symbol,label,point);grid.append(chip);
    }
    if(!grid.children.length){const p=document.createElement('p');p.textContent=filter?'Sin coincidencias.':view==='missing'?'No faltan caracteres dentro de este conjunto.':'No hay muestras propias.';grid.append(p);}
  }
  function draw(){
    const p=current();if(!p)return;
    el('profileHeading').textContent=p.name+(p.protected?' · predeterminada y protegida':'');
    el('profileName').value=p.name;
    el('profileCoverage').textContent=`${p.found.length} encontrados · ${p.missing.length} faltantes · ${p.fallback.length} disponibles en Original · ${p.unavailable.length} sin muestra`;
    el('showFound').textContent=`Ver encontrados (${p.found.length})`;el('showMissing').textContent=`Ver faltantes (${p.missing.length})`;
    el('profileWarnings').textContent=p.incomplete.length?`Variantes incompletas: ${p.incomplete.map(c=>`${c} (${p.variants[c]}/8)`).join(', ')}`:'';
    el('importReview').classList.toggle('hidden',!review);
    if(review)el('importReviewText').textContent=(review.copiesOriginal?'Se guardará como Original ampliada. ':'')+(review.replaced?`Se reemplazarán ${review.replaced} caracteres del perfil con las muestras importadas. `:'')+'Las filas vacías no borran caracteres existentes. Guardar el perfil no cambia automáticamente la letra de tu nota.';
    el('activeProfileLabel').textContent=profiles.find(x=>x.id===activeProfile)?.name||'Original';
    drawCharacters();controls();
  }
  function updateCatalog(data){
    profiles=data.profiles;groups=data.groups||{};
    const list=el('profileList');list.replaceChildren();
    for(const p of profiles){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name+(p.id===activeProfile?' · activa':'');list.append(opt);}
    if(!profiles.some(p=>p.id===activeProfile)){activeProfile='original';changed();toast('El perfil del borrador no está disponible. Se seleccionó Original.');}
    if(!profiles.some(p=>p.id===selected))selected='original';list.value=selected;draw();templateCount();
    if(data.problems?.length)status(data.problems.join('\n'));
  }
  function result(id,raw,error){
    if(id!==ticket)return;
    const completed=operation;busy=false;window.controls();
    if(error){status(error);toast(error);return;}
    try{
      const data=JSON.parse(raw||'{}');
      if(data.profiles){updateCatalog(data);status('Elige un perfil para ver sus caracteres.');}
      else if(data.review){review=data;view='found';draw();status('Calibración analizada. Revisa encontrados y faltantes antes de guardar.');}
      else if(data.preview){el('profilePreview').src=data.preview;el('profilePreview').classList.remove('hidden');el('profilePreviewWarnings').textContent=(data.warnings||[]).join(' · ');status('Vista de la primera página de prueba.');}
      else if(data.saved||data.deleted){
        review=null;if(data.saved)selected=data.saved;
        if(data.deleted===activeProfile)activeProfile='original';
        el('deleteProfileConfirm').classList.add('hidden');changed();begin('catalog');
        toast(data.deleted?'Perfil eliminado; puedes recuperar la última eliminación.':'Perfil guardado');
      }else if(data.discarded){review=null;draw();status('Importación descartada; tus perfiles se conservaron.');}
      else if(data.fileSaved)status(completed==='template'?'Plantilla guardada. Ábrela en Huawei Notes, escribe y exporta el .hinote para importarlo aquí.':'Respaldo guardado.');
      else if(data.cancelled)status('Operación cancelada.');
      controls();
    }catch(e){status('No se pudo leer la respuesta: '+e.message);}
  }
  function templateOptions(){return {groups:[...document.querySelectorAll('[name=calibrationGroup]:checked')].map(c=>c.value),custom:el('extraCharacters').value};}
  function templateCount(){
    const options=templateOptions(),text=options.groups.map(g=>groups[g]?.chars||'').join('')+options.custom;
    const count=new Set([...text.normalize('NFC')].filter(c=>!c.match(/\s/u))).size;
    el('templateCount').textContent=`${count} caracteres · ${count*8} celdas · ${Math.ceil(count/12)} páginas (máximo 256 caracteres)`;
  }
  function use(identity){
    if(busy||review||exporting)return;activeProfile=identity;changed();draw();saveDraft();toast('Letra activa: '+(profiles.find(p=>p.id===identity)?.name||'Original'));
  }
  function open(){
    if(exporting||ImageEditor.isBusy()||folderBusy)return;returnFocus=document.activeElement;
    el('calibrationDialog').classList.remove('hidden');selected=activeProfile;el('profileList').value=selected;draw();el('closeCalibration').focus();
    if(!profiles.length&&!busy)begin('catalog');
  }
  function close(){if(busy)return;el('calibrationDialog').classList.add('hidden');returnFocus?.focus?.();}
  function init(){
    el('manageCalibration').onclick=open;el('originalCalibration').onclick=()=>use('original');el('closeCalibration').onclick=close;
    el('profileList').onchange=()=>{selected=el('profileList').value;review=null;view='found';el('characterSearch').value='';el('profilePreview').classList.add('hidden');el('deleteProfileConfirm').classList.add('hidden');draw();};
    el('useProfile').onclick=()=>use(selected);
    el('showFound').onclick=()=>{view='found';drawCharacters();};el('showMissing').onclick=()=>{view='missing';drawCharacters();};
    el('characterSearch').oninput=drawCharacters;
    el('renameProfile').onclick=()=>begin('rename',{id:selected,name:el('profileName').value});
    el('duplicateProfile').onclick=()=>begin('duplicate',{id:selected,name:el('profileName').value+' (copia)'});
    el('backupProfile').onclick=()=>begin('backup',{id:selected});
    el('deleteProfile').onclick=()=>el('deleteProfileConfirm').classList.remove('hidden');
    el('cancelDeleteProfile').onclick=()=>el('deleteProfileConfirm').classList.add('hidden');
    el('confirmDeleteProfile').onclick=()=>begin('delete',{id:selected});
    el('restoreDeletedProfile').onclick=()=>begin('restoreDeleted');
    el('importProfile').onclick=()=>begin('import',{name:el('importProfileName').value,target:el('extendProfile').checked?selected:''});
    el('commitProfile').onclick=()=>begin('commit');el('discardProfile').onclick=()=>begin('discard');
    el('createTemplate').onclick=()=>begin('template',templateOptions());
    el('templateMissing').onclick=()=>{document.querySelectorAll('[name=calibrationGroup]').forEach(c=>c.checked=false);el('extraCharacters').value=(current()?.missing||[]).join('');el('extendProfile').checked=true;templateCount();};
    document.querySelectorAll('[name=calibrationGroup]').forEach(c=>c.onchange=templateCount);el('extraCharacters').oninput=templateCount;
    el('previewProfile').onclick=()=>begin('preview',{id:selected,text:el('profileSample').value});
    el('cancelCalibration').onclick=()=>{AndroidBridge.cancelCalibration();status('Cancelando… Si está abierto el selector del sistema, ciérralo para volver.');};
    el('calibrationDialog').addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const nodes=[...el('calibrationDialog').querySelectorAll('button,input,select,textarea,summary')].filter(n=>!n.disabled&&n.getClientRects().length);
        const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    });
    if(window.AndroidBridge?.requestCalibration)begin('catalog');
  }
  window.onCalibrationResult=result;
  window.onCalibrationProgress=(id,text)=>{if(id===ticket&&busy)status(text);};
  return {init,controls,isBusy:()=>busy,open};
})();
