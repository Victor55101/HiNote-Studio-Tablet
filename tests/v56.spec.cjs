// Native visibility is tested in KeyboardControllerTest; here Chromium runs
// the real editor with the current Android state and native IME commit path.
module.exports=({test,setup,select,lines,assert,openTable,openMath})=>{
  const state=(page,mode,suppress,interaction='physical')=>page.evaluate(({mode,suppress,interaction})=>onKeyboardState(JSON.stringify({nativeGate:false,imeConnected:true,mode,suppress,interaction,hardware:true})),{mode,suppress,interaction});
  const tap=async(page,selector)=>{await page.locator(selector).tap();await page.waitForTimeout(40);};
  test('V56 retains the original three mode names and stable stored values',async page=>{
    assert.deepEqual(await page.locator('#keyboardMode option').evaluateAll(nodes=>nodes.map(n=>[n.value,n.textContent])),[['auto','Automático'],['virtual','Mostrar virtual'],['physical','Solo físico']]);
    await setup(page,'Texto');await state(page,'physical',true);
    assert.equal(await page.locator('[data-select-for=keyboardMode] .selectValue').textContent(),'Solo físico');
  });
  test('V56 Solo físico gates automatic opening in document title cells and modal fields',async page=>{
    await setup(page,'Texto');await state(page,'physical',true);
    assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');
    await page.evaluate(()=>{window.touchRequests=[];AndroidBridge.beginTouchKeyboard=()=>touchRequests.push('begin');AndroidBridge.requestTouchKeyboard=()=>touchRequests.push('show');});
    await tap(page,'#editor');await tap(page,'#noteTitle');assert.deepEqual(await page.evaluate(()=>touchRequests),[]);
    await openTable(page);await page.waitForTimeout(20);assert.equal(await page.locator('.cellEditor').first().getAttribute('inputmode'),'none');
    await page.click('#tableCancel');await openMath(page,'graph');await page.waitForTimeout(20);assert.equal(await page.getAttribute('#graphPointX','inputmode'),'none');
    await state(page,'virtual',false);assert.equal(await page.getAttribute('#graphPointX','inputmode'),'decimal');assert.equal(await page.getAttribute('#noteTitle','inputmode'),null);
  });
  test('V56 Auto touch restores hints and explicitly requests keys with hardware still attached',async page=>{
    await setup(page,'Texto');await state(page,'auto',true);
    await page.evaluate(()=>{window.touchRequests=[];AndroidBridge.beginTouchKeyboard=()=>touchRequests.push('begin');AndroidBridge.requestTouchKeyboard=()=>touchRequests.push('show');});
    await tap(page,'#editor');assert.deepEqual(await page.evaluate(()=>touchRequests),['begin','show']);assert.equal(await page.getAttribute('#editor','inputmode'),null);
    await state(page,'auto',true);assert.equal(await page.getAttribute('#editor','inputmode'),'none');
    // Mouse/trackpad focus does not request the touch keyboard.
    await page.click('#noteTitle');assert.equal(await page.getAttribute('#noteTitle','inputmode'),'none');assert.deepEqual(await page.evaluate(()=>touchRequests),['begin','show']);
  });
  test('V56 Auto scrolling and interrupted touch cannot reopen the keys',async page=>{
    await setup(page,'Texto\n'.repeat(80));await state(page,'auto',true);
    await page.evaluate(()=>{window.touchRequests=[];AndroidBridge.beginTouchKeyboard=()=>touchRequests.push('begin');AndroidBridge.requestTouchKeyboard=()=>touchRequests.push('show');});
    const box=await page.locator('#editor').boundingBox(),session=await page.context().newCDPSession(page),x=box.x+150,y=box.y+100;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-60}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(40);assert.ok(!(await page.evaluate(()=>touchRequests)).includes('show'));
    await state(page,'auto',true);await page.evaluate(()=>{
      editor.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:9,isPrimary:true,bubbles:true}));
      onKeyboardState(JSON.stringify({nativeGate:false,mode:'physical',imeConnected:true,suppress:true,interaction:'physical'}));
      editor.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:9,isPrimary:true,bubbles:true}));
    });await page.waitForTimeout(40);assert.ok(!(await page.evaluate(()=>touchRequests)).includes('show'));assert.equal(await page.getAttribute('#editor','inputmode'),'none');
  });
  test('V56 mode selection gates the field before an asynchronous Android reply',async page=>{
    await setup(page,'Antes');await select(page,{line:0,offset:5});await state(page,'virtual',false);
    await page.evaluate(()=>{AndroidBridge.setKeyboardMode=()=>{};$('keyboardMode').value='physical';$('keyboardMode').dispatchEvent(new Event('change'));});
    assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:0,offset:5});
    await page.evaluate(()=>{$('keyboardMode').value='virtual';$('keyboardMode').dispatchEvent(new Event('change'));});assert.equal(await page.getAttribute('#editor','inputmode'),null);
  });
  test('V56 native composition still commits a correction with soft keys suppressed',async page=>{
    await setup(page,'Antes ');await select(page,{line:0,offset:6});await state(page,'physical',true);
    const session=await page.context().newCDPSession(page);
    await session.send('Input.imeSetComposition',{text:'Vazquez',selectionStart:7,selectionEnd:7});
    await session.send('Input.insertText',{text:'Vázquez'});await page.keyboard.press('Space');
    assert.deepEqual(await lines(page),['Antes Vázquez ']);assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
  });
};
