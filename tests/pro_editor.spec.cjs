/* Real glyph geometry with a mocked Android transport; no mocked layout. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'HiNote_Studio_Tablet_Android/app/src/main/assets');
const bank=JSON.parse(cp.execFileSync('python3',['tests/pro_fixture.py'],{cwd:root,maxBuffer:64*1024*1024}));
(async()=>{
  const server=http.createServer((req,res)=>{const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1),file=path.resolve(assets,name);if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.ttf')?'font/ttf':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:1000},hasTouch:true});
    await context.addInitScript(bank=>{
      window.testBank=bank;window.bridgeCalls=[];
      window.AndroidBridge={isProEditor:()=>true,isNotesProbe:()=>false,requestLiveLibrary:(profile,id)=>setTimeout(()=>onProLibrary(id,JSON.stringify({...testBank,profile}),null),0),
        invalidateCompose:(...args)=>bridgeCalls.push(['invalidate',...args]),setPreviewPage:()=>{},getDraft:()=>localStorage.getItem('native-draft')||'',saveDraft:raw=>{localStorage.setItem('native-draft',raw);return true;},
        requestCompose:(...args)=>bridgeCalls.push(['compose',...args]),requestSave:(...args)=>bridgeCalls.push(['save',...args]),requestOpenNotes:()=>{},getExportFolder:()=>'{"configured":false}',getTheme:()=> 'light',setTheme:()=>{},setEditingField:()=>{},beginTouchKeyboard:()=>{},requestTouchKeyboard:()=>{}};
    },bank);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ProEditor?.active);
    await page.evaluate(()=>{restoreSelection({start:{line:0,offset:0},end:{line:0,offset:0}});});
    await page.keyboard.type('Hola Hugo. ');await page.keyboard.insertText('Tu escritura, cálculo y precisión.');
    await page.waitForFunction(()=>ProEditor.testPlan().pages[0].items.length>20);
    assert.equal(await page.evaluate(()=>readLines().map(lineText).join('\n')),'Hola Hugo. Tu escritura, cálculo y precisión.');
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='compose').length),0,'Typing must not request native raster composition');
    assert.ok(await page.evaluate(()=>document.body.classList.contains('proUnified')));
    await page.evaluate(()=>checkpoint());
    // Click a real displayed position, not the hidden input, then insert.
    const point=await page.evaluate(()=>{const c=ProEditor.testPlan().pages[0].rows[0].carets.find(c=>c.offset===5),b=$('canvasShell').getBoundingClientRect();return {x:b.left+c.x*.675*zoom,y:b.top+(c.y-20)*.675*zoom};});
    await page.mouse.click(point.x,point.y);await page.keyboard.type('PRO ');
    assert.match(await page.evaluate(()=>lineText(readLines()[0])),/^Hola PRO Hugo/);
    await page.keyboard.press('Control+z');assert.match(await page.evaluate(()=>lineText(readLines()[0])),/^Hola Hugo/);
    // Touch tapping, one-finger pan and two-finger zoom use the same surface.
    await page.touchscreen.tap(point.x,point.y);await page.keyboard.type('T');
    assert.match(await page.evaluate(()=>lineText(readLines()[0])),/^Hola THugo/);
    await page.evaluate(()=>{
      const root=$('previewWrap'),capture=root.setPointerCapture;root.setPointerCapture=()=>{};const b=$('canvasShell').getBoundingClientRect(),event=(type,id,x,y)=>root.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===101,clientX:x,clientY:y,button:0,bubbles:true,cancelable:true}));
      window.proZoomBefore=zoom;event('pointerdown',101,b.left+100,b.top+180);event('pointerdown',102,b.left+200,b.top+180);event('pointermove',102,b.left+250,b.top+180);event('pointerup',102,b.left+250,b.top+180);event('pointerup',101,b.left+100,b.top+180);root.setPointerCapture=capture;
    });
    assert.ok(await page.evaluate(()=>zoom>proZoomBefore));
    // Synthetic pointers have no native capture; real browser pointers above do.
    // Native IME intermediate changes are drawn without committing the model.
    await page.evaluate(()=>{restoreSelection({start:{line:0,offset:4},end:{line:0,offset:4}});editor.dispatchEvent(new CompositionEvent('compositionstart'));document.execCommand('insertText',false,'ñ');editor.dispatchEvent(new InputEvent('input',{isComposing:true,inputType:'insertCompositionText'}));});
    assert.ok(await page.evaluate(()=>ProEditor.testPlan().pages.some(p=>p.items.some(c=>c.ch==='ñ'))));
    await page.evaluate(()=>editor.dispatchEvent(new CompositionEvent('compositionend')));
    // Preserve formatting / native selection operations.
    await page.evaluate(()=>restoreSelection({start:{line:0,offset:0},end:{line:0,offset:4}}));await page.selectOption('#sizeSel','150');
    assert.equal(await page.evaluate(()=>ProEditor.testPlan().pages[0].items[0].scale),1.5);
    // Paginate a realistic note, then measure steady edits on the visible page.
    await page.evaluate(()=>{renderLines(Array.from({length:65},(_,i)=>[{text:`Renglón ${i+1}: apuntes de comunicación y datos.`,...DEFAULT_STYLE}]));restoreSelection({start:{line:64,offset:0},end:{line:64,offset:0}});changed();});
    assert.ok(await page.evaluate(()=>ProEditor.metrics().pages>=2));
    const times=[];for(let i=0;i<20;i++){await page.keyboard.type('a');await page.evaluate(()=>new Promise(requestAnimationFrame));times.push(await page.evaluate(()=>ProEditor.metrics()));}
    const sorted=times.map(t=>t.layoutMs+t.paintMs).sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];
    assert.ok(p95<80,`Desktop live layout+paint p95: ${p95.toFixed(1)}ms`);
    assert.ok(await page.evaluate(()=>ProEditor.metrics().cacheSize<=512));
    // The exact plan accompanying the document is what the backend exports.
    const payload=await page.evaluate(()=>({document:serializeDocument(),settings:settings()}));
    assert.equal(payload.document.pro_layout.format,'hinote-live-v1');
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    fs.writeFileSync(path.join(root,'test-results/pro-live-document.json'),JSON.stringify(payload));
    fs.writeFileSync(path.join(root,'test-results/pro-performance.json'),JSON.stringify({environment:'Headless Chromium desktop; not a tablet measurement',p95Ms:p95,samples:times},null,2));
    await page.evaluate(()=>{$('noteTitle').value='Mis apuntes · Pro';currentPage=0;zoom=.8;applyZoom();restoreSelection({start:{line:0,offset:0},end:{line:0,offset:0}});});
    await page.screenshot({path:path.join(root,'test-results/pro-unified.png')});
    // Reload preserves text; classic fallback is explicit and reversible.
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForFunction(()=>ProEditor?.active);
    assert.equal(await page.evaluate(()=>readLines().length),65);
    await page.click('#proMode');assert.equal(await page.evaluate(()=>ProEditor.active),false);
    await page.click('#proMode');assert.equal(await page.evaluate(()=>ProEditor.active),true);
    // Blank image-only pages remain editable/navigable without fake text glyphs.
    await page.evaluate(()=>{currentPage=ImageEditor.count()-1;drawCurrent();});
    assert.deepEqual(errors,[]);console.log(`Pro browser checks passed; desktop layout+paint p95 ${p95.toFixed(1)}ms`);
    await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
