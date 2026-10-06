'use strict';
const MathGraphEditor=(()=>{
  const el=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
  const snap=n=>Math.round(n*2)/2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const text=(value='')=>({type:'text',text:value}),row=(value='')=>({type:'row',items:[text(value)]});
  const slots={fraction:['num','den'],root:['index','body'],scripts:['base','sup','sub'],group:['body'],operator:['lower','upper','body']};
  let objects={},working=null,originalId=null,insertion=null,resume=null,active=false,drag=null,category='basic',field=null,fields=[],traceIndex=0,graphDrag=null;
  let formulaHistory=[],formulaIndex=-1,toolsFrame=null,selectedPoint=-1,bulkDirty=false,graphHistory=[],graphIndex=-1;
  let graphZoom=1,graphView={x:0,y:0},graphPointers=new Map(),graphGesture=null;
  const isLine=line=>Boolean(line?.[0]?.objectId);
  const locked=()=>exporting||CalibrationUI.isBusy()||ImageEditor.isBusy()||TableEditor.isOpen()||NotebookUI.isBusy();
  const live=()=>{const ids=new Set(readLines().filter(isLine).map(l=>l[0].objectId));return Object.fromEntries(Object.entries(objects).filter(([id])=>ids.has(id)));};
  function state(){if(working?.kind==='graph'&&el('graphPoints')&&!graphDrag){readTrace(false);if(selectedPoint>=0)readPoint(false);}const pending=working?clone(working):null;if(graphDrag&&pending)pending.series[graphDrag.trace].points[graphDrag.point]=clone(graphDrag.before);return {mathObjects:clone(live()),pendingMath:working?{object:pending,originalId,insertion,traceIndex,selectedPoint,pointsDraft:working.kind==='graph'?el('graphPoints')?.value:null,pointDraft:working.kind==='graph'?['graphPointX','graphPointY','graphPointLabel'].map(id=>el(id).value):null}:resume};}
  function validate(obj){
    if(!obj||!['formula','graph'].includes(obj.kind)||!/^[a-zA-Z0-9_-]{1,80}$/.test(obj.id||''))throw Error('Elemento matemático inválido');
    for(const key of ['left','width','height','gap','size','thickness'])if(!Number.isFinite(obj[key]))throw Error('Medida matemática inválida');
    if(obj.left<.5||obj.width<2||obj.left+obj.width>16.001||obj.height<.5||obj.height>24.5||obj.gap<0||obj.gap>10||obj.size<.4||obj.size>1.5)throw Error('El elemento debe caber en la hoja; usa medidas de medio cuadro');
    if(obj.kind==='formula'){
      let count=0,chars=0;
      function walk(n,depth=0){if(!n||++count>500||depth>12)throw Error('Fórmula demasiado compleja');if(n.type==='text'){if(typeof n.text!=='string'||n.text.length>2048||n.text.includes('\n'))throw Error('Campo matemático inválido');chars+=n.text.length;}else if(n.type==='row'){if(!Array.isArray(n.items))throw Error('Secuencia inválida');n.items.forEach(c=>walk(c,depth+1));}else if(n.type==='matrix'){if(!Array.isArray(n.cells)||!n.cells.length||n.cells.length>6||!n.cells[0]?.length||n.cells[0].length>6)throw Error('Matriz inválida');n.cells.forEach(r=>{if(r.length!==n.cells[0].length)throw Error('Matriz irregular');r.forEach(c=>walk(c,depth+1));});}else if(slots[n.type])slots[n.type].forEach(s=>walk(n[s],depth+1));else throw Error('Molde desconocido');}
      walk(obj.expression);if(chars>8192)throw Error('La fórmula admite 8192 caracteres');
    }else{
      for(const a of ['x','y']){const lo=obj[a+'min'],hi=obj[a+'max'],step=obj[a+'step'];if(![lo,hi,step].every(Number.isFinite)||hi<=lo||step<=0||(hi-lo)/step>40)throw Error('Cada eje necesita mínimo < máximo y hasta 40 divisiones');}
      if(obj.width<4||obj.height<4)throw Error('La gráfica necesita al menos 4 × 4 cuadros');
      if(!Array.isArray(obj.series)||obj.series.length>8)throw Error('Máximo 8 trazos por gráfica');
      for(const t of obj.series){if(!['points','line','curve'].includes(t.type)||!Array.isArray(t.points)||t.points.length>100)throw Error('Trazo inválido');for(const key of ['color','pointColor','guideColor','labelColor'])if(t[key]&&!/^#[\da-f]{6}$/i.test(t[key]))throw Error('Color de trazo inválido');for(const [key,max] of [['width',10],['pointSize',6],['guideWidth',4]])if(t[key]!==undefined&&(!Number.isFinite(t[key])||t[key]<.5||t[key]>max))throw Error('Grosor de trazo inválido');for(const p of t.points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<obj.xmin||p.x>obj.xmax||p.y<obj.ymin||p.y>obj.ymax)throw Error('Los puntos deben quedar dentro de los límites de los ejes');if(typeof(p.label||'')!=='string'||(p.label||'').length>60)throw Error('La etiqueta admite 60 caracteres');}if(t.type==='curve'&&t.points.some((p,i)=>i&&p.x<=t.points[i-1].x))throw Error('Una curva necesita puntos con distintos valores de X');}
    }
    if(!/^#[\da-f]{6}$/i.test(obj.color||''))throw Error('Color inválido');
  }
  function restore(data){const candidate=data.mathObjects||{};if(typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).length>100)throw Error('Borrador matemático inválido');for(const [id,obj] of Object.entries(candidate)){validate(obj);if(id!==obj.id)throw Error('Identificador inválido');}objects=clone(candidate);resume=data.pendingMath||null;}
  function get(id){if(!objects[id])throw Error('El elemento matemático no está disponible');return clone(objects[id]);}
  function content(n){if(n.type==='text')return n.text;if(n.type==='row')return n.items.map(content).join('');if(n.type==='matrix')return n.cells.flat().map(content).join('');return slots[n.type].map(s=>content(n[s])).join('');}
  function objectCount(obj){return obj.kind==='formula'?content(obj.expression).length:[obj.title,obj.xlabel,obj.ylabel,...obj.series.flatMap(s=>s.points.map(p=>p.label||''))].join('').length;}
  const count=()=>Object.values(live()).reduce((n,o)=>n+objectCount(o),0);
  function block(line){const id=line[0].objectId,o=objects[id],div=document.createElement('div');div.className='line objectBlock';div.dataset.objectId=id;div.contentEditable='false';const b=document.createElement('button');b.className='btn';b.type='button';b.textContent=o?`${o.kind==='formula'?'ƒ Fórmula':'⌁ Gráfica'} · ${o.width} × ${o.height} cuadros`:'Elemento no disponible';b.onclick=()=>open(o?.kind||'formula',id);div.append(b);const hint=document.createElement('small');hint.textContent=o?`${o.kind==='formula'?'Moldes con tu escritura':'Ejes y trazos editables'} · ${Math.round(o.size*100)} %${o.beside?' · Al lado del anterior':''} · Toca para editar`:'';div.append(hint);return div;}
  const formulaHint='Toca una casilla y completa el molde. ← y → recorren cada carácter y salen del molde hacia el contenido siguiente; ⌫ borra texto o un molde vacío. Quitar molde elimina el contenedor activo y permite deshacer.';
  function hideFormulaHint(){if(el('mathMessage').textContent===formulaHint)message('');}
  function message(value){el('mathMessage').textContent=value;}
  function newTrace(color='#000000'){return {type:'line',color,pointColor:color,guideColor:'#81909f',labelColor:color,width:2,guideWidth:1,pointSize:2.5,markers:true,guides:false,dashed:false,points:[]};}
  function make(kind){const id='math_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),base={id,kind,left:1,width:kind==='formula'?15:7,height:kind==='formula'?2:8,gap:0,size:kind==='formula'?1:.6,color:'#000000',thickness:2,align:'left',beside:false};return kind==='formula'?{...base,fit:true,expression:row()}:{...base,xmin:0,xmax:10,xstep:2,ymin:0,ymax:10,ystep:2,xlabel:'x',ylabel:'y',title:'',ticks:true,grid:false,gridFit:true,arrows:true,series:[newTrace()]};}
  function open(kind='formula',id=null){if(locked()||ime)return;captureSelection();checkpoint();if(!id&&Object.keys(live()).length>=100){toast('Máximo 100 fórmulas y gráficas');return;}working=id?get(id):make(kind);originalId=id;insertion=bookmark();activate();}
  function activate(){el('mathDialog').classList.remove('hidden');el('mathDialog').classList.toggle('graphMode',working.kind==='graph');document.querySelector('.app').inert=true;el('mathTitle').textContent=working.kind==='formula'?'Escribir fórmula':'Editar gráfica';el('formulaEditor').classList.toggle('hidden',working.kind!=='formula');el('graphEditor').classList.toggle('hidden',working.kind!=='graph');el('mathFitLabel').classList.toggle('hidden',working.kind!=='formula');el('mathColor').setAttribute('aria-label',working.kind==='graph'?'Color de ejes':'Color del elemento');syncTools();formulaHistory=[];formulaIndex=-1;graphHistory=[];graphIndex=-1;field=null;traceIndex=0;selectedPoint=-1;bulkDirty=false;graphZoom=1;graphView={x:0,y:0};graphPointers.clear();graphGesture=null;if(working.kind==='formula'){formulaCheckpoint();drawFormula();drawKeys();message(formulaHint);}else{graphTools();graphCheckpoint();drawGraph();message('Toca un punto para editarlo o borrarlo. Usa X, Y y Etiqueta para agregarlo sin separadores.');}el('mathDone').focus();}
  function close(){working=null;originalId=null;resume=null;field=null;drag=null;graphDrag=null;el('mathDialog').classList.add('hidden');document.querySelector('.app').inert=false;queueDraft();el('insertFormula').focus();}
  function syncTools(){for(const [id,key] of [['mathLeft','left'],['mathWidth','width'],['mathHeight','height'],['mathGap','gap'],['mathSize','size'],['mathColor','color'],['mathThickness','thickness'],['mathAlign','align']])el(id).value=key==='size'?working[key]*100:working[key];el('mathBeside').checked=working.beside;el('mathFit').checked=working.fit!==false;el('mathRemove').disabled=!originalId;}
  function commit(){
    if(working.kind==='graph'&&(!readTrace()||(selectedPoint>=0&&!readPoint())))return false;
    if(working.kind==='graph'&&selectedPoint<0&&['graphPointX','graphPointY','graphPointLabel'].some(id=>el(id).value.trim())&&!savePoint())return false;
    if(working.kind==='formula'){const missing=missingField(working.expression);if(missing){drawFormula();const f=fields.find(f=>f.node===firstText(missing));f?.input.focus();message('Completa esta casilla o usa Quitar molde. Los moldes vacíos no se exportan.');return false;}}
    try{validate(working);if(working.kind==='formula'&&!content(working.expression).trim())throw Error('Escribe los datos de la fórmula antes de aplicarla');if(characterCount()- (originalId?objectCount(objects[originalId]):0)+objectCount(working)>MAX_CHARS)throw Error('La nota admite 200000 caracteres');}catch(e){message(e.message);return false;}
    const lines=readLines(),id=working.id;
    let at=originalId?lines.findIndex(l=>l[0]?.objectId===id):-1;
    if(!originalId){at=Math.min(insertion?.start.line??lines.length-1,lines.length-1);if(!lineText(lines[at])&&!isBlockLine(lines[at]))lines.splice(at,1,[{text:'\uFFFC',objectId:id}],[]);else{at++;lines.splice(at,0,[{text:'\uFFFC',objectId:id}],[]);}}
    if(working.beside){try{arrangeBeside(lines,at);}catch(e){message(e.message);return false;}}
    objects[id]=clone(working);working=null;renderLines(lines);checkpoint();changed();close();return true;
  }
  function arrangeBeside(lines,at){
    let prior=at-1;while(prior>=0&&!lineText(lines[prior])&&!isBlockLine(lines[prior]))prior--;
    if(prior<0||!isLine(lines[prior]))throw Error('Para colocar elementos lado a lado, inserta primero otra fórmula o gráfica justo antes.');
    const peers=[clone(objects[lines[prior][0].objectId])];let index=prior;
    while(peers[0].beside&&index>0&&isLine(lines[index-1]))peers.unshift(clone(objects[lines[--index][0].objectId]));
    const all=[...peers,clone(working)],minWidth=o=>o.kind==='graph'?4:2;
    const overlaps=peers.some(o=>Math.max(o.left,working.left)<Math.min(o.left+o.width,working.left+working.width)-.001);
    if(overlaps){
      const right=Math.max(...peers.map(o=>o.left+o.width)),left=right+.5,available=16-left;
      if(available>=minWidth(working)){
        all.at(-1).left=left;all.at(-1).width=Math.min(working.width,available);
      }else{
        // A full-width formula must make room for a following graph, and vice versa.
        // Reflow the whole adjacent row in half squares; commit it as one undo step.
        const start=Math.min(...peers.map(o=>o.left)),budget=16-start-.5*(all.length-1);
        const minimum=all.reduce((n,o)=>n+minWidth(o),0);
        if(budget<minimum)throw Error('No caben más elementos en esta fila. Desmarca Al lado del anterior para usar otra fila.');
        const widths=all.map(minWidth);let spare=Math.round((budget-minimum)*2);
        while(spare>0)for(let i=0;i<widths.length&&spare>0;i++,spare--)widths[i]+=.5;
        let x=start;all.forEach((o,i)=>{o.left=x;o.width=widths[i];x+=o.width+.5;});
      }
    }
    all.forEach(validate);
    all.slice(0,-1).forEach(o=>objects[o.id]=o);Object.assign(working,all.at(-1));
    if(at-prior>1)lines.splice(prior+1,at-prior-1);
  }
  function remove(){if(!originalId||!confirm('¿Eliminar este elemento? Puedes deshacerlo.'))return;const id=originalId,lines=readLines().filter(l=>l[0]?.objectId!==id);delete objects[id];close();renderLines(lines.length?lines:[[]]);checkpoint();changed();}
  function move(direction){const id=originalId;if(!id||!commit())return;const lines=readLines(),at=lines.findIndex(l=>l[0]?.objectId===id),to=at+direction;if(to>=0&&to<lines.length){[lines[at],lines[to]]=[lines[to],lines[at]];objects[id].beside=false;renderLines(lines);checkpoint();changed();}open(objects[id].kind,id);}
  function formulaCheckpoint(){const value=JSON.stringify(working.expression);if(formulaHistory[formulaIndex]!==value){if(formulaIndex>=0&&content(working.expression)!==content(JSON.parse(formulaHistory[formulaIndex])))hideFormulaHint();formulaHistory=formulaHistory.slice(0,formulaIndex+1);formulaHistory.push(value);if(formulaHistory.length>40)formulaHistory.shift();formulaIndex=formulaHistory.length-1;}el('mathUndo').disabled=formulaIndex<=0;el('mathRedo').disabled=formulaIndex>=formulaHistory.length-1;}
  function formulaUndo(d){formulaCheckpoint();const next=formulaIndex+d;if(next<0||next>=formulaHistory.length)return;formulaIndex=next;working.expression=JSON.parse(formulaHistory[next]);field=null;drawFormula();queueDraft();}
  function firstText(n){if(n.type==='text')return n;if(n.type==='row')return firstText(n.items[0]);if(n.type==='matrix')return firstText(n.cells[0][0]);return firstText(n[n.type==='root'?'body':n.type==='scripts'?'base':slots[n.type][0]]);}
  function missingField(n){
    if(n.type==='text')return null;
    if(n.type==='row'){for(const c of n.items){const m=missingField(c);if(m)return m;}return null;}
    const required=n.type==='fraction'?['num','den']:n.type==='root'?['body']:n.type==='scripts'?['base']:n.type==='group'?['body']:n.type==='operator'?['body']:[];
    if(n.type==='matrix'){for(const r of n.cells)for(const c of r){if(!content(c).trim())return c;const m=missingField(c);if(m)return m;}return null;}
    for(const key of required)if(!content(n[key]).trim())return n[key];
    for(const key of slots[n.type]){const m=missingField(n[key]);if(m)return m;}
    return null;
  }
  function scriptMode(n){return n.scriptMode||((content(n.sup)?'sup':'')+(content(n.sub)?'sub':'')||'sup');}
  function compactFormula(target=null){
    function clean(n){
      if(n.type==='row'){
        if(!n.functionName&&n.items.length===2&&['sin','cos','tan','log','ln','exp'].includes(n.items[0]?.text)&&n.items[1]?.type==='group')n.functionName=n.items[0].text;
        n.items.forEach(clean);const merged=[];
        const items=n.items.flatMap(c=>c.type==='row'&&!c.functionName?c.items:[c]);
        for(const c of items){const last=merged.at(-1);if(c.type==='text'&&last?.type==='text'&&c.color===last.color){if(c===target)target=last;last.text+=c.text;}else merged.push(c);}
        n.items=merged.length?merged:[text()];
        if(n.items[0].type!=='text')n.items.unshift(text());
        if(n.items.at(-1).type!=='text')n.items.push(text());
      }else if(n.type==='matrix')n.cells.flat().forEach(clean);
      else if(slots[n.type])slots[n.type].forEach(k=>clean(n[k]));
    }
    clean(working.expression);return target;
  }
  function drawFormula(target=null,caret=0){
    target=compactFormula(target);fields=[];const stage=el('formulaStage');stage.replaceChildren();
    const span=cls=>{const n=document.createElement('span');n.className=cls;return n;};
    function render(n,path=[],label='Expresión',caretOnly=false){
      if(n.type==='text'){
        const input=document.createElement('input');input.type='text';input.className='mathSlot'+(caretOnly&&!n.text?' mathCaret':'');input.maxLength=2048;input.value=n.text;input.placeholder=caretOnly?'':'□';input.setAttribute('aria-label',label);input.dataset.path=JSON.stringify(path);
        const size=()=>{input.classList.toggle('mathCaret',caretOnly&&!n.text);input.style.width=(Math.max(caretOnly?.12:1,n.text.length)*.62+.18)+'em';};
        size();input.style.color=n.color||working.color;const item={input,node:n,path,start:0,end:0};fields.push(item);
        const capture=()=>{if(document.activeElement!==input)return;item.start=input.selectionStart;item.end=input.selectionEnd;field=item;stage.querySelectorAll('.mathTemplate').forEach(t=>t.classList.remove('mathActiveTemplate'));input.closest('.mathTemplate')?.classList.add('mathActiveTemplate');};
        for(const event of ['focus','click','select','keyup'])input.addEventListener(event,capture);
        input.addEventListener('beforeinput',e=>{formulaCheckpoint();if(e.inputType==='deleteContentBackward'||e.inputType==='deleteContentForward'){e.preventDefault();capture();eraseFormula(e.inputType==='deleteContentForward');}});
        input.oninput=()=>{n.text=input.value;hideFormulaHint();size();capture();queueDraft();};
        input.onkeydown=e=>{if(e.isComposing)return;capture();if(e.key==='Tab'||e.key==='Enter'){e.preventDefault();navigate(e.shiftKey?-1:1,true);}else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();eraseFormula(e.key==='Delete');}else if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();formulaUndo(e.key.toLowerCase()==='y'||e.shiftKey?1:-1);}else if(['ArrowLeft','ArrowRight'].includes(e.key)&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();navigate(e.key==='ArrowLeft'?-1:1);}};
        return input;
      }
      const sub=(key,context)=>render(n[key],[...path,key],context);
      if(n.type==='row'){const out=span('mathRow');n.items.forEach((c,i)=>out.append(render(c,[...path,'items',i],label,n.items.length>1)));if(n.functionName){out.classList.add('mathTemplate');out.dataset.path=JSON.stringify(path);}return out;}
      let out;
      if(n.type==='fraction'){out=span('mathFraction');out.append(sub('num','Numerador'),sub('den','Denominador'));}
      else if(n.type==='root'){out=span('mathRoot');if(n.showIndex||content(n.index)){const index=span('rootIndex');index.append(sub('index','Índice de raíz'));out.append(index);}const sign=span('rootSign'),body=span('rootBody');sign.textContent='√';body.append(sub('body','Interior de raíz'));out.append(sign,body);}
      else if(n.type==='scripts'){out=span('mathScripts');const base=sub('base','Base');const stack=span('mathScriptStack'),mode=scriptMode(n);stack.dataset.mode=mode;const sup=span('mathSup'),subscript=span('mathSub');if(mode.includes('sup')||content(n.sup))sup.append(sub('sup','Exponente'));if(mode.includes('sub')||content(n.sub))subscript.append(sub('sub','Subíndice'));stack.append(sup,subscript);out.append(base,stack);}
      else if(n.type==='operator'){out=span('mathOperator');const stack=span('mathOpStack'),sign=span('mathOpSign');sign.textContent=n.symbol;if(n.symbol!=='lim'||content(n.upper))stack.append(sub('upper','Límite superior'));stack.append(sign,sub('lower','Límite inferior'));out.append(stack,sub('body','Contenido del operador'));}
      else{out=span('mathGroup');const left=span('mathBracket'),right=span('mathBracket');left.textContent=n.bracket||'(';right.textContent=left.textContent==='['?']':left.textContent==='|'?'|':')';out.append(left);if(n.type==='matrix'){const matrix=span('mathMatrix');matrix.style.gridTemplateColumns='repeat('+n.cells[0].length+',auto)';n.cells.forEach((r,i)=>r.forEach((c,j)=>matrix.append(render(c,[...path,'cells',i,j],'Matriz fila '+(i+1)+', columna '+(j+1)))));out.append(matrix);}else out.append(sub('body','Interior de grupo'));out.append(right);}
      out.classList.add('mathTemplate');out.dataset.path=JSON.stringify(path);return out;
    }
    stage.append(render(working.expression));
    const choice=fields.find(f=>f.node===target);if(choice){choice.input.focus();choice.input.setSelectionRange(caret,caret);choice.start=choice.end=caret;field=choice;}else if(field){field=fields.find(f=>JSON.stringify(f.path)===JSON.stringify(field.path))||fields[0];}else field=fields[0];
    el('mathUndo').disabled=formulaIndex<=0;el('mathRedo').disabled=formulaIndex>=formulaHistory.length-1;
  }
  function focusField(next,at){if(!next)return;next.input.focus();next.input.setSelectionRange(at,at);next.start=next.end=at;field=next;next.input.scrollIntoView({block:'nearest',inline:'nearest'});}
  function navigate(delta,byField=false){
    if(!fields.length)return;field=field||fields[0];
    const a=field.start||0,b=field.end??a,value=field.node.text;
    if(!byField){
      if(a!==b){focusField(field,delta<0?a:b);return;}
      if(delta>0&&b<value.length){focusField(field,b+[...value.slice(b)][0].length);return;}
      if(delta<0&&a>0){focusField(field,a-[...value.slice(0,a)].at(-1).length);return;}
    }
    let i=fields.indexOf(field)+delta;
    // An empty continuation at the edge of a script base is the same visual
    // position as the adjacent base field. Keep meaningful gaps between molds.
    while(i>=0&&i<fields.length){
      const next=fields[i],near=fields[i+delta];
      if(!next.node.text&&next.input.classList.contains('mathCaret')&&near){
        const nextRect=next.input.getBoundingClientRect(),r=near.input.getBoundingClientRect();
        if(Math.abs(nextRect.top-r.top)<3&&Math.abs((delta>0?nextRect.right:nextRect.left)-(delta>0?r.left:r.right))<10){i+=delta;continue;}
      }
      focusField(next,delta<0?next.node.text.length:0);return;
    }
  }
  function ancestor(path){let node=working.expression;for(const key of path)node=node[key];return node;}
  function templatePath(path=field?.path||[]){for(let length=path.length-1;length>=0;length--){const p=path.slice(0,length),n=ancestor(p);if(n&&typeof n==='object'&&!Array.isArray(n)&&n.type&&(!['row','text'].includes(n.type)||n.functionName)){if(n.type==='group'&&p.length>=2&&ancestor(p.slice(0,-2))?.functionName)return p.slice(0,-2);return p;}}return null;}
  function replaceTemplate(path,replacement=[]){
    const parent=ancestor(path.slice(0,-1)),key=path.at(-1),before=Array.isArray(parent)?parent[key-1]:null;
    if(Array.isArray(parent))parent.splice(key,1,...replacement);
    else parent[key]={type:'row',items:replacement.length?replacement:[text()]};
    const fallback=replacement.length?firstText(replacement[0]):before?.type==='text'?before:null;
    field=null;drawFormula(fallback,fallback?.text.length||0);formulaCheckpoint();queueDraft();
  }
  function eraseFormula(forward=false){
    if(!field)return;formulaCheckpoint();const n=field.node,a=field.start||0,b=field.end??a;
    if(b>a||(!forward&&a>0)||(forward&&a<n.text.length)){
      const start=b>a?a:forward?a:a-([...n.text.slice(0,a)].at(-1)?.length||1),end=b>a?b:forward?a+([...n.text.slice(a)][0]?.length||1):a;
      n.text=n.text.slice(0,start)+n.text.slice(end);
      const path=templatePath(),container=path?ancestor(path):null;
      if(container?.type==='scripts'&&!content(container.sup)&&!content(container.sub)&&!n.text){replaceTemplate(path,container.base.items);return;}
      drawFormula(n,start);formulaCheckpoint();queueDraft();return;
    }
    const path=templatePath(),container=path?ancestor(path):null;
    if(container&&!content(container)){replaceTemplate(path);return;}
    if(!n.text&&container?.type==='scripts'&&['sup','sub'].includes(field.path[path.length])){const side=field.path[path.length];container.scriptMode=scriptMode(container).replace(side,'');if(!container.scriptMode){replaceTemplate(path,container.base.items);return;}drawFormula(firstText(container.base));formulaCheckpoint();queueDraft();return;}
    if(!n.text&&container?.type==='root'&&field.path[path.length]==='index'){container.showIndex=false;drawFormula(firstText(container.body));formulaCheckpoint();queueDraft();return;}
    const parent=ancestor(field.path.slice(0,-1)),index=field.path.at(-1),other=parent?.[index+(forward?1:-1)];
    if(other&&other.type!=='text'){
      const otherPath=[...field.path.slice(0,-1),index+(forward?1:-1)];
      if(!content(other)){replaceTemplate(otherPath);return;}
      const choices=fields.filter(f=>f.path.slice(0,otherPath.length).join('.')===otherPath.join('.'));
      const choice=forward?choices[0]:choices.at(-1);if(choice){choice.input.focus();const at=forward?0:choice.node.text.length;choice.input.setSelectionRange(at,at);choice.start=choice.end=at;field=choice;return;}
    }
    navigate(forward?1:-1);
  }
  function insert(template){
    if(!working||working.kind!=='formula')return;formulaCheckpoint();field=field||fields[0];if(!field)return;
    let n=field.node,a=field.start||0,b=field.end??a,selected=n.text.slice(a,b),node;
    const script=['scripts','square','subscript'].includes(template),side=template==='subscript'?'sub':'sup';
    if(script){
      const near=templatePath();let existing=near?ancestor(near):null;
      if(existing?.type==='scripts'&&field.path[near.length]==='base'){
        existing.scriptMode='supsub';if(template==='square'&&!content(existing.sup))existing.sup=row('2');
        const target=firstText(existing[side]);drawFormula(target,target.text.length);formulaCheckpoint();queueDraft();return;
      }
      if(!selected&&a>0){const prefix=n.text.slice(0,a),atom=prefix.match(/(?:\d+(?:[.,]\d+)?|[\p{L}])$/u);if(atom){a-=atom[0].length;selected=atom[0];}}
    }
    if(template==='fraction')node={type:'fraction',num:row(selected),den:row()};
    else if(['root','cubeRoot','nthRoot'].includes(template))node={type:'root',showIndex:template!=='root',index:row(template==='cubeRoot'?'3':''),body:row(selected)};
    else if(script)node={type:'scripts',scriptMode:side,base:row(selected),sup:row(template==='square'?'2':''),sub:row()};
    else if(['group','brackets','absolute'].includes(template))node={type:'group',bracket:template==='brackets'?'[':template==='absolute'?'|':'(',body:row(selected)};
    else if(template==='matrix'||template==='determinant'){const rows=clamp(Math.round(+el('matrixRows').value||2),1,6),cols=clamp(Math.round(+el('matrixCols').value||2),1,6);node={type:'matrix',bracket:template==='determinant'?'|':'[',cells:Array.from({length:rows},()=>Array.from({length:cols},()=>row()))};}
    else if(template==='derivative'||template==='partial')node={type:'fraction',num:row(template==='partial'?'∂':'d'),den:row(template==='partial'?'∂':'d')};
    else if(['sum','product','integral','limit'].includes(template))node={type:'operator',symbol:{sum:'Σ',product:'∏',integral:'∫',limit:'lim'}[template],lower:row(),upper:row(),body:row(selected)};
    else if(['sin','cos','tan','log','ln','exp'].includes(template))node={type:'row',functionName:template,items:[text(template),{type:'group',bracket:'(',body:row(selected)}]};
    else{n.text=n.text.slice(0,a)+template+n.text.slice(b);drawFormula(n,a+template.length);formulaCheckpoint();queueDraft();return;}
    const parentPath=field.path.slice(0,-1),parent=ancestor(parentPath);let index=field.path.at(-1);
    if(!Array.isArray(parent))return;
    if(script&&!selected&&a===0&&index>0&&parent[index-1]?.type!=='text'){
      const previous=parent[index-1];
      if(previous.type==='scripts'){previous.scriptMode='supsub';if(template==='square'&&!content(previous.sup))previous.sup=row('2');const target=firstText(previous[side]);drawFormula(target,target.text.length);formulaCheckpoint();queueDraft();return;}
      node.base={type:'row',items:[previous]};parent.splice(index-1,1);index--;
    }
    const before={...n,text:n.text.slice(0,a)},after={...n,text:n.text.slice(b)};parent.splice(index,1,before,node,after);
    let target=firstText(node);
    if(script&&content(node.base))target=firstText(node[side]);
    if(template==='nthRoot')target=firstText(node.index);
    if(['sin','cos','tan','log','ln','exp'].includes(template))target=firstText(node.items[1]);
    if(template==='square'&&content(node.base))target=after;
    drawFormula(target,['derivative','partial'].includes(template)?target.text.length:0);formulaCheckpoint();queueDraft();
  }
  function removeTemplate(){if(!field)return;const path=templatePath();if(path===null){message('El campo activo no está dentro de un molde. Usa ⌫ para borrar texto.');return;}formulaCheckpoint();replaceTemplate(path);message('Molde eliminado. Deshacer fórmula recupera sus datos.');}
  const keyboards={basic:[['fraction','Fracción'],['root','Raíz'],['cubeRoot','Raíz cúbica'],['nthRoot','Raíz con índice'],['scripts','Potencia'],['square','Cuadrado'],['subscript','Subíndice'],['group','Paréntesis'],['absolute','Valor absoluto'],['×','Multiplicar'],['÷','Dividir'],['−','Menos'],['+','Más'],['=','Igual'],['±','Más / menos']],functions:[['sin','Seno'],['cos','Coseno'],['tan','Tangente'],['log','Logaritmo'],['ln','Log natural'],['exp','Exponencial'],['π','Pi'],['e','Euler'],['∞','Infinito'],['≤','Menor o igual'],['≥','Mayor o igual'],['≠','Distinto']],calculus:[['derivative','Derivada'],['partial','Derivada parcial'],['integral','Integral'],['sum','Sumatoria'],['product','Producto'],['limit','Límite'],['→','Tiende a'],['Δ','Delta']],greek:[...('α β γ η θ λ μ ρ σ ω φ Ω'.split(' ')).map(x=>[x,x])],matrix:[['matrix','Matriz'],['determinant','Determinante'],['brackets','Corchetes']]};
  function drawKeys(){el('mathKeys').replaceChildren();for(const [key,label] of keyboards[category]){const b=document.createElement('button');b.className='btn';b.type='button';b.dataset.template=key;const symbols={fraction:'□ / □',root:'√□',cubeRoot:'³√□',nthRoot:'ⁿ√□',scripts:'□ⁿ',square:'□²',subscript:'□ₙ',group:'(□)',brackets:'[□]',absolute:'|□|',matrix:'[⋮]',determinant:'|⋮|',derivative:'d□ / d□',partial:'∂□ / ∂□',integral:'∫',sum:'Σ',product:'∏',limit:'lim'};b.textContent=symbols[key]||key;const small=document.createElement('small');small.textContent=label;b.append(small);b.onclick=()=>insert(key);el('mathKeys').append(b);}el('matrixDimensions').classList.toggle('hidden',category!=='matrix');el('mathCategories').querySelectorAll('button').forEach(b=>b.classList.toggle('accent',b.dataset.category===category));}
  function graphCheckpoint(){
    if(!working||working.kind!=='graph')return;
    const value=JSON.stringify(working);if(graphHistory[graphIndex]===value)return;
    graphHistory=graphHistory.slice(0,graphIndex+1);graphHistory.push(value);if(graphHistory.length>40)graphHistory.shift();graphIndex=graphHistory.length-1;
    el('graphUndo').disabled=graphIndex<=0;el('graphRedo').disabled=graphIndex>=graphHistory.length-1;
  }
  function graphUndo(delta){graphCheckpoint();const next=graphIndex+delta;if(next<0||next>=graphHistory.length)return;graphIndex=next;working=JSON.parse(graphHistory[next]);selectedPoint=-1;bulkDirty=false;syncTools();graphTools();drawGraph();el('graphUndo').disabled=next<=0;el('graphRedo').disabled=next>=graphHistory.length-1;queueDraft();}
  function syncBulk(){const t=working.series[traceIndex];el('graphPoints').value=t.points.map(p=>p.x+'; '+p.y+(p.label?'; '+p.label:'')).join('\n');bulkDirty=false;}
  function graphTools(){
    for(const key of ['xmin','xmax','xstep','ymin','ymax','ystep','xlabel','ylabel','title'])el('graph_'+key).value=working[key];
    for(const key of ['grid','ticks','arrows'])el('graph_'+key).checked=working[key];el('graph_gridFit').checked=working.gridFit!==false;
    const sel=el('graphTrace');sel.replaceChildren();
    if(!working.series.length)working.series.push(newTrace(working.color));
    working.series.forEach((s,i)=>sel.add(new Option('Trazo '+(i+1),String(i))));traceIndex=clamp(traceIndex,0,working.series.length-1);sel.value=traceIndex;
    const t=working.series[traceIndex];el('graphType').value=t.type;el('graphColor').value=t.color||working.color;
    for(const key of ['pointColor','guideColor','labelColor'])el('graph_'+key).value=t[key]||t.color||working.color;
    for(const [key,fallback] of [['width',working.thickness],['guideWidth',1],['pointSize',2.5]])el('graph_'+key).value=t[key]??fallback;
    for(const key of ['markers','guides','dashed'])el('graph_'+key).checked=!!t[key];
    syncBulk();pointTools();
  }
  function pointTools(){
    const t=working.series[traceIndex],p=t.points[selectedPoint];if(!p)selectedPoint=-1;
    el('graphPointTitle').textContent=p?'Punto '+(selectedPoint+1)+' del trazo '+(traceIndex+1):'Nuevo punto';
    for(const [id,key] of [['graphPointX','x'],['graphPointY','y'],['graphPointLabel','label']])el(id).value=p?.[key]??'';
    el('graphSavePoint').textContent=p?'Guardar punto':'Agregar punto';el('graphDeletePoint').disabled=!p;
    const list=el('graphPointList');list.replaceChildren();
    t.points.forEach((point,i)=>{
      const li=document.createElement('div');li.className='graphPointRow'+(i===selectedPoint?' selected':'');
      const choose=document.createElement('button');choose.className='btn';choose.type='button';choose.textContent=(i+1)+': ('+point.x+', '+point.y+')'+(point.label?' · '+point.label:'');choose.setAttribute('aria-label','Editar punto '+(i+1));choose.onclick=()=>selectPoint(traceIndex,i);
      const remove=document.createElement('button');remove.className='btn danger';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Eliminar punto '+(i+1));remove.onclick=()=>deletePoint(i);
      li.append(choose,remove);list.append(li);
    });
  }
  function selectPoint(ti,pi){if(!readTrace()||(selectedPoint>=0&&!readPoint()))return;traceIndex=ti;selectedPoint=pi;graphTools();drawGraph();queueDraft();}
  function pointValue(){
    const xv=el('graphPointX').value,yv=el('graphPointY').value,label=el('graphPointLabel').value.trim();
    if(!xv.trim()||!yv.trim())throw Error('Completa X e Y del punto.');
    const x=Number(xv.replace(',','.')),y=Number(yv.replace(',','.'));
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('X e Y deben ser números.');
    if(label.length>60)throw Error('La etiqueta admite 60 caracteres.');
    return {x,y,label};
  }
  function readPoint(persist=true){
    if(selectedPoint<0)return true;const t=working.series[traceIndex],old=t.points[selectedPoint];if(!old)return true;
    try{const p={...old,...pointValue()};if(persist)graphCheckpoint();t.points[selectedPoint]=p;if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);
      try{validate(working);}catch(error){t.points=t.points.filter(point=>point!==p);t.points.push(old);if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);else t.points.splice(selectedPoint,0,t.points.pop());throw error;}
      selectedPoint=t.points.indexOf(p);syncBulk();if(persist){graphCheckpoint();drawGraph();queueDraft();}return true;
    }catch(error){if(persist)message(error.message);return false;}
  }
  function savePoint(){
    if(!readTrace())return false;
    if(selectedPoint>=0){if(!readPoint())return false;pointTools();message('Punto actualizado.');return true;}
    const t=working.series[traceIndex];try{if(t.points.length>=100)throw Error('Máximo 100 puntos por trazo');const p=pointValue();graphCheckpoint();const old=t.points;t.points=[...old,p];if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);try{validate(working);}catch(error){t.points=old;throw error;}selectedPoint=t.points.indexOf(p);syncBulk();pointTools();drawGraph();graphCheckpoint();queueDraft();message('Punto agregado. Toca Nuevo punto para agregar otro.');return true;}catch(error){message(error.message);return false;}
  }
  function deletePoint(index=selectedPoint){const t=working.series[traceIndex];if(!t.points[index])return;graphCheckpoint();t.points.splice(index,1);selectedPoint=-1;syncBulk();pointTools();drawGraph();graphCheckpoint();queueDraft();message('Punto eliminado. Deshacer gráfica lo recupera.');}
  function readTrace(persist=true){
    const t=working?.series[traceIndex];if(!t)return true;
    const old=clone(t);try{
      if(persist)graphCheckpoint();
      if(bulkDirty){
        t.points=el('graphPoints').value.trim().split('\n').filter(x=>x.trim()).map(line=>{const parts=line.includes(';')?line.split(';'):line.includes('\t')?line.split('\t'):line.split(',');if(parts.length<2||parts.length>3||!parts[0].trim()||!parts[1].trim())throw Error('Para pegar una lista usa X; Y; etiqueta. También puedes usar los tres campos del punto.');const x=Number(parts[0].trim().replace(',','.')),y=Number(parts[1].trim().replace(',','.')),label=(parts[2]||'').trim();if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Las coordenadas deben ser números');return {x,y,label};});
        if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);selectedPoint=-1;
      }
      t.type=el('graphType').value;t.color=el('graphColor').value;
      for(const key of ['pointColor','guideColor','labelColor'])t[key]=el('graph_'+key).value;
      for(const key of ['width','guideWidth','pointSize'])t[key]=+el('graph_'+key).value;
      for(const key of ['markers','guides','dashed'])t[key]=el('graph_'+key).checked;
      if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);validate(working);
      bulkDirty=false;if(persist){graphCheckpoint();queueDraft();}return true;
    }catch(error){Object.assign(t,old);if(persist)message(error.message);return false;}
  }
  function smooth(points){if(points.length<3)return points;const slopes=points.slice(1).map((b,i)=>(b[1]-points[i][1])/(b[0]-points[i][0])),tangents=[slopes[0],...slopes.slice(1).map((b,i)=>slopes[i]*b<=0?0:2*slopes[i]*b/(slopes[i]+b)),slopes.at(-1)],out=[];points.slice(1).forEach((b,i)=>{const a=points[i],dx=b[0]-a[0];for(let j=0;j<24;j++){const t=j/24,t2=t*t,t3=t2*t;out.push([a[0]+t*dx,(2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*dx*tangents[i]+(-2*t3+3*t2)*b[1]+(t3-t2)*dx*tangents[i+1]]);}});return [...out,points.at(-1)];}
  function graphGeometry(g){
    const unit=40,w=g.width*unit,h=g.height*unit;
    const axis=(low,high,step,start,end)=>{const tick=Math.floor(low/step+1e-9),span=high/step-tick;let scale=Math.floor((end-start)/span*2+1e-9)/2;const fitted=g.gridFit!==false&&scale>=.5;if(!fitted)scale=(end-start)/span;return {tick,scale,start,fitted};};
    const x=axis(g.xmin,g.xmax,g.xstep,1,g.width-.5),y=axis(g.ymin,g.ymax,g.ystep,g.title?1.5:1,g.height-1);
    const xy=(px,py)=>[(x.start+(px/g.xstep-x.tick)*x.scale)*unit,(g.height-1-(py/g.ystep-y.tick)*y.scale)*unit];
    const [left,bottom]=xy(g.xmin,g.ymin),[right,top]=xy(g.xmax,g.ymax),[ax,ay]=xy(clamp(0,g.xmin,g.xmax),clamp(0,g.ymin,g.ymax));
    return {xy,left,right,top,bottom,ax,ay,x,y,w,h,unit};
  }
  class LabelSpace{
    constructor(w,h,unit=40){this.w=w;this.h=h;this.unit=unit;this.cells=new Map();this.segments=[];this.boxes=[];}
    keys([x,y,w,h]){const keys=[];for(let i=Math.floor(x/this.unit);i<=Math.floor((x+w)/this.unit);i++)for(let j=Math.floor(y/this.unit);j<=Math.floor((y+h)/this.unit);j++)keys.push(i+','+j);return keys;}
    path(points,pad=1){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],index=this.segments.length;this.segments.push([a,b,pad]);const rect=[Math.min(a[0],b[0])-pad,Math.min(a[1],b[1])-pad,Math.abs(a[0]-b[0])+2*pad,Math.abs(a[1]-b[1])+2*pad];for(const k of this.keys(rect)){if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(index);}}}
    crosses(a,b,rect,pad){let [x,y,w,h]=rect;x-=pad;y-=pad;w+=2*pad;h+=2*pad;const dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;for(const [p,q] of [[-dx,a[0]-x],[dx,x+w-a[0]],[-dy,a[1]-y],[dy,y+h-a[1]]]){if(Math.abs(p)<1e-12){if(q<0)return false;}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);if(lo>hi)return false;}return true;}
    place(x,y,w,h,radius=2){let best=null;const margin=radius+this.unit*.12;for(const gap of [margin,margin+this.unit*.3])for(const [ox,oy] of [[gap,-h-gap],[gap,gap],[-w-gap,-h-gap],[-w-gap,gap],[-w/2,-h-gap],[-w/2,gap],[gap,-h/2],[-w-gap,-h/2]]){const xx=clamp(x+ox,3,this.w-w-3),yy=clamp(y+oy,3,this.h-h-3),rect=[xx,yy,w,h],indices=new Set(this.keys(rect).flatMap(k=>this.cells.get(k)||[]));let hits=0,overlap=0;for(const i of indices){const [a,b,p]=this.segments[i];if(this.crosses(a,b,rect,p+this.unit*.025))hits++;}for(const [bx,by,bw,bh] of this.boxes)overlap+=Math.max(0,Math.min(xx+w,bx+bw)-Math.max(xx,bx))*Math.max(0,Math.min(yy+h,by+bh)-Math.max(yy,by));const score=hits*1000+overlap*100+Math.hypot(xx+w/2-x,yy+h/2-y);if(!best||score<best.score)best={score,rect};}this.boxes.push(best.rect);return best.rect;}
  }
  function applyGraphView(){
    if(!working||working.kind!=='graph')return;const w=working.width*40,h=working.height*40;
    graphView.x=clamp(graphView.x,0,w-w/graphZoom);graphView.y=clamp(graphView.y,0,h-h/graphZoom);
    el('graphSVG').setAttribute('viewBox',`${graphView.x} ${graphView.y} ${w/graphZoom} ${h/graphZoom}`);
    el('graphZoomReset').textContent=Math.round(graphZoom*100)+' %';
    el('graphZoomIn').disabled=graphZoom>=4;el('graphZoomOut').disabled=graphZoom<=1;
  }
  function setGraphZoom(value){const w=working.width*40,h=working.height*40,cx=graphView.x+w/graphZoom/2,cy=graphView.y+h/graphZoom/2;graphZoom=clamp(value,1,4);graphView={x:cx-w/graphZoom/2,y:cy-h/graphZoom/2};applyGraphView();}
  function drawGraph(){
    let space=null;const labels=[];const svg=el('graphSVG');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
    const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);if(space&&tag==='text'&&!attrs['data-point-label']){const b=n.getBBox();space.boxes.push([b.x,b.y,b.width,b.height]);}return n;};
    const g=working;if(![g.width,g.height,g.xmin,g.xmax,g.xstep,g.ymin,g.ymax,g.ystep].every(Number.isFinite)||g.xmax<=g.xmin||g.ymax<=g.ymin||g.xstep<=0||g.ystep<=0||g.width<4||g.height<4)return;
    const geo=graphGeometry(g),{xy,left,right,top,bottom,ax,ay,w,h}=geo;applyGraphView();space=new LabelSpace(w,h);const arrowRight=g.arrows&&right+20<=w-2?right+20:right,arrowTop=g.arrows&&top-20>=2?top-20:top;
    const line=(points,c,dash=false,width=1)=>{if(c!=='#e1e5eb')space.path(points,width/2);return add('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:c,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...(dash?{'stroke-dasharray':'3.4 3.4'}:{})});};
    for(let x=0;x<=w;x+=40)line([[x,0],[x,h]],'#e1e5eb',false,.5);
    for(let y=0;y<=h;y+=40)line([[0,y],[w,y]],'#e1e5eb',false,.5);
    const guideMap=new Map();
    g.series.forEach(t=>{if(!t.guides)return;const c=t.guideColor||t.color,width=(t.guideWidth||1)*.6;for(const p of t.points){const [x,y]=xy(p.x,p.y);for(const [key,a,b] of [[['v',x,c,width],y,ay],[['h',y,c,width],x,ax]]){const k=JSON.stringify(key),ranges=guideMap.get(k)||[];ranges.push([Math.min(a,b),Math.max(a,b)]);guideMap.set(k,ranges);}}});
    for(const [key,ranges] of guideMap){const [axis,position,c,width]=JSON.parse(key),merged=[];ranges.sort((a,b)=>a[0]-b[0]).forEach(([a,b])=>{if(merged.length&&a<=merged.at(-1)[1]+1e-7)merged.at(-1)[1]=Math.max(b,merged.at(-1)[1]);else merged.push([a,b]);});for(const [a,b] of merged)line(axis==='v'?[[position,a],[position,b]]:[[a,position],[b,position]],c,true,width);}
    for(const axis of ['x','y']){
      const lo=g[axis+'min'],hi=g[axis+'max'],step=g[axis+'step'];if((hi-lo)/step>40)continue;
      const first=Math.ceil(lo/step-1e-9)*step,count=Math.min(41,Math.floor((hi-first)/step+1e-8)+1);
      for(let i=0;i<count;i++){
        const v=first+i*step,[x,y]=axis==='x'?xy(v,clamp(0,g.ymin,g.ymax)):xy(clamp(0,g.xmin,g.xmax),v);
        if(g.grid)line(axis==='x'?[[x,top],[x,bottom]]:[[left,y],[right,y]],'#c4ccd5',false,.5);
        if(g.ticks){if(!g.arrows||(axis==='x'?arrowRight-x:y-arrowTop)>8.1)line(axis==='x'?[[x,ay-2],[x,ay+2]]:[[ax-2,y],[ax+2,y]],g.color,false,g.thickness*.6);if(Math.abs(v)>1e-8)add('text',{x:axis==='x'?x:ax-6,y:axis==='x'?ay+15:y+4,'text-anchor':axis==='x'?'middle':'end','font-size':38*g.size*.675*.72,fill:g.color},Number(v.toPrecision(5)));}
      }
    }
    line([[left,ay],[arrowRight,ay]],g.color,false,g.thickness*.6);line([[ax,bottom],[ax,arrowTop]],g.color,false,g.thickness*.6);
    if(g.arrows){line([[arrowRight-5.4,ay-3.4],[arrowRight,ay],[arrowRight-5.4,ay+3.4]],g.color,false,g.thickness*.6);line([[ax-3.4,arrowTop+5.4],[ax,arrowTop],[ax+3.4,arrowTop+5.4]],g.color,false,g.thickness*.6);}
    const font=38*g.size*.675;
    add('text',{x:right,y:Math.min(h-5,ay+(g.ticks?35:24)),'text-anchor':'end',fill:g.color,'font-size':font},g.xlabel);
    add('text',{x:ax+8,y:Math.max(font+3,top-7),fill:g.color,'font-size':font},g.ylabel);
    add('text',{x:w/2,y:Math.max(20,top-28),'text-anchor':'middle','font-size':font,fill:g.color},g.title);
    g.series.forEach((t,ti)=>{
      const pts=t.points.map(p=>xy(p.x,p.y));if(t.type!=='points'&&pts.length>1)line(t.type==='curve'?smooth(t.points.map(p=>[p.x,p.y])).map(p=>xy(...p)):pts,t.color,t.dashed,(t.width||g.thickness)*.6);
      t.points.forEach((p,i)=>{const [x,y]=pts[i],selected=ti===traceIndex&&i===selectedPoint;if(selected)add('circle',{cx:x,cy:y,r:9,fill:'#6267f122',stroke:'#6267f1','stroke-width':1,'pointer-events':'none'});const circle=add('circle',{cx:x,cy:y,r:Math.max(2,(t.pointSize||2.5)*.675),fill:t.pointColor||t.color,stroke:t.pointColor||t.color,'stroke-width':1,class:'graphPoint','data-trace':ti,'data-point':i});circle.setAttribute('aria-label','Punto '+(i+1)+': '+p.x+', '+p.y);add('circle',{cx:x,cy:y,r:11,fill:'transparent',class:'graphHit','data-trace':ti,'data-point':i});space.path([[x-.01,y],[x+.01,y]],(t.pointSize||2.5)*.675);if(p.label)labels.push({x,y,r:(t.pointSize||2.5)*.675,text:p.label,color:t.labelColor||t.pointColor||t.color});});
    });
    for(const p of labels){const node=add('text',{x:0,y:0,fill:p.color,'font-size':font,'data-point-label':'true'},p.text),b=node.getBBox(),[x,y]=space.place(p.x,p.y,b.width,b.height,p.r);node.setAttribute('x',x-b.x);node.setAttribute('y',y-b.y);}
    el('graphGridInfo').textContent=(geo.x.fitted&&geo.y.fitted?'Divisiones sobre la cuadrícula: X = '+geo.x.scale+' cuadros; Y = '+geo.y.scale+' cuadros.':'Esta escala usa espaciado continuo. Amplía la gráfica o aumenta el paso de los ejes para encajar sus divisiones en medios cuadros.')+' Las coordenadas escritas se respetan.';
  }
  function graphPointer(e){
    if(!working||working.kind!=='graph')return;const svg=el('graphSVG'),point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;
    let {x,y}=point.matrixTransform(matrix.inverse());const g=working,geo=graphGeometry(g);
    const px=(x/40-geo.x.start)/geo.x.scale*g.xstep+geo.x.tick*g.xstep,py=(g.height-1-y/40)/geo.y.scale*g.ystep+geo.y.tick*g.ystep;
    const magnet=(value,axis,pixelsPerUnit)=>{
      const low=g[axis+'min'],high=g[axis+'max'];value=clamp(value,low,high);
      if(el('graphSnap').checked){
        const halfStep=g[axis+'step']/2,nearest=Math.round(value/halfStep)*halfStep;
        // CSS-pixel tolerance follows zoom. Most of each interval stays free.
        const tolerance=Math.min(6/Math.max(pixelsPerUnit,1e-9),halfStep*.08);
        if(nearest>=low&&nearest<=high&&Math.abs(value-nearest)<=tolerance)value=nearest;
      }
      return +value.toPrecision(12);
    };
    return {x:magnet(px,'x',Math.hypot(matrix.a,matrix.b)*40*geo.x.scale/g.xstep),
            y:magnet(py,'y',Math.hypot(matrix.c,matrix.d)*40*geo.y.scale/g.ystep)};
  }
  function mode(on){active=on;render();}
  function positionTools(){toolsFrame=null;const wrap=el('previewWrap').getBoundingClientRect();el('objectOverlay').querySelectorAll('.objectTarget').forEach(box=>{const r=box.getBoundingClientRect(),bar=box.querySelector('.objectQuickActions'),resize=box.querySelector('.objectResize');const visible=r.right>wrap.left&&r.left<wrap.right&&r.bottom>wrap.top&&r.top<wrap.bottom;bar.style.visibility=resize.style.visibility=visible?'visible':'hidden';if(!visible)return;bar.style.left=`${clamp(r.left,wrap.left+6,Math.max(wrap.left+6,wrap.right-bar.offsetWidth-6))-r.left}px`;bar.style.top=`${clamp(r.top-bar.offsetHeight-4,wrap.top+6,Math.max(wrap.top+6,wrap.bottom-bar.offsetHeight-6))-r.top}px`;resize.style.left=`${clamp(r.right-44,wrap.left+6,wrap.right-50)-r.left}px`;resize.style.top=`${clamp(r.bottom-44,wrap.top+6,wrap.bottom-50)-r.top}px`;});}
  function render(){const layer=el('objectOverlay');if(!layer)return;if(drag)return;layer.replaceChildren();if(!active||!composition||previewRevision!==revision||working||exporting)return;for(const obj of composition.object_pages?.[currentPage]||[]){const box=document.createElement('div'),k=.675*zoom;box.className='objectTarget';box.dataset.id=obj.id;Object.assign(box.style,{left:obj.x*k+'px',top:obj.y*k+'px',width:obj.width*k+'px',height:obj.height*k+'px'});const bar=document.createElement('div');bar.className='objectQuickActions';box.append(bar);for(const [cls,label] of [['objectMove','↔'],['objectOpen','Editar'],['objectResize','↘']]){const b=document.createElement('button');b.className=cls;b.textContent=label;b.setAttribute('aria-label',cls==='objectMove'?'Mover elemento por medios cuadros':cls==='objectResize'?'Cambiar espacio del elemento':'Editar elemento');(cls==='objectResize'?box:bar).append(b);if(cls==='objectOpen')b.onclick=()=>open(objects[obj.id].kind,obj.id);}layer.append(box);}positionTools();}
  function init(){
    const dialog=document.createElement('div');dialog.id='mathDialog';dialog.className='mathDialog hidden';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','mathTitle');dialog.innerHTML="<section class=\"mathCard\">\n<div class=\"mathHeading\"><div><h2 id=\"mathTitle\">Escribir fórmula</h2><p>Distribución en medios cuadros · Sin resolución matemática</p></div><button class=\"btn\" id=\"mathCancel\">Cancelar</button></div>\n<div class=\"mathTools\"><label>Izquierda <input id=\"mathLeft\" type=\"number\" min=\"0.5\" max=\"15\" step=\"0.5\"></label><label>Ancho <input id=\"mathWidth\" type=\"number\" min=\"2\" max=\"15.5\" step=\"0.5\"></label><label>Alto mínimo <input id=\"mathHeight\" type=\"number\" min=\"0.5\" max=\"24.5\" step=\"0.5\"></label><label>Espacio antes <input id=\"mathGap\" type=\"number\" min=\"0\" max=\"10\" step=\"0.5\"></label><label>Letra <input id=\"mathSize\" type=\"number\" min=\"40\" max=\"150\" step=\"5\"> %</label><label>Alinear <select id=\"mathAlign\"><option value=\"left\">Izquierda</option><option value=\"center\">Centro</option><option value=\"right\">Derecha</option></select></label><input id=\"mathColor\" type=\"color\" aria-label=\"Color del elemento\"><label>Grosor <input id=\"mathThickness\" type=\"number\" min=\"1\" max=\"10\"></label><label id=\"mathFitLabel\"><input id=\"mathFit\" type=\"checkbox\" checked> Ajustar al ancho</label><label><input id=\"mathBeside\" type=\"checkbox\"> Al lado del anterior</label></div>\n<p id=\"mathMessage\" class=\"mathMessage\" role=\"status\"></p>\n<div class=\"mathScroll\"><div id=\"formulaEditor\">\n<div id=\"formulaStage\" class=\"formulaStage\" aria-label=\"Fórmula con campos editables\"></div>\n<div class=\"mathKeyboard\">\n<div class=\"mathNavigation\"><button class=\"btn\" id=\"mathPrevious\" aria-label=\"Cursor a la izquierda\">←</button><button class=\"btn\" id=\"mathNext\" aria-label=\"Cursor a la derecha\">→</button><button class=\"btn\" id=\"mathBackspace\" aria-label=\"Borrar en fórmula\">⌫</button><button class=\"btn\" id=\"mathUndo\">Deshacer fórmula</button><button class=\"btn\" id=\"mathRedo\">Rehacer</button><button class=\"btn danger\" id=\"mathDeleteTemplate\">Quitar molde</button><button class=\"btn\" id=\"mathFieldColor\">Color al campo activo</button></div>\n<div id=\"mathDigits\" class=\"mathDigits\"></div>\n<div class=\"mathCategories\" id=\"mathCategories\"><button class=\"btn\" data-category=\"basic\">Álgebra</button><button class=\"btn\" data-category=\"functions\">Funciones</button><button class=\"btn\" data-category=\"calculus\">Cálculo</button><button class=\"btn\" data-category=\"greek\">Griegas</button><button class=\"btn\" data-category=\"matrix\">Matrices</button></div>\n<div id=\"matrixDimensions\" class=\"mathTools hidden\"><label>Filas <input id=\"matrixRows\" type=\"number\" min=\"1\" max=\"6\" value=\"2\"></label><label>Columnas <input id=\"matrixCols\" type=\"number\" min=\"1\" max=\"6\" value=\"2\"></label></div>\n<div id=\"mathKeys\" class=\"mathKeys\"></div></div></div>\n<div id=\"graphEditor\" class=\"graphLayout hidden\"><div class=\"graphControls\">\n<label>Título <input id=\"graph_title\" maxlength=\"60\"></label>\n<div class=\"graphRange\"><label>X mínimo<input id=\"graph_xmin\" type=\"number\" step=\"any\"></label><label>X máximo<input id=\"graph_xmax\" type=\"number\" step=\"any\"></label><label>Paso X<input id=\"graph_xstep\" type=\"number\" min=\"0.000001\" step=\"any\"></label></div>\n<div class=\"graphRange\"><label>Y mínimo<input id=\"graph_ymin\" type=\"number\" step=\"any\"></label><label>Y máximo<input id=\"graph_ymax\" type=\"number\" step=\"any\"></label><label>Paso Y<input id=\"graph_ystep\" type=\"number\" min=\"0.000001\" step=\"any\"></label></div>\n<div class=\"graphNames\"><label>Nombre eje X <input id=\"graph_xlabel\" maxlength=\"60\"></label><label>Nombre eje Y <input id=\"graph_ylabel\" maxlength=\"60\"></label></div>\n<div class=\"graphChecks\"><label><input id=\"graph_grid\" type=\"checkbox\"> Cuadrícula de ejes</label><label><input id=\"graph_ticks\" type=\"checkbox\" checked> Escala</label><label><input id=\"graph_arrows\" type=\"checkbox\" checked> Flechas</label><label><input id=\"graph_gridFit\" type=\"checkbox\" checked> Encajar divisiones en la hoja</label></div>\n<div class=\"graphActions\"><select id=\"graphTrace\" aria-label=\"Trazo activo\"></select><button class=\"btn\" id=\"graphAddTrace\">+ Trazo</button><button class=\"btn danger\" id=\"graphRemoveTrace\">− Trazo</button></div>\n<select id=\"graphType\" aria-label=\"Tipo de trazo\"><option value=\"points\">Puntos</option><option value=\"line\">Recta / segmentos</option><option value=\"curve\">Curva suave</option></select>\n<div class=\"graphChecks\"><label><input id=\"graph_markers\" type=\"checkbox\"> Marcar puntos</label><label><input id=\"graph_guides\" type=\"checkbox\"> Guías punteadas</label><label><input id=\"graph_dashed\" type=\"checkbox\"> Trazo punteado</label></div>\n<details id=\"graphStyles\" open><summary>Colores y trazos</summary><div class=\"graphStyles\">\n<label>Línea <input id=\"graphColor\" type=\"color\" aria-label=\"Color del trazo\"></label><label>Grosor línea <input id=\"graph_width\" type=\"number\" min=\"0.5\" max=\"10\" step=\"0.5\"></label>\n<label>Puntos <input id=\"graph_pointColor\" type=\"color\" aria-label=\"Color de puntos\"></label><label>Tamaño punto <input id=\"graph_pointSize\" type=\"number\" min=\"0.5\" max=\"6\" step=\"0.5\"></label>\n<label>Guías <input id=\"graph_guideColor\" type=\"color\" aria-label=\"Color de guías\"></label><label>Grosor guías <input id=\"graph_guideWidth\" type=\"number\" min=\"0.5\" max=\"4\" step=\"0.5\"></label>\n<label>Etiquetas <input id=\"graph_labelColor\" type=\"color\" aria-label=\"Color de etiquetas\"></label></div></details>\n<div id=\"graphPointList\" class=\"graphPointList\" aria-label=\"Lista de puntos\"></div>\n<details id=\"graphBulk\"><summary>Pegar lista de puntos</summary><label>X; Y; etiqueta opcional <textarea id=\"graphPoints\" spellcheck=\"false\" placeholder=\"2; 8; A&#10;4; 6; B\"></textarea></label></details></div>\n<div class=\"graphPreview\">\n<div class=\"graphChecks mathTools\"><label><input id=\"graphTapAdd\" type=\"checkbox\"> Tocar para agregar</label><label><input id=\"graphSnap\" type=\"checkbox\" checked> Atraer a divisiones y mitades</label></div>\n<div class=\"graphZoomTools\"><button class=\"btn\" id=\"graphZoomOut\" aria-label=\"Alejar gráfica\">−</button><button class=\"btn\" id=\"graphZoomReset\" aria-label=\"Restablecer zoom de gráfica\">100 %</button><button class=\"btn\" id=\"graphZoomIn\" aria-label=\"Ampliar gráfica\">+</button></div><div class=\"graphViewport\"><svg id=\"graphSVG\" viewBox=\"0 0 280 320\" role=\"img\" aria-label=\"Gráfica de edición\"></svg></div>\n<div class=\"graphPointForm\"><strong id=\"graphPointTitle\">Nuevo punto</strong><div class=\"graphPointFields\"><label>X<input id=\"graphPointX\" inputmode=\"decimal\" aria-label=\"X del punto\"></label><label>Y<input id=\"graphPointY\" inputmode=\"decimal\" aria-label=\"Y del punto\"></label><label>Etiqueta<input id=\"graphPointLabel\" maxlength=\"60\" aria-label=\"Etiqueta del punto\" placeholder=\"Opcional\"></label></div>\n<div class=\"graphActions\"><button class=\"btn primary\" id=\"graphSavePoint\">Agregar punto</button><button class=\"btn\" id=\"graphNewPoint\">Nuevo punto</button><button class=\"btn danger\" id=\"graphDeletePoint\">Borrar punto</button><button class=\"btn\" id=\"graphUndo\">Deshacer gráfica</button><button class=\"btn\" id=\"graphRedo\">Rehacer</button></div></div>\n<p id=\"graphGridInfo\"></p><p>Toca un punto para seleccionarlo; arrástralo para moverlo. Amplía con dos dedos o con + y desplaza el fondo para explorar. La nota usa tu escritura calibrada.</p>\n</div></div></div>\n<div class=\"mathActions\"><button class=\"btn\" id=\"mathMoveUp\">↑ Mover arriba</button><button class=\"btn\" id=\"mathMoveDown\">↓ Mover abajo</button><button class=\"btn danger\" id=\"mathRemove\">Eliminar elemento</button><button class=\"btn primary\" id=\"mathDone\">Aplicar a la nota</button></div></section>\n";document.body.append(dialog);const overlay=document.createElement('div');overlay.id='objectOverlay';el('canvasShell').append(overlay);
    el('insertFormula').onclick=()=>open('formula');el('insertGraph').onclick=()=>open('graph');el('mathCancel').onclick=close;el('mathDone').onclick=commit;el('mathRemove').onclick=remove;el('mathMoveUp').onclick=()=>move(-1);el('mathMoveDown').onclick=()=>move(1);
    for(const [id,key] of [['mathLeft','left'],['mathWidth','width'],['mathHeight','height'],['mathGap','gap'],['mathSize','size'],['mathColor','color'],['mathThickness','thickness'],['mathAlign','align']])el(id).onchange=()=>{if(working.kind==='graph')graphCheckpoint();working[key]=key==='color'||key==='align'?el(id).value:key==='size'?+el(id).value/100:+el(id).value;if(working.kind==='graph'){graphCheckpoint();drawGraph();}queueDraft();};
    for(const [id,key] of [['mathBeside','beside'],['mathFit','fit']])el(id).onchange=()=>{working[key]=el(id).checked;queueDraft();};
    el('mathCategories').onclick=e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;drawKeys();}};
    el('mathPrevious').onclick=()=>navigate(-1);el('mathNext').onclick=()=>navigate(1);el('mathBackspace').onclick=()=>eraseFormula();
    el('mathUndo').onclick=()=>formulaUndo(-1);el('mathRedo').onclick=()=>formulaUndo(1);el('mathDeleteTemplate').onclick=removeTemplate;
    el('mathFieldColor').onclick=()=>{if(field){formulaCheckpoint();field.node.color=el('mathColor').value;drawFormula(field.node,field.start);formulaCheckpoint();queueDraft();}};
    for(const value of ['7','8','9','4','5','6','1','2','3','0','.','x']){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=value;b.dataset.digit=value;b.onclick=()=>insert(value);el('mathDigits').append(b);}
    el('formulaStage').onclick=e=>{if(e.target.matches('input'))return;const mold=e.target.closest('.mathTemplate');if(mold){const path=JSON.parse(mold.dataset.path),choice=fields.find(f=>f.path.slice(0,path.length).join('.')===path.join('.'));choice?.input.focus();}else if(e.target===el('formulaStage')){const last=fields.at(-1);last?.input.focus();last?.input.setSelectionRange(last.node.text.length,last.node.text.length);}};
    for(const key of ['xmin','xmax','xstep','ymin','ymax','ystep','xlabel','ylabel','title','grid','gridFit','ticks','arrows'])el('graph_'+key).onchange=()=>{const node=el('graph_'+key);graphCheckpoint();working[key]=node.type==='checkbox'?node.checked:node.type==='number'?+node.value:node.value;try{validate(working);message('Ajustes actualizados.');drawGraph();graphCheckpoint();queueDraft();}catch(e){message(e.message);}};
    const styles=['graphType','graphColor','graph_pointColor','graph_guideColor','graph_labelColor','graph_width','graph_guideWidth','graph_pointSize','graph_markers','graph_guides','graph_dashed'];
    for(const id of styles)el(id).onchange=()=>{if(readTrace())drawGraph();};
    el('graphPoints').oninput=()=>{bulkDirty=true;queueDraft();};el('graphPoints').onchange=()=>{if(readTrace()){pointTools();drawGraph();}};
    el('graphTrace').onchange=()=>{const next=+el('graphTrace').value;if(readTrace()&&(selectedPoint<0||readPoint())){traceIndex=next;selectedPoint=-1;graphTools();drawGraph();}else el('graphTrace').value=traceIndex;};
    el('graphAddTrace').onclick=()=>{if(!readTrace())return;if(working.series.length>=8)return message('Máximo 8 trazos');graphCheckpoint();working.series.push(newTrace(['#000000','#E53935','#245BCE','#11977B'][working.series.length%4]));traceIndex=working.series.length-1;selectedPoint=-1;graphTools();drawGraph();graphCheckpoint();queueDraft();};
    el('graphRemoveTrace').onclick=()=>{graphCheckpoint();working.series.splice(traceIndex,1);traceIndex=0;selectedPoint=-1;graphTools();drawGraph();graphCheckpoint();queueDraft();};
    el('graphSavePoint').onclick=savePoint;el('graphDeletePoint').onclick=()=>deletePoint();
    el('graphNewPoint').onclick=()=>{if(selectedPoint>=0&&!readPoint())return;selectedPoint=-1;pointTools();drawGraph();el('graphPointX').focus();queueDraft();};
    for(const id of ['graphPointX','graphPointY','graphPointLabel']){el(id).oninput=()=>queueDraft();el(id).onchange=()=>{if(selectedPoint>=0&&readPoint())pointTools();};el(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(id==='graphPointX')el('graphPointY').focus();else if(id==='graphPointY')el('graphPointLabel').focus();else savePoint();}};}
    el('graphUndo').onclick=()=>graphUndo(-1);el('graphRedo').onclick=()=>graphUndo(1);
    const svg=el('graphSVG');
    el('graphZoomIn').onclick=()=>setGraphZoom(graphZoom*1.25);el('graphZoomOut').onclick=()=>setGraphZoom(graphZoom/1.25);el('graphZoomReset').onclick=()=>setGraphZoom(1);
    const pointer=e=>({x:e.clientX,y:e.clientY});
    const startPinch=()=>{const [a,b]=[...graphPointers.values()];if(!a||!b)return;if(graphDrag){Object.assign(graphDrag.item,graphDrag.before);graphDrag=null;drawGraph();}const matrix=svg.getScreenCTM(),p=svg.createSVGPoint();p.x=(a.x+b.x)/2;p.y=(a.y+b.y)/2;const center=p.matrixTransform(matrix.inverse());graphGesture={type:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:graphZoom,center,fx:(center.x-graphView.x)/(working.width*40/graphZoom),fy:(center.y-graphView.y)/(working.height*40/graphZoom),scale:matrix.a,mid:{x:p.x,y:p.y}};};
    svg.onpointerdown=e=>{
      if(e.button>0||graphPointers.size>=2)return;e.preventDefault();graphPointers.set(e.pointerId,pointer(e));svg.setPointerCapture(e.pointerId);
      if(graphPointers.size===2){startPinch();return;}
      if(!readTrace()||(selectedPoint>=0&&!readPoint())){graphPointers.clear();return;}
      if(e.target.matches('.graphPoint,.graphHit')){
        graphCheckpoint();traceIndex=+e.target.dataset.trace;selectedPoint=+e.target.dataset.point;
        const p=working.series[traceIndex].points[selectedPoint];graphDrag={pointer:e.pointerId,trace:traceIndex,point:selectedPoint,item:p,before:clone(p),x:e.clientX,y:e.clientY,moved:false};
        graphGesture=null;graphTools();drawGraph();queueDraft();
      }else{const m=svg.getScreenCTM();graphGesture={type:'blank',pointer:e.pointerId,start:pointer(e),view:{...graphView},scale:m.a,moved:false};}
    };
    svg.onpointermove=e=>{
      if(!graphPointers.has(e.pointerId))return;e.preventDefault();graphPointers.set(e.pointerId,pointer(e));
      if(graphGesture?.type==='pinch'&&graphPointers.size===2){const [a,b]=[...graphPointers.values()],g=graphGesture;graphZoom=clamp(g.zoom*Math.hypot(a.x-b.x,a.y-b.y)/g.distance,1,4);const scale=g.scale*graphZoom/g.zoom;graphView={x:g.center.x-working.width*40/graphZoom*g.fx-((a.x+b.x)/2-g.mid.x)/scale,y:g.center.y-working.height*40/graphZoom*g.fy-((a.y+b.y)/2-g.mid.y)/scale};applyGraphView();return;}
      if(graphDrag?.pointer===e.pointerId){if(Math.hypot(e.clientX-graphDrag.x,e.clientY-graphDrag.y)>4)graphDrag.moved=true;if(graphDrag.moved){Object.assign(graphDrag.item,graphPointer(e));drawGraph();}return;}
      const g=graphGesture;if(g?.type==='blank'){const dx=e.clientX-g.start.x,dy=e.clientY-g.start.y;if(Math.hypot(dx,dy)>4)g.moved=true;if(g.moved&&graphZoom>1){graphView={x:g.view.x-dx/g.scale,y:g.view.y-dy/g.scale};applyGraphView();}}
    };
    const endGraph=(e,cancel=false)=>{
      if(!graphPointers.has(e.pointerId))return;const gesture=graphGesture;graphPointers.delete(e.pointerId);
      if(graphDrag?.pointer===e.pointerId){const d=graphDrag;graphDrag=null;const t=working.series[d.trace];if(cancel)Object.assign(d.item,d.before);else{if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);try{validate(working);}catch(error){Object.assign(d.item,d.before);if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);message(error.message);}}traceIndex=d.trace;selectedPoint=t.points.indexOf(d.item);graphTools();drawGraph();graphCheckpoint();queueDraft();}
      else if(!cancel&&gesture?.type==='blank'&&!gesture.moved&&el('graphTapAdd').checked){
        const p=graphPointer(e),t=working.series[traceIndex];if(p&&t.points.length<100){graphCheckpoint();const point={...p,label:''};t.points.push(point);if(t.type==='curve')t.points.sort((a,b)=>a.x-b.x);try{validate(working);selectedPoint=t.points.indexOf(point);graphTools();drawGraph();graphCheckpoint();queueDraft();}catch(error){t.points=t.points.filter(p=>p!==point);message(error.message);}}
      }
      // A remaining pinch finger cannot insert a point when it lifts.
      graphGesture=graphPointers.size?{type:'blocked'}:null;
    };
    svg.onpointerup=e=>endGraph(e);svg.onpointercancel=e=>endGraph(e,true);svg.onlostpointercapture=e=>endGraph(e,true);
    overlay.onpointerdown=e=>{if(!e.target.matches('.objectMove,.objectResize')||locked()||working||drag)return;e.preventDefault();e.stopPropagation();ImageEditor.finishGesture(true);el('previewWrap').classList.add('objectManipulating');const id=e.target.closest('.objectTarget').dataset.id;checkpoint();drag={id,pointer:e.pointerId,x:e.clientX,y:e.clientY,before:get(id),kind:e.target.className,node:e.target.closest('.objectTarget')};e.target.setPointerCapture(e.pointerId);};document.addEventListener('pointermove',e=>{if(drag?.pointer!==e.pointerId)return;e.preventDefault();const o=objects[drag.id],old=drag.before,k=40*zoom,dx=(e.clientX-drag.x)/k,dy=(e.clientY-drag.y)/k;if(drag.kind==='objectMove'){o.left=clamp(snap(old.left+dx),.5,16-o.width);o.gap=clamp(snap(old.gap+dy),0,10);drag.node.style.transform=`translate(${(o.left-old.left)*k}px,${(o.gap-old.gap)*k}px)`;}else{o.width=clamp(snap(old.width+dx),o.kind==='graph'?4:2,16-o.left);o.height=clamp(snap(old.height+dy),o.kind==='graph'?4:.5,24.5);drag.node.style.width=o.width*k+'px';drag.node.style.height=o.height*k+'px';}},{passive:false});const end=(e,cancel=false)=>{if(drag?.pointer!==e.pointerId)return;const d=drag;drag=null;el('previewWrap').classList.remove('objectManipulating');if(cancel)objects[d.id]=d.before;else{renderLines(readLines());checkpoint();changed();}render();};document.addEventListener('pointerup',e=>end(e));document.addEventListener('pointercancel',e=>end(e,true));overlay.addEventListener('lostpointercapture',e=>end(e,true));el('previewWrap').addEventListener('scroll',()=>{if(toolsFrame===null)toolsFrame=requestAnimationFrame(positionTools);},{passive:true});dialog.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'&&!e.target.classList.contains('mathSlot')){const nodes=[...dialog.querySelectorAll('button,input,select,textarea')].filter(n=>!n.disabled&&n.getClientRects().length);const i=nodes.indexOf(document.activeElement);if((e.shiftKey&&i===0)||(!e.shiftKey&&i===nodes.length-1)){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0].focus();}}};
    if(resume?.object){try{validate(resume.object);working=resume.object;originalId=resume.originalId;insertion=resume.insertion;activate();if(working.kind==='graph'){traceIndex=clamp(resume.traceIndex||0,0,working.series.length-1);selectedPoint=Number.isInteger(resume.selectedPoint)?resume.selectedPoint:-1;graphTools();if(typeof resume.pointsDraft==='string'){el('graphPoints').value=resume.pointsDraft;bulkDirty=true;}if(Array.isArray(resume.pointDraft))['graphPointX','graphPointY','graphPointLabel'].forEach((id,i)=>el(id).value=resume.pointDraft[i]||'');drawGraph();}message('Se recuperó el elemento que estabas editando. Revisa y aplica los cambios.');}catch(e){resume=null;}}
  }
  return {init,open,get,block,isLine,state,restore,count,render,mode,isOpen:()=>!!working,isDragging:()=>!!drag};
})();
