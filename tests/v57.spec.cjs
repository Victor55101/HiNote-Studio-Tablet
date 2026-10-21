// Chromium UI checks only; the accessibility service is covered by Android tests.
module.exports=({test,setup,select,lines,assert})=>{
  test('V57 setup is exposed only in the independent keyboard trial',async page=>{
    await setup(page,'Texto');await page.click('[data-tab="save"]');
    assert.equal(await page.isVisible('#keyboardTrialSettings'),false);
    await page.evaluate(()=>onKeyboardState(JSON.stringify({keyboardTrial:true,keyboardAssist:'permission',mode:'physical',suppress:true,interaction:'physical'})));
    assert.equal(await page.isVisible('#keyboardTrialSettings'),true);
    assert.equal(await page.locator('#keyboardTrialState').textContent(),'Activa el control en Accesibilidad');
    await page.evaluate(()=>{window.setupRequests=0;AndroidBridge.openKeyboardTrialSetup=()=>setupRequests++;});
    await page.click('#keyboardTrialSettings');assert.equal(await page.evaluate(()=>setupRequests),1);
    await page.evaluate(()=>onKeyboardState(JSON.stringify({keyboardTrial:false,mode:'physical',suppress:true,interaction:'physical'})));
    assert.equal(await page.isVisible('#keyboardTrialSettings'),false);
  });
  test('V57 permission or mode updates preserve caret text size and zoom',async page=>{
    await setup(page,'Texto con acento');await select(page,{line:0,offset:6});
    const before=await page.evaluate(()=>({selection:bookmark(),lines:readLines(),zoom:$('zoomLabel').textContent,size:$('sizeSel').value}));
    for(const assist of ['permission','ready','active','refused','busy','setting']){
      await page.evaluate(assist=>onKeyboardState(JSON.stringify({keyboardTrial:true,keyboardAssist:assist,mode:'physical',suppress:true,interaction:'physical'})),assist);
      assert.deepEqual(await page.evaluate(()=>({selection:bookmark(),lines:readLines(),zoom:$('zoomLabel').textContent,size:$('sizeSel').value})),before);
    }
    assert.equal(await page.getAttribute('#editor','inputmode'),'none');assert.equal(await page.getAttribute('#editor','autocorrect'),'on');
    assert.deepEqual(await lines(page),['Texto con acento']);
  });
};
