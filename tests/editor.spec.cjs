/* Browser regressions for the tablet editor. Native bridge is explicitly mocked. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'HiNote_Studio_Tablet_Android/app/src/main/assets');
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
async function setup(page, text = '') {
  await page.evaluate(text => {
    $('autoPreview').checked = false;
    renderLines(text.split('\n').map(text => text ? [{text, ...DEFAULT_STYLE}] : []));
    savedSelection = null; history = []; historyIndex = -1;
    const point = {line: 0, offset: 0}; restoreSelection({start: point, end: {...point}});
    checkpoint(); changed(); window.bridgeCalls = [];
  }, text);
}
async function select(page, start, end = start) {
  await page.evaluate(({start, end}) => restoreSelection({start, end}), {start, end});
}
async function lines(page) { return page.evaluate(() => readLines().map(lineText)); }
async function paste(page, text) {
  await page.evaluate(text => {
    const data = new DataTransfer(); data.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
  }, text);
}

test('Multiline paste replaces selection and leaves caret before suffix', async page => {
  await setup(page, 'abcDEFghi'); await select(page, {line:0,offset:3}, {line:0,offset:6});
  await paste(page, 'uno\ndos\n'); assert.deepEqual(await lines(page), ['abcuno','dos','ghi']);
  assert.deepEqual(await page.evaluate(() => bookmark().start), {line:2,offset:0});
  await page.keyboard.type('X'); assert.deepEqual(await lines(page), ['abcuno','dos','Xghi']);
});
test('Enter in the middle preserves following text and cursor position', async page => {
  await setup(page, 'abcdef'); await select(page,{line:0,offset:3});
  await page.keyboard.press('Enter'); await page.keyboard.type('X'); assert.deepEqual(await lines(page),['abc','Xdef']);
});
test('Lists continue, terminate empty items and advance alphabetic markers', async page => {
  await setup(page,'9. primero'); await select(page,{line:0,offset:10}); await page.keyboard.press('Enter');
  assert.deepEqual(await lines(page),['9. primero','10. ']); await page.keyboard.press('Enter');
  assert.deepEqual(await lines(page),['9. primero','']); assert.equal(await page.evaluate(() => nextMarker('z)')), 'aa)');
});
test('Repeated size, color, opacity and list operations preserve formatting', async page => {
  await setup(page,'Texto importante'); await select(page,{line:0,offset:0},{line:0,offset:16});
  await page.selectOption('#sizeSel','150'); await page.selectOption('#sizeSel','200');
  await page.fill('#hexInput','#336699'); await page.fill('#opacity','45');
  await page.selectOption('#sizeSel','100');
  assert.deepEqual(await page.evaluate(() => readLines()[0]),[{text:'Texto importante',scale:1,color:'#336699',opacity:45,thickness:0}]);
  await page.click('[data-tab="lists"]'); await page.click('#applyList'); await page.click('#indentBtn'); await page.click('#outdentBtn'); await page.click('#removeList');
  assert.deepEqual(await page.evaluate(() => readLines()[0]),[{text:'Texto importante',scale:1,color:'#336699',opacity:45,thickness:0}]);
});
test('A selection ending at the next line start excludes that line', async page => {
  await setup(page,'uno\ndos'); await select(page,{line:0,offset:0},{line:1,offset:0}); await page.selectOption('#sizeSel','150');
  assert.equal(await page.evaluate(() => readLines()[0][0].scale),1.5); assert.equal(await page.evaluate(() => readLines()[1][0].scale),1);
  await page.click('[data-tab="lists"]'); await page.click('#applyList'); assert.deepEqual(await lines(page),['• uno','dos']);
});
test('Collapsing the caret clears the old formatting selection', async page => {
  await setup(page,'uno dos'); await select(page,{line:0,offset:0},{line:0,offset:3}); await page.selectOption('#sizeSel','150');
  await select(page,{line:0,offset:7}); await page.selectOption('#sizeSel','200');
  assert.equal(await page.evaluate(() => readLines()[0][0].scale),1.5);
  assert.equal(await page.evaluate(() => readLines()[0][1].scale),1);
});
test('Spanish case conversion spans style boundaries', async page => {
  await setup(page,'árbol él ÑANDÚ'); await select(page,{line:0,offset:0},{line:0,offset:2}); await page.selectOption('#sizeSel','150');
  await select(page,{line:0,offset:0},{line:0,offset:14}); await page.selectOption('#caseSel','title');
  assert.deepEqual(await lines(page),['Árbol Él Ñandú']); await page.selectOption('#caseSel','sentence');
  assert.deepEqual(await lines(page),['Árbol él ñandú']);
});
test('Undo and redo restore text and formatting', async page => {
  await setup(page,'Hola'); await select(page,{line:0,offset:0},{line:0,offset:4}); await page.selectOption('#sizeSel','150');
  await page.click('#undoBtn'); assert.equal(await page.evaluate(() => readLines()[0][0].scale),1);
  await page.click('#redoBtn'); assert.equal(await page.evaluate(() => readLines()[0][0].scale),1.5);
  await select(page,{line:0,offset:4}); await paste(page,' mundo'); assert.deepEqual(await lines(page),['Hola mundo']);
  await page.keyboard.press('Control+z'); assert.deepEqual(await lines(page),['Hola']);
  await page.keyboard.press('Control+y'); assert.deepEqual(await lines(page),['Hola mundo']);
});
test('Draft reload preserves text, style, title and page settings', async page => {
  await setup(page,'Mi borrador'); await select(page,{line:0,offset:0},{line:0,offset:11}); await page.selectOption('#sizeSel','150');
  await page.fill('#noteTitle','Nota persistente'); await page.click('[data-tab="page"]'); await page.fill('#wordSpacing','35');
  await page.evaluate(() => saveDraft()); await page.reload(); await page.waitForSelector('#editor .line');
  assert.deepEqual(await lines(page),['Mi borrador']); assert.equal(await page.evaluate(() => readLines()[0][0].scale),1.5);
  assert.equal(await page.inputValue('#noteTitle'),'Nota persistente'); assert.equal(await page.inputValue('#wordSpacing'),'35');
});
test('Stale composition cannot export; a fresh snapshot is immutable during export', async page => {
  await setup(page,'Hola'); await page.click('#refreshBtn');
  const old = await page.evaluate(() => bridgeCalls.filter(c => c[0]==='compose').at(-1)[3]);
  await paste(page,'Otro'); await page.evaluate(id => onComposeResult(id,JSON.stringify({snapshot:'old',page_count:2,warnings:[]})),old);
  assert.equal(await page.isDisabled('#exportBtn'),false);
  await page.click('#refreshBtn'); await page.evaluate(() => { const id=bridgeCalls.filter(c=>c[0]==='compose').at(-1)[3]; onComposeResult(id,JSON.stringify({snapshot:'current',page_count:2,warnings:[]})); });
  assert.equal(await page.isDisabled('#exportBtn'),false); await page.click('#exportBtn');
  assert.deepEqual(await page.evaluate(() => bridgeCalls.filter(c=>c[0]==='save').at(-1)),['save','current','Nueva nota',true,'[]',2]);
  assert.equal(await page.getAttribute('#editor','contenteditable'),'false');
  await page.evaluate(() => onExportComplete(false,'Guardado cancelado')); assert.equal(await page.getAttribute('#editor','contenteditable'),'true');
});
test('Soft keyboard Enter works and IME does not schedule intermediate conversions', async page => {
  await setup(page,'abcDEF'); await select(page,{line:0,offset:3});
  await page.evaluate(() => editor.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true})));
  assert.deepEqual(await lines(page),['abc','DEF']);
  const before = await page.evaluate(() => revision);
  await page.evaluate(() => { editor.dispatchEvent(new CompositionEvent('compositionstart')); editor.dispatchEvent(new InputEvent('input',{isComposing:true,inputType:'insertCompositionText'})); });
  assert.equal(await page.evaluate(() => revision),before);
  await page.evaluate(() => editor.dispatchEvent(new CompositionEvent('compositionend'))); assert.ok(await page.evaluate(() => revision) > before);
});
test('Replacing a large selection respects resulting length instead of sum', async page => {
  await setup(page,'a'.repeat(120000)); await select(page,{line:0,offset:0},{line:0,offset:120000}); await paste(page,'b'.repeat(120000));
  assert.equal(await page.evaluate(() => characterCount()),120000); assert.equal(await page.evaluate(() => editor.textContent[0]),'b');
});
test('Excess paragraph paste is rejected before creating the DOM', async page => {
  await setup(page); await paste(page,'\n'.repeat(10001)); assert.deepEqual(await lines(page),['']);
  assert.match(await page.textContent('#toast'),/10000 párrafos/);
});
test('Long documents generate only when manually requested', async page => {
  await setup(page,'texto '.repeat(4000));
  await page.evaluate(() => { $('autoPreview').checked = true; changed(); }); await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(() => bridgeCalls.filter(c=>c[0]==='compose').length),0);
  await page.click('#refreshBtn'); assert.equal(await page.evaluate(() => bridgeCalls.filter(c=>c[0]==='compose').length),1);
});
test('Page controls use the backend setting names', async page => {
  await setup(page,'Hola'); await page.click('[data-tab="page"]'); await page.fill('#lineRows','3'); await page.fill('#wordSpacing','35'); await page.fill('#letterSpacing','2');
  await page.click('#refreshBtn'); const s = await page.evaluate(() => JSON.parse(bridgeCalls.filter(c=>c[0]==='compose').at(-1)[2]));
  assert.equal(s.line_grid_rows,3); assert.equal(s.word_spacing,35); assert.equal(s.letter_spacing,2); assert.equal(s.auto_line_spacing,true);
});
test('Leading spaces typed or pasted survive serialization, formatting and draft reload',async page=>{
  await setup(page);await paste(page,'         O --- O\n            I\n            O');
  const before=await lines(page);assert.equal(before[0],'         O --- O');
  await select(page,{line:0,offset:0},{line:0,offset:9});await page.selectOption('#sizeSel','150');
  await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');
  assert.deepEqual(await lines(page),before);
  assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs.map(p=>p.segments.map(s=>s.text).join(''))),before);
});
test('Save folder persists, cancellation retains it, and manual mode can be restored',async page=>{
  await setup(page,'Hola');await page.click('[data-tab="save"]');await page.click('#chooseFolder');
  assert.equal(await page.isDisabled('#exportBtn'),true);
  await page.evaluate(()=>{localStorage.setItem('test-export-folder',JSON.stringify({configured:true,label:'Documentos / HiNote'}));onExportFolder(AndroidBridge.getExportFolder(),null);});
  assert.equal(await page.textContent('#folderLabel'),'Documentos / HiNote');
  await page.reload();await page.waitForSelector('#editor .line');await page.click('[data-tab="save"]');
  assert.equal(await page.textContent('#folderLabel'),'Documentos / HiNote');
  assert.ok(await page.evaluate(()=>['chooseFolder','clearFolder'].every(id=>$(id).scrollWidth<=$(id).clientWidth)),'Folder button labels must fit their controls');
  await page.screenshot({path:path.join(root,'test-results','save-folder.png')});
  await page.click('#chooseFolder');await page.evaluate(()=>onExportFolder(AndroidBridge.getExportFolder(),null));
  assert.equal(await page.textContent('#folderLabel'),'Documentos / HiNote');assert.equal(await page.isDisabled('#chooseFolder'),false);
  await page.click('#clearFolder');await page.evaluate(()=>{localStorage.removeItem('test-export-folder');onExportFolder(AndroidBridge.getExportFolder(),null);});
  assert.equal(await page.textContent('#folderLabel'),'Se preguntará dónde guardar');assert.equal(await page.isDisabled('#clearFolder'),true);
});
test('Saved-folder export is immediate in the UI and errors allow retry',async page=>{
  await setup(page,'Hola');await page.evaluate(()=>onExportFolder(JSON.stringify({configured:true,label:'HiNote'}),null));
  await page.click('#refreshBtn');await page.evaluate(()=>onComposeResult(revision,JSON.stringify({snapshot:'folder-note',page_count:1,warnings:[]})));
  await page.click('#exportBtn');assert.equal(await page.textContent('#status'),'Guardando en la carpeta elegida…');
  assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='save').length),1);
  assert.equal(await page.isDisabled('#chooseFolder'),true);
  await page.evaluate(()=>onExportComplete(false,'La carpeta ya no está disponible'));
  assert.equal(await page.isDisabled('#exportBtn'),false);assert.equal(await page.isDisabled('#chooseFolder'),false);
});

// Image editing is tested with real pointer/touch events and a mocked file picker.
async function importImage(page,asset='a',size=[640,480]){
  await page.click('[data-tab="images"]');await page.click('#insertImage');
  await page.evaluate(({asset,size})=>{
    const id=bridgeCalls.filter(c=>c[0]==='import').at(-1)[1];
    onImageImported(id,JSON.stringify({asset:asset.repeat(64),pixelWidth:size[0],pixelHeight:size[1]}),null);
    const call=bridgeCalls.filter(c=>c[0]==='compose').at(-1);
    if(call&&composing)onComposeResult(call[3],JSON.stringify({snapshot:'test-snapshot',page_count:1,warnings:[],layout:{grid_step:58.8}}));
  },{asset,size});
}
async function imageState(page){return page.evaluate(()=>ImageEditor.state());}
test('Import, rotate, crop, duplicate, order and undo preserve image metadata',async page=>{
  await setup(page,'Hola');await importImage(page);
  assert.equal((await imageState(page)).images.length,1);
  const original=(await imageState(page)).images[0];
  await page.click('#rotateImageRight');assert.equal((await imageState(page)).images[0].angle,90);
  await page.fill('#imageAngle','320');await page.press('#imageAngle','Tab');assert.equal((await imageState(page)).images[0].angle,320);
  await page.click('#cropImage');await page.evaluate(()=>{$('cropLeft').value='25';$('cropLeft').dispatchEvent(new Event('input'));});await page.click('#applyCrop');
  assert.equal((await imageState(page)).images[0].crop.left,.25);
  assert.equal((await imageState(page)).images[0].width,original.width*.75);
  await page.click('#undoBtn');assert.equal((await imageState(page)).images[0].crop.left,0);
  await page.click('#redoBtn');assert.equal((await imageState(page)).images[0].crop.left,.25);
  await page.click('#duplicateImage');assert.equal((await imageState(page)).images.length,2);
  const id=await page.evaluate(()=>ImageEditor.selected().id);await page.click('#imageBack');assert.equal((await imageState(page)).images[0].id,id);
  await page.click('#deleteImage');assert.equal((await imageState(page)).images.length,1);
  await page.click('#undoBtn');assert.equal((await imageState(page)).images.length,2);
});
test('Image moves do not recompose text, and only current page images are mounted',async page=>{
  await setup(page,'Hola');await importImage(page);await page.evaluate(()=>{zoom=.65;applyZoom();window.bridgeCalls=[];});
  const box=await page.locator('.pageImage').boundingBox();const before=(await imageState(page)).images[0];
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+40,{steps:6});await page.mouse.up();
  const after=(await imageState(page)).images[0];assert.ok(after.x>before.x+50);assert.ok(after.y>before.y+50);
  assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').length),0);
  await page.fill('#imagePage','3');await page.press('#imagePage','Tab');assert.equal(await page.textContent('#pageBadge'),'Página 3/3');
  await page.click('#prevPage');assert.equal(await page.locator('.pageImage').count(),0);
  await page.click('#nextPage');assert.equal(await page.locator('.pageImage').count(),1);
});
test('Reload preserves images, crops and empty pages without putting binary data in draft',async page=>{
  await setup(page,'Con imagen');await importImage(page);await page.click('#rotateImageRight');
  await page.click('#imageNewPage');await importImage(page,'b',[480,640]);
  const before=await imageState(page);await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');
  assert.deepEqual(await imageState(page),before);assert.deepEqual(await lines(page),['Con imagen']);
  assert.ok(await page.evaluate(()=>localStorage.getItem(DRAFT_KEY).length)<2500);
  assert.equal(await page.evaluate(()=>ImageEditor.count()),2);
});
test('Cancelled import unlocks controls and stale import result is ignored',async page=>{
  await setup(page);await page.click('[data-tab="images"]');await page.click('#insertImage');
  assert.equal(await page.isDisabled('#insertImage'),true);
  await page.evaluate(()=>{const t=bridgeCalls.filter(c=>c[0]==='import').at(-1)[1];onImageImported(t-1,'{}',null);});assert.equal(await page.isDisabled('#insertImage'),true);
  await page.evaluate(()=>{const t=bridgeCalls.filter(c=>c[0]==='import').at(-1)[1];onImageImported(t,null,null);});assert.equal(await page.isDisabled('#insertImage'),false);
  assert.equal((await imageState(page)).images.length,0);
});
test('Two finger touch scales and rotates an image and undo restores it',async page=>{
  await setup(page);await importImage(page);await page.evaluate(()=>{zoom=.55;applyZoom();});
  const before=(await imageState(page)).images[0],box=await page.locator('.pageImage').boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2,client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y:y-20,id:1},{x:x+50,y:y+20,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=(await imageState(page)).images[0];assert.ok(after.width>before.width);assert.ok(after.angle>10);
  await page.click('#undoBtn');assert.deepEqual((await imageState(page)).images[0],before);
});
test('Old V21 text draft migrates without losing formatting',async page=>{
  await page.addInitScript(()=>{localStorage.removeItem('hinote-draft-v23');localStorage.removeItem('native-draft');localStorage.setItem('hinote-draft-v21',JSON.stringify({version:21,lines:[[{text:'Anterior',scale:1.5,color:'#336699',opacity:60}]],title:'V22',settings:{},grid:false}));});
  await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await lines(page),['Anterior']);
  assert.equal(await page.evaluate(()=>readLines()[0][0].scale),1.5);assert.equal((await imageState(page)).images.length,0);
});
test('Image metadata is frozen during export and extra image pages are included',async page=>{
  await setup(page,'Hola');await importImage(page);await page.fill('#imagePage','4');await page.press('#imagePage','Tab');
  await page.click('#refreshBtn');await page.evaluate(()=>{const id=bridgeCalls.filter(c=>c[0]==='compose').at(-1)[3];onComposeResult(id,JSON.stringify({snapshot:'with-images',page_count:1,warnings:[]}));});
  await page.click('#exportBtn');const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='save').at(-1));
  assert.equal(call[5],4);assert.equal(JSON.parse(call[4])[0].page,3);assert.equal(await page.isDisabled('#rotateImageRight'),true);
});

test('Native thickness survives selected formatting, lists, undo and draft reload',async page=>{
  await setup(page,'* Hola');await select(page,{line:0,offset:0},{line:0,offset:1});await page.selectOption('#thicknessSel','3');
  await select(page,{line:0,offset:2},{line:0,offset:6});await page.selectOption('#thicknessSel','1');
  const doc=await page.evaluate(()=>serializeDocument());assert.equal(doc.paragraphs[0].list.marker_thickness,3);assert.equal(doc.paragraphs[0].segments[0].thickness,1);
  await page.click('#undoBtn');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].segments[0].thickness),0);
  await page.click('#redoBtn');await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');
  assert.deepEqual(await page.evaluate(()=>serializeDocument()),doc);
});

async function calibrationBridge(page){
  await page.addInitScript(()=>{
    const original={id:'original',name:'Original',revision:'v24',protected:true,found:['a','A','_','•','*'],missing:['!','¡','€'],fallback:[],unavailable:['!','¡','€'],variants:{a:8,A:8,_:8,'•':8,'*':8},incomplete:[],expected:['a','A','_','•','*','!','¡','€']};
    const other={id:'a'.repeat(32),name:'Mi letra nueva',revision:'r1',protected:false,found:['a','€'],missing:['A','_','!'],fallback:['A','_'],unavailable:['!'],variants:{a:8,'€':4},incomplete:['€'],expected:['a','A','_','!','€']};
    window.testProfiles=[original,other];
    const install=()=>{
      AndroidBridge.requestCalibration=(action,raw,id)=>{bridgeCalls.push(['calibration',action,raw,id]);if(action==='catalog')queueMicrotask(()=>onCalibrationResult(id,JSON.stringify({profiles:testProfiles,groups:{base:{name:'Básico',chars:'aA_!'},math:{name:'Matemáticas',chars:'±'}},problems:[]}),null));};
      AndroidBridge.requestCalibrationImport=(raw,id)=>bridgeCalls.push(['calibration-import',raw,id]);AndroidBridge.cancelCalibration=()=>bridgeCalls.push(['calibration-cancel']);
    };
    // The native bridge mock is installed by the context's earlier init script.
    install();
  });
  await page.reload();await page.waitForFunction(()=>!CalibrationUI.isBusy());await setup(page,'Hola');
  await page.click('[data-tab="calibration"]');await page.click('#manageCalibration');
}
test('Every calibration exposes found, missing, fallback and partial variants',async page=>{
  await calibrationBridge(page);assert.equal(await page.isDisabled('#deleteProfile'),true);
  await page.click('#showMissing');assert.match(await page.textContent('#characterGrid'),/!/);assert.match(await page.textContent('#characterGrid'),/Sin muestra/);
  await page.selectOption('#profileList','a'.repeat(32));await page.click('#showMissing');
  assert.equal(await page.locator('.characterChip.fallback').count(),2);assert.equal(await page.locator('.characterChip.missing').count(),1);
  await page.click('#showFound');assert.match(await page.textContent('#characterGrid'),/4\/8/);assert.match(await page.textContent('#profileWarnings'),/€/);
  await page.fill('#characterSearch','U+20AC');assert.equal(await page.locator('.characterChip').count(),1);
  await page.fill('#characterSearch','');await page.screenshot({path:path.join(root,'test-results','calibration-found.png')});
  await page.click('#showMissing');await page.screenshot({path:path.join(root,'test-results','calibration-missing.png')});
});
test('Profile choice persists in draft and switching invalidates the old preview',async page=>{
  await calibrationBridge(page);await page.selectOption('#profileList','a'.repeat(32));await page.click('#useProfile');await page.click('#closeCalibration');
  assert.equal(await page.evaluate(()=>activeProfile),'a'.repeat(32));assert.equal(await page.isDisabled('#exportBtn'),false);
  assert.equal(await page.evaluate(()=>previewRevision===revision),false);
  await page.evaluate(()=>saveDraft());await page.reload();await page.waitForFunction(()=>!CalibrationUI.isBusy());
  assert.equal(await page.evaluate(()=>activeProfile),'a'.repeat(32));
  await page.click('#refreshBtn');const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').at(-1));assert.equal(JSON.parse(call[2]).profile,'a'.repeat(32));
});
test('Calibration imports are reviewed before saving and stale callbacks are ignored',async page=>{
  await calibrationBridge(page);await page.fill('#importProfileName','Otra');await page.click('#importProfile');
  assert.equal(await page.getAttribute('#editor','contenteditable'),'false');assert.equal(await page.isDisabled('#exportBtn'),true);
  await page.evaluate(()=>{const c=bridgeCalls.filter(c=>c[0]==='calibration-import').at(-1);onCalibrationResult(c[2]-1,null,'Viejo');});
  assert.equal(await page.evaluate(()=>CalibrationUI.isBusy()),true);
  await page.evaluate(()=>{const c=bridgeCalls.filter(c=>c[0]==='calibration-import').at(-1);onCalibrationResult(c[2],JSON.stringify({review:true,replaced:0,detail:testProfiles[1]}),null);});
  assert.equal(await page.isVisible('#importReview'),true);assert.equal(await page.isDisabled('#profileList'),true);
  assert.equal(await page.evaluate(()=>activeProfile),'original');await page.click('#showMissing');assert.match(await page.textContent('#characterGrid'),/!/);
  await page.click('#discardProfile');await page.evaluate(()=>{const c=bridgeCalls.filter(c=>c[0]==='calibration').at(-1);onCalibrationResult(c[3],'{"discarded":true}',null);});
  assert.equal(await page.isVisible('#importReview'),false);assert.equal(await page.evaluate(()=>activeProfile),'original');
});
test('Supplement template contains only missing characters and cancel unlocks the app',async page=>{
  await calibrationBridge(page);await page.selectOption('#profileList','a'.repeat(32));await page.click('#templateOptions summary');await page.click('#templateMissing');
  assert.equal(await page.inputValue('#extraCharacters'),'A_!');assert.equal(await page.isChecked('#extendProfile'),true);
  await page.click('#createTemplate');const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='calibration').at(-1));
  assert.equal(call[1],'template');assert.deepEqual(JSON.parse(call[2]),{groups:[],custom:'A_!'});
  await page.evaluate(()=>{const c=bridgeCalls.filter(c=>c[0]==='calibration').at(-1);onCalibrationResult(c[3],'{"cancelled":true}',null);});
  assert.equal(await page.evaluate(()=>CalibrationUI.isBusy()),false);assert.equal(await page.isDisabled('#importProfile'),false);
});

async function openTable(page){await page.click('[data-tab="tables"]');await page.click('#insertTable');await page.waitForSelector('#tableDialog:not(.hidden)');}
async function fillCell(page,r,c,text){await page.locator(`.cellEditor[data-row="${r}"][data-col="${c}"]`).fill(text);}
test('Tables preserve anchors, text, rich color, sizes and draft reload',async page=>{
  await setup(page,'Antes\nDespués');await select(page,{line:0,offset:5});await openTable(page);
  await fillCell(page,0,0,'Título');await fillCell(page,1,1,'Rojo negro');
  await page.evaluate(()=>{const n=document.querySelector('.cellEditor[data-row="1"][data-col="1"]').firstChild;const r=document.createRange();r.setStart(n,0);r.setEnd(n,4);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.fill('#tableInkColor','#ff0000');await page.click('#tableApplyInk');
  await page.selectOption('#tableMode','compact');await page.selectOption('#tableAlign','center');await page.selectOption('#tableValign','middle');await page.selectOption('#tableCellSize','0.55');
  await page.click('#tableDone');
  let doc=await page.evaluate(()=>serializeDocument());assert.equal(doc.paragraphs[1].type,'table');
  assert.equal(doc.paragraphs[1].table.mode,'compact');const cell=doc.paragraphs[1].table.rows[1].cells[1];
  assert.equal(cell.size,.55);assert.equal(cell.align,'center');assert.equal(cell.valign,'middle');assert.equal(cell.segments[0].color,'#FF0000');assert.equal(cell.segments[0].text,'Rojo');assert.equal(cell.segments[1].color,'#000000');
  assert.equal(doc.paragraphs.at(-1).segments[0].text,'Después');await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('.tableBlock');
  assert.deepEqual(await page.evaluate(()=>serializeDocument()),doc);
});
test('Tables undo insertion, edits and deletion without altering other paragraphs',async page=>{
  await setup(page,'Texto');await openTable(page);await fillCell(page,0,0,'Uno');await page.click('#tableDone');
  await page.click('#undoBtn');assert.equal(await page.locator('.tableBlock').count(),0);await page.click('#redoBtn');assert.equal(await page.locator('.tableBlock').count(),1);
  await page.click('.tableBlock button');await fillCell(page,0,0,'Dos');await page.click('#tableDone');await page.click('#undoBtn');
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs.find(p=>p.type==='table').table.rows[0].cells[0].segments[0].text),'Uno');
  await page.click('.tableBlock button');page.once('dialog',d=>d.accept());await page.click('#tableRemove');assert.equal(await page.locator('.tableBlock').count(),0);await page.click('#undoBtn');assert.equal(await page.locator('.tableBlock').count(),1);
  assert.equal((await lines(page))[0],'Texto');
});
test('TSV paste populates cells; row and column operations preserve content',async page=>{
  await setup(page);await openTable(page);await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();
  await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','A\tB\tC\nD\tE\tF');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  assert.equal(await page.locator('.cellEditor[data-row="1"][data-col="2"]').textContent(),'F');await page.click('#tableAddCol');await page.click('#tableAddRow');
  await page.click('#tableDone');const t=await page.evaluate(()=>serializeDocument().paragraphs[0].table);
  assert.equal(t.widths.length,4);assert.equal(t.rows.length,5);assert(t.widths.reduce((a,b)=>a+b,0)+t.left<=16);assert.equal(t.rows[0].cells[2].segments[0].text,'B');
});
test('Touch handles resize columns and rows in half-square steps',async page=>{
  await setup(page);await openTable(page);
  const handle=page.locator('.tableGrip.column[data-col="0"]'),b=await handle.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2-20,b.y+b.height/2);await page.mouse.up();
  await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();assert.equal(await page.inputValue('#tableColWidth'),'3.5');
  const row=page.locator('.tableGrip.row[data-row="0"]'),br=await row.boundingBox();
  const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:br.x+br.width/2,y:br.y+br.height/2}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:br.x+br.width/2,y:br.y+br.height/2+20}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.inputValue('#tableRowHeight'),'1.5');await page.click('#tableDone');
  const t=await page.evaluate(()=>serializeDocument().paragraphs[0].table);assert.equal(t.widths[0],3.5);assert.equal(t.rows[0].height,1.5);
});
test('Table editor preserves explicit newlines and recovers unfinished changes',async page=>{
  await setup(page);await openTable(page);await fillCell(page,1,0,'uno');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('dos');
  await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#tableDialog:not(.hidden)');
  assert.equal(await page.locator('.cellEditor[data-row="1"][data-col="0"]').textContent(),'uno\ndos');await page.click('#tableDone');
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].table.rows[1].cells[0].segments.map(s=>s.text).join('')),'uno\ndos');
});
test('Table block survives text formatting and Enter inserts text after it',async page=>{
  await setup(page);await openTable(page);await page.click('#tableDone');
  await select(page,{line:0,offset:0},{line:1,offset:0});await page.click('[data-tab="text"]');await page.selectOption('#sizeSel','150');
  assert.equal(await page.locator('.tableBlock').count(),1);await select(page,{line:0,offset:0});await page.keyboard.press('Enter');await page.keyboard.type('Después');
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].type),'table');assert((await lines(page)).includes('Después'));
});
test('Preview table controls move and resize without changing text or images',async page=>{
  await setup(page);await openTable(page);await fillCell(page,0,0,'Tabla');await page.click('#tableDone');
  await page.evaluate(()=>{const t=serializeDocument().paragraphs[0].table;composition={snapshot:'mock',page_count:1,table_pages:[[{id:t.id,x:59,y:200,width:888,height:500,rows:[0,1,2,3]}]]};previewRevision=revision;zoom=.6;applyZoom();TableEditor.mode(true);TableEditor.selectPreview(t.id);});
  const b=await page.locator('.tableMove').boundingBox();await page.mouse.move(b.x+20,b.y+20);await page.mouse.down();await page.mouse.move(b.x+20,b.y+50);await page.mouse.up();
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].table.gap),1.5);
  await page.click('#undoBtn');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].table.gap),0);
});

test('Cell percentages remain visible after changing cells and reloading',async page=>{
  await setup(page);await openTable(page);
  assert.match(await page.locator('#tableMode option:checked').textContent(),/60 %/);
  for(const value of ['0.6','0.5','0.73']){
    await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();await page.selectOption('#tableCellSize',value);
    await page.locator('.cellEditor[data-row="1"][data-col="0"]').focus();await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();
    assert.equal(await page.inputValue('#tableCellSize'),value);assert.match(await page.locator('#tableCellSize option:checked').textContent(),/Fijo/);
  }
  await page.selectOption('#tableCellSize','0.6');await page.click('#tableDone');await page.evaluate(()=>saveDraft());await page.reload();await page.click('.tableBlock button');
  assert.equal(await page.inputValue('#tableCellSize'),'0.6');
  await page.selectOption('#tableMode','compact');assert.equal(await page.inputValue('#tableCellSize'),'0.6');
  await page.selectOption('#tableCellSize','0');assert.match(await page.locator('#tableCellSize option:checked').textContent(),/60–50 %/);
});
test('Touch multi-cell formatting preserves unselected cells and supports undo',async page=>{
  await setup(page);await openTable(page);await fillCell(page,0,0,'Primera');await fillCell(page,1,1,'Segunda');await fillCell(page,2,2,'Tercera');
  await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();await page.click('#tableSelectCells');
  for(const [r,c] of [[1,1],[2,2]]){const n=page.locator(`.cellEditor[data-row="${r}"][data-col="${c}"]`);await n.scrollIntoViewIfNeeded();const b=await n.boundingBox();await page.touchscreen.tap(b.x+15,b.y+15);}
  assert.equal(await page.locator('td.selectedCell').count(),3);assert.equal(await page.inputValue('#tableAlign'),'mixed');
  await page.selectOption('#tableAlign','right');await page.selectOption('#tableValign','middle');await page.selectOption('#tableCellSize','0.6');
  assert.equal(await page.locator('td.selectedCell').count(),3);
  await page.fill('#tableInkColor','#ff0000');await page.click('#tableApplyInk');
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/tables-multiselect.png')});
  await page.click('#tableDone');const t=await page.evaluate(()=>serializeDocument().paragraphs[0].table);
  for(const i of [0,1,2]){const c=t.rows[i].cells[i];assert.equal(c.size,.6);assert.equal(c.align,'right');assert.equal(c.valign,'middle');assert.equal(c.segments[0].color,'#FF0000');}
  assert.equal(t.rows[1].cells[0].align,'left');assert.equal(t.rows[1].cells[0].size,0);
  await page.click('.tableBlock button');await page.click('#tableSelectAll');await page.selectOption('#tableCellSize','0.5');await page.click('#tableDone');
  await page.click('#undoBtn');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].table),t);
});
test('Row column whole-table and range selection apply only to marked cells',async page=>{
  await setup(page);await openTable(page);await page.locator('.cellEditor[data-row="1"][data-col="1"]').focus();
  await page.click('#tableSelectRow');assert.equal(await page.locator('td.selectedCell').count(),3);await page.selectOption('#tableAlign','right');
  await page.click('#tableSelectCol');assert.equal(await page.locator('td.selectedCell').count(),6);await page.selectOption('#tableValign','bottom');
  await page.click('#tableSelectAll');assert.equal(await page.locator('td.selectedCell').count(),12);await page.selectOption('#tableCellSize','0');
  await page.click('#tableSelectCells');await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();
  await page.locator('.cellEditor[data-row="1"][data-col="1"]').click({modifiers:['Shift']});
  assert.equal(await page.locator('td.selectedCell').count(),4);await page.selectOption('#tableCellSize','0.55');await page.click('#tableDone');
  const t=await page.evaluate(()=>serializeDocument().paragraphs[0].table);
  for(let r=0;r<4;r++)for(let c=0;c<3;c++){const cell=t.rows[r].cells[c];assert.equal(cell.size,r<=1&&c<=1?.55:0);assert.equal(cell.valign,r===1||c===1?'bottom':'top');if(r===1)assert.equal(cell.align,'right');}
});
test('Selecting additional columns and rows preserves the existing marked cells',async page=>{
  await setup(page);await openTable(page);await page.locator('.cellEditor[data-row="0"][data-col="0"]').focus();
  await page.click('#tableSelectCol');assert.equal(await page.locator('td.selectedCell').count(),4);
  await page.locator('.cellEditor[data-row="0"][data-col="1"]').click();
  await page.click('#tableSelectCol');assert.equal(await page.locator('td.selectedCell').count(),8);
  await page.locator('.cellEditor[data-row="1"][data-col="2"]').click();
  await page.click('#tableSelectRow');assert.equal(await page.locator('td.selectedCell').count(),9);
  const selected=await page.locator('#tableGrid td.selectedCell .cellEditor').evaluateAll(nodes=>nodes.map(n=>`${n.dataset.row}:${n.dataset.col}`));
  assert(selected.includes('0:0')&&selected.includes('3:1')&&selected.includes('1:2'));
});
test('Named table move buttons change document order and respect ends',async page=>{
  await setup(page,'Antes\nDespués');await select(page,{line:0,offset:5});await openTable(page);await page.click('#tableDone');await page.click('.tableBlock button');
  await page.click('#tableMoveUp');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].type),'table');assert.equal(await page.isDisabled('#tableMoveUp'),true);
  await page.click('#tableMoveDown');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].segments[0].text),'Antes');
});
test('Table preview tools stay inside the page and viewport while zooming and panning',async page=>{
  await setup(page);await openTable(page);await page.click('#tableDone');
  await page.evaluate(()=>{const t=serializeDocument().paragraphs[0].table;composition={snapshot:'mock',page_count:1,table_pages:[[{id:t.id,x:59,y:59,width:888,height:950,rows:[0,1,2,3]}]]};previewRevision=revision;TableEditor.mode(true);TableEditor.selectPreview(t.id);});
  for(const view of [[.74,0,0],[1.84,80,40],[1.84,220,520],[.3,0,0]]){
    await page.evaluate(([z,x,y])=>{zoom=z;applyZoom();$('previewWrap').scrollLeft=x;$('previewWrap').scrollTop=y;},view);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const bounds=await page.evaluate(()=>{const a=$('previewWrap').getBoundingClientRect(),s=$('canvasShell').getBoundingClientRect();return {left:Math.max(a.left,s.left),right:Math.min(a.right,s.right),top:Math.max(a.top,s.top),bottom:Math.min(a.bottom,s.bottom)};});
    for(const selector of ['.tableMove','.tableOpen','.tableResize']){const b=await page.locator(selector).boundingBox();assert(b);assert(b.x>=bounds.left&&b.y>=bounds.top);assert(b.x+b.width<=bounds.right+1&&b.y+b.height<=bounds.bottom+1,`${selector}: ${JSON.stringify({b,bounds,view})}`);}
  }
  await page.evaluate(()=>{zoom=.74;applyZoom();});await page.screenshot({path:path.join(root,'test-results/tables-preview-tools.png')});
});
test('Preview sharpness is bounded debounced and rejects stale pages without composing',async page=>{
  await setup(page,'Hola');await page.evaluate(()=>{zoom=.6;composition={snapshot:'sharp',page_count:2};previewRevision=revision;drawCurrent();});
  const calls=()=>page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='pageHD'));
  const deliver=async request=>{await page.evaluate(c=>{const canvas=document.createElement('canvas');canvas.width=675*c[5];canvas.height=1080*c[5];canvas.getContext('2d').fillRect(100,100,30,30);onPageResult(c[4],c[1],c[2],canvas.toDataURL(),null);},request);};
  let first=(await calls()).at(-1);assert.equal(first[5],1);await deliver(first);await page.waitForFunction(()=>shownPreview?.resolution===1);
  await page.evaluate(()=>{for(const z of [1.1,1.3,1.8,2.5]){zoom=z;applyZoom();}});
  await page.waitForFunction(()=>bridgeCalls.filter(c=>c[0]==='pageHD').length===2);
  const hd=(await calls()).at(-1);assert.equal(hd[5],2);await deliver(hd);await page.waitForFunction(()=>$('previewCanvas').width===1350);
  assert.equal(await page.evaluate(()=>$('gridCanvas').width),1350);
  await page.evaluate(()=>{zoom=.7;applyZoom();});await page.waitForTimeout(300);assert.equal((await calls()).length,2);
  await page.evaluate(()=>{currentPage=1;drawCurrent();});const next=(await calls()).at(-1);await deliver(first);assert.equal(await page.evaluate(()=>shownPreview),null);
  await deliver(next);await page.waitForFunction(()=>shownPreview?.index===1);
  assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').length),0);
});

test('Touch table handles keep pointer capture and allow opening the editor',async page=>{
  await setup(page);await openTable(page);await fillCell(page,0,0,'Táctil');await page.click('#tableDone');
  const preview=()=>{const t=serializeDocument().paragraphs[0].table;composition={snapshot:'mock',page_count:1,table_pages:[[{id:t.id,x:59,y:200,width:888,height:500,rows:[0,1,2,3]}]]};previewRevision=revision;zoom=.6;applyZoom();TableEditor.mode(true);TableEditor.selectPreview(t.id);};
  await page.evaluate(preview);
  const b=await page.locator('.tableMove').boundingBox(),session=await page.context().newCDPSession(page);
  const scroll=await page.locator('#previewWrap').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+20,y:b.y+20}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+20,y:b.y+50}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].table.gap),1.5);
  assert.deepEqual(await page.locator('#previewWrap').evaluate(e=>[e.scrollLeft,e.scrollTop]),scroll);
  await page.evaluate(preview);
  await page.evaluate(()=>{window.tableTouchEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])document.addEventListener(type,e=>tableTouchEvents.push({type,target:e.target.className,defaultPrevented:e.defaultPrevented}),true);});
  const button=await page.locator('.tableOpen').boundingBox();await page.touchscreen.tap(button.x+button.width/2,button.y+button.height/2);
  try{await page.waitForSelector('#tableDialog:not(.hidden)');}catch(e){console.error('Table touch events: '+JSON.stringify(await page.evaluate(()=>({events:tableTouchEvents,ime,exporting,inert:document.querySelector('.app').inert,calibration:CalibrationUI.isBusy(),image:ImageEditor.isBusy()}))));throw e;}
  assert.equal(await page.locator('.cellEditor[data-row="0"][data-col="0"]').innerText(),'Táctil');
});

async function graphPaste(page,value){await page.locator('#graphBulk').evaluate(n=>n.open=true);await page.fill('#graphPoints',value);}
async function openMath(page,kind='formula'){await page.click('[data-tab="math"]');await page.click(kind==='formula'?'#insertFormula':'#insertGraph');await page.waitForSelector('#mathDialog:not(.hidden)');}

test('Formula templates nest at the cursor and preserve surrounding normal text',async page=>{
  await setup(page,'Antes\nDespués');await select(page,{line:0,offset:5});await openMath(page);
  await page.locator('.mathSlot').first().fill('x=');await page.click('[data-template="fraction"]');
  await page.getByLabel('Numerador',{exact:true}).fill('a+b');await page.click('[data-template="root"]');
  await page.getByLabel('Interior de raíz',{exact:true}).fill('c');await page.getByLabel('Denominador',{exact:true}).fill('2');
  await page.click('#mathDone');const doc=await page.evaluate(()=>serializeDocument());
  assert.equal(doc.paragraphs[1].type,'formula');const expr=doc.paragraphs[1].object.expression;
  assert.equal(expr.items[0].text,'x=');const f=expr.items.find(n=>n.type==='fraction');assert.equal(f.den.items[0].text,'2');
  assert.equal(f.num.items.find(n=>n.type==='root').body.items[0].text,'c');
  assert.deepEqual(await lines(page),['Antes','\uFFFC','','Después']);
  assert.equal(doc.paragraphs[0].segments[0].scale,1);
  await page.click('.objectBlock button');await page.screenshot({path:path.join(root,'test-results','formula-editor.png')});
});
test('Formula templates wrap selected text and support field navigation and undo',async page=>{
  await setup(page);await openMath(page);const first=page.locator('.mathSlot').first();await first.fill('a+b');await first.selectText();
  await page.click('[data-template="fraction"]');assert.equal(await page.getByLabel('Numerador',{exact:true}).inputValue(),'a+b');
  await page.getByLabel('Denominador',{exact:true}).fill('c');await page.click('#mathUndo');await page.click('#mathUndo');
  assert.equal(await page.locator('.mathFraction').count(),0);await page.click('#mathRedo');assert.equal(await page.locator('.mathFraction').count(),1);
  await page.getByLabel('Denominador',{exact:true}).fill('c');await page.click('#mathNext');assert.equal(await page.locator('.mathSlot').last().evaluate(n=>n===document.activeElement),true);
  await page.click('#mathDone');assert.equal((await page.evaluate(()=>serializeDocument())).paragraphs[0].object.expression.items.find(n=>n.type==='fraction').den.items[0].text,'c');
});
test('Math blocks undo redo reload and recover unfinished formula fields',async page=>{
  await setup(page);await openMath(page);await page.locator('.mathSlot').first().fill('E=mc');await page.click('#mathDone');
  await page.click('#undoBtn');assert.equal(await page.locator('.objectBlock').count(),0);await page.click('#redoBtn');assert.equal(await page.locator('.objectBlock').count(),1);
  await page.click('.objectBlock button');await page.locator('.mathSlot').first().fill('E=mc2');await page.evaluate(()=>saveDraft());await page.reload();
  await page.waitForSelector('#mathDialog:not(.hidden)');assert.equal(await page.locator('.mathSlot').first().inputValue(),'E=mc2');
  await page.click('#mathCancel');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items[0].text),'E=mc');
  await page.click('.objectBlock button');await page.locator('.mathSlot').first().fill('E=mc2');await page.click('#mathDone');await page.evaluate(()=>saveDraft());await page.reload();
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items[0].text),'E=mc2');
});
test('Matrix slots keep row and column structure and per-field color',async page=>{
  await setup(page);await openMath(page);await page.click('[data-category="matrix"]');await page.click('[data-template="matrix"]');
  for(let r=1;r<=2;r++)for(let c=1;c<=2;c++)await page.getByLabel(`Matriz fila ${r}, columna ${c}`,{exact:true}).fill(String((r-1)*2+c));
  await page.locator('#mathColor').evaluate(n=>{n.value='#e53935';n.dispatchEvent(new Event('change',{bubbles:true}));});await page.click('#mathFieldColor');
  await page.click('#mathDone');const matrix=await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items.find(n=>n.type==='matrix'));
  assert.deepEqual(matrix.cells.map(r=>r.map(c=>c.items[0].text)),[['1','2'],['3','4']]);assert.equal(matrix.cells[1][1].items[0].color,'#e53935');
});
test('Graph traces colors guides coordinates and signed axes survive reload',async page=>{
  await setup(page);await openMath(page,'graph');await page.fill('#graph_title','Oferta y demanda');await page.fill('#graph_xlabel','Q');await page.fill('#graph_ylabel','P');
  await graphPaste(page,'1; 9; A\n4; 5; B\n9; 2; C');await page.selectOption('#graphType','curve');await page.check('#graph_guides');
  await page.click('#graphAddTrace');await graphPaste(page,'2; 1; D\n8; 9; O');await page.selectOption('#graphType','line');
  await page.screenshot({path:path.join(root,'test-results','graph-editor.png')});await page.click('#mathDone');
  const graph=await page.evaluate(()=>serializeDocument().paragraphs[0].object);assert.equal(graph.kind,'graph');assert.equal(graph.series.length,2);assert.equal(graph.series[0].type,'curve');assert.equal(graph.series[0].guides,true);assert.equal(graph.series[1].points[1].label,'O');
  await page.evaluate(()=>saveDraft());await page.reload();assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object),graph);
  await page.click('.objectBlock button');await page.fill('#graph_xmin','-5');await page.fill('#graph_xmax','10');await page.click('#mathDone');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.xmin),-5);
});
test('Dragging graph points uses coordinates and unfinished point input is recovered',async page=>{
  await setup(page);await openMath(page,'graph');await graphPaste(page,'2; 8; A');await page.locator('#graphPoints').blur();
  await page.locator('.graphPoint').scrollIntoViewIfNeeded();
  const point=await page.locator('.graphPoint').boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();await page.mouse.move(point.x+50,point.y+35,{steps:5});await page.mouse.up();
  assert.notEqual(await page.inputValue('#graphPoints'),'2; 8; A');await graphPaste(page,'3; 7; Pendiente');await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#mathDialog:not(.hidden)');assert.equal(await page.inputValue('#graphPoints'),'3; 7; Pendiente');
  await page.click('#mathDone');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points[0]),{x:3,y:7,label:'Pendiente'});
});
test('Invalid mathematical geometry is explained and does not replace a saved object',async page=>{
  await setup(page);await openMath(page,'graph');await page.click('#mathDone');await page.click('.objectBlock button');await graphPaste(page,'20; 4');await page.click('#mathDone');
  assert.equal(await page.locator('#mathDialog:not(.hidden)').count(),1);assert.match(await page.textContent('#mathMessage'),/límites/);
  await page.click('#mathCancel');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points),[]);
});
test('Side by side graph blocks remove intervening empty lines and retain independent sizes',async page=>{
  await setup(page);await openMath(page,'graph');await page.click('#mathDone');await select(page,{line:1,offset:0});await openMath(page,'graph');
  await page.fill('#mathLeft','8.5');await page.check('#mathBeside');await page.click('#mathDone');const p=await page.evaluate(()=>serializeDocument().paragraphs);
  assert.equal(p[0].type,'graph');assert.equal(p[1].type,'graph');assert.equal(p[1].object.beside,true);assert.equal(p[1].object.left,8.5);
});
test('Math preview handles stay visible while zooming and moving blocks',async page=>{
  await setup(page);await openMath(page,'graph');await page.click('#mathDone');
  await page.evaluate(()=>{const o=serializeDocument().paragraphs[0].object;composition={snapshot:'math-mock',page_count:1,object_pages:[[{id:o.id,kind:o.kind,x:60,y:60,width:415,height:470}]]};previewRevision=revision;zoom=.6;applyZoom();MathGraphEditor.mode(true);});
  await page.locator('.objectSelect').click();
  const b=await page.locator('.objectMove').boundingBox();await page.mouse.move(b.x+10,b.y+10);await page.mouse.down();await page.mouse.move(b.x+34,b.y+34);await page.mouse.up();
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.gap),1);
  await page.evaluate(()=>{previewRevision=revision;zoom=1.2;applyZoom();});await page.locator('#previewWrap').evaluate(n=>n.scrollTop=300);await page.waitForTimeout(50);
  const wrap=await page.locator('#previewWrap').boundingBox();for(const name of ['.objectQuickActions','.objectResize']){const box=await page.locator(name).boundingBox();assert.ok(box.x>=wrap.x-1&&box.x+box.width<=wrap.x+wrap.width+1);assert.ok(box.y>=wrap.y-1&&box.y+box.height<=wrap.y+wrap.height+1);}
});
test('Formula molds are removable without leftover fields and undo restores their data',async page=>{
  await setup(page);await openMath(page);
  const groups={basic:['fraction','root','cubeRoot','nthRoot','scripts','square','subscript','group','absolute'],matrix:['matrix','determinant','brackets'],calculus:['derivative','partial','sum','product','integral','limit'],functions:['sin','log']};
  for(const [category,templates] of Object.entries(groups)){
    await page.click('[data-category="'+category+'"]');
    for(const template of templates){
      await page.click('[data-template="'+template+'"]');
      assert.ok(await page.locator('.mathTemplate').count()>0,template);
      await page.click('#mathDeleteTemplate');
      assert.equal(await page.locator('.mathTemplate').count(),0,template+' left a mold');
      assert.equal(await page.locator('.mathSlot').count(),1,template+' left duplicate caret fields');
    }
  }
  await page.click('[data-category="basic"]');await page.locator('.mathSlot').fill('a+b');await page.locator('.mathSlot').selectText();
  await page.click('[data-template="fraction"]');await page.getByLabel('Denominador',{exact:true}).fill('c');await page.click('#mathDeleteTemplate');
  assert.equal(await page.locator('.mathFraction').count(),0);await page.click('#mathUndo');
  assert.equal(await page.getByLabel('Numerador',{exact:true}).inputValue(),'a+b');assert.equal(await page.getByLabel('Denominador',{exact:true}).inputValue(),'c');
});
test('Formula backspace removes empty nested shells with touch keyboard input and no ghost bars',async page=>{
  await setup(page);await openMath(page);await page.click('[data-template="fraction"]');await page.click('[data-template="root"]');
  await page.getByLabel('Interior de raíz',{exact:true}).evaluate(n=>n.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true})));
  assert.equal(await page.locator('.mathRoot').count(),0);assert.equal(await page.locator('.mathFraction').count(),1);
  await page.click('#mathBackspace');assert.equal(await page.locator('.mathTemplate').count(),0);
  await page.click('[data-template="absolute"]');await page.getByLabel('Interior de grupo',{exact:true}).fill('12');await page.click('#mathDone');
  const nodes=await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items.filter(n=>n.type!=='text'));
  assert.equal(nodes.length,1);assert.equal(nodes[0].type,'group');
});
test('Formula power and subscript share the preceding base and deleting an index preserves the base',async page=>{
  await setup(page);await openMath(page);await page.locator('.mathSlot').fill('Q');await page.click('[data-template="subscript"]');
  assert.equal(await page.getByLabel('Base',{exact:true}).inputValue(),'Q');assert.equal(await page.getByLabel('Exponente',{exact:true}).count(),0);
  await page.getByLabel('Subíndice',{exact:true}).fill('1');await page.getByLabel('Base',{exact:true}).click();await page.click('[data-template="scripts"]');
  await page.getByLabel('Exponente',{exact:true}).fill('2');
  const sizes=await page.evaluate(()=>({base:parseFloat(getComputedStyle(document.querySelector('[aria-label="Base"]')).fontSize),sup:parseFloat(getComputedStyle(document.querySelector('[aria-label="Exponente"]')).fontSize)}));
  assert.ok(sizes.sup<sizes.base*.55);
  await page.click('#mathDone');const script=await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items.find(n=>n.type==='scripts'));
  assert.equal(script.base.items[0].text,'Q');assert.equal(script.sub.items[0].text,'1');assert.equal(script.sup.items[0].text,'2');
  await page.click('.objectBlock button');const power=page.getByLabel('Exponente',{exact:true});await power.selectText();await page.keyboard.press('Backspace');
  await page.getByLabel('Subíndice',{exact:true}).selectText();await page.keyboard.press('Backspace');
  assert.equal(await page.locator('.mathScripts').count(),0);assert.equal(await page.locator('.mathSlot').inputValue(),'Q');
});
test('Formula incomplete fractions stay editable and cannot export a residual blank denominator',async page=>{
  await setup(page);await openMath(page);await page.click('[data-template="fraction"]');await page.getByLabel('Numerador',{exact:true}).fill('a');
  await page.click('#mathDone');assert.equal(await page.locator('#mathDialog:not(.hidden)').count(),1);assert.match(await page.textContent('#mathMessage'),/Completa/);
  assert.equal(await page.getByLabel('Denominador',{exact:true}).evaluate(n=>n===document.activeElement),true);
  await page.click('#mathDeleteTemplate');await page.locator('.mathSlot').fill('a');await page.click('#mathDone');
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.expression.items[0].text),'a');
});
test('Graph point fields add labels without punctuation and deleting one point is undoable',async page=>{
  await setup(page);await openMath(page,'graph');
  for(const p of [[2,8,'A'],[5,5,'B'],[8,2,'C']]){
    await page.fill('#graphPointX',String(p[0]));await page.fill('#graphPointY',String(p[1]));await page.fill('#graphPointLabel',p[2]);await page.click('#graphSavePoint');await page.click('#graphNewPoint');
  }
  await page.getByRole('button',{name:'Editar punto 2',exact:true}).click();await page.fill('#graphPointLabel','Medio');await page.click('#graphDeletePoint');
  assert.equal(await page.locator('.graphPoint').count(),2);await page.click('#graphUndo');assert.equal(await page.locator('.graphPoint').count(),3);
  await page.getByRole('button',{name:'Eliminar punto 2',exact:true}).click();await page.click('#mathDone');
  assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points),[{x:2,y:8,label:'A'},{x:8,y:2,label:'C'}]);
});
test('Graph colors are independent and the plotted scale uses physical half squares',async page=>{
  await setup(page);await openMath(page,'graph');await graphPaste(page,'2; 8; A\n6; 2; B');await page.check('#graph_guides');
  for(const [id,color] of [['graphColor','#245bce'],['graph_pointColor','#e53935'],['graph_guideColor','#11977b'],['graph_labelColor','#8b36ad']])await page.locator('#'+id).evaluate((n,color)=>{n.value=color;n.dispatchEvent(new Event('change',{bubbles:true}));},color);
  const circle=await page.locator('.graphPoint').first().evaluate(n=>({x:+n.getAttribute('cx'),y:+n.getAttribute('cy'),color:getComputedStyle(n).fill}));
  assert.equal(circle.x%20,0);assert.equal(circle.y%20,0);assert.equal(circle.color,'rgb(229, 57, 53)');
  await page.click('#mathDone');const trace=await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0]);
  assert.equal(trace.color,'#245bce');assert.equal(trace.pointColor,'#e53935');assert.equal(trace.guideColor,'#11977b');assert.equal(trace.labelColor,'#8b36ad');
  await page.evaluate(()=>saveDraft());await page.reload();assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0]),trace);
});
test('Graph tapping an existing point selects it without snapping or adding another point',async page=>{
  await setup(page);await openMath(page,'graph');await graphPaste(page,'1.3; 2.7; A\n8; 8; B');await page.locator('#graphPoints').blur();await page.check('#graphTapAdd');
  const hit=page.locator('.graphHit').first();await hit.scrollIntoViewIfNeeded();const b=await hit.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
  assert.equal(await page.inputValue('#graphPointX'),'1.3');assert.equal(await page.inputValue('#graphPointY'),'2.7');assert.equal(await page.locator('.graphPoint').count(),2);
  await page.click('#graphDeletePoint');await page.click('#mathDone');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points),[{x:8,y:8,label:'B'}]);
});
test('Graph new point draft fields survive reload before being added',async page=>{
  await setup(page);await openMath(page,'graph');await page.fill('#graphPointX','3.5');await page.fill('#graphPointY','7');await page.fill('#graphPointLabel','Pendiente');
  await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#mathDialog:not(.hidden)');
  assert.equal(await page.inputValue('#graphPointX'),'3.5');assert.equal(await page.inputValue('#graphPointLabel'),'Pendiente');
  await page.click('#graphSavePoint');await page.click('#mathDone');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points),[{x:3.5,y:7,label:'Pendiente'}]);
});
test('Notebook combination selects native pages and sends their explicit reviewed order',async page=>{
  await setup(page,'Apunte intacto');await page.click('[data-tab="save"]');await page.click('#mergeNotebooks');await page.click('#notebookImport');
  await page.evaluate(()=>{const id=bridgeCalls.filter(c=>c[0]==='notebook-import').at(-1)[1];onNotebookResult(id,JSON.stringify({sources:[{id:'semester',title:'Materia',pages:[{id:'p8',number:8},{id:'p9',number:9}]},{id:'class',title:'Clase',pages:[{id:'new',number:1}]}]}),null);});
  assert.equal(await page.locator('#notebookQueue li').count(),3);await page.locator('#notebookQueue li').first().getByRole('button',{name:/↓/}).click();
  await page.getByLabel('Materia, página 8',{exact:true}).uncheck();await page.fill('#notebookName','Materia semestre');await page.click('#notebookExport');await page.click('#notebookSkipCurrent');
  const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='notebook-action').at(-1));assert.equal(call[1],'merge');assert.deepEqual(JSON.parse(call[2]),{title:'Materia semestre',pages:[{source:'semester',page:'p9'},{source:'class',page:'new'}]});
  assert.equal(await page.isDisabled('#notebookClose'),true);await page.evaluate(id=>onNotebookResult(id-1,'{"fileSaved":true}',null),call[3]);assert.equal(await page.isDisabled('#notebookClose'),true);
  await page.evaluate(id=>onNotebookResult(id,'{"fileSaved":true}',null),call[3]);await page.screenshot({path:path.join(root,'test-results','notebooks-editor.png')});await page.click('#notebookClose');assert.deepEqual(await lines(page),['Apunte intacto']);
});

test('Formula help disappears on writing only and reappears when editing again',async page=>{
  await setup(page);await openMath(page);
  assert.match(await page.textContent('#mathMessage'),/^Toca una casilla/);
  await page.click('[data-template="fraction"]');
  assert.match(await page.textContent('#mathMessage'),/^Toca una casilla/);
  await page.getByLabel('Numerador',{exact:true}).fill('12');
  assert.equal(await page.isVisible('#mathMessage'),false);
  await page.click('#mathDone');const warning=await page.textContent('#mathMessage');assert.match(warning,/Completa/);
  await page.getByLabel('Denominador',{exact:true}).fill('3');
  assert.equal(await page.textContent('#mathMessage'),warning);
  await page.click('#mathDone');await page.click('.objectBlock button');
  assert.match(await page.textContent('#mathMessage'),/^Toca una casilla/);
  await page.getByLabel('Numerador',{exact:true}).click();await page.click('#mathDigits button:first-child');
  assert.equal(await page.isVisible('#mathMessage'),false);
});
test('Mixed formula and graph rows fit automatically in both orders and undo restores widths',async page=>{
  for(const first of ['formula','graph']){
    await setup(page);await openMath(page,first);
    if(first==='formula')await page.locator('.mathSlot').first().fill('x=2');
    await page.click('#mathDone');const before=await page.evaluate(()=>serializeDocument().paragraphs[0].object);
    await select(page,{line:1,offset:0});await openMath(page,first==='formula'?'graph':'formula');
    if(first==='graph')await page.locator('.mathSlot').first().fill('y=3');
    await page.check('#mathBeside');await page.click('#mathDone');
    const objects=await page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.type).map(p=>p.object));
    assert.equal(objects.length,2);assert.notEqual(objects[0].kind,objects[1].kind);assert.equal(objects[1].beside,true);
    assert.ok(objects[0].left+objects[0].width<=objects[1].left);assert.ok(objects[1].left+objects[1].width<=16);
    assert.ok(objects.every(o=>o.width>=(o.kind==='graph'?4:2)));
    await page.click('#undoBtn');assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object),before);
    assert.equal(await page.locator('.objectBlock').count(),1);
  }
});
test('Graph touch preserves free decimals and only attracts nearby divisions or halves',async page=>{
  await setup(page);await openMath(page,'graph');
  for(const [key,value] of [['xmax','100'],['ymax','100'],['xstep','20'],['ystep','10']]){await page.fill('#graph_'+key,value);await page.locator('#graph_'+key).blur();}
  await graphPaste(page,'0; 0\n100; 100');await page.locator('#graphPoints').blur();await page.check('#graphTapAdd');
  async function tap(x,y){
    const at=await page.evaluate(({x,y})=>{
      const svg=document.getElementById('graphSVG'),a=svg.querySelectorAll('.graphPoint')[0],b=svg.querySelectorAll('.graphPoint')[1],p=svg.createSVGPoint();
      p.x=+a.getAttribute('cx')+(+b.getAttribute('cx')-+a.getAttribute('cx'))*x/100;
      p.y=+a.getAttribute('cy')+(+b.getAttribute('cy')-+a.getAttribute('cy'))*y/100;
      const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};
    },{x,y});await page.touchscreen.tap(at.x,at.y);
  }
  await tap(12.223244,24.55434);await tap(55,21);await tap(90.12732,15.12732);
  let points=await page.evaluate(()=>MathGraphEditor.state().pendingMath.object.series[0].points);
  assert.equal(points.length,5);
  assert.ok(Math.abs(points[2].x-12.223244)<.0001);assert.ok(Math.abs(points[2].y-24.55434)<.0001);
  assert.ok(Math.abs(points[3].x-55)<.0001);assert.ok(Math.abs(points[3].y-21)<.0001);
  assert.equal(points[4].x,90);assert.equal(points[4].y,15);
  await page.uncheck('#graphSnap');await tap(70.123,75.123);
  points=await page.evaluate(()=>MathGraphEditor.state().pendingMath.object.series[0].points);
  assert.ok(Math.abs(points.at(-1).x-70.123)<.0001);assert.ok(Math.abs(points.at(-1).y-75.123)<.0001);
  await page.click('#mathDone');await page.evaluate(()=>saveDraft());await page.reload();
  assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0].points),points);
});
test('Formula cursor crosses every base and index character with physical and screen arrows',async page=>{
  await setup(page);await openMath(page);await page.locator('.mathSlot').fill('ABC');await page.locator('.mathSlot').selectText();await page.click('[data-template="subscript"]');
  await page.getByLabel('Subíndice',{exact:true}).fill('12');
  const base=page.getByLabel('Base',{exact:true});await base.focus();await base.evaluate(n=>{n.setSelectionRange(0,0);n.dispatchEvent(new Event('select'));});
  for(let i=1;i<=3;i++){await page.keyboard.press('ArrowRight');assert.equal(await base.evaluate(n=>n.selectionStart),i);}
  await page.keyboard.press('ArrowRight');assert.equal(await page.getByLabel('Subíndice',{exact:true}).evaluate(n=>n===document.activeElement&&n.selectionStart===0),true);
  await page.click('#mathNext');assert.equal(await page.getByLabel('Subíndice',{exact:true}).evaluate(n=>n.selectionStart),1);
  await page.click('#mathNext');assert.equal(await page.getByLabel('Subíndice',{exact:true}).evaluate(n=>n.selectionStart),2);
  await page.click('#mathPrevious');assert.equal(await page.getByLabel('Subíndice',{exact:true}).evaluate(n=>n.selectionStart),1);
});
test('Graph pinch zoom does not add points and preview drag does not pan the page',async page=>{
  await setup(page);await openMath(page,'graph');await page.check('#graphTapAdd');
  const r=await page.locator('#graphSVG').boundingBox(),session=await page.context().newCDPSession(page),cx=r.x+r.width/2,cy=r.y+r.height/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy},{x:cx+30,y:cy}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-60,y:cy},{x:cx+60,y:cy}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('.graphPoint').count(),0);assert.ok(parseInt(await page.textContent('#graphZoomReset'))>150);
  await page.click('#mathDone');
  await page.evaluate(()=>{const o=serializeDocument().paragraphs[0].object;composition={snapshot:'drag-check',page_count:1,object_pages:[[{id:o.id,kind:o.kind,x:60,y:60,width:415,height:470}]]};previewRevision=revision;zoom=1.4;applyZoom();MathGraphEditor.mode(true);});
  await page.locator('.objectSelect').click();
  const scroll=await page.locator('#previewWrap').evaluate(n=>[n.scrollLeft,n.scrollTop]),b=await page.locator('.objectMove').boundingBox();
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+12,y:b.y+12}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+40,y:b.y+40}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await page.locator('#previewWrap').evaluate(n=>[n.scrollLeft,n.scrollTop]),scroll);
  assert.equal(await page.locator('#previewWrap').evaluate(n=>n.classList.contains('objectManipulating')),false);
});
test('Notebook current source uses fresh content and requires page review before merging',async page=>{
  await setup(page,'Texto nuevo');await page.click('[data-tab="save"]');await page.click('#mergeNotebooks');await page.click('#notebookCurrent');
  const current=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='notebook-action').at(-1));assert.equal(current[1],'current');
  assert.equal(JSON.parse(current[2]).document.paragraphs[0].segments[0].text,'Texto nuevo');
  await page.evaluate(id=>onNotebookResult(id,JSON.stringify({sources:[{id:'open1',current:true,title:'Documento abierto',pages:[{id:'p1',number:1},{id:'p2',number:2}]}]}),null),current[3]);
  assert.equal(await page.locator('#notebookQueue li').count(),2);assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='notebook-action'&&c[1]==='merge').length),0);
  await page.click('#notebookExport');const merge=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='notebook-action').at(-1));assert.equal(merge[1],'merge');
  assert.deepEqual(JSON.parse(merge[2]).pages,[{source:'open1',page:'p1'},{source:'open1',page:'p2'}]);
  await page.evaluate(id=>onNotebookResult(id,'{"fileSaved":true,"name":"Unido.hinote"}',null),merge[3]);await page.click('#notebookClose');
  await setup(page,'Edición posterior');await page.click('[data-tab="save"]');await page.click('#mergeNotebooks');await page.click('#notebookCurrent');
  const updated=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='notebook-action').at(-1));assert.equal(JSON.parse(updated[2]).document.paragraphs[0].segments[0].text,'Edición posterior');
});

async function mathPreview(page){await page.evaluate(()=>{const objects=serializeDocument().paragraphs.filter(p=>p.object).map(p=>p.object);composition={snapshot:'selection-mock',page_count:1,object_pages:[objects.map((o,i)=>({id:o.id,kind:o.kind,x:60+i*220,y:75,width:200,height:220}))]};previewRevision=revision;zoom=.8;applyZoom();});}
async function assertPinnedVisible(page,id){
  const box=await page.locator(id).boundingBox(),ribbon=await page.locator('.toolbar').boundingBox();
  assert.ok(box&&box.x>=ribbon.x&&box.x+box.width<=ribbon.x+ribbon.width);
  assert.ok(box.y>=ribbon.y&&box.y+box.height<=ribbon.y+ribbon.height);
  assert.ok(box.width>=44&&box.height>=44);
}
async function scrollRibbonRight(page){
  const scroll=await page.locator('#toolbarScroll').evaluate(n=>{n.scrollLeft=n.scrollWidth;return n.scrollLeft;});
  assert.ok(scroll>100,'The ribbon must overflow and actually scroll');
}
test('V35 undo and redo stay visible while only the other ribbon controls scroll',async page=>{
  await setup(page,'Texto');await select(page,{line:0,offset:5});await paste(page,' nuevo');
  for(const width of [1280,960,390]){
    await page.setViewportSize({width,height:850});await page.click('[data-tab="text"]');
    const before=await page.locator('#undoBtn').boundingBox();await scrollRibbonRight(page);
    await assertPinnedVisible(page,'#undoBtn');await assertPinnedVisible(page,'#redoBtn');
    assert.equal((await page.locator('#undoBtn').boundingBox()).x,before.x);
    await page.click('#undoBtn');assert.deepEqual(await lines(page),['Texto']);
    await page.click('#redoBtn');assert.deepEqual(await lines(page),['Texto nuevo']);
    assert.ok(await page.locator('#toolbarScroll').evaluate(n=>n.scrollLeft)>100);
  }
});
test('V38 paste stays pinned after every paste and keeps the reusable element',async page=>{
  for(const kind of ['formula','graph']){
    await setup(page);await openMath(page,kind);if(kind==='formula')await page.locator('.mathSlot').first().fill('x=2');await page.click('#mathDone');
    await mathPreview(page);await page.locator('.objectSelect').first().click();await page.click('.objectCopy');
    await page.click('[data-tab="text"]');await scrollRibbonRight(page);
    await assertPinnedVisible(page,'#pasteMath');await assertPinnedVisible(page,'#undoBtn');await assertPinnedVisible(page,'#redoBtn');
    assert.equal(await page.locator('#toolbarPinned #pasteMath').count(),1);
    assert.equal((await page.textContent('#pasteMath')).trim(),'');assert.equal(await page.locator('#pasteMath svg').count(),1);
    assert.equal(await page.getAttribute('#pasteMath','aria-label'),'Pegar tabla, fórmula o gráfica');
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','v35-pinned-paste-'+kind+'.png')});
    await select(page,{line:1,offset:0});await page.click('#pasteMath');
    assert.equal(await page.locator('.objectBlock').count(),2);assert.equal(await page.locator('#toolbarPinned #pasteMath').count(),1);assert.equal(await page.isDisabled('#pasteMath'),false);
    await page.click('#pasteMath');assert.equal(await page.locator('.objectBlock').count(),3);assert.equal(await page.locator('#toolbarPinned #pasteMath').count(),1);
    await page.click('#undoBtn');assert.equal(await page.locator('.objectBlock').count(),2);await page.click('#redoBtn');assert.equal(await page.locator('.objectBlock').count(),3);
    await mathPreview(page);await page.locator('.objectSelect').first().click();await page.click('.objectCopy');
    await page.click('[data-tab="images"]');await scrollRibbonRight(page);await assertPinnedVisible(page,'#pasteMath');
    await page.evaluate(()=>{exporting=true;controls();MathGraphEditor.pasteObject();});
    assert.equal(await page.locator('.objectBlock').count(),3);assert.equal(await page.locator('#toolbarPinned #pasteMath').count(),1);assert.equal(await page.isDisabled('#pasteMath'),true);
    await page.evaluate(()=>{exporting=false;controls();});await page.click('#pasteMath');
    assert.equal(await page.locator('.objectBlock').count(),4);assert.equal(await page.locator('#toolbarPinned #pasteMath').count(),1);
    const objects=await page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.object).map(p=>p.object));
    assert.equal(new Set(objects.map(o=>o.id)).size,4);for(const o of objects.slice(1))assert.deepEqual(o[kind==='formula'?'expression':'series'],objects[0][kind==='formula'?'expression':'series']);
  }
});
test('V34 math controls appear only on the tapped object in every tab',async page=>{
  await setup(page);await openMath(page,'graph');await page.click('#mathDone');await select(page,{line:1,offset:0});await openMath(page,'graph');await page.click('#mathDone');await mathPreview(page);
  assert.equal(await page.locator('.objectTarget').count(),0);
  for(const tab of ['text','lists','page','images','tables','math','save','calibration']){
    await page.click('[data-tab="'+tab+'"]');await page.locator('.objectSelect').first().click();
    assert.equal(await page.locator('.objectTarget').count(),1);assert.equal(await page.locator('.objectMove').count(),1);
    const first=await page.locator('.objectTarget').getAttribute('data-id');await page.locator('.objectSelect').last().click();
    assert.equal(await page.locator('.objectTarget').count(),1);assert.notEqual(await page.locator('.objectTarget').getAttribute('data-id'),first);
  }
});
test('V34 copied math retains editable data independently and quick deletion is undoable',async page=>{
  await setup(page);await openMath(page);await page.locator('.mathSlot').first().fill('x=2');await page.click('#mathDone');await mathPreview(page);await page.locator('.objectSelect').click();await page.click('.objectCopy');
  await select(page,{line:1,offset:0});await page.click('#pasteMath');let objects=await page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.object).map(p=>p.object));assert.equal(objects.length,2);assert.notEqual(objects[0].id,objects[1].id);assert.deepEqual(objects[0].expression,objects[1].expression);
  await page.locator('.objectBlock button').last().click();await page.locator('.mathSlot').first().fill('x=9');await page.click('#mathDone');
  objects=await page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.object).map(p=>p.object));assert.equal(objects[0].expression.items[0].text,'x=2');assert.equal(objects[1].expression.items[0].text,'x=9');
  await mathPreview(page);await page.locator('.objectSelect').last().click();await page.click('.objectDelete');assert.equal(await page.locator('.objectBlock').count(),1);await page.click('#undoBtn');assert.equal(await page.locator('.objectBlock').count(),2);
});
test('V34 touch selects math while pinch and background dragging keep working over it',async page=>{
  await setup(page);await openMath(page,'graph');await page.click('#mathDone');await mathPreview(page);
  const session=await page.context().newCDPSession(page);let box=await page.locator('.objectSelect').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  const before=await page.evaluate(()=>zoom);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-25,y:cy,id:1},{x:cx+25,y:cy,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.evaluate(()=>zoom)>before);assert.equal(await page.locator('.objectTarget').count(),0);
  box=await page.locator('.objectSelect').boundingBox();cx=box.x+box.width/2;cy=box.y+box.height/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:3}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForSelector('.objectTarget');
  const object=await page.evaluate(()=>serializeDocument().paragraphs[0].object),scroll=await page.locator('#previewWrap').evaluate(n=>n.scrollTop);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:4}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-30,id:4}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.locator('#previewWrap').evaluate(n=>n.scrollTop)>scroll);assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs[0].object),object);
});
test('V34 direct save composes pending content and remains separate from notebook merging',async page=>{
  await setup(page,'Contenido pendiente');await page.click('[data-tab="save"]');assert.equal(await page.locator('#saveDirect').count(),0);assert.equal(await page.isVisible('#mergeNotebooks'),true);
  await page.click('#exportBtn');const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').at(-1));assert.ok(call);assert.equal(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='save')),false);
  await page.evaluate(id=>onComposeResult(id,JSON.stringify({snapshot:'quick-save',page_count:1,warnings:[]})),call[3]);assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='save').at(-1)[1]),'quick-save');assert.equal(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='notebook-action')),false);
  await page.evaluate(()=>onExportComplete(true,'Guardado'));
});
test('V34 graph names follow the trace and help stays collapsed until requested',async page=>{
  await setup(page);await openMath(page,'graph');assert.equal(await page.locator('#graphHelp').getAttribute('open'),null);assert.equal(await page.isVisible('#graphGridInfo'),false);assert.equal(await page.getAttribute('#graphUndo','aria-label'),'Deshacer gráfica');
  await page.locator('#graphBulk summary').click();await page.fill('#graphPoints','1; 9; A\n8; 2; B');await page.fill('#graphTraceLabel','Demanda');await page.locator('#graphTraceLabel').blur();
  assert.equal(await page.locator('[data-trace-label]').count(),1);assert.match(await page.locator('[data-trace-label]').getAttribute('transform'),/rotate\(/);await page.click('#mathDone');
  const trace=await page.evaluate(()=>serializeDocument().paragraphs[0].object.series[0]);assert.equal(trace.label,'Demanda');assert.equal(trace.labelPosition,'auto');await page.click('.objectBlock button');assert.equal(await page.inputValue('#graphTraceLabel'),'Demanda');await page.click('#mathCancel');
});
test('V34 formula auto width reflects native measurements and manual resizing remains explicit',async page=>{
  await setup(page);await openMath(page);assert.equal(await page.isChecked('#mathAutoWidth'),true);await page.locator('.mathSlot').first().fill('x=2');await page.click('#mathDone');
  await page.evaluate(()=>{const o=serializeDocument().paragraphs[0].object;MathGraphEditor.applyMeasurements({object_pages:[[{id:o.id,width:40/.675*2.5}]]});});
  assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.width),2.5);await page.click('.objectBlock button');await page.fill('#mathWidth','6');await page.locator('#mathWidth').blur();assert.equal(await page.isChecked('#mathAutoWidth'),false);await page.click('#mathDone');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].object.width),6);
});

test('V34 stable keeps Notes experiments out of its interface',async page=>{
  assert.equal(await page.evaluate(()=>NotesProbeUI.isEnabled()),false);assert.equal(await page.locator('#openNotesProbe').count(),0);assert.equal(await page.locator('#notesProbeDialog').count(),0);
});
async function enableNotesProbe(page){await page.evaluate(()=>localStorage.setItem('test-probe-enabled','true'));await page.reload();await page.waitForSelector('#editor .line');await setup(page,'Contenido nuevo para Notes');}
async function finishProbe(page,result={message:'Listo'}){const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1));await page.evaluate(({id,result})=>onNotesProbeResult(id,JSON.stringify(result),null),{id:call[3],result});return call;}
test('V34 Pruebas guides the control test and ignores outdated diagnostic replies',async page=>{
  await enableNotesProbe(page);await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);
  await page.locator('#probeLegacy summary').click();await page.click('#probeSeedA');const control=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1));assert.equal(control[1],'seed-a');assert.equal(await page.isDisabled('#probeClose'),true);
  await page.evaluate(id=>onNotesProbeResult(id-1,'{"message":"respuesta vieja"}',null),control[3]);assert.equal(await page.isDisabled('#probeClose'),true);
  await finishProbe(page,{message:'PRUEBA-A copiado',report:{events:[{kind:'seed-a'}]}});assert.match(await page.textContent('#probeReport'),/seed-a/);
  await page.click('#probeInspect');assert.equal((await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1)))[1],'inspect');await finishProbe(page,{message:'El control sigue intacto'});await page.click('#probeClose');assert.equal(await page.evaluate(()=>document.querySelector('.app').inert),false);
});
test('V34 Pruebas exports fresh editable math and recovers controls after failure',async page=>{
  await enableNotesProbe(page);await select(page,{line:0,offset:0});await openMath(page);await page.locator('.mathSlot').first().fill('x=9');await page.click('#mathDone');
  await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);await page.locator('#probeLegacy summary').click();await page.click('#probeCopyHinote');
  const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1)),args=JSON.parse(call[2]);assert.equal(call[1],'page-hinote');assert.equal(args.page,0);assert.equal(args.document.paragraphs.find(p=>p.object).object.expression.items[0].text,'x=9');assert.match(args.document.paragraphs.map(p=>p.segments?.map(s=>s.text).join('')||'').join(''),/Contenido nuevo/);
  assert.equal(await page.evaluate(()=>exporting),true);await page.evaluate(id=>onNotesProbeResult(id,null,'Prueba de error'),call[3]);assert.equal(await page.evaluate(()=>exporting),false);assert.equal(await page.isDisabled('#probeClose'),false);assert.equal(await page.textContent('#probeStatus'),'Prueba de error');await page.click('#probeClose');assert.equal(await page.getAttribute('#editor','contenteditable'),'true');
});
test('V34 Pruebas preserves observations in the exported diagnostic request',async page=>{
  await enableNotesProbe(page);await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);await page.locator('#probeLegacy summary').click();await page.selectOption('#probePngResult',{label:'Pega como imagen'});await page.selectOption('#probeHinoteResult',{label:'No pega el contenido de HiNote'});await page.fill('#probeObservations','Notes conserva las rayas del lazo');await page.click('#probeSaveReport');
  const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1));assert.equal(call[1],'save-report');assert.deepEqual(JSON.parse(call[2]),{redraw_test:'No probado',temporary_notebook_test:'No probado',png_paste:'Pega como imagen',hinote_paste:'No pega el contenido de HiNote',shared_page:'No probado',notes:'Notes conserva las rayas del lazo'});await finishProbe(page,{message:'Informe guardado'});await page.screenshot({path:path.join(root,'test-results/notes-probe.png')});await page.click('#probeClose');
});

test('V36 offers both native transfer experiments and exports current page for each',async page=>{
  await enableNotesProbe(page);await select(page,{line:0,offset:0});await openMath(page);await page.locator('.mathSlot').first().fill('x=36');await page.click('#mathDone');
  await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);
  assert.equal(await page.locator('#transferModes > section').count(),2);assert.equal(await page.locator('#probeCopyPng').isVisible(),false);
  for(const [id,action] of [['probeDrawSample','transfer-sample-redraw'],['probeDrawPage','page-redraw'],['probeBridgeSample','page-sample-bridge'],['probeBridgePage','page-bridge'],['probeResumeBridge','transfer-resume'],['probeSaveTemporary','transfer-save'],['probeAccess','transfer-settings'],['probeStop','transfer-stop']]){
    await page.click('#'+id);const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1));assert.equal(call[1],action);
    if(action.startsWith('page-')){const args=JSON.parse(call[2]);assert.equal(args.page,0);assert.equal(args.document.paragraphs.find(p=>p.object).object.expression.items[0].text,'x=36');assert.equal(await page.evaluate(()=>exporting),true);}
    await finishProbe(page,{message:'Esperando verificación en Notes'});assert.equal(await page.evaluate(()=>exporting),false);
  }
  await page.screenshot({path:path.join(root,'test-results/notes-transfer-v36.png')});
});
test('V36 saves both transfer outcomes across reload and includes them in its report',async page=>{
  await enableNotesProbe(page);await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);
  await page.selectOption('#probeRedrawResult',{label:'Puedo seleccionar y mover cada raya'});await page.selectOption('#probeBridgeResult',{label:'Copié manualmente y pegué trazos editables'});await page.fill('#probeObservations','La copia manual funciona; revisar el botón Copiar.');
  await page.reload();await page.waitForSelector('#editor .line');await page.click('[data-tab="save"]');await page.click('#openNotesProbe');await finishProbe(page);await page.click('#probeSaveReport');
  const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='probe-action').at(-1)),data=JSON.parse(call[2]);assert.equal(data.redraw_test,'Puedo seleccionar y mover cada raya');assert.equal(data.temporary_notebook_test,'Copié manualmente y pegué trazos editables');assert.match(data.notes,/copia manual/);
  await finishProbe(page,{message:'Guardado'});
});

test('V38 text controls follow each selection and reapply 90 percent without an intermediate value',async page=>{
  await setup(page,'primero segundo');await select(page,{line:0,offset:0},{line:0,offset:7});await page.selectOption('#sizeSel','90');
  await select(page,{line:0,offset:8},{line:0,offset:15});assert.equal(await page.inputValue('#sizeSel'),'100');await page.selectOption('#sizeSel','90');
  await page.fill('#opacity','75');await page.fill('#hexInput','#2468AC');await page.selectOption('#thicknessSel','3');
  const segments=await page.evaluate(()=>readLines()[0]);assert.equal(segments.at(-1).scale,.9);assert.equal(segments.at(-1).opacity,75);assert.equal(segments.at(-1).color,'#2468AC');assert.equal(segments.at(-1).thickness,3);
  await select(page,{line:0,offset:0},{line:0,offset:7});assert.equal(await page.inputValue('#opacity'),'100');assert.equal(await page.inputValue('#hexInput'),'#000000');assert.equal(await page.inputValue('#thicknessSel'),'0');
  await select(page,{line:0,offset:0},{line:0,offset:15});assert.equal(await page.inputValue('#sizeSel'),'mixed');assert.equal(await page.inputValue('#opacity'),'');
  await select(page,{line:0,offset:8},{line:0,offset:15});await page.fill('#opacity','80');await page.press('#opacity','ArrowUp');assert.equal(await page.inputValue('#opacity'),'81');assert.equal(await page.evaluate(()=>readLines()[0].at(-1).opacity),81);
  await page.fill('#opacity','');await page.keyboard.type('85');assert.equal(await page.inputValue('#opacity'),'85');assert.equal(await page.evaluate(()=>readLines()[0].at(-1).opacity),85);
  assert.equal(await page.locator('#applyFormat').count(),0);
});
test('V38 list indentation reaches zero, follows paragraphs, and migrates old drafts once',async page=>{
  await setup(page,'• uno\n• dos');await select(page,{line:0,offset:5});await page.click('[data-tab="lists"]');
  await page.click('#indentBtn');assert.equal(await page.inputValue('#listIndent'),'1');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].list.level),1);
  await page.click('#outdentBtn');assert.equal(await page.inputValue('#listIndent'),'0');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].list.base_indent_squares),0);
  await select(page,{line:1,offset:5});await page.fill('#listIndent','3');await page.press('#listIndent','Tab');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[1].list.level),3);assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].list.level),0);
  const oldDraft=await page.evaluate(()=>{saveDraft();const data=JSON.parse(AndroidBridge.getDraft());data.version=32;data.lines=[[{text:'• antiguo',...DEFAULT_STYLE}]];data.settings.list_indent_squares=2;return JSON.stringify(data);});
  // Seed after the outgoing document's pagehide autosave, only on the first load.
  await page.addInitScript(raw=>{if(!sessionStorage.getItem('old-list-draft-seeded')){localStorage.setItem('native-draft',raw);sessionStorage.setItem('old-list-draft-seeded','true');}},oldDraft);
  await page.reload();await page.waitForSelector('#editor .line');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].list.level),2);await page.evaluate(()=>saveDraft());
  await page.reload();await page.waitForSelector('#editor .line');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].list.level),2);
});
test('V38 tables select one at a time in all tabs, copy independently and delete with undo',async page=>{
  await setup(page);assert.equal(await page.isDisabled('#pasteMath'),true);await openTable(page);await fillCell(page,0,0,'Original');await page.click('#tableDone');
  const preview=()=>{const tables=serializeDocument().paragraphs.filter(p=>p.table).map(p=>p.table);composition={snapshot:'tables',page_count:1,table_pages:[tables.map((t,i)=>({id:t.id,x:59,y:150+i*220,width:500,height:180}))]};previewRevision=revision;zoom=.6;applyZoom();};
  await page.evaluate(preview);assert.equal(await page.locator('.tableTarget').count(),0);await page.locator('.tableSelect').tap();await page.click('.tableCopy');
  await select(page,{line:1,offset:0});await page.click('#pasteMath');assert.equal(await page.locator('.tableBlock').count(),2);
  await page.locator('.tableBlock button').last().click();await fillCell(page,0,0,'Copia');await page.click('#tableDone');
  assert.deepEqual(await page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.table).map(p=>lineText(p.table.rows[0].cells[0].segments))),['Original','Copia']);
  await page.evaluate(preview);
  for(const tab of ['text','lists','page','images','tables','math','save','calibration']){
    await page.click('[data-tab="'+tab+'"]');await page.locator('.tableSelect').first().tap();assert.equal(await page.locator('.tableTarget').count(),1);
    const id=await page.locator('.tableTarget').getAttribute('data-id');await page.locator('.tableSelect').last().tap();assert.equal(await page.locator('.tableTarget').count(),1);assert.notEqual(await page.locator('.tableTarget').getAttribute('data-id'),id);
  }
  await page.click('.tableDelete');assert.equal(await page.locator('.tableBlock').count(),1);await page.click('#undoBtn');assert.equal(await page.locator('.tableBlock').count(),2);
});
test('V38 quick calibration changes the note and survives reload without opening the manager',async page=>{
  await calibrationBridge(page);await page.click('#closeCalibration');await page.selectOption('#activeProfileSelect','a'.repeat(32));
  assert.equal(await page.evaluate(()=>settings().profile),'a'.repeat(32));assert.equal(await page.isVisible('#calibrationDialog'),false);
  await page.reload();await page.waitForFunction(()=>!CalibrationUI.isBusy());assert.equal(await page.inputValue('#activeProfileSelect'),'a'.repeat(32));
  await page.click('[data-tab="calibration"]');await page.selectOption('#activeProfileSelect','original');assert.equal(await page.evaluate(()=>settings().profile),'original');
});
test('V38 direct Notes export composes fresh content and never invokes save or accessibility',async page=>{
  await setup(page,'Exportación completa');await page.click('#exportNotesBtn');assert.equal(await page.isDisabled('#exportNotesBtn'),true);
  const id=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').at(-1)[3]);await page.evaluate(id=>onComposeResult(id,JSON.stringify({snapshot:'to-notes',page_count:3,warnings:[]})),id);
  assert.deepEqual(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='open-notes').at(-1)),['open-notes','to-notes','Nueva nota',true,'[]',3]);
  assert.equal(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='save'||c[0]==='probe-action')),false);
  await page.evaluate(()=>onExportComplete(false,'Notes no disponible'));assert.equal(await page.isDisabled('#exportBtn'),false);assert.equal(await page.isDisabled('#exportNotesBtn'),false);
});
test('V38 physical keyboard keeps input editable and restores virtual hints in all editors',async page=>{
  await setup(page,'Texto');await page.evaluate(()=>onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}'));
  assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');
  await select(page,{line:0,offset:5});await page.keyboard.type(' fisico');assert.deepEqual(await lines(page),['Texto fisico']);
  await openMath(page,'graph');assert.equal(await page.getAttribute('#graphPointX','inputmode'),'none');
  await page.evaluate(()=>onKeyboardState('{"mode":"auto","hardware":false,"suppress":false}'));assert.equal(await page.getAttribute('#graphPointX','inputmode'),'decimal');assert.equal(await page.getAttribute('#editor','inputmode'),null);await page.click('#mathCancel');
  await page.evaluate(()=>{onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}');});await openTable(page);assert.equal(await page.locator('.cellEditor').first().getAttribute('inputmode'),'none');
  await page.evaluate(()=>onKeyboardState('{"mode":"virtual","hardware":true,"suppress":false}'));assert.equal(await page.locator('.cellEditor').first().getAttribute('inputmode'),null);assert.equal(await page.getAttribute('#editor','contenteditable'),'true');
});

async function keyboardTouchBridge(page){
  await page.evaluate(()=>{
    window.keyboardRequests=[];
    AndroidBridge.beginTouchKeyboard=()=>keyboardRequests.push('begin');
    AndroidBridge.requestTouchKeyboard=()=>keyboardRequests.push('show');
    onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}');
  });
}
test('V39 touch opens virtual input with hardware attached, mouse does not, and typing keeps the caret',async page=>{
  await setup(page,'Texto');await keyboardTouchBridge(page);
  await page.locator('#noteTitle').tap();await page.waitForFunction(()=>keyboardRequests.includes('show'));
  assert.equal(await page.getAttribute('#noteTitle','inputmode'),null);assert.equal(await page.evaluate(()=>hinoteKeyboardCanShow()),true);
  await page.evaluate(()=>{keyboardRequests=[];onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}');});
  await page.click('#noteTitle');assert.deepEqual(await page.evaluate(()=>keyboardRequests),[]);assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');
  await page.locator('#editor .line').tap();await page.waitForFunction(()=>keyboardRequests.includes('show'));await select(page,{line:0,offset:5});
  await page.evaluate(()=>onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}'));await page.keyboard.type(' físico');assert.deepEqual(await lines(page),['Texto físico']);
  await openMath(page,'graph');await keyboardTouchBridge(page);await page.locator('#graphPointX').tap();await page.waitForFunction(()=>keyboardRequests.includes('show'));assert.equal(await page.getAttribute('#graphPointX','inputmode'),'decimal');
});
test('V39 buttons, dragging, multitouch and physical-only mode never request virtual input',async page=>{
  await setup(page,'Texto');await keyboardTouchBridge(page);await page.locator('[data-tab="page"]').tap();assert.deepEqual(await page.evaluate(()=>keyboardRequests),[]);
  const editorBox=await page.locator('#editor').boundingBox(),client=await page.context().newCDPSession(page),x=editorBox.x+50,y=editorBox.y+30;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+60,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.evaluate(()=>keyboardRequests.includes('show')),false);
  await page.evaluate(()=>{keyboardRequests=[];onKeyboardState('{"mode":"auto","hardware":true,"suppress":true}');});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1},{x:x+40,y,id:2}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.evaluate(()=>keyboardRequests.includes('show')),false);
  await page.evaluate(()=>{keyboardRequests=[];onKeyboardState('{"mode":"physical","hardware":true,"suppress":true}');});await page.locator('#noteTitle').tap();assert.deepEqual(await page.evaluate(()=>keyboardRequests),[]);assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');
});

(async () => {
  const server = http.createServer((request,response) => {
    const url=request.url.split('?')[0],file=['/editor.js','/images.js','/images.css','/tables.js','/tables.css','/math_graph.js','/math_graph.css','/notebooks.js','/notes_probe.js','/calibration.js','/calibration.css','/logo-hinote.svg'].includes(url)?url.slice(1):'index.html';
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'); response.end(fs.readFileSync(path.join(assets,file)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;try{browser=await chromium.launch({headless:true});}catch(e){server.close();throw e;} let failed = 0;
  try {
    const selected = process.env.TEST_FILTER ? tests.filter(t=>t.name.includes(process.env.TEST_FILTER)) : tests;
    for (const {name,fn} of selected) {
      const context = await browser.newContext({viewport:{width:1280,height:850},hasTouch:true});
      await context.route('https://hinote.local/images/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect x="10" y="10" width="620" height="460" fill="#21bca8"/><circle cx="320" cy="240" r="140" fill="#273c75"/></svg>'}));
      await context.addInitScript(() => { window.bridgeCalls=[]; window.AndroidBridge={
        invalidateCompose:(...a)=>bridgeCalls.push(['invalidate',...a]), requestCompose:(...a)=>bridgeCalls.push(['compose',...a]),
        requestPage:(...a)=>bridgeCalls.push(['page',...a]),requestPageHD:(...a)=>bridgeCalls.push(['pageHD',...a]), requestSave:(...a)=>bridgeCalls.push(['save',...a]),requestOpenNotes:(...a)=>bridgeCalls.push(['open-notes',...a]), cancelExport:()=>bridgeCalls.push(['cancel']),
        requestImage:(...a)=>bridgeCalls.push(['import',...a]),getDraft:()=>localStorage.getItem('native-draft')||'',saveDraft:raw=>{localStorage.setItem('native-draft',raw);return true;},
        getExportFolder:()=>localStorage.getItem('test-export-folder')||'{"configured":false,"label":""}',requestExportFolder:()=>bridgeCalls.push(['folder']),clearExportFolder:()=>bridgeCalls.push(['clear-folder']),
        requestNotebookImport:(...a)=>bridgeCalls.push(['notebook-import',...a]),requestNotebookAction:(...a)=>bridgeCalls.push(['notebook-action',...a]),cancelNotebook:()=>bridgeCalls.push(['notebook-cancel']),
        isNotesProbe:()=>localStorage.getItem('test-probe-enabled')==='true',hasProbeShare:()=>false,requestProbeAction:(...a)=>bridgeCalls.push(['probe-action',...a])}; });
      const page = await context.newPage(); page.setDefaultTimeout(10000); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('#editor .line'); await fn(page);
        assert.deepEqual(errors,[],'Uncaught browser errors'); console.log('PASS '+name);
        if(name.startsWith('Import, rotate')){fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/images-editor.png')});}
        if(name.startsWith('Tables preserve anchors')){await page.click('.tableBlock button');fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/tables-editor.png')});}
      } catch (error) {
        failed++; console.error('FAIL '+name+'\n'+error.stack); fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
        await page.screenshot({path:path.join(root,'test-results',name.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
  const total = process.env.TEST_FILTER ? tests.filter(t=>t.name.includes(process.env.TEST_FILTER)).length : tests.length;
  assert.ok(total, 'The test filter must select at least one test');
  console.log(`${total-failed}/${total} editor tests passed`); process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
