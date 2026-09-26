'use strict';
const $ = id => document.getElementById(id);
const editor = $('editor');
const DEFAULT_STYLE = {scale: 1, color: '#000000', opacity: 100};
const MAX_CHARS = 200000, DRAFT_KEY = 'hinote-draft-v21';
const listRegex = /^([ \t]*)(•|\*|-|\d+[.)]|[A-Za-z]+[.)])([ \t]+|$)(.*)$/;
let savedSelection = null, ime = false, refreshTimer, draftTimer, historyTimer, toastTimer;
let revision = 0, previewRevision = -1, pageRequest = 0;
let composition = null, composing = false, exporting = false, currentPage = 0, zoom = 1;
let history = [], historyIndex = -1;

function bounded(value, min, max, fallback) {
  const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function cleanStyle(st = DEFAULT_STYLE) {
  return {scale: bounded(st.scale, .35, 2, 1),
    color: /^#[\da-f]{6}$/i.test(st.color || '') ? st.color.toUpperCase() : '#000000',
    opacity: bounded(st.opacity, 1, 100, 100)};
}
function sameStyle(a, b) { return a.scale === b.scale && a.color === b.color && a.opacity === b.opacity; }
function mergeSegments(segments) {
  const out = [];
  for (const seg of segments) {
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
function characterCount() { return editor.textContent.length + Math.max(0, editor.childElementCount - 1); }
function rangeInside(range) { return range && (range.commonAncestorContainer === editor || editor.contains(range.commonAncestorContainer)); }
function modelPoint(node, offset) {
  if (node === editor) {
    const i = Math.min(offset, editor.childNodes.length - 1);
    return {line: Math.max(0, i), offset: offset >= editor.childNodes.length ? (editor.lastChild?.textContent.length || 0) : 0};
  }
  let root = node;
  while (root.parentNode && root.parentNode !== editor) root = root.parentNode;
  const line = Math.max(0, Array.prototype.indexOf.call(editor.childNodes, root));
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
  if (sel && sel.rangeCount && rangeInside(sel.getRangeAt(0))) savedSelection = bookmark();
}
function domPoint(point) {
  const line = editor.childNodes[Math.min(point.line, editor.childNodes.length - 1)] || editor;
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let remaining = point.offset, node, last;
  while ((node = walker.nextNode())) {
    last = node; if (remaining <= node.length) return [node, remaining]; remaining -= node.length;
  }
  return last ? [last, last.length] : [line, 0];
}
function restoreSelection(mark) {
  if (!mark) return;
  const range = document.createRange(); range.setStart(...domPoint(mark.start)); range.setEnd(...domPoint(mark.end));
  editor.focus({preventScroll: true}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  savedSelection = bookmark();
}
function collapsed(mark) { return mark.start.line === mark.end.line && mark.start.offset === mark.end.offset; }
function normalizeRoots() {
  if ([...editor.childNodes].every(n => n.nodeType === 1 && /^(DIV|P)$/.test(n.tagName)) && editor.childNodes.length) return;
  const mark = bookmark(); renderLines(readLines()); restoreSelection(mark);
}
function checkpoint() {
  clearTimeout(historyTimer);
  const data = JSON.stringify(readLines()), selection = bookmark();
  if (history[historyIndex]?.data === data) { history[historyIndex].selection = selection; return; }
  history = history.slice(0, historyIndex + 1); history.push({data, selection});
  let bytes = history.reduce((sum, entry) => sum + entry.data.length * 2, 0);
  while (history.length > 2 && (history.length > 40 || bytes > 8 * 1024 * 1024)) bytes -= history.shift().data.length * 2;
  historyIndex = history.length - 1; controls();
}
function edit(operation) {
  if (exporting || ime) return;
  normalizeRoots(); checkpoint();
  const mark = bookmark() || {start: {line: 0, offset: 0}, end: {line: 0, offset: 0}};
  const result = operation(readLines(), mark); if (!result) return;
  const n = result.lines.reduce((sum, line) => sum + lineText(line).length, 0) + result.lines.length - 1;
  if (n > MAX_CHARS) { toast('El documento admite hasta 200000 caracteres'); return; }
  if (result.lines.length > 10000) { toast('El documento admite hasta 10000 párrafos'); return; }
  renderLines(result.lines); restoreSelection(result.selection || mark); checkpoint(); changed();
}
function undoRedo(direction) {
  if (exporting || ime) return;
  checkpoint(); const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next; const entry = history[next]; renderLines(JSON.parse(entry.data)); restoreSelection(entry.selection); changed();
}
function replaceText(lines, mark, text) {
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
  edit((lines, selection) => {
    for (const i of selectedLineIndexes(selection)) {
      const a = i === selection.start.line ? selection.start.offset : 0;
      const b = i === selection.end.line ? selection.end.offset : Infinity;
      lines[i] = mergeSegments([...sliceSegments(lines[i], 0, a), ...sliceSegments(lines[i], a, b).map(s => ({...s, ...patch})), ...sliceSegments(lines[i], b)]);
    }
    return {lines, selection};
  });
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
      const text = lineText(lines[i]), match = text.match(listRegex);
      let oldLength = match ? text.length - match[4].length : (text.match(/^[ \t]*/)[0].length);
      let prefix = match ? text.slice(0, oldLength) : text.slice(0, oldLength);
      const indent = Math.min(6, Math.floor((match ? match[1] : prefix).replace(/\t/g, '    ').length / 4));
      if (action === 'apply') prefix = '    '.repeat(indent) + markerFor($('listType').value, index) + ' ';
      else if (action === 'remove') prefix = '';
      else {
        const level = Math.max(0, Math.min(6, indent + (action === 'indent' ? 1 : -1)));
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
    line_grid_rows: Math.round(bounded($('lineRows').value, 1, 4, 1)), list_indent_squares: bounded($('listIndent').value, 0, 6, 1), auto_line_spacing: true, seed: 12345};
}
function serializeDocument() {
  const config = settings();
  return {paragraphs: readLines().map(line => {
    const text = lineText(line), match = text.match(listRegex);
    if (!match) return {segments: line};
    const prefix = text.length - match[4].length, style = styleAt(line, match[1].length);
    return {segments: sliceSegments(line, prefix), list: {marker: match[2], level: Math.min(6, Math.floor(match[1].replace(/\t/g, '    ').length / 4)),
      marker_scale: style.scale, marker_color: style.color, marker_opacity: style.opacity, base_indent_squares: config.list_indent_squares}};
  })};
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function saveDraft() {
  clearTimeout(draftTimer);
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({version: 21, lines: readLines(), title: $('noteTitle').value, settings: settings(), grid: $('gridCheck').checked, auto: $('autoPreview').checked}));
    $('draftStatus').textContent = 'Borrador guardado';
  } catch (_) { $('draftStatus').textContent = 'No se pudo guardar el borrador: revisa el espacio disponible'; }
}
function queueDraft() { $('draftStatus').textContent = 'Guardando…'; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!draft || draft.version !== 21 || !Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > 10000) return false;
    let count = draft.lines.length - 1, segments = 0;
    for (const line of draft.lines) {
      if (!Array.isArray(line)) return false;
      for (const s of line) { if (!s || typeof s.text !== 'string') return false; count += s.text.length; segments++; }
    }
    if (count > MAX_CHARS || segments > 20000) return false;
    renderLines(draft.lines); $('noteTitle').value = String(draft.title || 'Nueva nota').slice(0, 128);
    for (const [id, key, min, max, fallback] of [['letterSpacing','letter_spacing',-8,8,0],['wordSpacing','word_spacing',12,60,26],['lineRows','line_grid_rows',1,4,1],['listIndent','list_indent_squares',0,6,1]]) $(id).value = bounded(draft.settings?.[key], min, max, fallback);
    $('gridCheck').checked = draft.grid !== false; $('autoPreview').checked = draft.auto !== false; return true;
  } catch (_) { return false; }
}
function controls() {
  $('charCount').textContent = `${characterCount().toLocaleString('es')} caracteres`;
  $('exportBtn').disabled = exporting || composing || !composition || previewRevision !== revision;
  $('refreshBtn').disabled = exporting; $('cancelBtn').classList.toggle('hidden', !composing && !exporting);
  $('prevPage').disabled = exporting || composing || !composition || currentPage <= 0;
  $('nextPage').disabled = exporting || composing || !composition || currentPage >= composition.page_count - 1;
  editor.contentEditable = String(!exporting); $('noteTitle').disabled = exporting;
  document.querySelectorAll('.toolbar input,.toolbar select,.toolbar button').forEach(el => el.disabled = exporting);
  $('undoBtn').disabled = exporting || historyIndex <= 0; $('redoBtn').disabled = exporting || historyIndex >= history.length - 1;
}
function changed() {
  clearTimeout(refreshTimer); revision++; composing = false;
  if (window.AndroidBridge) AndroidBridge.invalidateCompose(revision);
  $('status').textContent = 'Vista pendiente…'; controls(); queueDraft();
  const n = characterCount();
  if (!ime && !exporting && $('autoPreview').checked && n <= 12000) refreshTimer = setTimeout(refreshPreview, n > 3000 ? 1500 : 700);
  else $('status').textContent = 'Pulsa Actualizar para ver los cambios';
}
function refreshPreview() {
  clearTimeout(refreshTimer); if (exporting || ime) return; saveDraft();
  if (!window.AndroidBridge) { $('status').textContent = 'El motor está disponible en la app Android'; return; }
  revision++; composing = true; $('status').textContent = 'Preparando páginas…'; controls();
  try { AndroidBridge.requestCompose(JSON.stringify(serializeDocument()), JSON.stringify(settings()), revision); }
  catch (e) { composing = false; $('status').textContent = 'Error'; toast(e.message); controls(); }
}
window.onComposeResult = (id, json) => {
  if (id !== revision) return; composing = false;
  try {
    const result = JSON.parse(json); if (result.error) throw new Error(result.error);
    composition = result; previewRevision = id; currentPage = Math.min(currentPage, result.page_count - 1);
    const warnings = result.warnings || []; $('warnings').replaceChildren();
    warnings.forEach(message => { const li = document.createElement('li'); li.textContent = message; $('warnings').append(li); });
    $('warningPanel').classList.toggle('hidden', warnings.length === 0); $('warningCount').textContent = `${warnings.length} avisos de escritura`;
    $('status').textContent = 'Cargando página…'; drawCurrent();
  } catch (e) { $('status').textContent = 'No se pudo generar'; toast(e.message); }
  controls();
};
window.onWorkProgress = (kind, id, page) => {
  if (kind === 'compose' && id === revision && composing) $('status').textContent = `Preparando página ${page}…`;
  if (kind === 'export' && exporting) $('status').textContent = `Guardando página ${page}…`;
};
function drawCurrent() {
  if (!composition || previewRevision !== revision || exporting) return;
  $('pageBadge').textContent = `Página ${currentPage + 1}/${composition.page_count}`;
  AndroidBridge.requestPage(composition.snapshot, currentPage, $('gridCheck').checked, ++pageRequest);
}
window.onPageResult = (id, snapshot, index, data, error) => {
  const fresh = () => id === pageRequest && composition?.snapshot === snapshot && index === currentPage && previewRevision === revision;
  if (!fresh()) return;
  if (error) { $('status').textContent = 'Error de vista'; toast(error); return; }
  const img = new Image();
  img.onload = () => { if (!fresh()) return; const canvas = $('previewCanvas'); canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0); applyZoom(); $('status').textContent = 'Listo'; };
  img.onerror = () => { if (fresh()) $('status').textContent = 'No se pudo abrir la vista'; }; img.src = data;
};
function applyZoom() {
  const canvas = $('previewCanvas'), shell = $('canvasShell'); canvas.style.display = 'block';
  canvas.style.width = `${675 * zoom}px`; canvas.style.height = `${1080 * zoom}px`;
  shell.style.width = `${675 * zoom}px`; shell.style.height = `${1080 * zoom}px`; shell.style.flexShrink = '0'; $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}
function exportNote() {
  if (exporting || composing || !composition || previewRevision !== revision) { toast('Actualiza la vista antes de guardar'); return; }
  clearTimeout(refreshTimer); saveDraft(); exporting = true; controls(); $('status').textContent = 'Elige dónde guardar…';
  try { AndroidBridge.requestSave(composition.snapshot, $('noteTitle').value || 'Nueva nota', $('gridCheck').checked); }
  catch (e) { window.onExportComplete(false, e.message); }
}
window.onExportStage = message => { if (exporting) $('status').textContent = message; };
window.onExportComplete = (ok, message) => { exporting = false; controls(); $('status').textContent = ok ? 'Guardado' : 'Guardado detenido'; toast(message); };

// Keep toolbar selections as model offsets, including a newly collapsed caret.
document.addEventListener('selectionchange', captureSelection);
document.querySelector('.toolbar').addEventListener('pointerdown', captureSelection, true);
$('tabs').addEventListener('click', event => {
  if (event.target.tagName !== 'BUTTON') return;
  [...$('tabs').children].forEach(b => b.classList.toggle('active', b === event.target));
  ['text','lists','page'].forEach(name => $('panel' + name[0].toUpperCase() + name.slice(1)).classList.toggle('hidden', event.target.dataset.tab !== name));
});
$('colorPick').addEventListener('input', () => $('hexInput').value = $('colorPick').value.toUpperCase());
$('hexInput').addEventListener('change', () => { const v = $('hexInput').value.trim().replace(/^#?/, '#'); if (/^#[\da-f]{6}$/i.test(v)) $('colorPick').value = v; });
$('sizeSel').addEventListener('change', () => applyStyle({scale: bounded($('sizeSel').value, 35, 200, 100) / 100}));
$('applyFormat').onclick = () => {
  const color = $('hexInput').value.trim().replace(/^#?/, '#');
  if (!/^#[\da-f]{6}$/i.test(color)) { toast('Escribe un color hexadecimal de 6 dígitos'); return; }
  applyStyle({color: color.toUpperCase(), opacity: bounded($('opacity').value, 1, 100, 100)});
};
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
['letterSpacing','wordSpacing','lineRows','listIndent','autoPreview'].forEach(id => $(id).addEventListener('change', changed));
$('gridCheck').addEventListener('change', () => { queueDraft(); drawCurrent(); }); $('noteTitle').addEventListener('input', queueDraft);
$('refreshBtn').onclick = refreshPreview; $('exportBtn').onclick = exportNote;
$('cancelBtn').onclick = () => {
  if (exporting) { AndroidBridge.cancelExport(); $('status').textContent = 'Cancelando…'; }
  else { clearTimeout(refreshTimer); revision++; AndroidBridge.invalidateCompose(revision); composing = false; $('status').textContent = 'Generación cancelada'; controls(); }
};
$('prevPage').onclick = () => { if (currentPage > 0) { currentPage--; drawCurrent(); controls(); } };
$('nextPage').onclick = () => { if (composition && currentPage < composition.page_count - 1) { currentPage++; drawCurrent(); controls(); } };
$('zoomOut').onclick = () => { zoom = Math.max(.25, zoom - .1); applyZoom(); };
$('zoomIn').onclick = () => { zoom = Math.min(2, zoom + .1); applyZoom(); };
$('zoomFit').onclick = () => { zoom = Math.max(.25, Math.min(2, ($('previewWrap').clientWidth - 32) / 675)); applyZoom(); };
window.addEventListener('resize', applyZoom); window.addEventListener('pagehide', saveDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
if (!restoreDraft()) renderLines([[]]);
checkpoint(); applyZoom(); changed();
