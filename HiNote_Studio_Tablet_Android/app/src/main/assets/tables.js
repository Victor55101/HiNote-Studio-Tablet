'use strict';
const TableEditor = (() => {
  const el=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
  const snap=n=>Math.round(n*2)/2, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  let tables={}, working=null, originalId=null, insertion=null, selectedRow=0, selectedCol=0, cellSelection=null, active=false, drag=null, resume=null;
  let selecting=false, selectedCells=new Set(['0:0']), selectionAnchor=[0,0], toolsFrame=null;
  let selectedId=null;
  const cellKey=(r,c)=>`${r}:${c}`;
  const currentCell=()=>working?.rows[selectedRow]?.cells[selectedCol];
  const chosenCells=()=>[...selectedCells].map(key=>{const [r,c]=key.split(':').map(Number);return working?.rows[r]?.cells[c];}).filter(Boolean);
  function singleCell(r=selectedRow,c=selectedCol){selectedRow=r;selectedCol=c;selectedCells=new Set([cellKey(r,c)]);selectionAnchor=[r,c];cellSelection=null;}
  const locked=()=>exporting||folderBusy||CalibrationUI.isBusy()||ImageEditor.isBusy()||MathGraphEditor.isOpen()||NotebookUI.isBusy();
  const newId=()=> 'table_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  const blank=()=>({segments:[],align:'left',valign:'top',size:0});
  const isLine=line=>Boolean(line?.[0]?.tableId);
  function live(){const ids=new Set(readLines().filter(isLine).map(l=>l[0].tableId));return Object.fromEntries(Object.entries(tables).filter(([id])=>ids.has(id)));}
  function state(){return {tables:clone(live()),pendingTable:working?{table:clone(working),originalId,insertion}:resume};}
  function restore(data){
    const candidate=data.tables||{};
    if(typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).length>50)throw Error('Borrador de tablas inválido');
    for(const [id,t] of Object.entries(candidate)){
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||id!==t.id)throw Error('Identificador de tabla inválido');
      validate(t);
    }
    tables=clone(candidate);resume=data.pendingTable||null;
  }
  function validate(t){
    if(!t||!Array.isArray(t.widths)||!t.widths.length||t.widths.length>12||!Array.isArray(t.rows)||!t.rows.length||t.rows.length>200)throw Error('La tabla admite hasta 200 filas y 12 columnas');
    if(!t.widths.every(w=>Number.isFinite(w)&&w>=1&&w<=15.5)||!Number.isFinite(t.left)||t.left<.5||t.left+t.widths.reduce((a,b)=>a+b,0)>16.001)throw Error('La tabla debe caber en el ancho de la hoja');
    let chars=0;
    for(const row of t.rows){
      if(!Number.isFinite(row.height)||row.height<.5||row.height>25||!Array.isArray(row.cells)||row.cells.length!==t.widths.length)throw Error('Medidas de fila inválidas');
      for(const c of row.cells){if(!Array.isArray(c.segments))throw Error('Celda inválida');for(const s of c.segments){if(typeof s.text!=='string')throw Error('Texto de celda inválido');chars+=s.text.length;}}
    }
    if(chars>MAX_CHARS)throw Error('La tabla supera 200000 caracteres');
  }
  function count(){return Object.values(live()).reduce((n,t)=>n+t.rows.reduce((a,r)=>a+r.cells.reduce((b,c)=>b+lineText(c.segments).length,0),0),0);}
  function get(id){if(!tables[id])throw Error('No se encontró la tabla del borrador');return clone(tables[id]);}
  function block(line){
    const id=line[0].tableId,t=tables[id],div=document.createElement('div');
    div.className='line tableBlock';div.dataset.tableId=id;div.contentEditable='false';
    const button=document.createElement('button');button.className='btn';button.type='button';
    button.textContent=t?`▦ Tabla · ${t.rows.length} filas × ${t.widths.length} columnas`:'▦ Tabla no disponible';
    button.onclick=()=>open(id);div.append(button);
    const hint=document.createElement('small');hint.textContent=t?`${t.mode==='compact'?'Ajustar al espacio · 60–50 %':'Estándar · 60 %'}${t.rows.some(r=>r.cells.some(c=>c.size>0))?' · Con tamaños fijos por celda':''} · Toca para editar`:'';div.append(hint);return div;
  }
  function show(message){el('tableMessage').textContent=message;}
  function readCell(node){
    const out=[];
    function walk(n,style){
      if(n.nodeType===3){out.push({text:n.nodeValue,...style});return;}
      if(n.nodeType!==1)return;
      if(n.tagName==='BR'){out.push({text:'\n',...style});return;}
      if(/^(DIV|P)$/.test(n.tagName)&&n!==node&&out.length&&!out.at(-1).text.endsWith('\n'))out.push({text:'\n',...style});
      for(const child of n.childNodes)walk(child,cleanStyle({...style,...n.dataset}));
    }
    walk(node,DEFAULT_STYLE);return mergeSegments(out);
  }
  function drawCell(node,segments){
    node.replaceChildren();
    for(const s of mergeSegments(segments)){const span=document.createElement('span');Object.assign(span.dataset,cleanStyle(s));span.style.color=rgba(s.color,s.opacity);span.textContent=s.text;node.append(span);}
  }
  function flush(){if(!working)return;el('tableGrid').querySelectorAll('.cellEditor').forEach(node=>{working.rows[+node.dataset.row].cells[+node.dataset.col].segments=readCell(node);});}
  function draw(){
    const grid=el('tableGrid');grid.replaceChildren();grid.style.width=`${50+40*working.widths.reduce((a,b)=>a+b,0)}px`;
    const cols=document.createElement('colgroup');
    for(const w of [1.25,...working.widths]){const col=document.createElement('col');col.style.width=`${w*40}px`;cols.append(col);}grid.append(cols);
    const head=document.createElement('thead'),tr=document.createElement('tr');head.append(tr);grid.append(head);
    const corner=document.createElement('th');corner.textContent='Fila';tr.append(corner);
    working.widths.forEach((w,i)=>{const th=document.createElement('th');th.textContent=`${i+1} · ${w} cuad.`;const grip=document.createElement('button');grip.className='tableGrip column';grip.dataset.col=i;grip.setAttribute('aria-label',`Ajustar ancho de columna ${i+1}`);th.append(grip);tr.append(th);});
    const body=document.createElement('tbody');grid.append(body);
    working.rows.forEach((row,r)=>{
      const tr=document.createElement('tr');tr.style.height=`${Math.max(50,row.height*40)}px`;body.append(tr);
      const th=document.createElement('th');th.textContent=r+1;const grip=document.createElement('button');grip.className='tableGrip row';grip.dataset.row=r;grip.setAttribute('aria-label',`Ajustar altura de fila ${r+1}`);th.append(grip);tr.append(th);
      row.cells.forEach((cell,c)=>{const td=document.createElement('td'),node=document.createElement('div');node.className='cellEditor';node.contentEditable='true';node.dataset.row=r;node.dataset.col=c;node.setAttribute('role','textbox');node.setAttribute('aria-multiline','true');node.setAttribute('aria-label',`Fila ${r+1}, columna ${c+1}`);drawCell(node,cell.segments);td.append(node);tr.append(td);td.style.textAlign=cell.align;td.style.verticalAlign=cell.valign==='middle'?'middle':cell.valign==='bottom'?'bottom':'top';});
    });
    sync();
  }
  function sync(){
    const c=currentCell();if(!c)return;
    if(!chosenCells().length)singleCell();
    const cells=chosenCells(),common=key=>cells.every(cell=>(cell[key]||0)===(cells[0][key]||0))?(cells[0][key]||0):'mixed';
    el('tableCellLabel').textContent=cells.length===1?`Celda ${selectedRow+1}, ${selectedCol+1}`:`${cells.length} celdas · activa ${selectedRow+1}, ${selectedCol+1}`;
    const size=common('size'),sizeSelect=el('tableCellSize');
    // Normalize numeric option values (0.60 and 0.6 are the same stored size).
    if(size!=='mixed'&&![...sizeSelect.options].some(o=>o.value===String(size))){const option=new Option(`Fijo · ${Math.round(size*10000)/100} %`,String(size));sizeSelect.add(option);}
    sizeSelect.querySelector('[value="0"]').textContent=working.mode==='compact'?'Según tabla · ajuste 60–50 %':'Según tabla · 60 %';
    for(const [id,value] of Object.entries({tableMode:working.mode,tableLeft:working.left,tableGap:working.gap,tableBorder:working.border,tableBorderColor:working.color,tableColWidth:working.widths[selectedCol],tableRowHeight:working.rows[selectedRow].height,tableAlign:common('align'),tableValign:common('valign'),tableCellSize:size}))el(id).value=value;
    el('tableRepeat').checked=working.repeat_header!==false;
    el('tableGrid').classList.toggle('selectingCells',selecting);
    el('tableGrid').querySelectorAll('td').forEach(td=>{const n=td.firstChild,selected=selectedCells.has(cellKey(+n.dataset.row,+n.dataset.col));td.classList.toggle('selectedCell',selected);td.setAttribute('aria-selected',String(selected));n.contentEditable=String(!selecting);n.tabIndex=0;});
    el('tableSelectCells').setAttribute('aria-pressed',String(selecting));el('tableSelectCells').classList.toggle('accent',selecting);
    el('tableSelectCells').textContent=selecting?'Terminar selección':'Seleccionar celdas';
    el('tableSelectionHint').textContent=selecting?'Toca para marcar o desmarcar. Fila y columna se agregan a la selección. Mayús + clic selecciona un rango; Toda la tabla marca todas las celdas.':'Toca una celda para escribir. Usa Seleccionar celdas para dar formato a varias.';
    const at=readLines().findIndex(l=>l[0]?.tableId===originalId);
    el('tableRemove').disabled=!originalId;el('tableMoveUp').disabled=!originalId||at<=0;el('tableMoveDown').disabled=!originalId||at>=readLines().length-1;
  }
  function selectGroup(kind){
    flush();selecting=true;cellSelection=null;
    if(kind==='all')selectedCells.clear();
    working.rows.forEach((row,r)=>row.cells.forEach((cell,c)=>{if(kind==='all'||(kind==='row'&&r===selectedRow)||(kind==='col'&&c===selectedCol))selectedCells.add(cellKey(r,c));}));
    sync();
  }
  function selectCell(r,c,range=false){
    const key=cellKey(r,c);cellSelection=null;
    if(range){const [ar,ac]=selectionAnchor;selectedCells.clear();for(let row=Math.min(ar,r);row<=Math.max(ar,r);row++)for(let col=Math.min(ac,c);col<=Math.max(ac,c);col++)selectedCells.add(cellKey(row,col));}
    else{if(selectedCells.has(key)&&selectedCells.size>1)selectedCells.delete(key);else selectedCells.add(key);selectionAnchor=[r,c];}
    if(selectedCells.has(key)){selectedRow=r;selectedCol=c;}else [selectedRow,selectedCol]=[...selectedCells][0].split(':').map(Number);
    sync();
  }
  function open(id=null){
    if(locked()||ime)return;captureSelection();checkpoint();
    if(!id&&Object.keys(live()).length>=50){toast('La nota admite hasta 50 tablas');return;}
    originalId=id;insertion=bookmark();
    working=id?get(id):{id:newId(),widths:[4,5,6],rows:Array.from({length:4},(_,r)=>({height:r?2:1,cells:Array.from({length:3},()=>({...blank(),align:r?'left':'center'}))})),left:1,gap:0,mode:'standard',border:2,color:'#000000',repeat_header:true};
    selecting=false;singleCell(0,0);activate();
  }
  function activate(){el('tableDialog').classList.remove('hidden');document.querySelector('.app').inert=true;draw();show('Estándar: 60 %. Ajustar al espacio reduce hasta 50 % si hace falta. La fila crece para conservar todo el texto.');el('tableDone').focus();}
  function close(){working=null;originalId=null;resume=null;drag=null;el('tableDialog').classList.add('hidden');document.querySelector('.app').inert=false;queueDraft();el('insertTable').focus();}
  function commit(){
    flush();try{validate(working);}catch(e){show(e.message);return false;}
    const others=Object.values(live()).filter(t=>t.id!==working.id),all=[...others,working];
    const cells=all.reduce((n,t)=>n+t.widths.length*t.rows.length,0);
    const chars=all.reduce((n,t)=>n+t.rows.reduce((a,r)=>a+r.cells.reduce((b,c)=>b+lineText(c.segments).length,0),0),0);
    if(cells>2000||chars+readLines().filter(l=>!isBlockLine(l)).reduce((n,l)=>n+lineText(l).length+1,0)+MathGraphEditor.count()>MAX_CHARS){show('La nota admite hasta 2000 celdas y 200000 caracteres');return false;}
    const lines=readLines(),id=working.id;
    tables[id]=clone(working);
    if(!originalId){
      const at=Math.min(insertion?.start.line??lines.length-1,lines.length-1);
      if(!lineText(lines[at])&&!isLine(lines[at]))lines.splice(at,1,[{text:'\uFFFC',tableId:id}],[]);
      else lines.splice(at+1,0,[{text:'\uFFFC',tableId:id}],[]);
    }
    working=null;originalId=null;renderLines(lines);checkpoint();changed();close();return true;
  }
  function modify(fn){flush();fn();cellSelection=null;draw();queueDraft();}
  function structure(kind){modify(()=>{
    if(kind==='addRow'){if(working.rows.length>=200)return show('Máximo 200 filas');working.rows.splice(selectedRow+1,0,{height:2,cells:working.widths.map(blank)});selectedRow++;}
    if(kind==='delRow'){if(working.rows.length===1)return show('Conserva al menos una fila');if(working.rows[selectedRow].cells.some(c=>lineText(c.segments))&&!confirm('¿Eliminar esta fila y su texto?'))return;working.rows.splice(selectedRow,1);selectedRow=Math.min(selectedRow,working.rows.length-1);}
    if(kind==='addCol'){if(working.widths.length>=12)return show('Máximo 12 columnas');if(16-working.left<working.widths.length+1)return show('Reduce la sangría para añadir otra columna');while(working.left+working.widths.reduce((a,b)=>a+b,0)+1>16){const i=working.widths.indexOf(Math.max(...working.widths));working.widths[i]-=.5;}working.widths.splice(selectedCol+1,0,1);working.rows.forEach(r=>r.cells.splice(selectedCol+1,0,blank()));selectedCol++;}
    if(kind==='delCol'){if(working.widths.length===1)return show('Conserva al menos una columna');if(working.rows.some(r=>lineText(r.cells[selectedCol].segments))&&!confirm('¿Eliminar esta columna y su texto?'))return;working.widths.splice(selectedCol,1);working.rows.forEach(r=>r.cells.splice(selectedCol,1));selectedCol=Math.min(selectedCol,working.widths.length-1);}
    singleCell();
  });}
  function capture(){
    if(!working||selecting||selectedCells.size>1)return;const sel=getSelection();if(!sel?.rangeCount)return;
    const range=sel.getRangeAt(0),node=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('.cellEditor');
    if(!node||!node.contains(range.endContainer))return;
    const start=range.cloneRange();start.selectNodeContents(node);start.setEnd(range.startContainer,range.startOffset);
    cellSelection={row:+node.dataset.row,col:+node.dataset.col,start:start.toString().length,end:start.toString().length+range.toString().length};
  }
  function ink(){
    capture();flush();const cell=currentCell(),s=cellSelection;
    const patch={color:el('tableInkColor').value.toUpperCase(),thickness:+el('tableInkWidth').value};
    if(!selecting&&selectedCells.size===1&&s&&s.row===selectedRow&&s.col===selectedCol&&s.end>s.start)cell.segments=mergeSegments([...sliceSegments(cell.segments,0,s.start),...sliceSegments(cell.segments,s.start,s.end).map(x=>({...x,...patch})),...sliceSegments(cell.segments,s.end)]);
    else chosenCells().forEach(c=>c.segments=c.segments.map(x=>({...x,...patch})));
    draw();queueDraft();show(`Color y grosor aplicados a ${selectedCells.size===1?'la selección de texto o celda':selectedCells.size+' celdas'}.`);
  }
  function insertCellText(text){
    if(text.length>MAX_CHARS)return show('El texto supera el límite de la nota');
    document.execCommand('insertText',false,text);flush();queueDraft();
  }
  function paste(event){
    const node=event.target.closest('.cellEditor');if(!node)return;event.preventDefault();if(selecting)return show('Termina la selección para escribir o pegar en una celda.');
    const text=event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n');
    if(!text.includes('\t'))return insertCellText(text);
    const rows=text.replace(/\n$/,'').split('\n').map(r=>r.split('\t'));
    if(text.length>MAX_CHARS||selectedRow+rows.length>200||rows.some(r=>selectedCol+r.length>working.widths.length)){show('La tabla pegada excede las columnas disponibles o el límite de filas; añade columnas antes de pegar.');return;}
    modify(()=>{while(working.rows.length<selectedRow+rows.length)working.rows.push({height:2,cells:working.widths.map(blank)});rows.forEach((r,i)=>r.forEach((text,j)=>{working.rows[selectedRow+i].cells[selectedCol+j].segments=[{text,...DEFAULT_STYLE}];}));});
    show('Celdas pegadas. Revisa el contenido antes de aplicar la tabla.');
  }
  function move(direction){
    const id=originalId;if(!id||!commit())return;checkpoint();const lines=readLines(),at=lines.findIndex(l=>l[0]?.tableId===id),to=at+direction;
    if(to>=0&&to<lines.length){[lines[at],lines[to]]=[lines[to],lines[at]];renderLines(lines);checkpoint();changed();}open(id);
  }
  function remove(){const id=originalId;if(!id||!confirm('¿Eliminar la tabla y su contenido de esta nota? Puedes deshacerlo.'))return;const lines=readLines().filter(l=>l[0]?.tableId!==id);delete tables[id];close();renderLines(lines.length?lines:[[]]);checkpoint();changed();}
  function mode(value){active=value;render();}
  function clearSelection(){selectedId=null;render();}
  function selectPreview(id){if(locked()||working||drag||!tables[id])return;selectedId=id;MathGraphEditor.clearSelection();render();}
  function copyObject(id){if(locked()||working||drag)return;elementClipboard={kind:'table',table:get(id)};MathGraphEditor.updateControls();toast('Tabla copiada. Coloca el cursor y pulsa el icono Pegar.');}
  function pasteObject(){
    if(elementClipboard?.kind!=='table'||locked()||working||drag||ime)return;
    captureSelection();const table=clone(elementClipboard.table),all=[...Object.values(live()),table];
    const cells=all.reduce((n,t)=>n+t.rows.length*t.widths.length,0),chars=table.rows.reduce((n,r)=>n+r.cells.reduce((m,c)=>m+lineText(c.segments).length,0),0);
    if(all.length>50||cells>2000||characterCount()+chars>MAX_CHARS)return toast('La nota admite hasta 50 tablas, 2000 celdas y 200000 caracteres.');
    const lines=readLines();if(lines.length>9998)return toast('La nota admite hasta 10000 párrafos.');
    checkpoint();table.id=newId();validate(table);const point=bookmark()?.start;let at=clamp(point?.line??lines.length-1,0,lines.length-1);
    if(!lineText(lines[at])&&!isBlockLine(lines[at]))lines.splice(at,1,[{text:'\uFFFC',tableId:table.id}],[]);
    else{at++;lines.splice(at,0,[{text:'\uFFFC',tableId:table.id}],[]);}
    tables[table.id]=table;selectedId=null;renderLines(lines);const caret={line:at+1,offset:0};restoreSelection({start:caret,end:{...caret}});checkpoint();changed();toast('Tabla pegada. Puedes moverla o editarla.');
  }
  function quickRemove(id){if(locked()||working||drag||!tables[id])return;checkpoint();const lines=readLines().filter(l=>l[0]?.tableId!==id);delete tables[id];selectedId=null;renderLines(lines.length?lines:[[]]);checkpoint();changed();render();toast('Tabla eliminada. Deshacer la recupera.');}
  function positionTools(){
    toolsFrame=null;
    const wrap=el('previewWrap').getBoundingClientRect(),shell=el('canvasShell').getBoundingClientRect();
    const left=Math.max(wrap.left,shell.left)+6,right=Math.min(wrap.right,shell.right)-6,top=Math.max(wrap.top,shell.top)+6,bottom=Math.min(wrap.bottom,shell.bottom)-6;
    el('tableOverlay').querySelectorAll('.tableTarget').forEach(box=>{
      const r=box.getBoundingClientRect(),bar=box.querySelector('.tableQuickActions'),resize=box.querySelector('.tableResize');
      const visible=r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom;
      bar.style.visibility=resize.style.visibility=visible?'visible':'hidden';if(!visible)return;
      const w=bar.offsetWidth,h=bar.offsetHeight;
      bar.style.left=`${clamp(r.left,left,Math.max(left,right-w))-r.left}px`;
      bar.style.top=`${clamp(r.top-h-4,top,Math.max(top,bottom-h))-r.top}px`;
      resize.style.left=`${clamp(r.right-44,left,Math.max(left,right-44))-r.left}px`;
      resize.style.top=`${clamp(r.bottom-44,top,Math.max(top,bottom-44))-r.top}px`;
    });
  }
  function scheduleTools(){if(toolsFrame===null)toolsFrame=requestAnimationFrame(positionTools);}
  function render(){
    const layer=el('tableOverlay');if(!layer)return;if(drag){scheduleTools();return;}layer.replaceChildren();
    if(!composition||previewRevision!==revision||locked()||working)return;
    if(!(composition.table_pages?.[currentPage]||[]).some(t=>t.id===selectedId))selectedId=null;
    for(const t of composition.table_pages?.[currentPage]||[]){
      if(!tables[t.id])continue;
      const box=document.createElement('div'),k=.675*zoom;box.className='tableHit'+(selectedId===t.id?' tableTarget':'');box.dataset.id=t.id;Object.assign(box.style,{left:`${t.x*k}px`,top:`${t.y*k}px`,width:`${t.width*k}px`,height:`${t.height*k}px`});
      const choose=document.createElement('button');choose.type='button';choose.className='tableSelect';choose.setAttribute('aria-label','Seleccionar tabla');choose.setAttribute('aria-pressed',String(selectedId===t.id));choose.onclick=e=>{e.stopPropagation();selectPreview(t.id);};box.append(choose);layer.append(box);
      if(selectedId!==t.id)continue;
      const bar=document.createElement('div');bar.className='tableQuickActions';box.append(bar);
      for(const [action,label,help] of [['tableMove','↔','Mover tabla'],['tableOpen','✎','Editar tabla'],['tableCopy','⧉','Copiar tabla'],['tableDelete','×','Eliminar tabla'],['tableResize','↘','Redimensionar tabla']]){const b=document.createElement('button');b.type='button';b.className=action;b.textContent=label;b.setAttribute('aria-label',help);b.title=help;(action==='tableResize'?box:bar).append(b);b.onclick=e=>{e.stopPropagation();if(action==='tableCopy')copyObject(t.id);if(action==='tableDelete')quickRemove(t.id);};}
      const edit=box.querySelector('.tableOpen');let tap=null;
      edit.onclick=()=>{if(!working)open(t.id);};
      // Touch browsers can omit the compatibility click immediately after a drag.
      // Recognize a stationary release directly, while retaining keyboard clicks.
      edit.onpointerdown=e=>{if(e.pointerType!=='mouse')tap={id:e.pointerId,x:e.clientX,y:e.clientY};};
      edit.onpointercancel=()=>tap=null;
      edit.onpointerup=e=>{const start=tap;tap=null;if(start?.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<12){e.preventDefault();e.stopPropagation();if(!working)open(t.id);}};
    }
    positionTools();
  }
  function previewStart(e){
    if(!e.target.matches('.tableMove,.tableResize')||locked()||working||drag)return;
    const id=e.target.closest('.tableTarget').dataset.id;if(!tables[id])return;e.preventDefault();checkpoint();
    drag={kind:e.target.className,id,pointer:e.pointerId,x:e.clientX,y:e.clientY,before:clone(tables[id]),node:e.target.closest('.tableTarget')};e.target.setPointerCapture(e.pointerId);
  }
  function dragMove(e){
    if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();
    if(drag.kind==='column'||drag.kind==='row'){
      if(drag.kind==='column'){const other=working.widths.reduce((a,b,i)=>a+(i===drag.index?0:b),0);working.widths[drag.index]=clamp(snap(drag.value+(e.clientX-drag.x)/40),1,16-working.left-other);el('tableGrid').querySelectorAll('col')[drag.index+1].style.width=`${working.widths[drag.index]*40}px`;el('tableGrid').style.width=`${50+40*working.widths.reduce((a,b)=>a+b,0)}px`;}
      else{working.rows[drag.index].height=clamp(snap(drag.value+(e.clientY-drag.y)/40),.5,25);el('tableGrid').querySelectorAll('tbody tr')[drag.index].style.height=`${Math.max(50,working.rows[drag.index].height*40)}px`;}
      return;
    }
    const t=tables[drag.id],old=drag.before,k=.675*zoom* (40/.675),dx=(e.clientX-drag.x)/k,dy=(e.clientY-drag.y)/k;
    if(drag.kind==='tableMove'){
      t.left=clamp(snap(old.left+dx),.5,16-old.widths.reduce((a,b)=>a+b,0));t.gap=clamp(snap(old.gap+dy),0,10);
      drag.node.style.transform=`translate(${(t.left-old.left)*k}px,${(t.gap-old.gap)*k}px)`;
    }else{
      const total=old.widths.reduce((a,b)=>a+b,0),factor=clamp((total+dx)/total,.3,(16-old.left)/total);
      const widths=old.widths.map(w=>Math.max(1,snap(w*factor)));
      if(widths.reduce((a,b)=>a+b,0)+old.left<=16)t.widths=widths;
      t.rows=old.rows.map(r=>({...r,height:clamp(snap(r.height+dy/old.rows.length),.5,25)}));
      drag.node.style.width=`${t.widths.reduce((a,b)=>a+b,0)*k}px`;
    }
  }
  function dragEnd(e,cancel=false){
    if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;
    if(d.kind==='row'||d.kind==='column'){if(cancel){if(d.kind==='row')working.rows[d.index].height=d.value;else working.widths[d.index]=d.value;}draw();queueDraft();return;}
    if(cancel)tables[d.id]=d.before;else{renderLines(readLines());checkpoint();changed();}render();
  }
  function init(){
    document.addEventListener('click',e=>{if(selectedId&&!drag&&!e.target.closest('#tableOverlay,#tableDialog,#pasteMath'))clearSelection();});
    el('insertTable').onclick=()=>open();el('tableDone').onclick=commit;el('tableCancel').onclick=close;el('tableRemove').onclick=remove;
    el('tableMoveUp').onclick=()=>move(-1);el('tableMoveDown').onclick=()=>move(1);
    for(const [id,kind] of [['tableAddRow','addRow'],['tableDelRow','delRow'],['tableAddCol','addCol'],['tableDelCol','delCol']])el(id).onclick=()=>structure(kind);
    el('tableSelectCells').onclick=()=>{flush();selecting=!selecting;if(!selecting)singleCell();cellSelection=null;sync();};
    for(const [id,kind] of [['tableSelectRow','row'],['tableSelectCol','col'],['tableSelectAll','all']])el(id).onclick=()=>selectGroup(kind);
    const grid=el('tableGrid');grid.addEventListener('focusin',e=>{const n=e.target.closest('.cellEditor');if(n&&!selecting){singleCell(+n.dataset.row,+n.dataset.col);sync();}});
    grid.addEventListener('pointerdown',e=>{if(e.target.closest('.cellEditor')&&(e.shiftKey||e.ctrlKey||e.metaKey)){flush();selecting=true;cellSelection=null;sync();}});
    grid.addEventListener('click',e=>{const n=e.target.closest('.cellEditor');if(n&&selecting)selectCell(+n.dataset.row,+n.dataset.col,e.shiftKey);});
    grid.addEventListener('input',()=>{flush();queueDraft();});grid.addEventListener('paste',paste);grid.addEventListener('drop',e=>e.preventDefault());
    grid.addEventListener('beforeinput',e=>{if(selecting){e.preventDefault();return;}if(['insertParagraph','insertLineBreak'].includes(e.inputType)&&!e.isComposing){e.preventDefault();insertCellText('\n');}});
    grid.addEventListener('keydown',e=>{if(e.isComposing)return;if(selecting){const n=e.target.closest('.cellEditor');if(n&&[' ','Enter'].includes(e.key)){e.preventDefault();selectCell(+n.dataset.row,+n.dataset.col,e.shiftKey);}return;}if(e.key==='Enter'){e.preventDefault();insertCellText('\n');}if(e.key==='Tab'){e.preventDefault();const n=el('tableGrid').querySelectorAll('.cellEditor'),index=selectedRow*working.widths.length+selectedCol+(e.shiftKey?-1:1);n[clamp(index,0,n.length-1)].focus();}});
    document.addEventListener('selectionchange',capture);el('tableApplyInk').onclick=ink;
    for(const [id,key] of [['tableAlign','align'],['tableValign','valign'],['tableCellSize','size']])el(id).onchange=()=>{const value=el(id).value;if(value==='mixed')return;modify(()=>chosenCells().forEach(c=>c[key]=key==='size'?Number(value):value));show(`Formato aplicado a ${selectedCells.size} ${selectedCells.size===1?'celda':'celdas'}.`);};
    for(const [id,fn] of Object.entries({tableMode:()=>working.mode=el('tableMode').value,tableLeft:()=>working.left=clamp(snap(+el('tableLeft').value),.5,16-working.widths.reduce((a,b)=>a+b,0)),tableGap:()=>working.gap=clamp(snap(+el('tableGap').value),0,10),tableBorder:()=>working.border=clamp(Math.round(+el('tableBorder').value),1,10),tableBorderColor:()=>working.color=el('tableBorderColor').value,tableRepeat:()=>working.repeat_header=el('tableRepeat').checked,tableRowHeight:()=>working.rows[selectedRow].height=clamp(snap(+el('tableRowHeight').value),.5,25),tableColWidth:()=>{const others=working.widths.reduce((n,w,i)=>n+(i===selectedCol?0:w),0);working.widths[selectedCol]=clamp(snap(+el('tableColWidth').value),1,16-working.left-others);}}))el(id).onchange=()=>modify(fn);
    grid.addEventListener('pointerdown',e=>{if(!e.target.classList.contains('tableGrip')||drag)return;e.preventDefault();flush();const column=e.target.classList.contains('column'),index=+(column?e.target.dataset.col:e.target.dataset.row);drag={kind:column?'column':'row',pointer:e.pointerId,index,x:e.clientX,y:e.clientY,value:column?working.widths[index]:working.rows[index].height};e.target.setPointerCapture(e.pointerId);});
    el('tableOverlay').addEventListener('pointerdown',previewStart);document.addEventListener('pointermove',dragMove,{passive:false});document.addEventListener('pointerup',e=>dragEnd(e));document.addEventListener('pointercancel',e=>dragEnd(e,true));
    el('previewWrap').addEventListener('scroll',scheduleTools,{passive:true});
    el('tableDialog').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'&&!e.target.closest('.cellEditor')){const focus=[...el('tableDialog').querySelectorAll('button,input,select,[contenteditable=true]')].filter(n=>!n.disabled&&n.getClientRects().length);const i=focus.indexOf(document.activeElement);if((e.shiftKey&&i===0)||(!e.shiftKey&&i===focus.length-1)){e.preventDefault();focus[e.shiftKey?focus.length-1:0].focus();}}});
    if(resume?.table){try{validate(resume.table);working=resume.table;originalId=resume.originalId;insertion=resume.insertion;activate();show('Se recuperó la tabla que estabas editando. Aplica los cambios o cancela para conservar la versión anterior.');}catch(e){resume=null;}}
  }
  return {init,open,get,block,isLine,state,restore,count,mode,render,clearSelection,selectPreview,pasteObject,isOpen:()=>!!working};
})();
