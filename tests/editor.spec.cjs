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
  assert.deepEqual(await page.evaluate(() => bridgeCalls.filter(c=>c[0]==='save').at(-1)),['save','current','Nueva nota',true]);
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

(async () => {
  const server = http.createServer((request,response) => {
    const file = request.url.split('?')[0] === '/editor.js' ? 'editor.js' : 'index.html';
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'); response.end(fs.readFileSync(path.join(assets,file)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true}); let failed = 0;
  try {
    for (const {name,fn} of tests) {
      const context = await browser.newContext({viewport:{width:1280,height:850}});
      await context.addInitScript(() => { window.bridgeCalls=[]; window.AndroidBridge={
        invalidateCompose:(...a)=>bridgeCalls.push(['invalidate',...a]), requestCompose:(...a)=>bridgeCalls.push(['compose',...a]),
        requestPage:(...a)=>bridgeCalls.push(['page',...a]), requestSave:(...a)=>bridgeCalls.push(['save',...a]), cancelExport:()=>bridgeCalls.push(['cancel'])}; });
      const page = await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('#editor .line'); await fn(page);
        assert.deepEqual(errors,[],'Uncaught browser errors'); console.log('PASS '+name);
      } catch (error) {
        failed++; console.error('FAIL '+name+'\n'+error.stack); fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
        await page.screenshot({path:path.join(root,'test-results',name.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
  console.log(`${tests.length-failed}/${tests.length} editor tests passed`); process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
