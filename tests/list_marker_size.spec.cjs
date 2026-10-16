/* V49: user-visible list sizing, marker selection and persistence. */
module.exports=({test,setup,select,lines,paste,assert})=>{
  const choose=async(page,id,value)=>{await page.locator('[data-select-for='+id+']').tap();await page.locator('.selectMenu [data-value="'+value+'"]').tap();};
  const doc=page=>page.evaluate(()=>serializeDocument().paragraphs);
  const makeList=async(page,type='num_dot')=>{
    if(!await page.isVisible('#listType'))await page.locator('#listToggle').tap();
    await page.selectOption('#listType',type);
  };
  const tapMarker=async(page,i=0)=>{
    const p=await page.locator('#editor .line').nth(i).evaluate(n=>{
      const b=n.getBoundingClientRect(),s=getComputedStyle(n),w=parseFloat(s.getPropertyValue('--marker-width'));
      return {x:b.left+parseFloat(s.paddingLeft)-w+4,y:b.top+Math.min(b.height/2,15)};
    });await page.touchscreen.tap(p.x,p.y);
  };
  test('V49 whole list selection resizes every marker type with its text',async page=>{
    for(const type of ['bullet','dash','asterisk','num_dot','num_paren','alpha_lower_dot','alpha_lower_paren','alpha_upper_dot','alpha_upper_paren','roman_lower_dot','roman_upper_dot','multi_decimal']){
      await setup(page,'Uno\nDos\n\nTres');await select(page,{line:0,offset:0},{line:3,offset:4});await makeList(page,type);
      await choose(page,'sizeSel','60');const p=await doc(page);
      assert.equal(p[2].list,undefined,type+' blank separator');
      for(const i of [0,1,3]){assert.equal(p[i].list.marker_scale,.6,type);assert.ok(p[i].segments.every(s=>s.scale===.6));}
      assert.deepEqual(await lines(page),['Uno','Dos','','Tres']);
    }
  });
  test('V49 partial text and excluded end paragraph retain marker size',async page=>{
    await setup(page,'1. Uno largo\n2. Dos\n3. Tres');
    await select(page,{line:0,offset:1},{line:0,offset:4});await choose(page,'sizeSel','60');
    let p=await doc(page);assert.equal(p[0].list.marker_scale,1);assert.equal(p[0].segments.find(s=>s.scale===.6).text,'no ');
    await select(page,{line:0,offset:0},{line:1,offset:0});await choose(page,'sizeSel','150');
    p=await doc(page);assert.equal(p[0].list.marker_scale,1.5);assert.equal(p[1].list.marker_scale,1);assert.equal(p[1].segments[0].scale,1);
  });
  test('V50 obsolete list controls are absent and Ninguna preserves text',async page=>{
    await setup(page,'1. Uno\n2. Dos');await select(page,{line:0,offset:0},{line:1,offset:3});
    assert.equal(await page.locator('#listFormatTarget,#applyList,#removeList').count(),0);
    await makeList(page,'none');assert.deepEqual(await lines(page),['Uno','Dos']);assert.ok((await doc(page)).every(p=>!p.list));
  });
  test('V49 tapping a marker selects its list level across separators without selecting other lists',async page=>{
    await setup(page,'Uno\n\nDos\nOtro\nFinal');await select(page,{line:0,offset:0},{line:2,offset:3});await makeList(page,'multi_decimal');
    await select(page,{line:4,offset:0},{line:4,offset:5});await makeList(page,'multi_decimal');
    await select(page,{line:2,offset:0});await page.click('#indentBtn');
    await tapMarker(page,0);assert.equal(await page.locator('.markerSelected').count(),1);
    await choose(page,'sizeSel','60');let p=await doc(page);assert.equal(p[0].list.marker_scale,.6);assert.equal(p[2].list.marker_scale,1);assert.equal(p[4].list.marker_scale,1);assert.equal(p[0].segments[0].scale,1);
    await select(page,{line:2,offset:0});await page.click('#outdentBtn');
    await tapMarker(page,0);assert.equal(await page.locator('.markerSelected').count(),2);assert.equal(await page.inputValue('#sizeSel'),'mixed');
    await choose(page,'sizeSel','150');p=await doc(page);assert.equal(p[0].list.marker_scale,1.5);assert.equal(p[2].list.marker_scale,1.5);assert.equal(p[4].list.marker_scale,1);
    assert.deepEqual(await lines(page),['Uno','','Dos','Otro','Final']);
  });
  test('V49 marker selection survives actual toolbar touches theme undo and redo',async page=>{
    await setup(page,'1. Uno\n2. Dos');await tapMarker(page);await choose(page,'sizeSel','60');
    assert.equal(await page.inputValue('#sizeSel'),'60');assert.equal(await page.locator('.markerSelected').count(),2);
    await page.locator('#themeToggle').tap();assert.equal(await page.locator('.markerSelected').count(),2);
    await page.locator('#undoBtn').tap();assert.ok((await doc(page)).every(p=>p.list.marker_scale===1));
    await page.locator('#redoBtn').tap();assert.ok((await doc(page)).every(p=>p.list.marker_scale===.6));
    await page.keyboard.press('Escape');assert.equal(await page.locator('.markerSelected').count(),0);
    await select(page,{line:1,offset:3});await page.keyboard.press('Enter');await page.keyboard.type('Tres');
    const p=await doc(page);assert.equal(p[2].list.marker_scale,.6);assert.equal(p[2].segments[0].scale,1);assert.equal(p[2].list.marker,'3.');
  });
  test('V49 size survives reload copy and native composition request',async page=>{
    await setup(page,'1. Uno\n2. Dos\n');await tapMarker(page);await choose(page,'sizeSel','150');
    await page.keyboard.press('Escape');await select(page,{line:0,offset:0},{line:1,offset:3});
    await page.evaluate(()=>{window.markerCopy=new DataTransfer();editor.dispatchEvent(new ClipboardEvent('copy',{clipboardData:markerCopy,bubbles:true,cancelable:true}));});
    await select(page,{line:2,offset:0});await page.evaluate(()=>editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:markerCopy,bubbles:true,cancelable:true})));
    let p=await doc(page);assert.ok(p.every(p=>p.list.marker_scale===1.5&&p.segments[0].scale===1));assert.notEqual(p[0].list.id,p[2].list.id);
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await doc(page),p);
    await page.locator('#refreshBtn').tap();const sent=await page.evaluate(()=>JSON.parse(bridgeCalls.filter(c=>c[0]==='compose').at(-1)[1]));
    assert.deepEqual(sent.paragraphs,p);
  });
  test('V49 empty item follows insertion size and retains editable text offsets',async page=>{
    await setup(page,'1. Uno');await select(page,{line:0,offset:3});await page.keyboard.press('Enter');
    await choose(page,'sizeSel','60');await page.keyboard.type('Dos');
    const p=await doc(page);assert.equal(p[0].list.marker_scale,1);assert.equal(p[1].list.marker_scale,1);assert.equal(p[1].segments[0].scale,.6);
    assert.deepEqual(await lines(page),['Uno','Dos']);assert.equal(await page.evaluate(()=>bookmark().start.offset),3);
  });
  test('V49 large wide markers reserve width and height without entering editable text',async page=>{
    await setup(page,'MMM. Texto largo con varias palabras que se repite para comprobar la sangría francesa\nMMM. Otro texto');
    await select(page,{line:1,offset:0});await page.click('#continueList');
    await tapMarker(page);await choose(page,'sizeSel','200');await page.keyboard.press('Escape');
    await select(page,{line:0,offset:0},{line:1,offset:10});await choose(page,'sizeSel','60');await tapMarker(page);await choose(page,'sizeSel','200');await page.keyboard.press('Escape');
    const boxes=await page.locator('#editor .line').evaluateAll(nodes=>nodes.map(n=>{
      const s=getComputedStyle(n),m=getComputedStyle(n,'::before'),r=document.createRange(),t=document.createTreeWalker(n,NodeFilter.SHOW_TEXT).nextNode();r.setStart(t,0);r.setEnd(t,1);
      const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,textLeft:r.getBoundingClientRect().left,left:b.left,padding:parseFloat(s.paddingLeft),markerWidth:parseFloat(m.width),markerFont:parseFloat(m.fontSize),baseFont:parseFloat(s.fontSize),body:n.textContent};
    }));
    for(const b of boxes){assert.equal(b.markerFont,b.baseFont*2);assert.ok(b.markerWidth>80);assert.ok(b.textLeft>=b.left+b.padding-1);assert.ok(b.height>=50);assert.ok(!b.body.startsWith('MMM.'));}
    assert.ok(boxes[1].top>=boxes[0].bottom);
    const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../test-results/v49-marker-sizes.png')});
  });
  test('V49 text tap exits marker selection and keyboard delete removes only list structure',async page=>{
    await setup(page,'1. Uno\n2. Dos');await tapMarker(page);
    const p=await page.locator('#editor .line').first().evaluate(n=>{const t=document.createTreeWalker(n,NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(t,1);r.setEnd(t,2);const b=r.getBoundingClientRect();return {x:b.left+1,y:b.top+b.height/2};});await page.touchscreen.tap(p.x,p.y);
    assert.equal(await page.locator('.markerSelected').count(),0);await page.keyboard.type('X');assert.deepEqual(await lines(page),['UXno','Dos']);
    await tapMarker(page);assert.equal(await page.locator('.markerSelected').count(),2);
    await page.keyboard.press('Delete');assert.deepEqual(await lines(page),['UXno','Dos']);assert.ok((await doc(page)).every(p=>!p.list));
    await page.keyboard.press('Control+z');assert.ok((await doc(page)).every(p=>p.list));
  });
};
