'use strict';
const $ = id => document.getElementById(id);
const editor = $('editor');
const DEFAULT_STYLE = {scale: 1, color: '#000000', opacity: 100, thickness: 0};
const MAX_CHARS = 200000, DRAFT_KEY = 'hinote-draft-v23';
const listRegex = /^([ \t]*)(•|\*|-|\d+[.)]|[A-Za-z]+[.)])([ \t]+|$)(.*)$/;
let savedSelection = null, ime = false, refreshTimer, draftTimer, historyTimer, toastTimer;
let revision = 0, previewRevision = -1, pageRequest = 0;
let composition = null, composing = false, exporting = false, currentPage = 0, zoom = 1;
let qualityTimer, requestedPreview=null, shownPreview=null;
const previewResolution=()=>Math.min(2,Math.max(1,Math.ceil(zoom*(window.devicePixelRatio||1))));
let history = [], historyIndex = -1;
let folderBusy = false, exportFolderState = {configured:false,label:''};
let saveRequested = false;
let activeProfile = 'original';
let elementClipboard = null, pendingExportMode = 'save', currentExportMode = 'save';
const isBlockLine=line=>TableEditor.isLine(line)||MathGraphEditor.isLine(line);

function bounded(value, min, max, fallback) {
  const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function cleanStyle(st = DEFAULT_STYLE) {
  return {scale: bounded(st.scale, .35, 2, 1),
    color: /^#[\da-f]{6}$/i.test(st.color || '') ? st.color.toUpperCase() : '#000000',
    opacity: bounded(st.opacity, 1, 100, 100), thickness: Math.round(bounded(st.thickness,0,10,0)),
    ...(['sub','sup'].includes(st.script)?{script:st.script}:{}),
    ...(['upper','lower','title','sentence','toggle'].includes(st.caseMode)?{caseMode:st.caseMode}:{})};
}
function sameStyle(a, b) { return a.scale === b.scale && a.color === b.color && a.opacity === b.opacity && (a.thickness||0) === (b.thickness||0) && (a.script||'normal') === (b.script||'normal') && (a.caseMode||'normal') === (b.caseMode||'normal'); }
function mergeSegments(segments) {
  const out = [];
  for (const seg of segments) {
    if(seg.paragraph){out.push({text:'',paragraph:seg.paragraph});continue;}
    if (seg.tableId) { out.push({text:'\uFFFC',tableId:seg.tableId}); continue; }
    if (seg.objectId) { out.push({text:'\uFFFC',objectId:seg.objectId}); continue; }
    if (!seg.text) continue;
    const s = {text: String(seg.text), ...cleanStyle(seg)}, last = out[out.length - 1];
    if (last && sameStyle(last, s)) last.text += s.text; else out.push(s);
  }
  return out;
}
function lineText(line) { return line.map(s => s.text).join(''); }
function sliceSegments(line, start, end = Infinity) {
  let pos = 0; const out = [];
  for (const s of line) {
    const a = Math.max(0, start - pos), b = Math.min(s.text.length, end - pos);
    if (b > a) out.push({...s, text: s.text.slice(a, b)});
    pos += s.text.length;
    if (pos >= end) break;
  }
  return out;
}
function styleAt(line, offset) {
  let pos = 0;
  for (const s of line) { pos += s.text.length; if (offset < pos) return cleanStyle(s); }
  return cleanStyle(line.filter(s=>!s.paragraph).at(-1)||paragraphOf(line).format);
}
function readLines() {
  const lines = []; let loose = [];
  function walk(node, style, out) {
    if (node.nodeType === Node.TEXT_NODE) { out.push({text: node.nodeValue, ...style}); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === 'BR') return;
    const st = cleanStyle({...style, ...node.dataset});
    for (const child of node.childNodes) walk(child, st, out);
  }
  for (const node of editor.childNodes) {
    if (node.nodeType === 1 && (node.dataset.tableId || node.dataset.objectId)) {
      if(loose.length){lines.push(mergeSegments(loose));loose=[];}
      lines.push([{text:'\uFFFC',...(node.dataset.tableId?{tableId:node.dataset.tableId}:{objectId:node.dataset.objectId})}]);continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE && /^(DIV|P)$/.test(node.tagName)) {
      if (loose.length) { lines.push(mergeSegments(loose)); loose = []; }
      const segments = []; walk(node, DEFAULT_STYLE, segments);
      let meta={};try{meta=JSON.parse(node.dataset.paragraph||'{}');}catch(_){}
      lines.push(withParagraph(segments,meta));
    } else walk(node, DEFAULT_STYLE, loose);
  }
  if (loose.length) lines.push(mergeSegments(loose));
  return lines.length ? lines : [[]];
}
function rgba(hex, opacity) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${opacity / 100})`;
}
function renderParagraph(line,marker='') {
  const div=document.createElement('div');div.className='line';decorateParagraph(div,line,marker);
  for(const s of mergeSegments(line)){
    if(s.paragraph)continue;
    if(sameStyle(s,DEFAULT_STYLE))div.append(document.createTextNode(s.text));
    else{
      const span=document.createElement('span');Object.assign(span.dataset,cleanStyle(s));
      span.style.fontSize=`${s.scale*(s.script? .65:1)}em`;
      if(s.script)span.style.verticalAlign=s.script==='sup'?'super':'sub';
      span.style.color=rgba(s.color.toUpperCase()==='#000000'?'#E4EDF0':s.color,s.opacity);
      span.style.fontWeight=s.thickness?String(Math.min(850,400+s.thickness*35)):'400';
      span.textContent=s.text;div.append(span);
    }
  }
  if(!div.childNodes.length || lineText(line).endsWith('\n'))div.append(document.createElement('br'));
  return div;
}
function renderLines(lines) {
  const fragment=document.createDocumentFragment(),markers=listMarkers(lines);
  lines.forEach((line,i)=>{
    if(TableEditor.isLine(line))fragment.append(TableEditor.block(line));
    else if(MathGraphEditor.isLine(line))fragment.append(MathGraphEditor.block(line));
    else fragment.append(renderParagraph(line,markers[i]));
  });editor.replaceChildren(fragment);
}
function characterCount() { return readLines().reduce((n,l)=>n+(isBlockLine(l)?0:lineText(l).length),0)+Math.max(0,editor.childElementCount-1)+TableEditor.count()+MathGraphEditor.count(); }
function rangeInside(range) { return range && (range.commonAncestorContainer === editor || editor.contains(range.commonAncestorContainer)); }
function modelPoint(node, offset) {
  if (node === editor) {
    const i = Math.min(offset, editor.childNodes.length - 1);
    return {line: Math.max(0, i), offset: offset >= editor.childNodes.length ? (editor.lastChild?.textContent.length || 0) : 0};
  }
  let root = node;
  while (root.parentNode && root.parentNode !== editor) root = root.parentNode;
  const line = Math.max(0, Array.prototype.indexOf.call(editor.childNodes, root));
  if(root.dataset?.tableId||root.dataset?.objectId)return {line,offset:0};
  const range = document.createRange(); range.setStart(root, 0); range.setEnd(node, offset);
  return {line, offset: range.toString().length};
}
function bookmark() {
  const sel = getSelection();
  if (sel && sel.rangeCount && rangeInside(sel.getRangeAt(0))) {
    const r = sel.getRangeAt(0);
    const anchor=modelPoint(sel.anchorNode,sel.anchorOffset),focus=modelPoint(sel.focusNode,sel.focusOffset);
    const backward=anchor.line>focus.line||anchor.line===focus.line&&anchor.offset>focus.offset;
    return {start: modelPoint(r.startContainer, r.startOffset), end: modelPoint(r.endContainer, r.endOffset),...(backward?{backward:true}:{})};
  }
  return savedSelection ? JSON.parse(JSON.stringify(savedSelection)) : null;
}
function captureSelection() {
  const sel = getSelection();
  if (sel && sel.rangeCount && rangeInside(sel.getRangeAt(0))) {
    savedSelection = bookmark();
    if(!ime && typingState && (!collapsed(savedSelection)||!pointEqual(typingState.point,savedSelection.start)))typingState=null;
    if (!document.activeElement?.closest('#panelText,#colorDialog')) syncTextControls();
    syncListControls();
  }
}
function selectionStyles() {
  const mark=bookmark(),lines=readLines();if(!mark)return [];
  if(collapsed(mark))return isBlockLine(lines[mark.start.line])?[]:[insertionStyle(mark,lines)];
  return selectedLineIndexes(mark).flatMap(i=>isBlockLine(lines[i])?[]:sliceSegments(lines[i],i===mark.start.line?mark.start.offset:0,i===mark.end.line?mark.end.offset:Infinity).map(cleanStyle));
}
function syncTextControls() {
  const styles=selectionStyles();if(!styles.length)return;
  const common=key=>styles.every(s=>s[key]===styles[0][key])?styles[0][key]:null;
  for(const [id,key,factor] of [['sizeSel','scale',100],['thicknessSel','thickness',1]]){
    const control=$(id),value=common(key);control.querySelectorAll('[data-selection-value]').forEach(o=>o.remove());
    const text=value===null?'mixed':String(Math.round(value*factor*100)/100);
    if(![...control.options].some(o=>o.value===text)){const option=new Option(value===null?'Mixto':text,text);option.dataset.selectionValue='true';control.add(option);}
    control.value=text;control.dataset.mixed=String(value===null);
  }
  const opacity=common('opacity'),color=common('color');
  $('opacity').value=opacity??'';$('opacity').placeholder=opacity===null?'Mixta':'';
  $('hexInput').value=color??'';$('hexInput').placeholder=color===null?'Mixto':'';
  $('colorPick').value=color||'#000000';$('colorPick').dataset.mixed=String(color===null);
  for(const [id,value] of [['subscriptBtn','sub'],['superscriptBtn','sup']]){const active=styles.every(s=>s.script===value),mixed=!active&&styles.some(s=>s.script===value);$(id).setAttribute('aria-pressed',mixed?'mixed':String(active));$(id).classList.toggle('active',active);}
  $('caseSel').value=common('caseMode')||'';
}
function syncListControls(){
  if(document.activeElement===$('listIndent'))return;
  const mark=bookmark();if(!mark)return;const lines=readLines();
  const values=selectedLineIndexes(mark).filter(i=>!isBlockLine(lines[i])).map(i=>paragraphIndent(paragraphOf(lines[i])));
  if(values.length){$('listIndent').value=values.every(v=>v===values[0])?values[0]:'';$('listIndent').placeholder='Mixta';}
  const list=paragraphOf(lines[mark.start.line]).list;
  if(list){$('listType').value=list.type;$('listStart').value=list.start;}
  for(const id of ['continueList','restartList','setListStart'])$(id).disabled=!list;

}
function domPoint(point) {
  const line = editor.childNodes[Math.min(point.line, editor.childNodes.length - 1)] || editor;
  if(line.dataset?.tableId||line.dataset?.objectId)return [editor,Math.max(0,[...editor.childNodes].indexOf(line))];
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let remaining = point.offset, node, last;
  while ((node = walker.nextNode())) {
    last = node; if (remaining <= node.length) return [node, remaining]; remaining -= node.length;
  }
  return last ? [last, last.length] : [line, 0];
}
function restoreSelection(mark, focus=true) {
  if (!mark) return;
  const range = document.createRange(); range.setStart(...domPoint(mark.start)); range.setEnd(...domPoint(mark.end));
  if(focus)editor.focus({preventScroll: true}); const sel = getSelection(); sel.removeAllRanges();
  if(mark.backward)sel.setBaseAndExtent(...domPoint(mark.end),...domPoint(mark.start));else sel.addRange(range);
  savedSelection = bookmark();
  if(focus){syncTextControls();syncListControls();}
}
function resumeEditor(mark=bookmark()) {
  if(!mark||!editor.isContentEditable||editor.closest('[inert]'))return false;
  restoreSelection(mark);return true;
}
function collapsed(mark) { return mark.start.line === mark.end.line && mark.start.offset === mark.end.offset; }
function normalizeRoots() {
  if ([...editor.childNodes].every(n => n.nodeType === 1 && /^(DIV|P)$/.test(n.tagName)) && editor.childNodes.length) return;
  const mark = bookmark(); renderLines(readLines()); restoreSelection(mark);
}
function checkpoint() {
  clearTimeout(historyTimer);
  const data = JSON.stringify({lines:readLines(),...ImageEditor.state(),...TableEditor.state(),...MathGraphEditor.state()}), selection = bookmark();
  const imageSelection=ImageEditor.selected()?.id||null;
  if (history[historyIndex]?.data === data) { history[historyIndex].selection = selection; history[historyIndex].imageSelection=imageSelection; return; }
  history = history.slice(0, historyIndex + 1); history.push({data, selection,imageSelection});
  let bytes = history.reduce((sum, entry) => sum + entry.data.length * 2, 0);
  while (history.length > 2 && (history.length > 40 || bytes > 8 * 1024 * 1024)) bytes -= history.shift().data.length * 2;
  historyIndex = history.length - 1; controls();
}
function edit(operation, keepControlFocus=false) {
  if (exporting || CalibrationUI.isBusy() || TableEditor.isOpen() || MathGraphEditor.isOpen() || NotebookUI.isBusy() || ime) return;
  const held=keepControlFocus?document.activeElement:null;
  const fieldRange=held&&typeof held.selectionStart==='number'?[held.selectionStart,held.selectionEnd]:null;
  normalizeRoots(); checkpoint();
  const mark = bookmark() || {start: {line: 0, offset: 0}, end: {line: 0, offset: 0}};
  const result = operation(readLines(), mark); if (!result) return;
  const n = result.lines.reduce((sum, line) => sum + lineText(line).length, 0) + result.lines.length - 1;
  if (n + TableEditor.count()+MathGraphEditor.count() > MAX_CHARS) { toast('El documento admite hasta 200000 caracteres'); return; }
  if (result.lines.length > 10000) { toast('El documento admite hasta 10000 párrafos'); return; }
  renderLines(result.lines);
  if(result.typingStyle)setTypingStyle(result.typingStyle,(result.selection||mark).start);
  restoreSelection(result.selection || mark,!keepControlFocus);
  if(!keepControlFocus)scrollCaretIntoView();
  if(held){held.focus({preventScroll:true});if(fieldRange)held.setSelectionRange(...fieldRange);}
  checkpoint(); changed();
}
function undoRedo(direction) {
  if (exporting || CalibrationUI.isBusy() || TableEditor.isOpen() || MathGraphEditor.isOpen() || NotebookUI.isBusy() || ime || ImageEditor.isBusy()) return;
  ImageEditor.finishGesture(false);
  checkpoint(); const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next; const entry = history[next], data=JSON.parse(entry.data), sameText=JSON.stringify(readLines())===JSON.stringify(data.lines)&&JSON.stringify(TableEditor.state().tables)===JSON.stringify(data.tables||{})&&JSON.stringify(MathGraphEditor.state().mathObjects)===JSON.stringify(data.mathObjects||{});
  typingState=null;TableEditor.restore(data);MathGraphEditor.restore(data);renderLines(data.lines); ImageEditor.restore(data); ImageEditor.select(entry.imageSelection); restoreSelection(entry.selection);
  if(sameText){ImageEditor.modified();drawCurrent();}else changed();
}
function replaceText(lines, mark, text, soft=false, rich=null) {
  if(isBlockLine(lines[mark.start.line]))mark={...mark,start:{...mark.start,offset:0}};
  if(isBlockLine(lines[mark.end.line]))mark={...mark,end:{...mark.end,offset:1}};
  const {start,end}=mark,before=sliceSegments(lines[start.line],0,start.offset),after=sliceSegments(lines[end.line],end.offset);
  const st=insertionStyle(mark,lines),meta=paragraphOf(lines[start.line]);
  const pieces=soft?[text]:text.replace(/\r\n?/g,'\n').split('\n');
  let replacement=rich||pieces.map(piece=>withParagraph(piece?[{text:caseText(piece,st.caseMode,lineText(lines[start.line]).slice(0,start.offset)),...st}]:[],{...meta,...(!piece?{format:st}:{})}));
  replacement[0]=withParagraph([...before,...replacement[0].filter(s=>!s.paragraph)],start.offset?meta:paragraphOf(replacement[0]));
  const last=replacement.length-1,point={line:start.line+last,offset:lineText(replacement[last]).length};
  replacement[last]=withParagraph([...replacement[last].filter(s=>!s.paragraph),...after],paragraphOf(replacement[last]));
  lines.splice(start.line,end.line-start.line+1,...replacement);
  return {lines,selection:{start:point,end:{...point}},typingStyle:st};
}
function insertText(text) {
  if (text.length > MAX_CHARS) { toast('El texto supera 200000 caracteres'); return; }
  edit((lines, mark) => {
    const result=replaceText(lines,mark,text),before=result.lines.map(lineText),last=result.selection.start.line;
    // Plain clipboard list markers become structure too, including when the
    // destination already belongs to a list. Do not duplicate a literal number.
    if(text!=='\t')for(let i=mark.start.line;i<=last;i++){
      if(i===mark.start.line&&mark.start.offset)continue;
      const line=result.lines[i],meta=paragraphOf(line),prefix=parseListPrefix(lineText(line));
      if(meta.list&&prefix)result.lines[i]=withParagraph(sliceSegments(line,prefix.length),meta);
    }
    result.lines=migrateTextLists(result.lines);
    const removed=before[last].length-lineText(result.lines[last]).length;
    result.selection.start.offset=Math.max(0,result.selection.start.offset-removed);result.selection.end={...result.selection.start};return result;
  });
}
function selectedLineIndexes(mark) {
  const last = mark.end.line > mark.start.line && mark.end.offset === 0 ? mark.end.line - 1 : mark.end.line;
  return Array.from({length: last - mark.start.line + 1}, (_, i) => mark.start.line + i);
}
function applyStyle(patch) {
  const mark=bookmark();if(!mark)return;
  // A format command returns to the document. Only editable value fields and
  // the open color dialog retain focus while the user is entering a value.
  const focused=document.activeElement,keep=!!focused?.closest('#colorDialog')||!!(focused?.matches('input')&&focused.closest('#panelText'));
  if(collapsed(mark)){
    if(isBlockLine(readLines()[mark.start.line]))return;
    setTypingStyle({...insertionStyle(mark),...patch},mark.start);
    const node=editor.children[mark.start.line],line=readLines()[mark.start.line];
    if(!lineText(line)){const meta={...paragraphOf(line),format:typingState.style};decorateParagraph(node,withParagraph(line,meta),node.dataset.marker||'');queueDraft();}
    if(!keep)resumeEditor(mark);syncTextControls();return;
  }
  typingState=null;
  edit((lines,selection)=>({lines:patchRuns(lines,selection,patch),selection}),keep);
  syncTextControls();
}
function alphaMarker(number, upper = false) {
  let out = ''; do { number--; out = String.fromCharCode((upper ? 65 : 97) + number % 26) + out; number = Math.floor(number / 26); } while (number > 0); return out;
}
function nextMarker(marker) {
  if (/^\d+[.)]$/.test(marker)) return (Number(marker.slice(0, -1)) + 1) + marker.slice(-1);
  if (/^[A-Za-z]+[.)]$/.test(marker)) {
    const number = [...marker.slice(0, -1).toLowerCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 96, 0);
    return alphaMarker(number + 1, marker[0] === marker[0].toUpperCase()) + marker.slice(-1);
  }
  return marker;
}
function markerFor(type, i) {
  if (type === 'bullet') return '•'; if (type === 'dash') return '-'; if (type === 'asterisk') return '*';
  const ending = type.endsWith('paren') ? ')' : '.';
  return (type.startsWith('alpha') ? alphaMarker(i + 1, type.includes('upper')) : String(i + 1)) + ending;
}
function modifyLists(action){changeLists(action);}
function enter(soft=false) {
  edit((lines,mark)=>{
    if(isBlockLine(lines[mark.start.line])){const at=mark.start.line+1;lines.splice(at,0,[]);return {lines,selection:{start:{line:at,offset:0},end:{line:at,offset:0}}};}
    const meta=paragraphOf(lines[mark.start.line]);
    if(!soft && meta.list && !lineText(lines[mark.start.line]).trim() && collapsed(mark)){
      const next={...meta};if(meta.list.level>0)next.list={...meta.list,level:meta.list.level-1};else delete next.list;
      lines[mark.start.line]=withParagraph([],next);return {lines,selection:mark,typingStyle:insertionStyle(mark,lines)};
    }
    return replaceText(lines,mark,'\n',soft);
  });
}
function changeCase(mode) {
  const mark=bookmark();if(!mark)return;if(collapsed(mark)){applyStyle({caseMode:mode||'normal'});return;}
  edit((lines, selection) => {
    let wordStart = true, sentenceStart = true;
    for (const i of selectedLineIndexes(selection)) {
      if(isBlockLine(lines[i]))continue;
      const a = i === selection.start.line ? selection.start.offset : 0;
      const b = i === selection.end.line ? selection.end.offset : lineText(lines[i]).length;
      const selected = sliceSegments(lines[i], a, b).map(s => ({...s, text: [...s.text].map(c => {
        let out = c;
        if (mode === 'upper') out = c.toUpperCase();
        if (mode === 'lower') out = c.toLowerCase();
        if (mode === 'toggle') out = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
        if (mode === 'title') out = wordStart ? c.toUpperCase() : c.toLowerCase();
        if (mode === 'sentence') out = sentenceStart ? c.toUpperCase() : c.toLowerCase();
        if (/\p{L}/u.test(c)) sentenceStart = false;
        else if (/[.!?]/.test(c)) sentenceStart = true;
        wordStart = !/[\p{L}\p{N}]/u.test(c); return out;
      }).join('')}));
      const length = selected.reduce((n, s) => n + s.text.length, 0);
      lines[i] = withParagraph([...sliceSegments(lines[i], 0, a), ...selected.map(s=>({...s,caseMode:mode})), ...sliceSegments(lines[i], b)],paragraphOf(lines[i]));
      if (i === selection.end.line) selection.end.offset += length - (b - a);
      wordStart = true;
    }
    return {lines, selection};
  });
}
function settings() {
  return {letter_spacing: bounded($('letterSpacing').value, -8, 8, 0), word_spacing: bounded($('wordSpacing').value, 12, 60, 26),
    line_grid_rows: Math.round(bounded($('lineRows').value, 1, 4, 1)), list_indent_squares: 0, auto_line_spacing: true, seed: 12345, profile: activeProfile};
}
function serializeDocument() {
  const config = settings();
  const lines=readLines(),markers=listMarkers(lines);
  return {paragraphs:lines.map((line,i)=>{
    if(TableEditor.isLine(line))return {type:'table',table:TableEditor.get(line[0].tableId)};
    if(MathGraphEditor.isLine(line)){const object=MathGraphEditor.get(line[0].objectId);return {type:object.kind,object};}
    const meta=paragraphOf(line),l=meta.list,segments=line.filter(s=>!s.paragraph);
    if(!l)return {segments,...(meta.indent?{indent_squares:meta.indent}:{})};
    const indent=paragraphIndent(meta),style=l.markerStyle;
    return {segments,list:{id:l.id,type:l.type,marker:markers[i],level:l.level,indent_squares:indent,base_indent_squares:0,
      marker_scale:style.scale,marker_color:style.color,marker_opacity:style.opacity,marker_thickness:style.thickness}};
  })};
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function saveDraft() {
  ImageEditor.finishGesture(false);
  clearTimeout(draftTimer);
  try {
    const raw=JSON.stringify({version:46,lines:readLines(),...ImageEditor.state(),...TableEditor.state(),...MathGraphEditor.state(),title:$('noteTitle').value,settings:settings(),grid:$('gridCheck').checked,auto:$('autoPreview').checked});
    const nativeSaved=window.AndroidBridge?.saveDraft ? AndroidBridge.saveDraft(raw) : false;
    try{localStorage.setItem(DRAFT_KEY,raw);}catch(e){if(!nativeSaved)throw e;}
    $('draftStatus').textContent = 'Borrador guardado';
  } catch (_) { $('draftStatus').textContent = 'No se pudo guardar el borrador: revisa el espacio disponible'; }
}
function queueDraft() { $('draftStatus').textContent = 'Guardando…'; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
function restoreDraft() {
  try {
    const native=window.AndroidBridge?.getDraft?AndroidBridge.getDraft():'';
    const draft = JSON.parse(native||localStorage.getItem(DRAFT_KEY)||localStorage.getItem('hinote-draft-v21'));
    if (!draft || ![21,23,25,27,30,31,32,38,46].includes(draft.version) || !Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > 10000) return false;
    let count = draft.lines.length - 1, segments = 0;
    for (const line of draft.lines) {
      if (!Array.isArray(line)) return false;
      for (const s of line) { if (!s || typeof s.text !== 'string') return false; count += s.text.length; segments++; }
    }
    if (count > MAX_CHARS || segments > 20000) return false;
    ImageEditor.restore(draft);
    TableEditor.restore(draft);
    MathGraphEditor.restore(draft);
    activeProfile = /^(original|[a-f0-9]{32})$/.test(draft.settings?.profile||'')?draft.settings.profile:'original';
    // V35 added a hidden global base to each list level. Encode the actual
    // indentation in the paragraph so level 0 now really reaches the margin.
    if(draft.version<38){const base=Math.floor(bounded(draft.settings?.list_indent_squares,0,6,1));draft.lines=draft.lines.map(line=>!isBlockLine(line)&&listRegex.test(lineText(line))?mergeSegments([{text:'    '.repeat(base),...styleAt(line,0)},...line]):line);}
    if(draft.version<46)draft.lines=migrateTextLists(draft.lines);
    renderLines(draft.lines);typingState=null; $('noteTitle').value = String(draft.title || 'Nueva nota').slice(0, 128);
    for (const [id, key, min, max, fallback] of [['letterSpacing','letter_spacing',-8,8,0],['wordSpacing','word_spacing',12,60,26],['lineRows','line_grid_rows',1,4,1],['listIndent','list_indent_squares',0,6,1]]) $(id).value = bounded(draft.settings?.[key], min, max, fallback);
    $('gridCheck').checked = draft.grid !== false; $('autoPreview').checked = draft.auto !== false; return true;
  } catch (_) { return false; }
}
function controls() {
  const calibrationBusy=CalibrationUI.isBusy()||NotebookUI.isBusy();
  $('charCount').textContent = `${characterCount().toLocaleString('es')} caracteres`;
  $('exportBtn').disabled = calibrationBusy || folderBusy || exporting || saveRequested || ImageEditor.isBusy();
  $('exportNotesBtn').disabled = $('exportBtn').disabled;
  $('refreshBtn').disabled = exporting || saveRequested || calibrationBusy || folderBusy; $('cancelBtn').classList.toggle('hidden', !composing && !exporting);
  $('prevPage').disabled = exporting || composing || currentPage <= 0;
  $('nextPage').disabled = exporting || composing || currentPage >= ImageEditor.count() - 1;
  editor.contentEditable = String(!exporting && !calibrationBusy); $('noteTitle').disabled = exporting || calibrationBusy;
  document.querySelectorAll('.toolbar input,.toolbar select,.toolbar button').forEach(el => el.disabled = exporting || folderBusy);
  $('undoBtn').disabled = exporting || ImageEditor.isBusy() || historyIndex <= 0; $('redoBtn').disabled = exporting || ImageEditor.isBusy() || historyIndex >= history.length - 1;
  ImageEditor.updateControls();
  $('chooseFolder').disabled = exporting || ImageEditor.isBusy();
  $('clearFolder').disabled = exporting || ImageEditor.isBusy() || !exportFolderState.configured;
  if(calibrationBusy || folderBusy)document.querySelectorAll('.toolbar input,.toolbar select,.toolbar button').forEach(el=>el.disabled=true);
  CalibrationUI.controls();
  MathGraphEditor.updateControls();
  window.StudioUI?.ribbon();window.StudioUI?.meta();
}
function showExportFolder(raw) {
  const data=JSON.parse(raw || '{}');
  exportFolderState={configured:data.configured===true,label:String(data.label||'Carpeta elegida')};
  $('folderLabel').textContent=exportFolderState.configured?exportFolderState.label:'Se preguntará dónde guardar';
  $('folderHint').textContent=exportFolderState.configured?'Se recuerda al cerrar la app. Si el nombre existe, se guarda otra copia.':'Elige una carpeta para guardar directamente en ella.';
}
function changeExportFolder(clear=false) {
  if(exporting||CalibrationUI.isBusy()||ImageEditor.isBusy())return;
  if(!window.AndroidBridge?.requestExportFolder){toast('Configura la carpeta desde la app Android');return;}
  saveDraft();folderBusy=true;controls();
  try{clear?AndroidBridge.clearExportFolder():AndroidBridge.requestExportFolder();}
  catch(e){folderBusy=false;controls();toast(e.message);}
}
window.onExportFolder=(raw,error)=>{
  folderBusy=false;
  try{showExportFolder(raw);}catch(e){toast('No se pudo leer la carpeta elegida');}
  controls();if(error)toast(error);
};
function changed() {
  saveRequested=false;clearTimeout(refreshTimer); clearTimeout(qualityTimer); revision++; composing = false;
  if (window.AndroidBridge) AndroidBridge.invalidateCompose(revision);
  $('status').textContent = 'Vista pendiente…'; controls(); queueDraft();
  const n = characterCount();
  if (!ime && !exporting && !CalibrationUI.isBusy() && !NotebookUI.isBusy() && !MathGraphEditor.isOpen() && $('autoPreview').checked && n <= 12000) refreshTimer = setTimeout(refreshPreview, n > 3000 ? 1500 : 700);
  else $('status').textContent = 'Pulsa Actualizar para ver los cambios';
}
function refreshPreview() {
  clearTimeout(refreshTimer); if (exporting || CalibrationUI.isBusy() || NotebookUI.isBusy() || MathGraphEditor.isOpen() || TableEditor.isOpen() || folderBusy || ime) return; saveDraft();
  if (!window.AndroidBridge) { $('status').textContent = 'El motor está disponible en la app Android'; return; }
  revision++; composing = true; $('status').textContent = 'Preparando páginas…'; controls();
  try { AndroidBridge.requestCompose(JSON.stringify(serializeDocument()), JSON.stringify(settings()), revision); }
  catch (e) { composing = false; $('status').textContent = 'Error'; toast(e.message); controls(); }
}
window.onComposeResult = (id, json) => {
  if (id !== revision) return; composing = false;
  try {
    const result = JSON.parse(json); if (result.error) throw new Error(result.error);
    composition = result; previewRevision = id; currentPage = Math.min(currentPage, ImageEditor.count() - 1);
    MathGraphEditor.applyMeasurements(result);
    const warnings = result.warnings || []; $('warnings').replaceChildren();
    warnings.forEach(message => { const li = document.createElement('li'); li.textContent = message; $('warnings').append(li); });
    $('warningPanel').classList.toggle('hidden', warnings.length === 0); $('warningCount').textContent = `${warnings.length} avisos de escritura`;
    $('status').textContent = 'Cargando página…'; drawCurrent();
  } catch (e) { saveRequested=false;$('status').textContent = 'No se pudo generar'; toast(e.message); }
  controls();
  if(saveRequested){saveRequested=false;exportNote(pendingExportMode);}
};
window.onWorkProgress = (kind, id, page) => {
  if (kind === 'compose' && id === revision && composing) $('status').textContent = `Preparando página ${page}…`;
  if (kind === 'export' && exporting) $('status').textContent = `Guardando página ${page}…`;
  if (kind === 'calibration') window.onCalibrationProgress(id,`Analizando página ${page}…`);
};
function drawCurrent() {
  clearTimeout(qualityTimer);requestedPreview=null;shownPreview=null;
  ImageEditor.finishGesture(false);ImageEditor.render();
  TableEditor.render();
  MathGraphEditor.render();
  $('pageBadge').textContent = `Página ${currentPage + 1}/${ImageEditor.count()}`;
  if(exporting||CalibrationUI.isBusy())return;
  if(!composition || currentPage >= composition.page_count){
    pageRequest++;const c=$('previewCanvas');c.getContext('2d').clearRect(0,0,c.width,c.height);applyZoom();return;
  }
  if (previewRevision !== revision) {const c=$('previewCanvas');c.getContext('2d').clearRect(0,0,c.width,c.height);return;}
  const c=$('previewCanvas');c.getContext('2d').clearRect(0,0,c.width,c.height);
  requestPreview();
}
function requestPreview(){
  if(!window.AndroidBridge||!composition||currentPage>=composition.page_count||previewRevision!==revision||exporting||CalibrationUI.isBusy()||composing)return;
  const snapshot=composition.snapshot,index=currentPage,resolution=previewResolution();
  if([requestedPreview,shownPreview].some(p=>p?.snapshot===snapshot&&p.index===index&&p.resolution>=resolution))return;
  requestedPreview={snapshot,index,resolution,id:++pageRequest};
  try{
    if(typeof AndroidBridge.requestPageHD==='function')AndroidBridge.requestPageHD(snapshot,index,$('gridCheck').checked,pageRequest,resolution);
    else AndroidBridge.requestPage(snapshot,index,$('gridCheck').checked,pageRequest);
  }catch(e){requestedPreview=null;$('status').textContent='Error de vista';toast(e.message);}
}
function schedulePreviewQuality(){clearTimeout(qualityTimer);qualityTimer=setTimeout(requestPreview,220);}
window.onPageResult = (id, snapshot, index, data, error) => {
  const fresh = () => id === pageRequest && composition?.snapshot === snapshot && index === currentPage && previewRevision === revision;
  if (!fresh()) return;
  if (error) { requestedPreview=null;$('status').textContent = 'Error de vista'; toast(error); return; }
  const img = new Image();
  const release=()=>{img.onload=null;img.onerror=null;img.src='';};
  img.onload = () => { if (!fresh()){release();return;} const canvas = $('previewCanvas'); canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0);shownPreview=requestedPreview;requestedPreview=null;release(); applyZoom(); $('status').textContent = 'Listo'; };
  img.onerror = () => { if (fresh()){requestedPreview=null;$('status').textContent = 'No se pudo abrir la vista';}release(); }; img.src = data;
};
function applyZoom() {
  const canvas = $('previewCanvas'), shell = $('canvasShell'); canvas.style.display = 'block';
  canvas.style.width = `${675 * zoom}px`; canvas.style.height = `${1080 * zoom}px`;
  shell.style.width = `${675 * zoom}px`; shell.style.height = `${1080 * zoom}px`; shell.style.flexShrink = '0'; $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
  ImageEditor.render();
  TableEditor.render();
  MathGraphEditor.render();
  schedulePreviewQuality();
}
function exportNote(mode='save') {
  if (exporting || CalibrationUI.isBusy() || NotebookUI.isBusy() || MathGraphEditor.isOpen() || TableEditor.isOpen() || folderBusy || ImageEditor.isBusy() || ime) return;
  if(!window.AndroidBridge){toast('Guarda desde la app Android.');return;}
  if(composing||!composition||previewRevision!==revision){pendingExportMode=mode;saveRequested=true;if(!composing)refreshPreview();if(!composing)saveRequested=false;controls();return;}
  clearTimeout(refreshTimer); saveDraft(); exporting = true;currentExportMode=mode; controls(); $('status').textContent = mode==='notes'?'Preparando cuaderno para Notes…':exportFolderState.configured?'Guardando en la carpeta elegida…':'Elige dónde guardar…';
  try { const method=mode==='notes'?'requestOpenNotes':'requestSave';AndroidBridge[method](composition.snapshot, $('noteTitle').value || 'Nueva nota', $('gridCheck').checked,ImageEditor.exportJSON(),ImageEditor.count()); }
  catch (e) { window.onExportComplete(false, e.message); }
}
window.onExportStage = message => { if (exporting) $('status').textContent = message; };
window.onExportComplete = (ok, message) => { exporting = false; controls(); $('status').textContent = ok ? (currentExportMode==='notes'?'Enviado a Notes':'Guardado') : 'Exportación detenida'; toast(message); };

// Keep toolbar selections as model offsets, including a newly collapsed caret.
document.addEventListener('selectionchange', captureSelection);
document.querySelector('.toolbar').addEventListener('pointerdown', captureSelection, true);
$('tabs').addEventListener('click', event => {const tab=event.target.closest('[data-tab]');if(tab)window.StudioUI?.setTab(tab.dataset.tab);});
$('colorPick').addEventListener('input', () => {const color=$('colorPick').value.toUpperCase();$('hexInput').value=color;applyStyle({color});});
$('hexInput').addEventListener('input', () => { const color=$('hexInput').value.trim().replace(/^#?/, '#').toUpperCase();if(/^#[\da-f]{6}$/i.test(color)){$('colorPick').value=color;applyStyle({color});} });
$('opacity').addEventListener('input',()=>{if($('opacity').value!==''&&$('opacity').validity.valid)applyStyle({opacity:Number($('opacity').value)});});
$('sizeSel').addEventListener('change', () => {if($('sizeSel').value!=='mixed')applyStyle({scale: bounded($('sizeSel').value, 35, 200, 100) / 100});});
$('thicknessSel').addEventListener('change', () => {if($('thicknessSel').value!=='mixed')applyStyle({thickness: Math.round(bounded($('thicknessSel').value,0,10,0))});});
$('caseSel').addEventListener('change', () => { const mode = $('caseSel').value; changeCase(mode); });
for (const [id, action] of [['applyList','apply'],['removeList','remove'],['indentBtn','indent'],['outdentBtn','outdent'],['continueList','continue'],['restartList','restart'],['setListStart','start']]) $(id).onclick = () => modifyLists(action);
$('subscriptBtn').onclick=()=>toggleScript('sub');$('superscriptBtn').onclick=()=>toggleScript('sup');
$('undoBtn').onclick = () => undoRedo(-1); $('redoBtn').onclick = () => undoRedo(1);
editor.addEventListener('keydown', event => {
  if (ime || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); undoRedo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
  } else if (event.key === 'Enter') { event.preventDefault(); enter(event.shiftKey); }
  else if (event.key === 'Tab') { event.preventDefault();const mark=bookmark();if(mark&&paragraphOf(readLines()[mark.start.line]).list&&(mark.start.offset===0||!collapsed(mark)))modifyLists(event.shiftKey?'outdent':'indent');else insertText('\t'); }
  else if ((event.key==='Backspace'||event.key==='Delete') && deleteStructure(event.key==='Backspace'))event.preventDefault();
});
editor.addEventListener('beforeinput', event => {
  if (ime || event.isComposing) return;
  if(event.inputType?.startsWith('insert')||event.inputType?.startsWith('delete'))startNativeEdit();
  if(event.inputType?.startsWith('delete') && event.cancelable && deleteStructure(event.inputType.includes('Backward'))){event.preventDefault();return;}
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undoRedo(event.inputType === 'historyUndo' ? -1 : 1); }
  else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') { event.preventDefault(); enter(event.inputType==='insertLineBreak'); }
  else if (event.inputType === 'insertText' && characterCount() >= MAX_CHARS && (!bookmark() || collapsed(bookmark()))) { event.preventDefault(); toast('El documento admite hasta 200000 caracteres'); }
});
editor.addEventListener('input', event => { if (ime || event.isComposing) return; finishNativeEdit();autoListAtCaret();refreshListMarkers();captureSelection();scrollCaretIntoView();changed(); clearTimeout(historyTimer); historyTimer = setTimeout(checkpoint, 500); });
editor.addEventListener('compositionstart', () => { startNativeEdit();ime = true; clearTimeout(refreshTimer); });
editor.addEventListener('compositionend', () => { ime = false;finishNativeEdit();captureSelection();scrollCaretIntoView();checkpoint();changed(); });
editor.addEventListener('paste',pasteEditorSelection);
editor.addEventListener('copy',e=>copyEditorSelection(e));editor.addEventListener('cut',e=>copyEditorSelection(e,true));
editor.addEventListener('drop', event => event.preventDefault());
['letterSpacing','wordSpacing','lineRows','autoPreview'].forEach(id => $(id).addEventListener('change', changed));
$('listIndent').addEventListener('change',()=>{if($('listIndent').value!=='')modifyLists('setIndent');});
$('gridCheck').addEventListener('change', () => { queueDraft(); drawCurrent(); }); $('noteTitle').addEventListener('input', queueDraft);
$('refreshBtn').onclick = refreshPreview; $('exportBtn').onclick = ()=>exportNote(); $('exportNotesBtn').onclick=()=>exportNote('notes');
$('chooseFolder').onclick=()=>changeExportFolder();$('clearFolder').onclick=()=>changeExportFolder(true);
$('cancelBtn').onclick = () => {
  saveRequested=false;
  if (exporting) { AndroidBridge.cancelExport(); $('status').textContent = 'Cancelando…'; }
  else { clearTimeout(refreshTimer); revision++; AndroidBridge.invalidateCompose(revision); composing = false; $('status').textContent = 'Generación cancelada'; controls(); }
};
$('prevPage').onclick = () => { if (currentPage > 0) { currentPage--; drawCurrent(); controls(); } };
$('nextPage').onclick = () => { if (currentPage < ImageEditor.count() - 1) { currentPage++; drawCurrent(); controls(); } };
$('zoomOut').onclick = () => { zoom = Math.max(.25, zoom - .1); applyZoom(); };
$('zoomIn').onclick = () => { zoom = Math.min(2, zoom + .1); applyZoom(); };
$('zoomFit').onclick = () => { zoom = Math.max(.25, Math.min(2, ($('previewWrap').clientWidth - 32) / 675)); applyZoom(); };
window.addEventListener('resize', applyZoom); window.addEventListener('pagehide', saveDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
const tableOverlay=document.createElement('div');tableOverlay.id='tableOverlay';$('canvasShell').append(tableOverlay);
if (!restoreDraft()) renderLines([[]]);
try{if(window.AndroidBridge?.getExportFolder)showExportFolder(AndroidBridge.getExportFolder());}catch(e){toast('No se pudo leer la carpeta de guardado');}
checkpoint(); applyZoom(); changed();
CalibrationUI.init();
TableEditor.init();
MathGraphEditor.init();
NotebookUI.init();

// Physical keys continue reaching the editable fields; only their soft-keyboard
// hint changes. Preserve decimal/text hints when returning to virtual input.
(()=>{
  const originalModes=new WeakMap();let suppress=false,nativeGate=false,mode='auto',touch=null,touchRevision=0;
  const fieldSelector='textarea,[contenteditable],input:not([type]),input[type=text],input[type=number],input[type=search],input[type=email],input[type=password],input[type=url],input[type=tel]';
  function typingField(target){
    const node=target instanceof Element?target.closest(fieldSelector):null;
    if(!node||node.disabled||node.readOnly||node.closest('[inert]')||node.getClientRects().length===0)return null;
    return node.matches('input,textarea')||node.isContentEditable?node:null;
  }
  function updateFields(){
    document.querySelectorAll(fieldSelector).forEach(node=>{
      if(suppress&&!nativeGate){if(!originalModes.has(node))originalModes.set(node,node.getAttribute('inputmode'));if(node.getAttribute('inputmode')!=='none')node.setAttribute('inputmode','none');}
      else if(originalModes.has(node)){const mode=originalModes.get(node);if(mode===null)node.removeAttribute('inputmode');else node.setAttribute('inputmode',mode);originalModes.delete(node);}
    });
  }
  window.onKeyboardState=raw=>{try{
    const data=JSON.parse(raw);suppress=data.suppress===true;nativeGate=data.nativeGate===true;mode=data.mode||'auto';$('keyboardMode').value=mode;
    if(suppress){touch=null;touchRevision++;}updateFields();window.StudioUI?.syncSelects?.();
  }catch(_){}};
  window.hinoteKeyboardCanShow=()=>!suppress&&mode!=='physical'&&!!typingField(document.activeElement);
  document.addEventListener('pointerdown',event=>{
    touch=null;touchRevision++;
    if((event.pointerType!=='touch'&&event.pointerType!=='pen')||!event.isPrimary||mode==='physical')return;
    const node=typingField(event.target);if(!node)return;
    touch={id:event.pointerId,node,x:event.clientX,y:event.clientY,moved:false};
    // Restore the field's original hint before its default focus/selection.
    // A mouse click never enters this path, even when it focuses the same field.
    suppress=false;updateFields();window.AndroidBridge?.beginTouchKeyboard?.();
  },true);
  document.addEventListener('pointermove',event=>{if(touch&&event.pointerId===touch.id&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>12)touch.moved=true;},true);
  document.addEventListener('pointercancel',()=>{touch=null;touchRevision++;},true);
  document.addEventListener('pointerup',event=>{
    if(!touch||event.pointerId!==touch.id)return;
    const gesture=touch,request=touchRevision;touch=null;if(gesture.moved)return;
    requestAnimationFrame(()=>{
      if(request===touchRevision&&hinoteKeyboardCanShow()&&typingField(document.activeElement)===gesture.node)
        window.AndroidBridge?.requestTouchKeyboard?.();
    });
  },true);
  $('keyboardMode').onchange=()=>{mode=$('keyboardMode').value;touch=null;touchRevision++;if(window.AndroidBridge?.setKeyboardMode)AndroidBridge.setKeyboardMode(mode);else toast('La detección del teclado está disponible en Android.');};
  new MutationObserver(updateFields).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['contenteditable']});
  if(window.AndroidBridge?.getKeyboardState)onKeyboardState(AndroidBridge.getKeyboardState());
})();
