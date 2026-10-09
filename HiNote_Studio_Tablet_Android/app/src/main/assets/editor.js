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
    opacity: bounded(st.opacity, 1, 100, 100), thickness: Math.round(bounded(st.thickness,0,10,0))};
}
function sameStyle(a, b) { return a.scale === b.scale && a.color === b.color && a.opacity === b.opacity && (a.thickness||0) === (b.thickness||0); }
function mergeSegments(segments) {
  const out = [];
  for (const seg of segments) {
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
  return cleanStyle(line[line.length - 1]);
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
      const segments = []; walk(node, DEFAULT_STYLE, segments); lines.push(mergeSegments(segments));
    } else walk(node, DEFAULT_STYLE, loose);
  }
  if (loose.length) lines.push(mergeSegments(loose));
  return lines.length ? lines : [[]];
}
function rgba(hex, opacity) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${opacity / 100})`;
}
function renderLines(lines) {
  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    if(TableEditor.isLine(line)){fragment.append(TableEditor.block(line));continue;}
    if(MathGraphEditor.isLine(line)){fragment.append(MathGraphEditor.block(line));continue;}
    const div = document.createElement('div'); div.className = 'line';
    for (const s of mergeSegments(line)) {
      if (sameStyle(s, DEFAULT_STYLE)) div.append(document.createTextNode(s.text));
      else {
        const span = document.createElement('span'); Object.assign(span.dataset, cleanStyle(s));
        span.style.fontSize = `${17 * s.scale}px`; span.style.color = rgba(s.color, s.opacity);
        span.textContent = s.text; div.append(span);
      }
    }
    if (!div.childNodes.length) div.append(document.createElement('br'));
    fragment.append(div);
  }
  editor.replaceChildren(fragment);
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
    return {start: modelPoint(r.startContainer, r.startOffset), end: modelPoint(r.endContainer, r.endOffset)};
  }
  return savedSelection ? JSON.parse(JSON.stringify(savedSelection)) : null;
}
function captureSelection() {
  const sel = getSelection();
  if (sel && sel.rangeCount && rangeInside(sel.getRangeAt(0))) {
    savedSelection = bookmark();
    if (!document.activeElement?.closest('#panelText')) syncTextControls();
    syncListControls();
  }
}
function selectionStyles() {
  const mark=bookmark(),lines=readLines();if(!mark)return [];
  if(collapsed(mark))return isBlockLine(lines[mark.start.line])?[]:[styleAt(lines[mark.start.line],Math.max(0,mark.start.offset-1))];
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
}
function syncListControls(){
  if(document.activeElement===$('listIndent'))return;
  const mark=bookmark();if(!mark)return;const lines=readLines();
  const values=selectedLineIndexes(mark).filter(i=>!isBlockLine(lines[i])).map(i=>Math.min(12,Math.floor((lineText(lines[i]).match(/^[ \t]*/)[0]).replace(/\t/g,'    ').length/4)));
  if(values.length){$('listIndent').value=values.every(v=>v===values[0])?values[0]:'';$('listIndent').placeholder='Mixta';}
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
  if(focus)editor.focus({preventScroll: true}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  savedSelection = bookmark();
  if(focus){syncTextControls();syncListControls();}
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
  renderLines(result.lines); restoreSelection(result.selection || mark,!keepControlFocus);
  if(held){held.focus({preventScroll:true});if(fieldRange)held.setSelectionRange(...fieldRange);}
  checkpoint(); changed();
}
function undoRedo(direction) {
  if (exporting || CalibrationUI.isBusy() || TableEditor.isOpen() || MathGraphEditor.isOpen() || NotebookUI.isBusy() || ime || ImageEditor.isBusy()) return;
  ImageEditor.finishGesture(false);
  checkpoint(); const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next; const entry = history[next], data=JSON.parse(entry.data), sameText=JSON.stringify(readLines())===JSON.stringify(data.lines)&&JSON.stringify(TableEditor.state().tables)===JSON.stringify(data.tables||{})&&JSON.stringify(MathGraphEditor.state().mathObjects)===JSON.stringify(data.mathObjects||{});
  TableEditor.restore(data);MathGraphEditor.restore(data);renderLines(data.lines); ImageEditor.restore(data); ImageEditor.select(entry.imageSelection); restoreSelection(entry.selection);
  if(sameText){ImageEditor.modified();drawCurrent();}else changed();
}
function replaceText(lines, mark, text) {
  if(isBlockLine(lines[mark.start.line]))mark={...mark,start:{...mark.start,offset:0}};
  if(isBlockLine(lines[mark.end.line]))mark={...mark,end:{...mark.end,offset:1}};
  const {start, end} = mark, before = sliceSegments(lines[start.line], 0, start.offset);
  const after = sliceSegments(lines[end.line], end.offset), st = styleAt(lines[start.line], start.offset);
  const pieces = text.replace(/\r\n?/g, '\n').split('\n');
  const replacement = pieces.map(piece => piece ? [{text: piece, ...st}] : []);
  replacement[0] = mergeSegments([...before, ...replacement[0]]);
  const caret = {line: start.line + pieces.length - 1, offset: (pieces.length === 1 ? start.offset : 0) + pieces[pieces.length - 1].length};
  replacement[replacement.length - 1] = mergeSegments([...replacement[replacement.length - 1], ...after]);
  lines.splice(start.line, end.line - start.line + 1, ...replacement);
  return {lines, selection: {start: caret, end: {...caret}}};
}
function insertText(text) {
  if (text.length > MAX_CHARS) { toast('El texto supera 200000 caracteres'); return; }
  edit((lines, mark) => replaceText(lines, mark, text));
}
function selectedLineIndexes(mark) {
  const last = mark.end.line > mark.start.line && mark.end.offset === 0 ? mark.end.line - 1 : mark.end.line;
  return Array.from({length: last - mark.start.line + 1}, (_, i) => mark.start.line + i);
}
function applyStyle(patch) {
  const mark = bookmark(); if (!mark || collapsed(mark)) { toast('Selecciona texto primero'); return; }
  const focused=document.activeElement,keep=!!focused?.closest('#panelText');
  edit((lines, selection) => {
    for (const i of selectedLineIndexes(selection)) {
      if(isBlockLine(lines[i]))continue;
      const a = i === selection.start.line ? selection.start.offset : 0;
      const b = i === selection.end.line ? selection.end.offset : Infinity;
      lines[i] = mergeSegments([...sliceSegments(lines[i], 0, a), ...sliceSegments(lines[i], a, b).map(s => ({...s, ...patch})), ...sliceSegments(lines[i], b)]);
    }
    return {lines, selection};
  },keep);
  if(!keep)syncTextControls();
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
function modifyLists(action) {
  edit((lines, selection) => {
    selectedLineIndexes(selection).forEach((i, index) => {
      if(isBlockLine(lines[i]))return;
      const text = lineText(lines[i]), match = text.match(listRegex);
      let oldLength = match ? text.length - match[4].length : (text.match(/^[ \t]*/)[0].length);
      let prefix = match ? text.slice(0, oldLength) : text.slice(0, oldLength);
      const indent = Math.min(12, Math.floor((match ? match[1] : prefix).replace(/\t/g, '    ').length / 4));
      if (action === 'apply') prefix = '    '.repeat(indent) + markerFor($('listType').value, index) + ' ';
      else if (action === 'remove') prefix = '';
      else {
        const level = action==='setIndent'?Math.round(bounded($('listIndent').value,0,12,indent)):Math.max(0, Math.min(12, indent + (action === 'indent' ? 1 : -1)));
        prefix = '    '.repeat(level) + (match ? match[2] + ' ' : '');
      }
      const st = styleAt(lines[i], Math.max(0, oldLength));
      lines[i] = mergeSegments([{text: prefix, ...st}, ...sliceSegments(lines[i], oldLength)]);
      for (const point of [selection.start, selection.end]) if (point.line === i) point.offset = point.offset < oldLength ? Math.min(prefix.length, point.offset) : point.offset + prefix.length - oldLength;
    });
    return {lines, selection};
  });
}
function enter() {
  edit((lines, mark) => {
    if(isBlockLine(lines[mark.start.line])){const at=mark.start.line+1;lines.splice(at,0,[]);return {lines,selection:{start:{line:at,offset:0},end:{line:at,offset:0}}};}
    const text = lineText(lines[mark.start.line]), match = text.match(listRegex);
    if (match && !match[4].trim() && collapsed(mark)) {
      lines[mark.start.line] = []; const point = {line: mark.start.line, offset: 0};
      return {lines, selection: {start: point, end: {...point}}};
    }
    const prefix = match && mark.start.offset >= text.length - match[4].length ? match[1] + nextMarker(match[2]) + ' ' : '';
    return replaceText(lines, mark, '\n' + prefix);
  });
}
function changeCase(mode) {
  const mark = bookmark(); if (!mark || collapsed(mark)) { toast('Selecciona texto primero'); return; }
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
      lines[i] = mergeSegments([...sliceSegments(lines[i], 0, a), ...selected, ...sliceSegments(lines[i], b)]);
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
  return {paragraphs: readLines().map(line => {
    if(TableEditor.isLine(line))return {type:'table',table:TableEditor.get(line[0].tableId)};
    if(MathGraphEditor.isLine(line)){const object=MathGraphEditor.get(line[0].objectId);return {type:object.kind,object};}
    const text = lineText(line), match = text.match(listRegex);
    if (!match) return {segments: line};
    const prefix = text.length - match[4].length, style = styleAt(line, match[1].length);
    const indent=Math.min(12,Math.floor(match[1].replace(/\t/g,'    ').length/4));
    return {segments: sliceSegments(line, prefix), list: {marker: match[2], level: Math.min(6,indent),
      marker_scale: style.scale, marker_color: style.color, marker_opacity: style.opacity, marker_thickness: style.thickness, base_indent_squares: Math.max(0,indent-6)}};
  })};
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function saveDraft() {
  ImageEditor.finishGesture(false);
  clearTimeout(draftTimer);
  try {
    const raw=JSON.stringify({version:38,lines:readLines(),...ImageEditor.state(),...TableEditor.state(),...MathGraphEditor.state(),title:$('noteTitle').value,settings:settings(),grid:$('gridCheck').checked,auto:$('autoPreview').checked});
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
    if (!draft || ![21,23,25,27,30,31,32,38].includes(draft.version) || !Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > 10000) return false;
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
    renderLines(draft.lines); $('noteTitle').value = String(draft.title || 'Nueva nota').slice(0, 128);
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
  $('prevPage').disabled = exporting || composing || !composition || currentPage <= 0;
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
$('tabs').addEventListener('click', event => {
  if (event.target.tagName !== 'BUTTON') return;
  [...$('tabs').children].forEach(b => b.classList.toggle('active', b === event.target));
  ['text','lists','page','images','tables','math','save','calibration'].forEach(name => $('panel' + name[0].toUpperCase() + name.slice(1)).classList.toggle('hidden', event.target.dataset.tab !== name));
  ImageEditor.mode(event.target.dataset.tab==='images');
  TableEditor.mode(event.target.dataset.tab==='tables');
  MathGraphEditor.mode(event.target.dataset.tab==='math');
});
$('colorPick').addEventListener('input', () => {const color=$('colorPick').value.toUpperCase();$('hexInput').value=color;applyStyle({color});});
$('hexInput').addEventListener('input', () => { const color=$('hexInput').value.trim().replace(/^#?/, '#').toUpperCase();if(/^#[\da-f]{6}$/i.test(color)){$('colorPick').value=color;applyStyle({color});} });
$('opacity').addEventListener('input',()=>{if($('opacity').value!==''&&$('opacity').validity.valid)applyStyle({opacity:Number($('opacity').value)});});
$('sizeSel').addEventListener('change', () => {if($('sizeSel').value!=='mixed')applyStyle({scale: bounded($('sizeSel').value, 35, 200, 100) / 100});});
$('thicknessSel').addEventListener('change', () => {if($('thicknessSel').value!=='mixed')applyStyle({thickness: Math.round(bounded($('thicknessSel').value,0,10,0))});});
$('caseSel').addEventListener('change', () => { const mode = $('caseSel').value; if (mode) changeCase(mode); $('caseSel').value = ''; });
for (const [id, action] of [['applyList','apply'],['removeList','remove'],['indentBtn','indent'],['outdentBtn','outdent']]) $(id).onclick = () => modifyLists(action);
$('undoBtn').onclick = () => undoRedo(-1); $('redoBtn').onclick = () => undoRedo(1);
editor.addEventListener('keydown', event => {
  if (ime || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); undoRedo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
  } else if (event.key === 'Enter') { event.preventDefault(); enter(); }
  else if (event.key === 'Tab') { event.preventDefault(); modifyLists(event.shiftKey ? 'outdent' : 'indent'); }
});
editor.addEventListener('beforeinput', event => {
  if (ime || event.isComposing) return;
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undoRedo(event.inputType === 'historyUndo' ? -1 : 1); }
  else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') { event.preventDefault(); enter(); }
  else if (event.inputType === 'insertText' && characterCount() >= MAX_CHARS && (!bookmark() || collapsed(bookmark()))) { event.preventDefault(); toast('El documento admite hasta 200000 caracteres'); }
});
editor.addEventListener('input', () => { if (ime) return; captureSelection(); changed(); clearTimeout(historyTimer); historyTimer = setTimeout(checkpoint, 500); });
editor.addEventListener('compositionstart', () => { ime = true; clearTimeout(refreshTimer); });
editor.addEventListener('compositionend', () => { ime = false; captureSelection(); checkpoint(); changed(); });
editor.addEventListener('paste', event => { event.preventDefault(); insertText((event.clipboardData || window.clipboardData).getData('text/plain')); });
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
  const originalModes=new WeakMap();let suppress=false,mode='auto',touch=null,touchRevision=0;
  const fieldSelector='textarea,[contenteditable],input:not([type]),input[type=text],input[type=number],input[type=search],input[type=email],input[type=password],input[type=url],input[type=tel]';
  function typingField(target){
    const node=target instanceof Element?target.closest(fieldSelector):null;
    if(!node||node.disabled||node.readOnly||node.closest('[inert]')||node.getClientRects().length===0)return null;
    return node.matches('input,textarea')||node.isContentEditable?node:null;
  }
  function updateFields(){
    document.querySelectorAll(fieldSelector).forEach(node=>{
      if(suppress){if(!originalModes.has(node))originalModes.set(node,node.getAttribute('inputmode'));if(node.getAttribute('inputmode')!=='none')node.setAttribute('inputmode','none');}
      else if(originalModes.has(node)){const mode=originalModes.get(node);if(mode===null)node.removeAttribute('inputmode');else node.setAttribute('inputmode',mode);originalModes.delete(node);}
    });
  }
  window.onKeyboardState=raw=>{try{
    const data=JSON.parse(raw);suppress=data.suppress===true;mode=data.mode||'auto';$('keyboardMode').value=mode;
    if(suppress){touch=null;touchRevision++;}updateFields();
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
  $('keyboardMode').onchange=()=>{if(window.AndroidBridge?.setKeyboardMode)AndroidBridge.setKeyboardMode($('keyboardMode').value);else toast('La detección del teclado está disponible en Android.');};
  new MutationObserver(updateFields).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['contenteditable']});
  if(window.AndroidBridge?.getKeyboardState)onKeyboardState(AndroidBridge.getKeyboardState());
})();
