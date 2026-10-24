module.exports=({test,setup,select,lines,assert})=>{
  test('Production privacy access preserves the document and does not request typing',async page=>{
    await setup(page,'Mi borrador con formato');await select(page,{line:0,offset:3},{line:0,offset:10});
    await page.evaluate(()=>{AndroidBridge.openPrivacy=()=>bridgeCalls.push(['privacy']);AndroidBridge.requestTouchKeyboard=()=>bridgeCalls.push(['touch-keyboard']);});
    const before=await lines(page);await page.click('[data-tab=save]');await page.click('#privacyBtn');
    assert.deepEqual(await lines(page),before);
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='privacy').length),1);
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='touch-keyboard').length),0);
  });
  test('Production paste cannot inject script, frames or external resource nodes',async page=>{
    await setup(page);
    await page.evaluate(()=>{window.injection=false;const data=new DataTransfer();data.setData('text/plain','Seguro');data.setData('text/html','<p><b>Seguro</b><script>window.injection=true</script><img src="https://example.org/private" onerror="window.injection=true"><iframe src="https://example.org"></iframe></p>');editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    assert.deepEqual(await lines(page),['Seguro']);assert.equal(await page.evaluate(()=>window.injection),false);
    assert.equal(await page.locator('#editor iframe,#editor img,#editor script').count(),0);
    assert.equal(await page.evaluate(()=>readLines()[0][0].bold),true);
  });
};
