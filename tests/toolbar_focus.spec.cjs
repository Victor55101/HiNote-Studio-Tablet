/* Real toolbar interactions: no selection restoration after the action. */
module.exports=({test,setup,select,lines,paste,assert,openTable})=>{
  const tapCaret=async(page,offset)=>{
    const p=await page.locator('#editor .line').first().evaluate((node,offset)=>{
      const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(text,offset);r.setEnd(text,offset+1);const b=r.getBoundingClientRect();return {x:b.left+1,y:b.top+b.height/2};
    },offset);await page.touchscreen.tap(p.x,p.y);
  };
  const choose=async(page,id,value)=>{await page.locator('[data-select-for='+id+']').tap();await page.locator('.selectMenu [data-value="'+value+'"]').tap();};
  const focused=page=>page.evaluate(()=>document.activeElement.id);
  const markers=page=>page.evaluate(()=>listMarkers(readLines()));
  test('V47 touch script buttons preserve the live caret and style the first physical key',async page=>{
    for(const [button,script] of [['subscriptBtn','sub'],['superscriptBtn','sup']]){
      await setup(page,'HOO');await tapCaret(page,1);const before=await page.evaluate(()=>bookmark().start);
      await page.locator('#'+button).tap();assert.equal(await focused(page),'editor');assert.deepEqual(await page.evaluate(()=>bookmark().start),before);
      await page.keyboard.type('2');assert.deepEqual(await lines(page),['H2OO']);assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text==='2').script),script);
      await page.keyboard.press('End');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');assert.equal(await focused(page),'editor');assert.equal(await page.isVisible('#tableDialog'),false);
    }
  });
  test('V47 touch size menu keeps editor focus and typing continues without retapping the text',async page=>{
    await setup(page,'abcd');await tapCaret(page,2);const before=await page.evaluate(()=>bookmark().start);
    await page.locator('[data-select-for=sizeSel]').tap();assert.equal(await focused(page),'editor');assert.deepEqual(await page.evaluate(()=>bookmark().start),before);
    await page.locator('.selectMenu [data-value="90"]').tap();assert.equal(await focused(page),'editor');assert.equal(await page.inputValue('#sizeSel'),'90');
    await page.keyboard.type('XY');assert.deepEqual(await lines(page),['abXYcd']);assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text==='XY').scale),.9);
    await page.keyboard.press('ArrowLeft');assert.equal(await focused(page),'editor');assert.equal(await page.locator('.selectMenu').count(),0);
  });
  test('V47 sequential toolbar formats and color dialog return to the same insertion point',async page=>{
    await setup(page,'Hola mundo');await tapCaret(page,5);const before=await page.evaluate(()=>bookmark().start);
    await choose(page,'sizeSel','90');await choose(page,'thicknessSel','4');
    await page.locator('[data-color-for=colorPick]').tap();await page.locator('#colorPalette button[aria-label="Color #EF4444"]').tap();await page.locator('#colorDone').tap();
    assert.equal(await focused(page),'editor');assert.deepEqual(await page.evaluate(()=>bookmark().start),before);
    await page.fill('#opacity','60');await page.keyboard.press('Enter');assert.equal(await focused(page),'editor');
    await page.locator('#subscriptBtn').tap();await page.keyboard.type('2');
    const run=await page.evaluate(()=>readLines()[0].find(s=>s.text==='2'));assert.deepEqual(run,{text:'2',scale:.9,color:'#EF4444',opacity:60,thickness:4,script:'sub'});
  });
  test('V47 keyboard menu navigation closes into the document and arrows never reopen controls',async page=>{
    await setup(page,'Texto');await tapCaret(page,2);await page.locator('[data-select-for=sizeSel]').tap();
    await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await focused(page),'editor');assert.equal(await page.inputValue('#sizeSel'),'70');
    await page.keyboard.type('x');assert.deepEqual(await lines(page),['Texxto']);
    await page.keyboard.press('End');for(const key of ['ArrowRight','ArrowDown','ArrowUp','Home','ArrowLeft']){await page.keyboard.press(key);assert.equal(await focused(page),'editor');assert.equal(await page.locator('.selectMenu').count(),0);}
  });
  test('V47 bulk numbering matches Word across blank question and answer separators',async page=>{
    const text='¿Cuál es la principal característica de una BD NoSQL?\nAlmacena datos de forma flexible, sin depender de tablas y esquemas rígidos\n\n¿Qué software se recomienda para una BD NoSQL?\nMongoDB, por su facilidad de uso, flexibilidad y escalabilidad\n\n¿Dónde se puede usar una BD SQL?\nEn bancos, hospitales, escuelas empresas, sistemas de inventarios, etc\n\n¿Cuál es la principal desventaja de una BD NoSQL?\nQue puede ser más difícil garantizar la integridad y consistencia de los datos dependiendo del sistema utilizado';
    await setup(page,text);await page.keyboard.press('Control+a');await page.locator('#listToggle').tap();await choose(page,'listType','num_dot');
    assert.deepEqual(await markers(page),['1.','2.','','3.','4.','','5.','6.','','7.','8.']);assert.deepEqual(await lines(page),text.split('\n'));
    const ids=await page.evaluate(()=>readLines().filter(l=>paragraphOf(l).list).map(l=>paragraphOf(l).list.id));assert.equal(new Set(ids).size,1);
    assert.equal(await focused(page),'editor');await page.locator('#applyList').tap();assert.deepEqual(await markers(page),['1.','2.','','3.','4.','','5.','6.','','7.','8.']);
    const doc=await page.evaluate(()=>serializeDocument());assert.equal(doc.paragraphs.filter(p=>p.list).length,8);assert.equal(doc.paragraphs[2].list,undefined);
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await markers(page),['1.','2.','','3.','4.','','5.','6.','','7.','8.']);
  });
  test('V47 explicit empty list items stay numbered until empty Enter exits the list',async page=>{
    await setup(page,'Uno');await page.keyboard.press('End');await page.locator('#listToggle').tap();await choose(page,'listType','num_dot');await page.keyboard.press('Enter');
    assert.deepEqual(await markers(page),['1.','2.']);await page.keyboard.press('Enter');assert.deepEqual(await markers(page),['1.','']);
  });
  test('V47 backwards selections retain their active end after choosing a format',async page=>{
    await setup(page,'abcdef');await page.keyboard.press('End');for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowLeft');
    const before=await page.evaluate(()=>bookmark());assert.equal(before.backward,true);await choose(page,'sizeSel','90');
    assert.deepEqual(await page.evaluate(()=>bookmark()),before);assert.equal(await focused(page),'editor');await page.keyboard.press('Shift+ArrowLeft');assert.equal(await page.evaluate(()=>getSelection().toString()),'cdef');
  });
  test('V47 format selection on multiple paragraphs can be replaced immediately by typing',async page=>{
    for(const text of ['Primero\n\nSegundo','Nuevo\n\nSegundo']){
      await setup(page,text);await page.keyboard.press('Control+a');await choose(page,'sizeSel','90');
      await page.keyboard.type('Nuevo');assert.deepEqual(await lines(page),['Nuevo']);assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text).scale),.9);assert.equal(await focused(page),'editor');
    }
  });
  test('V47 keyboard mode selector restores the title field rather than keeping arrow focus',async page=>{
    await setup(page,'Texto');await page.fill('#noteTitle','Mi nota');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    await choose(page,'keyboardMode','physical');assert.equal(await focused(page),'noteTitle');assert.equal(await page.evaluate(()=>$('noteTitle').selectionStart),1);
    await page.keyboard.type('X');assert.equal(await page.inputValue('#noteTitle'),'MXi nota');
  });
  test('V47 touch can scroll a format menu without committing or losing the caret',async page=>{
    await setup(page,'Texto');await tapCaret(page,2);await page.locator('[data-select-for=sizeSel]').tap();
    const box=await page.locator('.selectMenu').boundingBox(),before=await page.locator('.selectMenu').evaluate(n=>n.scrollTop),session=await page.context().newCDPSession(page);
    const x=box.x+box.width/2,y=box.y+box.height-30;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(const delta of [20,40,70,110,150])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('.selectMenu').count(),1);assert.ok(await page.locator('.selectMenu').evaluate(n=>n.scrollTop)>before);assert.equal(await focused(page),'editor');assert.equal(await page.inputValue('#sizeSel'),'100');
    await page.keyboard.press('Escape');assert.equal(await focused(page),'editor');await page.keyboard.type('X');assert.deepEqual(await lines(page),['TeXxto']);
  });
  test('V47 table dropdown restores its cell so physical arrows and typing stay in the cell',async page=>{
    await setup(page);await openTable(page);await page.locator('.cellEditor').first().fill('Celda');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await choose(page,'tableValign','bottom');assert.equal(await page.evaluate(()=>document.activeElement.className),'cellEditor');await page.keyboard.type('X');
    assert.equal(await page.locator('.cellEditor').first().textContent(),'CeXlda');for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.className),'cellEditor');
  });
};
