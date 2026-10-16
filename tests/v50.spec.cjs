/* V50 acceptance: real touch controls, structural lists and priority preview. */
module.exports=({test,setup,select,lines,assert,openMath,graphPane})=>{
  const choose=async(page,id,value)=>{await page.locator(`[data-select-for=${id}]`).tap();await page.locator(`.selectMenu [data-value="${value}"]`).tap();};
  const marker=async(page,i=0)=>{
    const p=await page.locator('#editor .line').nth(i).evaluate(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:b.left+parseFloat(s.paddingLeft)-parseFloat(s.getPropertyValue('--marker-width'))+4,y:b.top+12};});
    await page.touchscreen.tap(p.x,p.y);
  };
  const selected=page=>page.evaluate(()=>selectedMarkerIndexes());
  const doc=page=>page.evaluate(()=>serializeDocument().paragraphs);
  test('V50 T18 T20 T36 marker Tab changes only its list and level across separators',async page=>{
    await setup(page,'1. Uno\n2. Dos\n3. Tres\n\n1. Otra\n2. Lista');
    await select(page,{line:1,offset:0});await page.keyboard.press('Tab');
    await marker(page);assert.deepEqual(await selected(page),[0,2]);
    await page.keyboard.press('Tab');assert.deepEqual(await selected(page),[0,1,2]);
    const p=await doc(page);assert.deepEqual(p.filter(p=>p.list).map(p=>p.list.level),[1,1,1,0,0]);
    await page.keyboard.press('Shift+Tab');assert.deepEqual((await doc(page)).filter(p=>p.list).map(p=>p.list.level),[0,0,0,0,0]);
    await marker(page,4);assert.deepEqual(await selected(page),[4,5]);
    await choose(page,'opacity','45');await choose(page,'thicknessSel','4');await choose(page,'sizeSel','150');
    const after=await doc(page);assert.equal(after[0].list.marker_opacity,100);assert.equal(after[4].list.marker_opacity,45);assert.equal(after[4].list.marker_thickness,4);assert.equal(after[5].list.marker_scale,1.5);assert.equal(after[4].segments[0].scale,1);
  });
  test('V50 T24 marker selection survives a real editor finger scroll',async page=>{
    await setup(page,Array.from({length:40},(_,i)=>`${i+1}. Elemento de la lista`).join('\n'));await marker(page);
    const before=await page.evaluate(()=>bookmark()),box=await page.locator('.editorScroll').boundingBox();
    const session=await page.context().newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height-35;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(const delta of [30,60,100,160,220])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(await page.locator('.editorScroll').evaluate(n=>n.scrollTop)>0);
    assert.equal((await selected(page)).length,40);assert.deepEqual(await page.evaluate(()=>bookmark()),before);
    await choose(page,'opacity','60');assert.equal((await selected(page)).length,40);assert.ok((await doc(page)).every(p=>p.list.marker_opacity===60));
  });
  test('V50 T25 T26 preview buttons keep text caret and structural selection',async page=>{
    await setup(page,'1. Uno\n2. Dos');await select(page,{line:1,offset:2});
    await page.evaluate(()=>{composition={snapshot:'mock',page_count:3};previewRevision=revision;controls();});
    for(const id of ['zoomIn','zoomOut','zoomFit','nextPage','prevPage'])await page.locator('#'+id).tap();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');await page.keyboard.type('X');assert.deepEqual(await lines(page),['Uno','DoXs']);
    await marker(page);const before=await page.evaluate(()=>bookmark());
    for(const id of ['zoomIn','zoomOut','nextPage','prevPage'])await page.locator('#'+id).tap();
    assert.deepEqual(await selected(page),[0,1]);assert.deepEqual(await page.evaluate(()=>bookmark()),before);
  });
  test('V50 arrows visit list markers before the preceding paragraph',async page=>{
    await setup(page,'Encabezado\n1. Uno\n2. Dos');await select(page,{line:1,offset:0});await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await selected(page),[1,2]);await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:0,offset:10});assert.deepEqual(await selected(page),[]);
    await page.keyboard.press('ArrowRight');assert.deepEqual(await selected(page),[1,2]);
    await page.keyboard.press('ArrowRight');assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:1,offset:0});
  });
  test('V50 Backspace preserves body indent then walks back through the stops',async page=>{
    await setup(page,'Antes\n1. Texto');await select(page,{line:1,offset:0});await page.keyboard.press('Tab');
    const left=()=>page.locator('#editor .line').nth(1).evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect().left;});
    const before=await left();await page.keyboard.press('Backspace');assert.equal(await left(),before);assert.equal((await doc(page))[1].list,undefined);
    await page.keyboard.type('A');assert.deepEqual(await lines(page),['Antes','ATexto']);await select(page,{line:1,offset:0});
    await page.keyboard.press('Backspace');const middle=await left();assert.ok(middle<before);
    await page.keyboard.press('Backspace');assert.ok(await left()<middle);assert.deepEqual(await lines(page),['Antes','ATexto']);
  });
  test('V50 T02 T03 T05 independent bold italic underline and mixed size',async page=>{
    await setup(page,'abcdef');await select(page,{line:0,offset:1},{line:0,offset:4});await page.locator('#boldBtn').tap();await choose(page,'sizeSel','150');
    await select(page,{line:0,offset:2});await page.keyboard.type('X');
    assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text.includes('X')).bold),true);
    await select(page,{line:0,offset:0},{line:0,offset:7});assert.equal(await page.inputValue('#sizeSel'),'mixed');await choose(page,'sizeSel','90');
    let runs=await page.evaluate(()=>readLines()[0]);assert.ok(runs.every(s=>s.scale===.9));assert.equal(runs[0].bold,undefined);assert.equal(runs[1].bold,true);
    await page.locator('#italicBtn').tap();await page.locator('#underlineBtn').tap();await page.evaluate(()=>saveDraft());await page.reload();
    runs=await page.evaluate(()=>readLines()[0]);assert.ok(runs.every(s=>s.italic&&s.underline));assert.equal(runs[1].bold,true);
  });
  test('V50 T06 explicit insertion at either styled boundary keeps its affinity',async page=>{
    await setup(page,'abcd');await select(page,{line:0,offset:2},{line:0,offset:4});await page.locator('#boldBtn').tap();
    await page.evaluate(()=>{const t=editor.firstChild.lastChild.firstChild;getSelection().setBaseAndExtent(t,0,t,0);captureSelection();});
    assert.equal(await page.getAttribute('#boldBtn','aria-pressed'),'true');await page.keyboard.type('X');
    assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text.includes('X')).bold),true);
    await select(page,{line:0,offset:2});assert.equal(await page.getAttribute('#boldBtn','aria-pressed'),'false');await page.keyboard.type('Y');
    assert.deepEqual(await lines(page),['abYXcd']);assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text.includes('Y')).bold),undefined);
  });
  test('V50 PDF import inserts pages at the caret and survives undo and reload',async page=>{
    await setup(page,'AntesDespués');await select(page,{line:0,offset:5});await page.click('[data-tab=insert]');assert.equal(await page.locator('#imageNewPage').count(),0);
    await page.locator('#insertPdf').tap();assert.equal(await page.getAttribute('#editor','contenteditable'),'false');
    await page.evaluate(()=>onPdfImported(bridgeCalls.filter(c=>c[0]==='import-pdf').at(-1)[1],JSON.stringify({asset:'a'.repeat(64),pages:2,name:'Dos páginas.pdf'}),null));
    let p=await doc(page);assert.equal(p[0].segments[0].text,'Antes');assert.deepEqual(p.filter(p=>p.type==='pdf').map(p=>p.pdf.index),[0,1]);assert.equal(p[3].segments[0].text,'Después');
    await page.keyboard.type('X');assert.equal((await lines(page))[3],'XDespués');await page.evaluate(()=>saveDraft());await page.reload();assert.equal(await page.locator('.pdfBlock').count(),2);
    await page.locator('.pdfBlock').first().getByRole('button',{name:'Eliminar página'}).click();assert.equal(await page.locator('.pdfBlock').count(),1);await page.click('#undoBtn');assert.equal(await page.locator('.pdfBlock').count(),2);
  });
  test('V50 visible page arrives early and obsolete render callbacks are ignored',async page=>{
    await setup(page,'Texto');await page.evaluate(()=>{composition={snapshot:'old',page_count:4};currentPage=2;controls();});await page.click('#refreshBtn');
    await page.evaluate(()=>{window.earlyId=revision;const c=document.createElement('canvas');c.width=675;c.height=1080;c.getContext('2d').fillRect(0,0,675,1080);window.earlyData=c.toDataURL();onComposePageReady(revision,JSON.stringify({snapshot:'new',page_count:3}),2,earlyData);});
    await page.waitForFunction(()=>composition.snapshot==='new');assert.equal(await page.evaluate(()=>composing),true);assert.equal(await page.isDisabled('#prevPage'),false);
    assert.equal(await page.evaluate(()=>$('previewCanvas').getContext('2d').getImageData(10,10,1,1).data[3]),255);
    await page.click('#exportBtn');assert.equal(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='save')),false);
    await page.evaluate(()=>{changed();onComposePageReady(earlyId,JSON.stringify({snapshot:'stale',page_count:3}),2,earlyData);});
    assert.notEqual(await page.evaluate(()=>composition.snapshot),'stale');
  });
  test('V50 decimal graph labels and manual resizing expand both axes',async page=>{
    await setup(page);await openMath(page,'graph');await graphPane(page,'axes');
    for(const [id,value] of [['xmin','-120000'],['xmax','120000'],['xstep','20000'],['ymin','-120000'],['ymax','120000'],['ystep','20000']])await page.locator('#graph_'+id).evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('change',{bubbles:true}));},value);
    const labels=await page.locator('#graphSVG text').allTextContents();assert.ok(labels.includes('120000'));assert.ok(labels.includes('-120000'));assert.ok(!labels.some(s=>/e[+-]/i.test(s)));
    await graphPane(page,'sheet');await page.locator('#mathHeight').evaluate(n=>{n.value='12';n.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#mathWidth').evaluate(n=>{n.value='10';n.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.click('#mathDone');const g=(await doc(page))[0].object;assert.equal(g.height,12);assert.equal(g.width,10);assert.equal(g.gridFit,false);
  });
};
