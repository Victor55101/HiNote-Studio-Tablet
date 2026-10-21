module.exports=({test,setup,select,lines,assert,openMath})=>{
  const state=(page,mode,pending=0)=>page.evaluate(({mode,pending})=>onKeyboardState(JSON.stringify({keyboardTrial:true,keyboardAssist:'ready',nativeGate:true,imeConnected:true,mode,suppress:mode!=='virtual',interaction:'physical',pendingPhysicalInput:pending})),{mode,pending});
  test('V58 native visibility leaves text and numeric hints unchanged across physical transitions',async page=>{
    await setup(page,'Antes ');await openMath(page,'graph');
    const snapshot=()=>page.locator('#editor,#noteTitle,#graphPointX').evaluateAll(nodes=>nodes.map(n=>[n.id,...['inputmode','autocorrect','autocomplete'].map(k=>n.getAttribute(k))]));
    const before=await snapshot();
    for(const mode of ['virtual','auto','physical','virtual']){await state(page,mode);assert.deepEqual(await snapshot(),before);}
  });
  test('V58 first physical character is inserted once and acknowledged after the real input event',async page=>{
    await setup(page,'Antes ');await select(page,{line:0,offset:6});
    await page.evaluate(()=>{window.inputAcks=[];AndroidBridge.keyboardInputApplied=request=>inputAcks.push({request,text:editor.innerText});});
    await state(page,'auto',71);await page.keyboard.type('h');
    assert.deepEqual(await lines(page),['Antes h']);
    assert.ok((await page.evaluate(()=>inputAcks)).some(a=>a.request===71&&a.text==='Antes h'));
    assert.equal(await page.getAttribute('#editor','inputmode'),null);
  });
  test('V58 completed physical-mode caret tap requests closing without requesting virtual keys',async page=>{
    await setup(page,'Texto');await state(page,'physical');
    await page.evaluate(()=>{window.keyRequests=[];AndroidBridge.requestPhysicalKeyboardHide=()=>keyRequests.push('close');AndroidBridge.beginTouchKeyboard=()=>keyRequests.push('begin');AndroidBridge.requestTouchKeyboard=()=>keyRequests.push('open');});
    await page.locator('#editor').tap();await page.waitForTimeout(50);
    assert.deepEqual(await page.evaluate(()=>keyRequests),['close']);
  });
  test('V58 IME candidate replacement remains a native edit with physical keys suppressed',async page=>{
    await setup(page,'Hugo ');await select(page,{line:0,offset:5});await state(page,'physical');
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'zoe',selectionStart:3,selectionEnd:3});
    await cdp.send('Input.insertText',{text:'Zoé'});await page.keyboard.press('Space');
    assert.deepEqual(await lines(page),['Hugo Zoé ']);assert.equal(await page.getAttribute('#editor','inputmode'),null);
  });
};
