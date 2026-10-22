module.exports=({test,setup,select,lines,assert})=>{
  const pasteHTML=(page,html,plain='')=>page.evaluate(({html,plain})=>{const data=new DataTransfer();data.setData('text/html',html);data.setData('text/plain',plain);editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},{html,plain});
  test('V60 Android HTML-only clipboard preserves mixed scripts and exact HiNote run styles',async page=>{
    await setup(page);
    const original=await page.evaluate(()=>{
      const runs=[{text:'H',...DEFAULT_STYLE},{text:'2',...DEFAULT_STYLE,script:'sub'},{text:'O  + x',...DEFAULT_STYLE},{text:'2',scale:1.5,color:'#336699',opacity:60,thickness:3,bold:true,italic:true,underline:true,script:'sup'}];
      renderLines([runs,[]]);checkpoint();return readLines()[0];
    });
    await select(page,{line:0,offset:0},{line:0,offset:9});
    const clipboard=await page.evaluate(()=>{const data=new DataTransfer();editor.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));return {html:data.getData('text/html'),plain:data.getData('text/plain')};});
    assert.ok(clipboard.html.includes('<sub'));assert.ok(clipboard.html.includes('<sup'));
    await select(page,{line:1,offset:0});await pasteHTML(page,clipboard.html,clipboard.plain);
    assert.deepEqual(await page.evaluate(()=>readLines()[1]),original);
    await page.keyboard.press('Control+z');assert.deepEqual(await lines(page),['H2O  + x2','']);
    await page.keyboard.press('Control+y');assert.deepEqual(await page.evaluate(()=>readLines()[1]),original);
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await page.evaluate(()=>readLines()[1]),original);
  });
  test('V60 external HTML imports semantic and CSS sub/sup without double shrinking',async page=>{
    await setup(page,'antes DESPUÉS');await select(page,{line:0,offset:6},{line:0,offset:13});
    await pasteHTML(page,'<p><strong>H<sub>2</sub>O</strong> + x<sup>2</sup> + y<span style="font-size:7.8pt;vertical-align:super;color:rgb(51, 102, 153);font-style:italic;text-decoration:underline">3</span></p>','H2O + x2 + y3');
    assert.deepEqual(await lines(page),['antes H2O + x2 + y3']);
    const runs=await page.evaluate(()=>readLines()[0]);assert.equal(runs.find(s=>s.script==='sub').text,'2');assert.equal(runs.find(s=>s.script==='sub').scale,1);
    const sup=runs.filter(s=>s.script==='sup');assert.equal(sup.length,2);assert.equal(sup[0].scale,1);assert.ok(Math.abs(sup[1].scale-1)<.001);assert.equal(sup[1].color,'#336699');assert.ok(sup[1].italic&&sup[1].underline);
  });
  test('V60 external lists and line breaks retain structure and formatting',async page=>{
    await setup(page);await pasteHTML(page,'<div><p>Título</p><ol start="4"><li>H<sub>2</sub>O<br>misma entrada</li><li><em>Final</em></li></ol><p><br></p></div>','Título\n4. H2O\nmisma entrada\n5. Final\n');
    assert.deepEqual(await lines(page),['Título','H2O\nmisma entrada','Final','']);assert.deepEqual(await page.evaluate(()=>listMarkers(readLines())),['','4.','5.','']);
    assert.equal(await page.evaluate(()=>readLines()[1].find(s=>s.script==='sub').text),'2');
  });
  test('V60 rich clipboard data is read as inert text and approved styles only',async page=>{
    await setup(page);let requests=0;page.on('request',r=>{if(r.url().includes('clipboard-test.invalid'))requests++;});
    await pasteHTML(page,'<style>body{display:none}</style><script>window.clipboardExecuted=true</script><img src="https://clipboard-test.invalid/a" onerror="window.clipboardExecuted=true"><p onclick="window.clipboardExecuted=true"><b>Seguro</b><iframe src="https://clipboard-test.invalid/b"></iframe><sup>2</sup></p>','Seguro2');
    assert.deepEqual(await lines(page),['Seguro2']);assert.equal(await page.evaluate(()=>window.clipboardExecuted),undefined);assert.equal(requests,0);
    assert.equal(await page.locator('#editor script,#editor img,#editor iframe,#editor [onclick]').count(),0);
    await select(page,{line:0,offset:7});await pasteHTML(page,'<img src="https://clipboard-test.invalid/c">',' plano');assert.deepEqual(await lines(page),['Seguro2 plano']);
  });
  test('V60 Android native HTML is used only for the same explicit plain paste payload',async page=>{
    await setup(page);await page.evaluate(()=>{window.clipboardReads=0;AndroidBridge.readRichClipboard=()=>{clipboardReads++;return JSON.stringify({plain:'H2O',html:'H<sub>2</sub>O'});};});
    await pasteHTML(page,'','H2O');assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.script==='sub').text),'2');assert.equal(await page.evaluate(()=>clipboardReads),1);
    await select(page,{line:0,offset:3});await pasteHTML(page,'',' x2');assert.deepEqual(await lines(page),['H2O x2']);assert.equal(await page.evaluate(()=>readLines()[0].filter(s=>s.script).length),1);
    await pasteHTML(page,'x<sup>2</sup>','x2');assert.equal(await page.evaluate(()=>clipboardReads),2);
  });
  test('V60 paste without formatting bypasses rich native data for only that shortcut',async page=>{
    await setup(page);await page.evaluate(()=>{window.clipboardReads=0;AndroidBridge.readRichClipboard=()=>{clipboardReads++;return JSON.stringify({plain:'H2O',html:'H<sub>2</sub>O'});};
      editor.dispatchEvent(new KeyboardEvent('keydown',{key:'V',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));});
    await pasteHTML(page,'<b>H<sub>2</sub>O</b>','H2O');
    assert.deepEqual(await lines(page),['H2O']);assert.equal(await page.evaluate(()=>readLines()[0].some(s=>s.script||s.bold)),false);assert.equal(await page.evaluate(()=>clipboardReads),0);
    await pasteHTML(page,'','H2O');assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.script==='sub').text),'2');assert.equal(await page.evaluate(()=>clipboardReads),1);
  });
};
