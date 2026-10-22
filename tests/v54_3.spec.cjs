/* WebView can deliver focus/selection changes between touch and its click. */
module.exports=({test,setup,select,lines,assert})=>{
  const formats=[['boldBtn','bold',true],['italicBtn','italic',true],['underlineBtn','underline',true],['subscriptBtn','script','sub'],['superscriptBtn','script','sup']];
  async function resetDuringPress(page,id){
    await page.locator('#'+id).evaluate(button=>button.addEventListener('pointerdown',()=>{
      button.focus({preventScroll:true});getSelection().collapse(editor,0);
      document.dispatchEvent(new Event('selectionchange'));
    },{once:true}));
  }
  const mark=page=>page.evaluate(()=>bookmark());
  test('V54.3 format commands survive WebView focus and range reset during a touch',async page=>{
    for(const [id,key,value] of formats){
      await setup(page,'Primero\nDestino texto');await select(page,{line:1,offset:7});const before=await mark(page);
      await resetDuringPress(page,id);await page.locator('#'+id).tap();
      assert.deepEqual(await mark(page),before,id+' must keep the insertion point');
      assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'true',id+' must light before typing');
      await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','DestinoX texto']);
      assert.equal(await page.evaluate(key=>readLines()[1].find(s=>s.text==='X')[key],key),value);
      await page.locator('#'+id).tap();assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'false');
      await page.keyboard.type('Y');assert.deepEqual(await lines(page),['Primero','DestinoXY texto']);
      assert.equal(await page.evaluate(key=>styleAt(readLines()[1],8)[key]||null,key),null);
    }
  });
  test('V54.3 late touch compatibility mouse events cannot refocus a format button',async page=>{
    for(const [id] of formats){
      await setup(page,'Antes y después');await select(page,{line:0,offset:7});
      const button=page.locator('#'+id),b=await button.boundingBox();await button.tap();
      const blocked=await button.evaluate((n,p)=>{
        return ['mousedown','mouseup','click'].every(type=>{
          const event=new MouseEvent(type,{bubbles:true,cancelable:true,detail:1,clientX:p.x+p.width/2,clientY:p.y+p.height/2});
          n.dispatchEvent(event);if(type==='mousedown'&&!event.defaultPrevented){n.focus();getSelection().collapse(editor,0);}return event.defaultPrevented;
        });
      },b);
      assert.equal(blocked,true,id);await page.keyboard.type('X');assert.deepEqual(await lines(page),['Antes yX después']);
    }
  });
  test('V54.3 a format chosen during composition survives the native commit',async page=>{
    for(const [id,key,value] of formats){
      await setup(page,'Base');await select(page,{line:0,offset:4});
      await page.evaluate(()=>{
        editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        const s=getSelection(),r=s.getRangeAt(0),n=document.createTextNode('á');r.insertNode(n);s.collapse(n,1);
        editor.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',isComposing:true,bubbles:true}));
      });
      await page.locator('#'+id).tap();assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'true');
      await page.evaluate(()=>editor.dispatchEvent(new CompositionEvent('compositionend',{data:'á',bubbles:true})));
      assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'true',id+' must remain synchronized after commit');
      await page.keyboard.type('X');assert.deepEqual(await lines(page),['BaseáX']);
      assert.equal(await page.evaluate(key=>readLines()[0].find(s=>s.text==='X')[key],key),value);
      assert.equal(await page.evaluate(key=>readLines()[0].find(s=>s.text.includes('á'))[key]||null,key),null,'The composing text keeps its original style');
    }
  });
  test('V54.3 size opacity and thickness menus restore the range before applying their value',async page=>{
    for(const [id,value,key,expected] of [['sizeSel','150','scale',1.5],['opacity','75','opacity',75],['thicknessSel','4','thickness',4]]){
      await setup(page,'Primero\nDestino texto');await select(page,{line:1,offset:7});
      await page.locator('#superscriptBtn').tap();const before=await mark(page);
      await page.locator('[data-select-for='+id+']').tap();
      const option=page.locator('.selectMenu [data-value="'+value+'"]');
      await option.evaluate(n=>n.addEventListener('pointerdown',()=>{n.focus();getSelection().collapse(editor,0);document.dispatchEvent(new Event('selectionchange'));},{once:true}));
      await option.tap();assert.deepEqual(await mark(page),before);assert.equal(await page.inputValue('#'+id),value);
      assert.equal(await page.getAttribute('#superscriptBtn','aria-pressed'),'true','The pending script survives the menu');
      await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','DestinoX texto']);
      const run=await page.evaluate(()=>readLines()[1].find(s=>s.text==='X'));assert.equal(run[key],expected);assert.equal(run.script,'sup');
    }
  });
  test('V54.3 a color field cannot overwrite the saved backward text selection',async page=>{
    await setup(page,'Primero\nabcdef');await select(page,{line:1,offset:1},{line:1,offset:5});
    await page.evaluate(()=>{const m=bookmark();restoreSelection({...m,backward:true});});const before=await mark(page);
    await page.locator('#hexInput').focus();await page.evaluate(()=>{const field=document.activeElement;getSelection().collapse(editor,0);field.focus();document.dispatchEvent(new Event('selectionchange'));});
    await page.fill('#hexInput','#336699');assert.deepEqual(await mark(page),before);
    assert.deepEqual(await page.evaluate(()=>readLines().map(l=>l.filter(s=>s.color==='#336699').map(s=>s.text))),[[],['bcde']]);
    await page.press('#hexInput','Enter');assert.deepEqual(await mark(page),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
    await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','aXf']);
  });
  test('V54.3 backward selections and immediate button states survive every format command',async page=>{
    for(const [id,key,value] of formats){
      await setup(page,'Primero\nabcdef\nTercero');await select(page,{line:1,offset:1},{line:1,offset:5});
      await page.evaluate(()=>{const m=bookmark();restoreSelection({...m,backward:true});});const before=await mark(page);
      await resetDuringPress(page,id);await page.locator('#'+id).tap();assert.deepEqual(await mark(page),before);
      assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'true');
      assert.equal(await page.evaluate(key=>readLines()[1].find(s=>s.text==='bcde')[key],key),value);
      await page.locator('#'+id).tap();assert.deepEqual(await mark(page),before);assert.equal(await page.getAttribute('#'+id,'aria-pressed'),'false');
      await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','aXf','Tercero']);
    }
  });
  test('V54.3 moving or cancelling a toolbar touch never formats and leaves caret navigation free',async page=>{
    for(const cancel of [false,true]){
      await setup(page,'Primero\nDestino texto');await select(page,{line:1,offset:7});const before=await mark(page);
      const button=page.locator('#boldBtn'),b=await button.boundingBox(),session=await page.context().newCDPSession(page),p={x:b.x+b.width/2,y:b.y+b.height/2,id:1};
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      if(!cancel)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+25}]});
      await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
      assert.deepEqual(await mark(page),before);assert.equal(await page.getAttribute('#boldBtn','aria-pressed'),'false');
      await page.keyboard.press('ArrowLeft');assert.deepEqual((await mark(page)).start,{line:1,offset:6});
      await button.tap();await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','DestinXo texto']);
    }
  });
  test('V54.3 format touch survives keyboard resize in all existing modes',async page=>{
    for(const mode of ['physical','auto','virtual']){
      await page.setViewportSize({width:1280,height:850});await setup(page,'Primero\nDestino texto');await select(page,{line:1,offset:7});
      await page.evaluate(mode=>onKeyboardState(JSON.stringify({nativeGate:true,mode,suppress:mode==='physical'})),mode);
      const b=await page.locator('#subscriptBtn').boundingBox(),session=await page.context().newCDPSession(page),p={x:b.x+b.width/2,y:b.y+b.height/2,id:1};
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await page.setViewportSize({width:1280,height:550});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await page.getAttribute('#subscriptBtn','aria-pressed'),'true',mode);assert.deepEqual((await mark(page)).start,{line:1,offset:7});
      await page.keyboard.type('X');assert.deepEqual(await lines(page),['Primero','DestinoX texto']);assert.equal(await page.evaluate(()=>readLines()[1].find(s=>s.text==='X').script),'sub');
    }
  });
};
