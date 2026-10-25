module.exports=({test,setup,select,lines,assert})=>{
  test('Production logo opens About without changing text, caret, formatting or keyboard mode',async page=>{
    await setup(page,'Mi borrador con formato');await select(page,{line:0,offset:3},{line:0,offset:10});
    await page.click('#boldBtn');
    await page.evaluate(()=>{AndroidBridge.openAbout=()=>bridgeCalls.push(['about']);AndroidBridge.requestTouchKeyboard=()=>bridgeCalls.push(['touch-keyboard']);});
    const before=await page.evaluate(()=>({lines:readLines(),selection:bookmark(),keyboard:document.getElementById('keyboardMode').value}));
    await page.touchscreen.tap(...Object.values(await page.locator('#aboutBtn').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})));
    assert.deepEqual(await page.evaluate(()=>({lines:readLines(),selection:bookmark(),keyboard:document.getElementById('keyboardMode').value})),before);
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='about').length),1);
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='touch-keyboard').length),0);
    assert.equal(await page.getAttribute('#aboutBtn','aria-label'),'Acerca de HiNote Studio');
    await page.click('[data-tab=save]');assert.equal(await page.locator('#privacyBtn').count(),0);
  });
  test('Production About logo supports keyboard activation and never turns a cancelled drag into an action',async page=>{
    await setup(page,'Borrador');await page.evaluate(()=>{AndroidBridge.openAbout=()=>bridgeCalls.push(['about']);});
    await page.locator('#aboutBtn').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='about').length),1);
    const r=await page.locator('#aboutBtn').boundingBox();await page.mouse.move(r.x+10,r.y+10);await page.mouse.down();await page.mouse.move(r.x+r.width+60,r.y+60);await page.mouse.up();
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='about').length),1);
  });
  test('Production paste cannot inject script, frames or external resource nodes',async page=>{
    await setup(page);
    await page.evaluate(()=>{window.injection=false;const data=new DataTransfer();data.setData('text/plain','Seguro');data.setData('text/html','<p><b>Seguro</b><script>window.injection=true</script><img src="https://example.org/private" onerror="window.injection=true"><iframe src="https://example.org"></iframe></p>');editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    assert.deepEqual(await lines(page),['Seguro']);assert.equal(await page.evaluate(()=>window.injection),false);
    assert.equal(await page.locator('#editor iframe,#editor img,#editor script').count(),0);
    assert.equal(await page.evaluate(()=>readLines()[0][0].bold),true);
  });
};
