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
  await page.fill('#hexInput','#336699'); await page.fill('#opacity','45'); await page.click('#applyFormat');
  await page.selectOption('#sizeSel','100');
  assert.deepEqual(await page.evaluate(() => readLines()[0]),[{text:'Texto importante',scale:1,color:'#336699',opacity:45}]);
  await page.click('[data-tab="lists"]'); await page.click('#applyList'); await page.click('#indentBtn'); await page.click('#outdentBtn'); await page.click('#removeList');
  assert.deepEqual(await page.evaluate(() => readLines()[0]),[{text:'Texto importante',scale:1,color:'#336699',opacity:45}]);
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
  assert.equal(await page.isDisabled('#exportBtn'),true);
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

// Image editing is tested with real pointer/touch events and a mocked file picker.
async function importImage(page,asset='a',size=[640,480]){
  await page.click('[data-tab="images"]');await page.click('#insertImage');
  await page.evaluate(({asset,size})=>{
    const id=bridgeCalls.filter(c=>c[0]==='import').at(-1)[1];
    onImageImported(id,JSON.stringify({asset:asset.repeat(64),pixelWidth:size[0],pixelHeight:size[1]}),null);
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
  await page.evaluate(()=>{localStorage.removeItem(DRAFT_KEY);localStorage.removeItem('native-draft');localStorage.setItem('hinote-draft-v21',JSON.stringify({version:21,lines:[[{text:'Anterior',scale:1.5,color:'#336699',opacity:60}]],title:'V22',settings:{},grid:false}));});
  await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await lines(page),['Anterior']);
  assert.equal(await page.evaluate(()=>readLines()[0][0].scale),1.5);assert.equal((await imageState(page)).images.length,0);
});
test('Image metadata is frozen during export and extra image pages are included',async page=>{
  await setup(page,'Hola');await importImage(page);await page.fill('#imagePage','4');await page.press('#imagePage','Tab');
  await page.click('#refreshBtn');await page.evaluate(()=>{const id=bridgeCalls.filter(c=>c[0]==='compose').at(-1)[3];onComposeResult(id,JSON.stringify({snapshot:'with-images',page_count:1,warnings:[]}));});
  await page.click('#exportBtn');const call=await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='save').at(-1));
  assert.equal(call[5],4);assert.equal(JSON.parse(call[4])[0].page,3);assert.equal(await page.isDisabled('#rotateImageRight'),true);
});

(async () => {
  const server = http.createServer((request,response) => {
    const url=request.url.split('?')[0],file=['/editor.js','/images.js','/images.css','/logo-hinote.svg'].includes(url)?url.slice(1):'index.html';
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'); response.end(fs.readFileSync(path.join(assets,file)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;try{browser=await chromium.launch({headless:true});}catch(e){server.close();throw e;} let failed = 0;
  try {
    for (const {name,fn} of tests) {
      const context = await browser.newContext({viewport:{width:1280,height:850},hasTouch:true});
      await context.route('https://hinote.local/images/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect x="10" y="10" width="620" height="460" fill="#21bca8"/><circle cx="320" cy="240" r="140" fill="#273c75"/></svg>'}));
      await context.addInitScript(() => { window.bridgeCalls=[]; window.AndroidBridge={
        invalidateCompose:(...a)=>bridgeCalls.push(['invalidate',...a]), requestCompose:(...a)=>bridgeCalls.push(['compose',...a]),
        requestPage:(...a)=>bridgeCalls.push(['page',...a]), requestSave:(...a)=>bridgeCalls.push(['save',...a]), cancelExport:()=>bridgeCalls.push(['cancel']),
        requestImage:(...a)=>bridgeCalls.push(['import',...a]),getDraft:()=>localStorage.getItem('native-draft')||'',saveDraft:raw=>{localStorage.setItem('native-draft',raw);return true;}}; });
      const page = await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('#editor .line'); await fn(page);
        assert.deepEqual(errors,[],'Uncaught browser errors'); console.log('PASS '+name);
        if(name.startsWith('Import, rotate')){fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/images-editor.png')});}
      } catch (error) {
        failed++; console.error('FAIL '+name+'\n'+error.stack); fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
        await page.screenshot({path:path.join(root,'test-results',name.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
  console.log(`${tests.length-failed}/${tests.length} editor tests passed`); process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
