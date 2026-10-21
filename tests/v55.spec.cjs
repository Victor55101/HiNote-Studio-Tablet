// IME commits use Chromium's native input path; the Android provider is not emulated.
module.exports=({test,setup,select,lines,assert,openTable,openMath})=>{
  const nativeState=page=>page.evaluate(()=>onKeyboardState(JSON.stringify({nativeGate:false,imeConnected:true,mode:'auto',hardware:true,suppress:true})));
  const metrics=page=>page.evaluate(()=>{
    const rect=selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,padding:s.padding};};
    return {
      fixed:Object.fromEntries(['.topbar','.logo','.toolbar','.ribbonMain','.cardhead','#noteTitle'].map(s=>[s,rect(s)])),
      cards:['.editorCard','.previewCard'].map(rect),footers:['.draftFooter','.previewFooter'].map(rect),
      zoom,textSize:getComputedStyle(editor).fontSize,title:document.activeElement.id,mark:bookmark()
    };
  });
  test('V55 opening and closing a docked IME preserves chrome while lifting both footers',async page=>{
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto de prueba');await select(page,{line:0,offset:5});
    await page.evaluate(()=>{zoom=.8;applyZoom();});const before=await metrics(page);
    for(const height of [900,780,640,560,1000]){
      await page.setViewportSize({width:1536,height});await page.waitForTimeout(40);const after=await metrics(page);
      assert.deepEqual(after.fixed,before.fixed,'Keyboard height must not select a compact ribbon');
      assert.equal(after.zoom,before.zoom);assert.equal(after.textSize,before.textSize);assert.equal(after.title,'editor');assert.deepEqual(after.mark,before.mark);
      after.cards.forEach((r,i)=>{assert.equal(r.x,before.cards[i].x);assert.equal(r.y,before.cards[i].y);assert.equal(r.width,before.cards[i].width);if(height<1000)assert.ok(r.height<before.cards[i].height);});
      after.footers.forEach((r,i)=>{assert.equal(r.height,before.footers[i].height);assert.ok(r.y+r.height<=height+1);if(height<1000)assert.ok(r.y<before.footers[i].y);});
    }
  });
  test('V55 physical suggestion bars and floating IME state do not resize app controls',async page=>{
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto');await select(page,{line:0,offset:5});
    const before=await metrics(page);
    for(const suppress of [true,false,true]){
      await page.evaluate(suppress=>onKeyboardState(JSON.stringify({nativeGate:false,imeConnected:true,mode:'auto',hardware:true,suppress})),suppress);
      assert.deepEqual(await metrics(page),before);assert.equal(await page.getAttribute('#editor','inputmode'),suppress?'none':null);
    }
    // Docking a suggestions-only row changes the available height, not the ribbon.
    await page.setViewportSize({width:1536,height:920});const after=await metrics(page);assert.deepEqual(after.fixed,before.fixed);
  });
  test('V55 native physical mode preserves correction and restores decimal hints in virtual mode',async page=>{
    await setup(page,'Texto');await page.evaluate(()=>onKeyboardState(JSON.stringify({nativeGate:false,imeConnected:true,mode:'physical',hardware:true,suppress:true})));
    assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');
    assert.equal(await page.locator('[data-select-for=keyboardMode] .selectValue').textContent(),'Solo físico');
    await openTable(page);assert.equal(await page.locator('.cellEditor').first().getAttribute('inputmode'),'none');assert.equal(await page.locator('.cellEditor').first().getAttribute('autocorrect'),'on');
    await page.click('#tableCancel');await openMath(page,'graph');assert.equal(await page.getAttribute('#graphPointX','inputmode'),'none');
    await page.evaluate(()=>onKeyboardState(JSON.stringify({nativeGate:false,imeConnected:true,mode:'virtual',hardware:true,suppress:false})));assert.equal(await page.getAttribute('#graphPointX','inputmode'),'decimal');
    await page.click('#mathCancel');await openMath(page,'formula');assert.equal(await page.locator('.mathSlot').first().getAttribute('autocorrect'),'off');assert.equal(await page.locator('.mathSlot').first().getAttribute('spellcheck'),'false');
  });
  const commitWord=async(page,word,corrected)=>{
    const session=await page.context().newCDPSession(page);
    await session.send('Input.imeSetComposition',{text:word,selectionStart:word.length,selectionEnd:word.length});
    await session.send('Input.insertText',{text:corrected});await page.keyboard.press('Space');
  };
  test('V55 IME correction commits accents and Space without losing selected text formatting',async page=>{
    await setup(page,'Antes ');await select(page,{line:0,offset:6});
    // Configure pending rich text without moving focus into a toolbar textbox.
    await page.evaluate(()=>applyStyle({scale:.9,color:'#FF0000'}));await nativeState(page);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:0,offset:6});
    const z=await page.evaluate(()=>zoom);await commitWord(page,'Vazquez','Vázquez');
    assert.deepEqual(await lines(page),['Antes Vázquez ']);assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');assert.equal(await page.evaluate(()=>zoom),z);
    const runs=await page.evaluate(()=>readLines()[0]);const corrected=runs.filter(s=>s.color==='#FF0000').map(s=>s.text).join('');assert.equal(corrected,'Vázquez ');assert.ok(runs.filter(s=>s.color==='#FF0000').every(s=>s.scale===.9));
  });
  test('V55 native replacement of an existing word preserves its surrounding paragraph',async page=>{
    await setup(page,'Antes Vazquez después');await select(page,{line:0,offset:13});await nativeState(page);
    const session=await page.context().newCDPSession(page);
    await session.send('Input.imeSetComposition',{text:'Vázquez',selectionStart:7,selectionEnd:7,replacementStart:6,replacementEnd:13});
    await session.send('Input.insertText',{text:'Vázquez'});
    assert.deepEqual(await lines(page),['Antes Vázquez después']);assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
  });
  test('V55 the title accepts native corrected words followed by Space',async page=>{
    await setup(page,'Texto');await nativeState(page);await page.fill('#noteTitle','Antes ');await page.press('#noteTitle','End');
    await commitWord(page,'Vazquez','Vázquez');assert.equal(await page.inputValue('#noteTitle'),'Antes Vázquez ');assert.equal(await page.evaluate(()=>document.activeElement.id),'noteTitle');
  });
  test('V55 a table cell keeps native correction and saves the corrected rich text',async page=>{
    await setup(page);await nativeState(page);await openTable(page);const cell=page.locator('.cellEditor').first();
    await cell.fill('Antes ');await cell.press('End');await commitWord(page,'Vazquez','Vázquez');assert.equal(await cell.textContent(),'Antes Vázquez ');
    await page.click('#tableDone');assert.equal(await page.evaluate(()=>serializeDocument().paragraphs.find(p=>p.table).table.rows[0].cells[0].segments.map(s=>s.text).join('')),'Antes Vázquez ');
  });
};
