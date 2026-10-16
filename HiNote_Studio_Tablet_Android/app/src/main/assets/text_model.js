'use strict';
// Paragraph properties use a zero-length record. Unlike properties added to an
// Array, this survives JSON history/drafts and leaves every text offset intact.
const LIST_TYPES = new Set(['bullet','dash','asterisk','num_dot','num_paren','alpha_lower_dot','alpha_lower_paren','alpha_upper_dot','alpha_upper_paren','roman_lower_dot','roman_upper_dot','multi_decimal']);
let typingState = null, nativeEdit = null, markerSelection = null, editorGesture = null;
function selectedMarkerIndexes(lines=readLines()){
  return markerSelection?lines.flatMap((line,i)=>{const l=paragraphOf(line).list;return l?.id===markerSelection.id&&l.level===markerSelection.level?[i]:[];}):[];
}
function syncMarkerSelection(){
  const indexes=new Set(selectedMarkerIndexes());
  if(markerSelection&&!indexes.size)markerSelection=null;
  [...editor.children].forEach((node,i)=>node.classList.toggle('markerSelected',indexes.has(i)));
  editor.classList.toggle('markersSelected',!!markerSelection);
  $('sizeLabel').textContent=markerSelection?'Tamaño de marcas':'Tamaño';
  $('editorHint').textContent=markerSelection?'Marcas del nivel seleccionadas · Esc vuelve al texto':'Enter continúa listas · Ctrl+Z deshace';
  for(const id of ['caseSel','subscriptBtn','superscriptBtn'])$(id).disabled=!!markerSelection||exporting||folderBusy||CalibrationUI.isBusy()||NotebookUI.isBusy();
  $('caseSel').disabled ||= !bookmark()||collapsed(bookmark());
  window.StudioUI?.syncSelects?.();
}
function clearMarkerSelection(){
  if(!markerSelection)return;
  markerSelection=null;syncMarkerSelection();syncTextControls();
}
function selectListMarkers(index){
  if(!editor.isContentEditable||ime)return false;
  const l=paragraphOf(readLines()[index]).list;if(!l)return false;
  const point={line:index,offset:0};typingState=null;
  markerSelection={id:l.id,level:l.level,anchor:point};
  restoreSelection({start:point,end:{...point}});syncMarkerSelection();syncTextControls();return true;
}
function fullListItem(line,selection,i){
  return !!paragraphOf(line).list && !collapsed(selection) &&
    (i!==selection.start.line||selection.start.offset===0) &&
    (i!==selection.end.line||selection.end.offset>=lineText(line).length);
}
const markerMeasure=document.createElement('canvas').getContext('2d');
function markerAtPointer(event){
  const node=event.target.closest?.('.line[data-list]');if(!node||node.parentElement!==editor)return -1;
  const box=node.getBoundingClientRect(),css=getComputedStyle(node),width=parseFloat(css.getPropertyValue('--marker-width'))||32;
  const right=box.left+parseFloat(css.paddingLeft),left=right-width;
  const pseudo=getComputedStyle(node,'::before');let height=parseFloat(pseudo.lineHeight)||parseFloat(pseudo.fontSize)*1.65;
  const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();
  if(text?.length){const r=document.createRange();r.setStart(text,0);r.setEnd(text,1);height=Math.max(height,r.getBoundingClientRect().bottom-box.top);}
  return event.clientX>=left&&event.clientX<right&&event.clientY>=box.top&&event.clientY<=Math.min(box.bottom,box.top+height)?[...editor.children].indexOf(node):-1;
}
function initMarkerSelection(){
  function restoreGesture(g){
    if(!g?.preserve||!g.mark)return;
    markerSelection=g.markers;typingState=g.typing;restoreSelection(g.mark,false);syncMarkerSelection();syncTextControls();
  }
  editor.addEventListener('pointerdown',event=>{
    if(event.button!==0||!editor.isContentEditable||ime)return;
    const index=markerAtPointer(event),touch=event.pointerType!=='mouse';
    editorGesture={id:event.pointerId,index,x:event.clientX,y:event.clientY,moved:false,
      preserve:touch,mark:bookmark(),markers:markerSelection?structuredClone(markerSelection):null,typing:typingState};
    if(!touch){if(index>=0)event.preventDefault();else clearMarkerSelection();}
  });
  editor.addEventListener('pointermove',event=>{const g=editorGesture;if(g?.id===event.pointerId&&Math.hypot(event.clientX-g.x,event.clientY-g.y)>12)g.moved=true;});
  editor.addEventListener('pointercancel',()=>{const g=editorGesture;editorGesture=null;restoreGesture(g);});
  editor.addEventListener('pointerup',event=>{
    const g=editorGesture;editorGesture=null;if(g?.id!==event.pointerId)return;
    if(g.moved){restoreGesture(g);return;}
    if(g.index>=0&&markerAtPointer(event)===g.index){
      event.preventDefault();if(event.pointerType!=='mouse')window.StudioUI?.absorbTap?.(event);selectListMarkers(g.index);
    }else{clearMarkerSelection();captureSelection();}
  });
  editor.addEventListener('mousedown',event=>{if(markerAtPointer(event)>=0)event.preventDefault();});
  editor.addEventListener('keydown',event=>{
    if(event.isComposing||ime)return;
    const plain=!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
    const mark=bookmark(),lines=readLines();
    if(!markerSelection&&plain&&mark&&collapsed(mark)){
      const i=mark.start.line;
      if(mark.start.offset===0&&paragraphOf(lines[i]).list&&['ArrowLeft','ArrowUp'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();selectListMarkers(i);return;
      }
      if(event.key==='ArrowRight'&&mark.start.offset===lineText(lines[i]).length&&paragraphOf(lines[i+1]).list){
        event.preventDefault();event.stopImmediatePropagation();selectListMarkers(i+1);return;
      }
    }
    if(!markerSelection)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();clearMarkerSelection();return;}
    if(event.key==='Tab'){
      event.preventDefault();event.stopImmediatePropagation();changeLists(event.shiftKey?'outdent':'indent');return;
    }
    if(['Backspace','Delete'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();changeLists('remove');return;
    }
    if(plain&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();let point={...markerSelection.anchor};
      if(['ArrowLeft','ArrowUp'].includes(event.key)){
        for(let i=point.line-1;i>=0;i--)if(!isBlockLine(lines[i])){point={line:i,offset:lineText(lines[i]).length};break;}
      }
      clearMarkerSelection();restoreSelection({start:point,end:{...point}});scrollCaretIntoView();return;
    }
    if(['Home','End','Enter'].includes(event.key)||event.key.length===1&&(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()==='a'))clearMarkerSelection();
  },true);
  editor.addEventListener('beforeinput',event=>{if(event.inputType?.startsWith('insert')||event.inputType?.startsWith('delete'))clearMarkerSelection();},true);
}
function paragraphOf(line) { return line?.find(s=>s.paragraph)?.paragraph || {}; }
function withParagraph(line, properties = {}) {
  const meta = {};
  if(properties.list && LIST_TYPES.has(properties.list.type)) {
    const l=properties.list;
    meta.list={id:String(l.id||newListId()).slice(0,80),type:l.type,level:Math.round(bounded(l.level,0,8,0)),start:Math.round(bounded(l.start,1,999999,1)),markerStyle:cleanStyle(l.markerStyle)};
    if(l.indent!==undefined)meta.list.indent=Math.round(bounded(l.indent,0,12,0));
  }
  if(properties.indent)meta.indent=bounded(properties.indent,0,12,0);
  if(properties.listExit&&!meta.list){const e=properties.listExit;meta.listExit={indent:bounded(e.indent,0,12,0),marker:String(e.marker||'').slice(0,80),style:cleanStyle(e.style),stage:e.stage==='marker'?'marker':'body'};}
  if(properties.format && !sameStyle(cleanStyle(properties.format),DEFAULT_STYLE))meta.format=cleanStyle(properties.format);
  const runs=mergeSegments(line.filter(s=>!s.paragraph));
  return Object.keys(meta).length ? [{text:'',paragraph:meta},...runs] : runs;
}
function newListId(){return 'list-'+(crypto.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
function romanNumber(n){let out='';for(const [v,t] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=v){out+=t;n-=v;}return out;}
function listMarkers(lines){
  const sequences=new Map();
  return lines.map(line=>{
    const l=paragraphOf(line).list;if(!l)return '';
    let c=sequences.get(l.id);if(!c){c=Array(9).fill(0);sequences.set(l.id,c);}
    for(let i=0;i<l.level;i++)if(!c[i])c[i]=l.start;
    c[l.level]=c[l.level]?c[l.level]+1:(l.level===0?l.start:1);c.fill(0,l.level+1);
    if(l.type==='multi_decimal')return c.slice(0,l.level+1).join('.')+'.';
    if(l.type.startsWith('roman')){const r=romanNumber(c[l.level]);return (l.type.includes('lower')?r.toLowerCase():r)+'.';}
    return markerFor(l.type,c[l.level]-1);
  });
}
function paragraphIndent(meta){return meta.list ? (meta.list.indent??meta.list.level) : (meta.indent||0);}
function decorateParagraph(node,line,marker){
  const meta=paragraphOf(line),encoded=Object.keys(meta).length?JSON.stringify(meta):'';
  const signature=encoded+'|'+marker;if(node._paragraphSignature===signature)return;node._paragraphSignature=signature;
  if(encoded)node.dataset.paragraph=encoded;else delete node.dataset.paragraph;
  if(meta.list){
    node.dataset.list=meta.list.id;node.dataset.marker=marker;node.setAttribute('role','listitem');node.setAttribute('aria-level',meta.list.level+1);
    const s=meta.list.markerStyle,css=getComputedStyle(editor),base=parseFloat(css.fontSize)||16;
    const weight=Math.min(900,(s.bold?700:400)+(s.thickness||0)*25);
    markerMeasure.font=`${weight} ${base*s.scale}px ${css.fontFamily}`;
    node.style.setProperty('--marker-width',Math.max(base*2,markerMeasure.measureText(marker).width+base*.6*s.scale)+'px');
    node.style.setProperty('--marker-weight',weight);
    node.style.setProperty('--marker-color',editorInk(s.color,s.opacity));
    node.style.setProperty('--marker-size',s.scale+'em');
    node.style.setProperty('--marker-slant',s.italic?'italic':'normal');node.style.setProperty('--marker-decoration',s.underline?'underline':'none');
  }else{delete node.dataset.list;delete node.dataset.marker;node.removeAttribute('role');node.removeAttribute('aria-level');}
  node.style.setProperty('--paragraph-indent',paragraphIndent(meta)*1.5+'em');
  if(meta.listExit){const e=meta.listExit,base=parseFloat(getComputedStyle(editor).fontSize)||16;markerMeasure.font=`${Math.min(900,(e.style.bold?700:400)+e.style.thickness*25)} ${base*e.style.scale}px ${getComputedStyle(editor).fontFamily}`;const width=Math.max(base*2,markerMeasure.measureText(e.marker).width+base*.6*e.style.scale);node.style.setProperty('--paragraph-indent',(e.indent*1.5*base+(e.stage==='body'?width:0))+'px');}
}
function refreshListMarkers(){const lines=readLines(),markers=listMarkers(lines);[...editor.children].forEach((node,i)=>{if(!isBlockLine(lines[i]))decorateParagraph(node,lines[i],markers[i]);});syncMarkerSelection();}
function parseListPrefix(text){
  const m=text.match(/^([ \t]*)([•*\-]|\d+(?:\.\d+)*[.)]|[a-zA-Z][.)]|[ivxlcdmIVXLCDM]{2,8}\.)[ \t]+/);if(!m)return null;
  const token=m[2],body=token.slice(0,-1),ending=token.endsWith(')')?'paren':'dot';let type,start=1;
  if(token==='•'||token==='*'||token==='-')type=token==='•'?'bullet':token==='*'?'asterisk':'dash';
  else if(/^\d+(?:\.\d+)+$/.test(body)){type='multi_decimal';start=+body.split('.')[0];}
  else if(/^\d+$/.test(body)){type='num_'+ending;start=+body;}
  else if(/^[ivxlcdm]{2,8}$/i.test(body)){type='roman_'+(body===body.toUpperCase()?'upper':'lower')+'_dot';const values={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};start=0;for(let i=0;i<body.length;i++){const n=values[body[i].toLowerCase()],next=values[body[i+1]?.toLowerCase()]||0;start+=n<next?-n:n;}}
  else{type='alpha_'+(body===body.toUpperCase()?'upper':'lower')+'_'+ending;start=body.toLowerCase().charCodeAt(0)-96;}
  return {length:m[0].length,indentLength:m[1].length,type,start,ordinal:type==='multi_decimal'?+body.split('.').at(-1):start,
    level:Math.min(8,type==='multi_decimal'?body.split('.').length-1:Math.floor(m[1].replace(/\t/g,'    ').length/4))};
}
function migrateTextLists(lines){
  let previous=null;const counts=new Map();
  const prefixes=lines.map(line=>isBlockLine(line)||paragraphOf(line).list?null:parseListPrefix(lineText(line)));
  // A decimal root plus decimal descendants is one multilevel definition.
  // Root markers such as "1." do not by themselves reveal that definition.
  for(let i=0;i<prefixes.length;){
    if(!['num_dot','multi_decimal'].includes(prefixes[i]?.type)){i++;continue;}
    const first=i;let nested=false;
    while(i<prefixes.length&&['num_dot','multi_decimal'].includes(prefixes[i]?.type)){nested ||= prefixes[i].type==='multi_decimal';i++;}
    if(nested)for(let j=first;j<i;j++)prefixes[j].type='multi_decimal';
  }
  return lines.map((line,i)=>{
    if(isBlockLine(line)||paragraphOf(line).list){previous=null;return line;}
    const p=prefixes[i];if(!p){previous=null;return line;}
    const key=p.level,numbered=!['bullet','dash','asterisk'].includes(p.type);
    const reuse=previous&&previous.type===p.type&&(!numbered||p.ordinal===(counts.get(key)||0)+1||(!counts.has(key)&&p.level>previous.level));
    const l={id:reuse?previous.id:newListId(),type:p.type,level:p.level,start:reuse?previous.start:p.start,markerStyle:styleAt(line,p.indentLength)};
    if(!reuse)counts.clear();for(const level of counts.keys())if(level>key)counts.delete(level);counts.set(key,p.ordinal);previous=l;
    return withParagraph(sliceSegments(line,p.length),{...paragraphOf(line),list:l});
  });
}
function changeLists(action){
  const type=$('listType').value;
  edit((lines,selection)=>{
    const affected=(markerSelection?selectedMarkerIndexes(lines):selectedLineIndexes(selection)).filter(i=>!isBlockLine(lines[i]));
    const bulkApply=action==='apply'&&!collapsed(selection);
    const indexes=affected.filter(i=>!bulkApply||lineText(lines[i]).trim());
    // Word leaves blank separators unnumbered when converting a selection.
    // An empty item created explicitly by Enter or a collapsed caret is a
    // different operation and retains its marker until the user exits it.
    if(bulkApply)for(const i of affected)if(!lineText(lines[i]).trim()){
      const meta={...paragraphOf(lines[i])};delete meta.list;lines[i]=withParagraph(lines[i],meta);
    }
    if(!indexes.length)return bulkApply?{lines,selection}:undefined;
    const first=indexes[0],current=paragraphOf(lines[first]).list;
    if(['continue','restart','start'].includes(action)){
      if(!current)return;
      let target=null;
      if(action==='continue')for(let i=first-1;i>=0;i--){const l=paragraphOf(lines[i]).list;if(l&&l.id!==current.id&&l.type===current.type){target=l;break;}}
      if(action==='continue'&&!target){toast('No hay una lista anterior del mismo tipo');return;}
      target=target||{...current,id:newListId(),start:action==='start'?Math.round(bounded($('listStart').value,1,999999,1)):1};
      for(let i=first;i<lines.length;i++){const m=paragraphOf(lines[i]);if(m.list?.id===current.id)lines[i]=withParagraph(lines[i],{...m,list:{...m.list,id:target.id,start:target.start}});}
    }else{
      const previous=paragraphOf(lines[first-1]).list;
      const definition=current?.type===type?current:previous?.type===type?previous:{id:newListId(),type,start:1,markerStyle:styleAt(lines[first],0)};
      for(const i of indexes){const meta={...paragraphOf(lines[i])},l=meta.list;
        if(action==='apply'){delete meta.listExit;meta.list={...definition,markerStyle:l?.markerStyle||(bulkApply?styleAt(lines[i],0):definition.markerStyle),level:l?.level||0,...(l?.indent!==undefined?{indent:l.indent}:{})};}
        else if(action==='remove'){delete meta.list;delete meta.indent;delete meta.listExit;}
        else if(action==='setIndent'){const indent=Math.round(bounded($('listIndent').value,0,12,0));if(l)meta.list={...l,indent};else meta.indent=indent;}
        else if(l){meta.list={...l,level:Math.round(bounded(l.level+(action==='indent'?1:-1),0,8,0))};delete meta.list.indent;}
        else meta.indent=Math.round(bounded((meta.indent||0)+(action==='indent'?1:-1),0,12,0));
        lines[i]=withParagraph(lines[i],meta);
      }
    }
    if(markerSelection){const next=paragraphOf(lines[first]).list;markerSelection=next?{...markerSelection,id:next.id,level:next.level}:null;}
    return {lines,selection};
  });
}
function pointEqual(a,b){return a?.line===b?.line&&a?.offset===b?.offset;}
function insertionStyle(mark=bookmark(),lines=readLines()){
  if(!mark)return cleanStyle();
  if(collapsed(mark)&&pointEqual(typingState?.point,mark.start))return {...typingState.style};
  const line=lines[mark.start.line]||[];
  const selection=getSelection();
  if(collapsed(mark)&&selection?.isCollapsed&&selection.focusNode?.nodeType===Node.TEXT_NODE&&editor.contains(selection.focusNode)){
    const actual=modelPoint(selection.focusNode,selection.focusOffset);
    if(pointEqual(actual,mark.start)){
      let node=selection.focusNode.parentElement,style={};
      while(node&&node!==editor&&!node.classList.contains('line')){style={...node.dataset,...style};node=node.parentElement;}
      return cleanStyle(style);
    }
  }
  return lineText(line)?styleAt(line,Math.max(0,mark.start.offset-(collapsed(mark)?1:0))):cleanStyle(paragraphOf(line).format);
}
function caseText(text,mode,context=''){
  if(!mode)return text;
  let wordStart=!/[\p{L}\p{N}]$/u.test(context),sentenceStart=!context.trim()||/[.!?]\s*$/.test(context);
  return [...text].map(c=>{
    let out=c;
    if(mode==='upper')out=c.toLocaleUpperCase('es');
    if(mode==='lower')out=c.toLocaleLowerCase('es');
    if(mode==='toggle')out=c===c.toUpperCase()?c.toLowerCase():c.toUpperCase();
    if(mode==='title')out=wordStart?c.toUpperCase():c.toLowerCase();
    if(mode==='sentence')out=sentenceStart?c.toUpperCase():c.toLowerCase();
    if(/\p{L}/u.test(c))sentenceStart=false;else if(/[.!?]/.test(c))sentenceStart=true;
    wordStart=!/[\p{L}\p{N}]/u.test(c);return out;
  }).join('');
}
function setTypingStyle(style,point){typingState={point:{...point},style:cleanStyle(style)};}
function keepTypingStyleAtCaret(style){const m=bookmark();if(m&&collapsed(m))setTypingStyle(style,m.start);}
function patchRuns(lines,selection,patch,includeMarkers=false){
  for(const i of selectedLineIndexes(selection)){
    if(isBlockLine(lines[i]))continue;let meta=paragraphOf(lines[i]);
    if(includeMarkers&&fullListItem(lines[i],selection,i))meta={...meta,list:{...meta.list,markerStyle:cleanStyle({...meta.list.markerStyle,...Object.fromEntries(Object.entries(patch).filter(([k])=>k!=='script'))})}};
    if(!lineText(lines[i]))meta={...meta,format:cleanStyle({...meta.format,...patch})};
    const a=i===selection.start.line?selection.start.offset:0,b=i===selection.end.line?selection.end.offset:Infinity;
    lines[i]=withParagraph([...sliceSegments(lines[i],0,a),...sliceSegments(lines[i],a,b).map(s=>({...s,...patch})),...sliceSegments(lines[i],b)],meta);
  }return lines;
}
function toggleTextAttribute(key){const values=selectionStyles();applyStyle({[key]:!(values.length&&values.every(s=>s[key]))});}
function toggleScript(script){const values=selectionStyles();applyStyle({script:values.length&&values.every(s=>(s.script||'normal')===script)?'normal':script});}
function startNativeEdit(){
  const mark=bookmark();if(!mark)return;
  nativeEdit={lines:readLines(),mark,style:insertionStyle(mark)};
}
function finishNativeEdit(){
  const before=nativeEdit;nativeEdit=null;if(!before)return;
  const mark=bookmark();if(!mark)return;const lines=readLines();
  // Only decorate the text the native input connection actually committed.
  // Never cancel/reconstruct composing events or implement dead-key mapping.
  const sameParagraph=lines.length===before.lines.length&&mark.start.line===before.mark.start.line;
  const old=sameParagraph?lineText(before.lines[mark.start.line]):before.lines.map(lineText).join('\n');
  const now=sameParagraph?lineText(lines[mark.start.line]):lines.map(lineText).join('\n');
  let a=0,b=0;
  while(a<old.length&&a<now.length&&old[a]===now[a])a++;
  while(b<old.length-a&&b<now.length-a&&old[old.length-1-b]===now[now.length-1-b])b++;
  let end=now.length-b;
  if(!collapsed(before.mark)&&collapsed(mark)){
    // Replacing a selection still inserts text when the first letters happen
    // to equal the old text. String differencing alone cannot identify it.
    const offset=point=>lines.slice(0,point.line).reduce((n,line)=>n+lineText(line).length+1,0)+point.offset;
    a=sameParagraph?before.mark.start.offset:offset(before.mark.start);
    end=sameParagraph?mark.start.offset:offset(mark.start);
  }
  const at=offset=>{
    if(sameParagraph)return {line:mark.start.line,offset};
    for(let i=0;i<lines.length;i++){const n=lineText(lines[i]).length;if(offset<=n)return {line:i,offset};offset-=n+1;}
    return {line:lines.length-1,offset:lineText(lines.at(-1)).length};
  };
  if(end>a){
    const from=at(a),to=at(end);let decorated=false;
    for(let i=from.line;i<=to.line;i++){
      if(isBlockLine(lines[i]))continue;
      const first=i===from.line?from.offset:0,last=i===to.line?to.offset:lineText(lines[i]).length;
      const text=lineText(lines[i]).slice(first,last),current=sliceSegments(lines[i],first,last);
      const converted=caseText(text,before.style.caseMode,lineText(lines[i]).slice(0,first));
      if(current.some(s=>!sameStyle(cleanStyle(s),before.style))||converted!==text){
        lines[i]=withParagraph([...sliceSegments(lines[i],0,first),{text:converted,...before.style},...sliceSegments(lines[i],last)],paragraphOf(lines[i]));
        const delta=converted.length-text.length;for(const point of [mark.start,mark.end])if(point.line===i&&point.offset>=last)point.offset+=delta;
        decorated=true;
      }
    }
    if(decorated){
      if(sameParagraph&&editor.children[mark.start.line])editor.children[mark.start.line].replaceWith(renderParagraph(lines[mark.start.line],listMarkers(lines)[mark.start.line]));
      else renderLines(lines);
      restoreSelection(mark,false);
    }
  }
  if(collapsed(mark))setTypingStyle(before.style,mark.start);
}
function copyEditorSelection(event,cut=false){
  const mark=bookmark();if(!mark||collapsed(mark)||!event.clipboardData)return;
  const lines=readLines(),markers=listMarkers(lines),copy=[];
  for(let i=mark.start.line;i<=mark.end.line;i++){
    if(isBlockLine(lines[i]))continue;
    const a=i===mark.start.line?mark.start.offset:0,b=i===mark.end.line?mark.end.offset:Infinity;
    copy.push(withParagraph(sliceSegments(lines[i],a,b),a===0?paragraphOf(lines[i]):{}));
  }
  if(!copy.length)return;
  const plain=copy.map((line,i)=>(paragraphOf(line).list?markers[mark.start.line+i]+' ':'')+lineText(line)).join('\n');
  event.preventDefault();event.clipboardData.setData('text/plain',plain);
  event.clipboardData.setData('application/x-hinote-paragraphs+json',JSON.stringify({version:46,lines:copy}));
  if(cut)edit((ls,m)=>replaceText(ls,m,''));
}
function pasteEditorSelection(event){
  clearMarkerSelection();
  event.preventDefault();const data=event.clipboardData||window.clipboardData;
  try{
    const raw=data.getData('application/x-hinote-paragraphs+json');
    if(raw && raw.length<8*1024*1024){
      const parsed=JSON.parse(raw);if(parsed.version===46&&Array.isArray(parsed.lines)&&parsed.lines.length&&parsed.lines.length<=10000){
        const ids=new Map(),destination=paragraphOf(readLines()[bookmark()?.start.line]).list;
        const lines=parsed.lines.map(line=>{
          if(!Array.isArray(line)||line.some(s=>!s||typeof s.text!=='string'||s.tableId||s.objectId))throw Error('Invalid clipboard');
          const meta={...paragraphOf(line)};
          if(meta.list){const l=meta.list;if(!ids.has(l.id))ids.set(l.id,destination?.type===l.type?destination.id:newListId());meta.list={...l,id:ids.get(l.id),start:destination?.type===l.type?destination.start:l.start};}
          return withParagraph(line,meta);
        });
        edit((ls,mark)=>replaceText(ls,mark,'',false,lines));return;
      }
    }
  }catch(_){}
  insertText(data.getData('text/plain'));
}
function autoListAtCaret(){
  const mark=bookmark();if(!mark||!collapsed(mark))return;
  const lines=readLines(),line=lines[mark.start.line];if(isBlockLine(line)||paragraphOf(line).list)return;
  const p=parseListPrefix(lineText(line));if(!p||p.length!==mark.start.offset)return;
  checkpoint();const previous=paragraphOf(lines[mark.start.line-1]).list;
  const reuse=previous?.type===p.type && (['bullet','dash','asterisk'].includes(p.type)||p.start>1);
  const list={id:reuse?previous.id:newListId(),type:p.type,level:p.level,start:reuse?previous.start:p.start,markerStyle:styleAt(line,0)};
  lines[mark.start.line]=withParagraph(sliceSegments(line,p.length),{...paragraphOf(line),list,format:insertionStyle(mark)});
  const point={line:mark.start.line,offset:0};renderLines(lines);restoreSelection({start:point,end:{...point}});checkpoint();
}
function deleteStructure(backwards){
  const mark=bookmark();if(!mark)return false;const lines=readLines(),i=mark.start.line,line=lines[i];
  if(!collapsed(mark)){edit((ls,m)=>replaceText(ls,m,''));return true;}
  if(isBlockLine(line))return false;
  if(backwards&&mark.start.offset===0&&paragraphOf(line).list){
    edit((ls,m)=>{const meta={...paragraphOf(ls[i])};meta.listExit={indent:paragraphIndent(meta),marker:listMarkers(ls)[i],style:meta.list.markerStyle,stage:'body'};delete meta.list;ls[i]=withParagraph(ls[i],meta);return {lines:ls,selection:m};});return true;
  }
  if(backwards&&mark.start.offset===0&&(paragraphOf(line).listExit||paragraphOf(line).indent)){
    edit((ls,m)=>{const meta={...paragraphOf(ls[i])};if(meta.listExit?.stage==='body')meta.listExit={...meta.listExit,stage:'marker'};else if(meta.listExit){if(meta.listExit.indent>1)meta.listExit={...meta.listExit,indent:meta.listExit.indent-1};else delete meta.listExit;}else meta.indent=Math.max(0,meta.indent-1);ls[i]=withParagraph(ls[i],meta);return {lines:ls,selection:m};});return true;
  }
  const other=backwards?i-1:i+1;
  if((backwards?mark.start.offset===0:mark.start.offset===lineText(line).length)&&other>=0&&other<lines.length&&!isBlockLine(lines[other])){
    const a=backwards?other:i,b=a+1;edit((ls)=>replaceText(ls,{start:{line:a,offset:lineText(ls[a]).length},end:{line:b,offset:0}},''));return true;
  }return false;
}
function scrollCaretIntoView(root=editor){
  const selection=getSelection();if(!selection?.rangeCount||!root.contains(selection.focusNode))return;
  const range=document.createRange();range.setStart(selection.focusNode,selection.focusOffset);range.collapse(true);
  let rect=range.getBoundingClientRect();
  if(!rect.height){const n=selection.focusNode.nodeType===1?selection.focusNode:selection.focusNode.parentElement;rect=n.getBoundingClientRect();}
  for(let parent=root;parent&&parent!==document.body;parent=parent.parentElement){
    const css=getComputedStyle(parent);if(!/(auto|scroll)/.test(css.overflowY)||parent.scrollHeight<=parent.clientHeight)continue;
    const bounds=parent.getBoundingClientRect(),top=bounds.top+12,bottom=bounds.bottom-12;
    const delta=rect.bottom>bottom?rect.bottom-bottom:rect.top<top?rect.top-top:0;
    if(delta){parent.scrollTop+=delta;rect={...rect,top:rect.top-delta,bottom:rect.bottom-delta};}
  }
}
