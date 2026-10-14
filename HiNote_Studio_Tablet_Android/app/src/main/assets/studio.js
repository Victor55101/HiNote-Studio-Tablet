'use strict';
/* Presentation only: move existing controls, preserve model IDs and action handlers. */
window.StudioUI = (() => {
  const el=id=>document.getElementById(id), node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const paths={chevron:'m6 9 6 6 6-6',move:'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4',copy:'M8 8h13v13H8zM16 8V3H3v13h5',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',resize:'M8 4H4v4M4 4l16 16M16 20h4v-4',crop:'M8 3v13h13M3 8h13v13',rotate:'M20 7a9 9 0 1 0 1 9M20 2v5h-5',replace:'M3 8h15l-4-4M21 16H6l4 4',keyboard:'M3 5h18v14H3zM7 9h.01M12 9h.01M17 9h.01M7 13h.01M12 13h.01M17 13h.01M8 16h8',list:'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',redo:'m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',paste:'M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M9 2h6v5H9z',image:'M3 3h18v18H3zM3 16l6-6 6 6 3-3 3 3M16 7h.01',table:'M3 3h18v18H3zM3 9h18M9 3v18',formula:'M18 4H6l7 8-7 8h12',graph:'M4 3v17h17M7 14l4-5 4 3 6-8',plus:'M12 5v14M5 12h14',left:'m14 5-7 7 7 7M7 12h14',right:'m10 5 7 7-7 7M3 12h14',close:'m6 6 12 12M6 18 18 6',up:'m5 12 7-7 7 7M12 5v16',down:'m5 12 7 7 7-7M12 3v14'};
  function icon(key){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.classList.add('uiIcon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[key]);svg.append(p);return svg;}
  function objectIcon(button,action){const key=/Move$/.test(action)?'move':/Copy$/.test(action)?'copy':/Delete$/.test(action)?'trash':/Resize$/.test(action)?'resize':null;if(key)button.replaceChildren(icon(key));}
  function decorate(id,key,only=false){const b=el(id);if(!b)return;const label=b.getAttribute('aria-label')||b.textContent.trim();if(only){b.textContent='';b.setAttribute('aria-label',label);b.title=label;}b.prepend(icon(key));}
  function tabs(items,changed,cls='inspectorTabs'){
    const bar=node('div',cls);bar.setAttribute('role','tablist');
    for(const [id,title] of items){const b=node('button','btn',title);b.type='button';b.dataset.pane=id;b.setAttribute('role','tab');b.onclick=()=>select(id);bar.append(b);}
    function select(id){for(const b of bar.children){const on=b.dataset.pane===id;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}changed(id);}
    bar.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const b=[...bar.children],i=b.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?b.length-1:(i+(e.key==='ArrowRight'?1:-1)+b.length)%b.length;select(b[next].dataset.pane);b[next].focus();});
    return {bar,select};
  }
  let activeTab='text',listExpanded=false,graphTabs,profileTabs,sharedMathTools;
  function ribbon(){
    for(const [name,id] of [['text','panelText'],['insert','panelInsert'],['page','panelPage'],['save','panelSave'],['calibration','panelCalibration']])el(id).classList.toggle('hidden',activeTab!==name);
    const mark=bookmark(),lines=readLines(),inList=!!mark&&selectedLineIndexes(mark).some(i=>!!paragraphOf(lines[i]).list);
    el('panelLists').classList.toggle('hidden',activeTab!=='text'||(!listExpanded&&!inList));el('listToggle').setAttribute('aria-expanded',String(listExpanded||inList));
    if(inList&&document.activeElement!==el('listType')){const list=paragraphOf(lines[mark.start.line]).list;if(list)el('listType').value=list.type;}
    el('panelImages').classList.toggle('hidden',!ImageEditor.selected());
    syncColors();
  }
  function setTab(name){if(!['text','insert','page','save','calibration'].includes(name))return;activeTab=name;for(const b of el('tabs').children){const on=b.dataset.tab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));}ribbon();}
  function meta(){
    el('noteSubtitle').textContent=(el('noteTitle').value||'Nueva nota')+' · '+el('draftStatus').textContent;
    const current=!!composition&&previewRevision===revision&&!composing;
    el('viewState').textContent=composing?'Actualizando…':current?'Vista al día':'Vista pendiente';el('viewState').classList.toggle('current',current);
    el('viewState').title=el('status').textContent;
    if(current&&!exporting&&!saveRequested&&!folderBusy&&!CalibrationUI.isBusy()&&!NotebookUI.isBusy())el('refreshBtn').disabled=true;
  }
  function buildGraph(){
    const controls=el('graphEditor').querySelector('.graphControls'),preview=el('graphEditor').querySelector('.graphPreview');
    sharedMathTools=el('mathLeft').closest('.mathTools');sharedMathTools.classList.add('mathModeTools');
    const colorLabel=node('label',null,'Color');el('mathColor').before(colorLabel);colorLabel.append(el('mathColor'));
    const sizeUnit=el('mathSize').parentElement.lastChild;if(sizeUnit.nodeType===3){const unit=node('span','unit','%');sizeUnit.replaceWith(unit);}
    el('mathFitLabel').title='Reduce la fórmula si supera el ancho disponible';el('mathAutoWidthLabel').title='El contenedor se adapta al tamaño de la fórmula';
    const paneBody=node('div','graphInspectorBody'),panes={};
    for(const key of ['points','trace','axes','sheet']){const p=node('section','graphInspectorPane');p.id='graphPane'+key;panes[key]=p;paneBody.append(p);}
    const traceBar=el('graphTrace').parentElement;traceBar.classList.add('graphTraceBar');
    const axes=[el('graph_title').parentElement,...controls.querySelectorAll('.graphRange'),el('graph_xlabel').parentElement.parentElement,el('graph_grid').parentElement.parentElement];axes.forEach(n=>panes.axes.append(n));
    for(const n of [el('graphType'),el('graphTraceLabel').parentElement.parentElement,el('graph_markers').parentElement.parentElement,el('graphStyles')])panes.trace.append(n);
    const pointsForm=el('graphPointX').closest('.graphPointForm');panes.points.append(pointsForm);
    const list=node('details');list.id='graphPointDetails';list.append(node('summary',null,'Puntos del trazo'),el('graphPointList'));panes.points.append(list,el('graphBulk'),el('graphHelp'));
    graphTabs=tabs([['points','Puntos'],['trace','Trazo'],['axes','Ejes'],['sheet','Hoja']],key=>Object.entries(panes).forEach(([id,p])=>p.classList.toggle('hidden',id!==key)));
    controls.append(traceBar,graphTabs.bar,paneBody);graphTabs.bar.id='graphInspectorTabs';graphTabs.select('points');
    const canvasTools=node('div','graphCanvasTools');canvasTools.append(preview.querySelector('.graphChecks'),preview.querySelector('.graphZoomTools'));preview.prepend(canvasTools);
    const footer=node('div','graphGlobalActions');footer.append(node('p','graphFootHint','Toca un punto para editarlo. Arrastra para moverlo.'));
    const hist=node('div','graphHistory');hist.append(el('graphUndo'),el('graphRedo'));footer.append(hist);preview.append(footer);
    decorate('graphUndo','undo',true);decorate('graphRedo','redo',true);
  }
  function mathMode(){
    if(!sharedMathTools)return;const graph=el('mathDialog').classList.contains('graphMode');
    if(graph){el('graphPanesheet').append(sharedMathTools);graphTabs.select('points');}
    else{el('formulaEditor').prepend(sharedMathTools);el('formulaStage').after(el('mathMessage'));}
    if(graph)el('graphEditor').querySelector('.graphPreview').append(el('mathMessage'));
    syncColors();
  }
  function buildTable(){
    const card=el('tableDialog').querySelector('.tableCard'),toolArea=card.querySelector('.tableToolArea');
    const rows=[...toolArea.querySelectorAll('.tableTools')],body=node('div','tableBody'),main=node('div','tableMain'),canvas=node('div','tableCanvas'),side=node('aside','tableSide');
    canvas.append(rows[1],el('tableGridWrap'));rows[2].classList.add('tableCellTools');main.append(canvas,rows[2]);side.append(rows[0]);
    const help=node('details');help.open=true;help.append(node('summary',null,'Ayuda de tamaños'),el('tableSizeHint'),el('tableMessage'));side.append(help);body.append(main,side);toolArea.replaceWith(body);
    const ink=node('label',null,'Color del texto');el('tableInkColor').before(ink);ink.append(el('tableInkColor'));
    const border=node('label',null,'Color del borde');el('tableBorder').parentElement.after(border);border.append(el('tableBorderColor'));
  }
  function buildProfiles(){
    const sidebar=el('profileList').parentElement,profileGroup=node('div','profileGroup'),importGroup=node('div','profileGroup');
    const nameLabel=sidebar.querySelector('[for=profileName]');nameLabel.before(profileGroup);
    profileGroup.append(nameLabel,el('profileName'),sidebar.querySelector('.profileActions'),el('deleteProfileConfirm'));
    const importLabel=sidebar.querySelector('[for=importProfileName]');importLabel.before(importGroup);
    importGroup.append(importLabel,el('importProfileName'),el('extendProfile').parentElement,el('importProfile'),sidebar.querySelector('small'));sidebar.querySelector('hr').remove();
    const content=el('profileHeading').parentElement,coverage=el('profileCoverage');coverage.classList.add('hidden');
    const stats=node('div','profileStats');stats.id='profileStats';coverage.after(stats);
    const paneBody=node('div','profilePanes'),characters=node('section','profilePane');characters.id='profileCharacters';
    const top=node('div','characterTop');top.append(content.querySelector('.characterTabs'),content.querySelector('.characterSearch'));
    characters.append(top,el('characterLegend'),el('characterGrid'),el('profileWarnings'));
    const template=el('templateOptions'),test=el('profilePreviewOptions');template.open=true;test.open=true;
    profileTabs=tabs([['characters','Caracteres'],['template','Crear plantilla'],['test','Probar esta escritura']],key=>{characters.classList.toggle('hidden',key!=='characters');template.classList.toggle('hidden',key!=='template');test.classList.toggle('hidden',key!=='test');});profileTabs.bar.id='profileInspectorTabs';
    content.append(profileTabs.bar,paneBody);paneBody.append(characters,template,test,el('importReview'));profileTabs.select('characters');
    const templateLayout=node('div','templateLayout'),settings=node('div'),summary=node('aside','templateSummary');
    for(const n of [...template.children])if(n.tagName!=='SUMMARY')settings.append(n);
    summary.append(node('strong',null,'Resumen'),el('templateCount'),settings.querySelector('.profileActions'),settings.querySelector('small'));
    templateLayout.append(settings,summary);template.append(templateLayout);
    const sampleLayout=node('div','profileTestLayout'),sampleControls=node('div'),paper=node('div');
    sampleControls.append(test.querySelector('label'),el('profileSample'),el('previewProfile'),el('profilePreviewWarnings'));
    const empty=node('div','profilePreviewEmpty','Escribe un texto y pulsa Previsualizar perfil para ver tu escritura.');empty.id='profilePreviewEmpty';paper.append(empty,el('profilePreview'));sampleLayout.append(sampleControls,paper);test.append(sampleLayout);
    new MutationObserver(()=>empty.classList.toggle('hidden',!el('profilePreview').classList.contains('hidden'))).observe(el('profilePreview'),{attributes:true,attributeFilter:['class']});
    el('importProfile').addEventListener('click',()=>profileTabs.select('characters'));
  }
  function profile(p,active){
    if(p){const stats=el('profileStats');if(stats){stats.replaceChildren();for(const [value,label] of [[p.found.length,'encontrados'],[p.missing.length,'faltantes'],[p.fallback.length,'disponibles en Original'],[p.unavailable.length,'sin muestra']]){const card=node('div','profileStat');card.append(node('strong',null,String(value)),node('small',null,label));stats.append(card);}}}
    if(active)el('activeCoverage').textContent=active.name+' · '+active.found.length+' de '+(active.found.length+active.missing.length)+' caracteres';
  }
  const colorButtons=new Map();let colorInput=null,returnFocus=null,colorInert=[],hsv={h:0,s:0,v:0},colorPointer=null;
  const valid=c=>/^#[\da-f]{6}$/i.test(c);
  function fromHex(c){const rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255),max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;let h=0;if(d){const i=rgb.indexOf(max);h=(i===0?(rgb[1]-rgb[2])/d+(rgb[1]<rgb[2]?6:0):i===1?(rgb[2]-rgb[0])/d+2:(rgb[0]-rgb[1])/d+4)*60;}return {h,s:max?d/max:0,v:max};}
  function toHex(){const {h,s,v}=hsv,c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+a.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();}
  function syncColors(){for(const [input,b] of colorButtons){const color=input.value;b.querySelector('.colorSwatch').style.background=color;b.querySelector('.colorCode').textContent=input.dataset.mixed==='true'?'Mixto':color.toUpperCase();b.disabled=input.disabled;b.setAttribute('aria-label',(input.getAttribute('aria-label')||'Elegir color')+': '+color.toUpperCase());}}
  function colorPaint(){const c=toHex();el('colorSV').style.background=`linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent),hsl(${hsv.h},100%,50%)`;el('colorCursor').style.left=hsv.s*100+'%';el('colorCursor').style.top=(1-hsv.v)*100+'%';el('colorPreview').style.background=c;el('colorHue').value=hsv.h;el('colorSaturation').value=Math.round(hsv.s*100);el('colorValue').value=Math.round(hsv.v*100);if(document.activeElement!==el('colorHex'))el('colorHex').value=c;el('colorError').textContent='';}
  function commitColor(){if(!colorInput||colorInput.disabled)return;const c=toHex();if(colorInput.value.toUpperCase()===c)return;colorInput.value=c;colorInput.dataset.mixed='false';colorInput.dispatchEvent(new Event('input',{bubbles:true}));colorInput.dispatchEvent(new Event('change',{bubbles:true}));syncColors();}
  function recentColors(){try{return JSON.parse(localStorage.getItem('hinote-recent-colors')||'[]').filter(valid).slice(0,8);}catch(_){return [];}}
  function palette(container,colors){container.replaceChildren();for(const c of colors){const b=node('button');b.style.background=c;b.type='button';b.setAttribute('aria-label','Color '+c);b.onclick=()=>{hsv=fromHex(c);colorPaint();commitColor();};container.append(b);}}
  function openColor(input){
    if(input.disabled)return;captureSelection();colorInput=input;returnFocus=colorButtons.get(input);hsv=fromHex(input.value);palette(el('colorRecent'),recentColors());colorPaint();
    // Inert only other top-level UI roots; the existing dialog's inert app state is restored exactly.
    colorInert=[...document.body.children].filter(n=>n!==el('colorDialog')&&n.tagName!=='SCRIPT'&&n.tagName!=='STYLE').map(n=>[n,n.inert]);for(const [n] of colorInert)n.inert=true;
    el('colorTitle').textContent=input.getAttribute('aria-label')||'Color de tinta';el('colorDialog').classList.remove('hidden');el('colorClose').focus({preventScroll:true});
  }
  function closeColor(){if(!colorInput)return;const c=colorInput.value.toUpperCase();try{localStorage.setItem('hinote-recent-colors',JSON.stringify([c,...recentColors().filter(x=>x!==c)].slice(0,8)));}catch(_){}el('colorDialog').classList.add('hidden');for(const [n,state] of colorInert)n.inert=state;colorInert=[];colorInput=null;returnFocus?.focus({preventScroll:true});}
  function buildColors(){
    for(const input of document.querySelectorAll('input[type=color]')){input.classList.add('nativeColor');input.tabIndex=-1;const b=node('button','colorButton');b.type='button';b.dataset.colorFor=input.id;b.append(node('span','colorSwatch'),node('span','colorCode'));input.after(b);colorButtons.set(input,b);b.onclick=()=>openColor(input);new MutationObserver(syncColors).observe(input,{attributes:true,attributeFilter:['disabled','aria-label']});}
    const d=node('div','colorDialog hidden');d.id='colorDialog';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','colorTitle');
    d.innerHTML='<section class="colorCard"><div class="colorHeading"><h2 id="colorTitle">Color de tinta</h2><button class="btn" id="colorClose" aria-label="Cerrar colores"></button></div><div class="colorSV" id="colorSV" aria-label="Saturación y brillo"><span class="colorCursor" id="colorCursor"></span></div><input id="colorHue" class="colorHue" type="range" min="0" max="359" value="0" aria-label="Tono"><div class="colorFields"><div class="colorPreview" id="colorPreview"></div><label>Hexadecimal<input id="colorHex" maxlength="7" spellcheck="false" autocomplete="off" inputmode="text"></label></div><div class="colorNumberFields"><label>Saturación %<input id="colorSaturation" type="number" min="0" max="100"></label><label>Brillo %<input id="colorValue" type="number" min="0" max="100"></label></div><p class="colorError" id="colorError" role="status"></p><span class="colorSublabel">Colores habituales</span><div class="colorPalette" id="colorPalette"></div><span class="colorSublabel">Recientes</span><div class="colorPalette" id="colorRecent"></div><p>El color elegido se aplica al momento.</p><button class="btn primary colorDone" id="colorDone">Listo</button></section>';
    document.body.append(d);decorate('colorClose','close',true);palette(el('colorPalette'),['#000000','#FFFFFF','#475569','#A855F7','#2563EB','#16B5B5','#EF4444','#FFA936']);el('colorClose').onclick=closeColor;el('colorDone').onclick=closeColor;
    el('colorHex').oninput=()=>{const c='#'+el('colorHex').value.replace(/^#/,'');if(valid(c)){hsv=fromHex(c);colorPaint();commitColor();}else el('colorError').textContent='Escribe 6 caracteres: 0–9 o A–F.';};
    el('colorHue').oninput=()=>{hsv.h=+el('colorHue').value;colorPaint();};el('colorHue').onchange=commitColor;
    for(const [id,key] of [['colorSaturation','s'],['colorValue','v']])el(id).oninput=()=>{const value=el(id).value;if(value!==''&&el(id).validity.valid){hsv[key]=+value/100;colorPaint();commitColor();}};
    function point(e){const r=el('colorSV').getBoundingClientRect();hsv.s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));hsv.v=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));colorPaint();}
    el('colorSV').onpointerdown=e=>{if(e.button>0||colorPointer!==null)return;e.preventDefault();colorPointer=e.pointerId;el('colorSV').setPointerCapture(e.pointerId);point(e);};
    el('colorSV').onpointermove=e=>{if(colorPointer===e.pointerId)point(e);};el('colorSV').onpointerup=e=>{if(colorPointer!==e.pointerId)return;point(e);colorPointer=null;commitColor();};el('colorSV').onpointercancel=()=>{colorPointer=null;if(colorInput){hsv=fromHex(colorInput.value);colorPaint();}};
    d.addEventListener('click',e=>{if(e.target===d)closeColor();});d.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeColor();}if(e.key==='Tab'){const a=[...d.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length),i=a.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();a.at(-1).focus();}else if(!e.shiftKey&&i===a.length-1){e.preventDefault();a[0].focus();}}});
    document.addEventListener('change',syncColors);syncColors();
  }
  function init(){
    for(const [id,key] of [['undoBtn','undo'],['redoBtn','redo'],['pasteMath','paste'],['prevPage','left'],['nextPage','right']])decorate(id,key,true);
    for(const [id,key] of [['insertImage','image'],['insertTable','table'],['insertFormula','formula'],['insertGraph','graph'],['imageNewPage','plus']])decorate(id,key);
    decorate('listToggle','list');const caseLabel=node('label','field caseField','Estilo');el('caseSel').before(caseLabel);caseLabel.append(el('caseSel'));
    el('listToggle').onclick=()=>{listExpanded=!listExpanded;ribbon();};el('listType').addEventListener('change',()=>modifyLists('apply'));
    el('removeList').addEventListener('click',()=>{listExpanded=false;ribbon();});
    buildGraph();buildTable();buildProfiles();buildColors();mathMode();
    for(const [id,label] of [['tableAddRow','Fila'],['tableAddCol','Columna']]){el(id).textContent=label;decorate(id,'plus');}
    el('prevPage').setAttribute('aria-label','Página anterior');el('nextPage').setAttribute('aria-label','Página siguiente');
    ImageEditor.mode(true);setTab('text');meta();
    new MutationObserver(meta).observe(el('draftStatus'),{subtree:true,childList:true,characterData:true});new MutationObserver(meta).observe(el('status'),{subtree:true,childList:true,characterData:true});el('noteTitle').addEventListener('input',meta);
    document.addEventListener('selectionchange',()=>{if(document.activeElement?.closest('#editor'))ribbon();});
    // Disable hidden native color controls and their visible proxies together.
    CalibrationUI.redraw();
  }
  return {icon,objectIcon,init,setTab,ribbon,meta,mathMode,profile,syncColors,closeColor,selectGraphPane:key=>graphTabs.select(key),selectProfilePane:key=>profileTabs.select(key)};
})();
StudioUI.init();
