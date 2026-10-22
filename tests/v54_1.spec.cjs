module.exports=({test,setup,select,lines,assert,openMath,openTable,importImage})=>{
  test('V54.1 title shares the document header and percentage fields only select',async page=>{
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto');
    const head=await page.locator('.documentHead h2').boundingBox(),title=await page.locator('#noteTitle').boundingBox();
    assert.ok(title.x>head.x+head.width&&Math.abs(title.y+title.height/2-head.y-head.height/2)<3);
    assert.equal(await page.locator('.editorCard>.noteTitle').count(),0);
    await openMath(page,'formula');assert.equal(await page.locator('#mathSize').evaluate(n=>n.tagName),'SELECT');
    await page.selectOption('#mathSize','75');await page.locator('.mathSlot').first().fill('x2');await page.click('#mathDone');
    const id=await page.evaluate(()=>serializeDocument().paragraphs.find(p=>p.object).object.id);
    await page.evaluate(id=>MathGraphEditor.open('formula',id),id);
    assert.equal(await page.inputValue('#mathSize'),'75');
    await page.click('#mathCancel');await page.evaluate(id=>{const data=MathGraphEditor.state();data.mathObjects[id].size=.731;MathGraphEditor.restore(data);MathGraphEditor.open('formula',id);},id);
    assert.equal(await page.inputValue('#mathSize'),'73.1','Existing custom percentages remain selectable');
    assert.equal(await page.locator('#cropLeft').getAttribute('type'),'range');
  });
  test('V54.1 color percentages select values and retain the range picker',async page=>{
    await setup(page,'Color');await page.locator('[data-color-for=colorPick]').tap();
    for(const id of ['colorSaturation','colorValue']){
      assert.equal(await page.locator('#'+id).evaluate(n=>n.tagName),'SELECT');
      assert.equal(await page.locator('#'+id+' option').count(),101);
    }
    await page.fill('#colorHex','#FF0000');
    for(const [id,value] of [['colorSaturation','50'],['colorValue','80']]){
      await page.locator('[data-select-for='+id+']').tap();await page.locator('.selectMenu [data-value="'+value+'"]').tap();
    }
    assert.equal((await page.inputValue('#colorHex')).toUpperCase(),'#CC6666');
    assert.equal(await page.locator('[data-select-for=colorValue] .selectValue').textContent(),'80 %');
    assert.equal(await page.locator('#colorHue').getAttribute('type'),'range');
    await page.click('#colorDone');
  });
  test('V54.1 table alignment names fit and dimension fields stay compact',async page=>{
    for(const width of [1536,1280,1000]){
      await page.setViewportSize({width,height:1000});await setup(page);await openTable(page);
      for(const value of ['left','center','right']){
        await page.selectOption('#tableAlign',value);
        const label=await page.locator('[data-select-for=tableAlign] .selectValue').evaluate(n=>({available:n.clientWidth,needed:n.scrollWidth}));
        assert.ok(label.available>=label.needed,JSON.stringify({width,value,label}));
      }
      assert.ok((await page.locator('#tableColWidth').boundingBox()).width<=109);
      await page.screenshot({path:`test-results/v54-1-table-${width}.png`});await page.click('#tableCancel');
    }
  });
  test('V54.1 virtual keyboard frees table grid space and leaves other modals alone',async page=>{
    await page.setViewportSize({width:1536,height:580});await setup(page);await openTable(page);
    await page.evaluate(()=>onKeyboardState(JSON.stringify({nativeGate:true,mode:'auto',suppress:false,imeVisible:false})));
    const before=await page.locator('#tableGridWrap').boundingBox();
    for(const mode of ['auto','virtual']){
      await page.evaluate(mode=>onKeyboardState(JSON.stringify({nativeGate:true,mode,suppress:false,imeVisible:true})),mode);
      assert.equal(await page.isVisible('.tableCellTools'),false);assert.equal(await page.isVisible('.tableActions'),false);
      const grid=await page.locator('#tableGridWrap').boundingBox();assert.ok(grid.height>before.height+120,JSON.stringify({before,grid}));
      await page.locator('.cellEditor').first().fill('Texto visible');
      const cell=await page.locator('.cellEditor').first().boundingBox();assert.ok(cell.y>=grid.y&&cell.y+cell.height<=grid.y+grid.height);
    }
    await page.screenshot({path:'test-results/v54-1-table-keyboard.png'});
    await page.evaluate(()=>onKeyboardVisibility(false));assert.equal(await page.isVisible('.tableCellTools'),true);assert.equal(await page.isVisible('.tableActions'),true);
    await page.evaluate(()=>onKeyboardState(JSON.stringify({nativeGate:true,mode:'physical',suppress:true,imeVisible:true})));
    assert.equal(await page.isVisible('.tableCellTools'),true);
    await page.click('#tableCancel');await openMath(page,'formula');assert.equal(await page.isVisible('.mathActions'),true);
  });
  test('V54.1 rich paste in a table cell retains mixed scripts and styles on apply',async page=>{
    await setup(page);await openTable(page);await page.locator('.cellEditor').first().focus();
    await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','H2O + x2');data.setData('text/html','<b>H<sub>2</sub>O</b> + x<sup style="color:#336699;font-style:italic;text-decoration:underline">2</sup>');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    await page.click('#tableDone');const runs=await page.evaluate(()=>serializeDocument().paragraphs.find(p=>p.table).table.rows[0].cells[0].segments);
    assert.equal(runs.map(s=>s.text).join(''),'H2O + x2');assert.equal(runs.find(s=>s.script==='sub').text,'2');
    const sup=runs.find(s=>s.script==='sup');assert.ok(sup.italic&&sup.underline);assert.equal(sup.color,'#336699');assert.ok(runs[0].bold);
  });
  test('V54.1 only writable touch targets request a keyboard',async page=>{
    await setup(page,'Texto');await page.evaluate(()=>{
      AndroidBridge.beginTouchKeyboard=()=>bridgeCalls.push(['begin-touch']);AndroidBridge.requestTouchKeyboard=()=>bridgeCalls.push(['show-touch']);AndroidBridge.cancelTouchKeyboard=preview=>bridgeCalls.push(['cancel-touch',preview]);
      onKeyboardState(JSON.stringify({nativeGate:true,mode:'auto',suppress:false}));
    });
    await page.locator('#editor .line').tap();await page.waitForTimeout(30);
    assert.ok(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='show-touch')));
    await page.evaluate(()=>bridgeCalls=[]);await page.locator('[data-tab=page]').tap();await page.locator('#zoomOut').tap();
    const p=await page.locator('#previewWrap').boundingBox();await page.touchscreen.tap(p.x+p.width-20,p.y+30);await page.waitForTimeout(30);
    const calls=await page.evaluate(()=>bridgeCalls);assert.equal(calls.filter(c=>['begin-touch','show-touch'].includes(c[0])).length,0);
    assert.ok(calls.some(c=>c[0]==='cancel-touch'&&c[1]===true));
    await page.locator('#noteTitle').tap();await page.waitForTimeout(30);assert.ok(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='show-touch')));
  });
  test('V54.1 table paste without formatting bypasses native HTML once',async page=>{
    await setup(page);await openTable(page);await page.locator('.cellEditor').first().focus();
    await page.evaluate(()=>{
      AndroidBridge.readRichClipboard=()=>JSON.stringify({plain:'H2O',html:'H<sub>2</sub>O'});
      const cell=document.activeElement;cell.dispatchEvent(new KeyboardEvent('keydown',{key:'V',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));
      for(let i=0;i<2;i++){const data=new DataTransfer();data.setData('text/plain','H2O');cell.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}
    });
    await page.click('#tableDone');const runs=await page.evaluate(()=>serializeDocument().paragraphs.find(p=>p.table).table.rows[0].cells[0].segments);
    assert.equal(runs.map(s=>s.text).join(''),'H2OH2O');assert.equal(runs.filter(s=>s.script==='sub').length,1);
  });
  for(const kind of ['image','table','formula','graph'])test(`V54.1 ${kind}: stale preview and arriving layout cannot swallow a selection tap`,async page=>{
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto');
    if(kind==='image')await importImage(page);else if(kind==='table'){await openTable(page);await page.click('#tableDone');}
    else{await openMath(page,kind);if(kind==='formula')await page.locator('.mathSlot').first().fill('x');await page.click('#mathDone');}
    await page.evaluate(kind=>{
      const geometry={x:140,y:180,width:400,height:260};
      if(kind==='image'){const state=ImageEditor.state();Object.assign(state.images[0],geometry);ImageEditor.restore(state);}
      const doc=serializeDocument(),t=doc.paragraphs.find(p=>p.table)?.table,o=doc.paragraphs.find(p=>p.object)?.object;
      composition={snapshot:'last-visible',page_count:1,layout:{grid_step:58.8},table_pages:[t?[{id:t.id,...geometry}]:[]],object_pages:[o?[{id:o.id,kind:o.kind,...geometry}]:[]]};
      composing=false;previewRevision=revision;currentPage=0;zoom=1;ImageEditor.select(null);TableEditor.clearSelection();MathGraphEditor.clearSelection();applyZoom();
      changed();applyZoom();
    },kind);
    const selector=kind==='image'?'.pageImage':kind==='table'?'.tableSelect':'.objectSelect';
    assert.equal(await page.locator(selector).count(),1,'The visible last layout remains selectable while updated text is pending');
    const b=await page.locator(selector).boundingBox(),p={x:b.x+b.width/2,y:b.y+b.height/2,id:1},session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await page.evaluate(()=>{previewRevision=revision;drawCurrent();});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(kind=>kind==='image'?!!ImageEditor.selected():!!document.querySelector(kind==='table'?'.tableTarget':'.objectTarget'),kind),true);
    if(kind!=='image'){
      await page.evaluate(()=>{renderLines(readLines().filter(l=>!isBlockLine(l)));changed();applyZoom();});
      assert.equal(await page.locator(selector).count(),0,'Deleted objects never regain hit areas from an old layout');
    }
  });
};
