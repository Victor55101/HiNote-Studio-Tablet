module.exports=({test,setup,assert,openMath,openTable,importImage})=>{
  const kinds=['image','table','formula','graph'];
  const body=kind=>kind==='image'?'.pageImage':kind==='table'?'.tableSelect':'.objectSelect';
  const chosen=(page,kind)=>page.evaluate(kind=>kind==='image'?!!ImageEditor.selected():!!document.querySelector(kind==='table'?'.tableTarget':'.objectTarget'),kind);
  const documentState=page=>page.evaluate(()=>({images:ImageEditor.state(),document:serializeDocument(),revision,historyIndex}));
  const scroll=page=>page.locator('#previewWrap').evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));
  const center=async(page,kind)=>{const b=await page.locator(body(kind)).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,id:1};};
  const touch=(session,type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  async function prepare(page,kind){
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto');
    if(kind==='image')await importImage(page);
    else if(kind==='table'){await openTable(page);await page.click('#tableDone');}
    else{await openMath(page,kind);if(kind==='formula')await page.locator('.mathSlot').first().fill('x=2');await page.click('#mathDone');}
    await page.evaluate(kind=>{
      const geometry={x:140,y:180,width:400,height:260};
      if(kind==='image'){
        const data=ImageEditor.state();Object.assign(data.images[0],geometry,{angle:0});ImageEditor.restore(data);
      }
      const doc=serializeDocument(),table=doc.paragraphs.find(p=>p.table)?.table,object=doc.paragraphs.find(p=>p.object)?.object;
      composition={snapshot:'v54-gestures',page_count:1,layout:{grid_step:58.8},table_pages:[table?[{id:table.id,...geometry}]:[]],object_pages:[object?[{id:object.id,kind:object.kind,...geometry}]:[]]};
      composing=false;previewRevision=revision;currentPage=0;zoom=1.4;
      ImageEditor.select(null);TableEditor.clearSelection();MathGraphEditor.clearSelection();applyZoom();
      $('previewWrap').scrollLeft=40;$('previewWrap').scrollTop=40;checkpoint();
    },kind);
  }
  for(const kind of kinds){
    test(`V54 ${kind}: dragging an unselected body scrolls without selecting or editing it`,async page=>{
      await prepare(page,kind);const session=await page.context().newCDPSession(page),p=await center(page,kind),before=await documentState(page),s=await scroll(page);
      await touch(session,'touchStart',[p]);assert.equal(await chosen(page,kind),false,'Touch-down alone must not select');
      await touch(session,'touchMove',[{...p,x:p.x-35,y:p.y-60}]);
      const moved=await scroll(page);assert.ok(moved.y>s.y+45);assert.ok(moved.x>s.x+20);
      assert.equal(await chosen(page,kind),false);await touch(session,'touchEnd',[]);
      assert.equal(await chosen(page,kind),false);assert.deepEqual(await documentState(page),before);
      assert.equal(await page.locator('#previewWrap').evaluate(n=>n.classList.contains('objectManipulating')),false);
      // The same contract applies to a mouse, including synthetic click handling.
      const q=await center(page,kind),s2=await scroll(page);await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.x,q.y-30,{steps:3});await page.mouse.up();
      assert.ok((await scroll(page)).y>s2.y+20);assert.equal(await chosen(page,kind),false);assert.deepEqual(await documentState(page),before);
    });
    test(`V54 ${kind}: a completed tap selects then a separate drag moves with cancel and undo`,async page=>{
      await prepare(page,kind);const session=await page.context().newCDPSession(page),p=await center(page,kind),before=await documentState(page);
      await touch(session,'touchStart',[p]);await touch(session,'touchMove',[{...p,x:p.x+2,y:p.y+2}]);assert.equal(await chosen(page,kind),false);
      await touch(session,'touchEnd',[]);assert.equal(await chosen(page,kind),true);assert.deepEqual(await documentState(page),before);
      let q=await center(page,kind);const s=await scroll(page);
      await touch(session,'touchStart',[q]);await touch(session,'touchMove',[{...q,x:q.x+30,y:q.y+30}]);await touch(session,'touchCancel',[]);
      assert.equal(await chosen(page,kind),true);assert.deepEqual(await documentState(page),before);assert.deepEqual(await scroll(page),s);
      q=await center(page,kind);await touch(session,'touchStart',[q]);await touch(session,'touchMove',[{...q,x:q.x+30,y:q.y+30}]);await touch(session,'touchEnd',[]);
      const after=await documentState(page);assert.notDeepEqual({images:after.images,document:after.document},{images:before.images,document:before.document});assert.deepEqual(await scroll(page),s);
      await page.click('#undoBtn');const undone=await documentState(page);assert.deepEqual({images:undone.images,document:undone.document},{images:before.images,document:before.document});
    });
    test(`V54 ${kind}: a pinch on an unselected body zooms the page and cannot complete a tap`,async page=>{
      await prepare(page,kind);const session=await page.context().newCDPSession(page),p=await center(page,kind),before=await documentState(page),z=await page.evaluate(()=>zoom);
      let a={...p,x:p.x-35},b={...p,x:p.x+35,id:2};
      await touch(session,'touchStart',[a]);await touch(session,'touchStart',[a,b]);
      a={...a,x:a.x-25};b={...b,x:b.x+25};await touch(session,'touchMove',[a,b]);assert.ok(await page.evaluate(()=>zoom)>z*1.4);
      // Keep one finger down, pan, then lift: it is still navigation, not a tap.
      await touch(session,'touchEnd',[b]);a={...a,y:a.y-30};await touch(session,'touchMove',[a]);await touch(session,'touchEnd',[]);
      assert.equal(await chosen(page,kind),false);assert.deepEqual(await documentState(page),before);
      // Pinch cancellation must not select an object either.
      await page.evaluate(()=>{zoom=1.4;applyZoom();$('previewWrap').scrollTop=40;$('previewWrap').scrollLeft=40;});
      const q=await center(page,kind);await touch(session,'touchStart',[{...q,x:q.x-25},{...q,x:q.x+25,id:2}]);await touch(session,'touchCancel',[]);
      assert.equal(await chosen(page,kind),false);assert.deepEqual(await documentState(page),before);
    });
    test(`V54 ${kind}: a page pinch stays navigation when its second finger lands on the selected body`,async page=>{
      await prepare(page,kind);
      let p=await center(page,kind);await page.touchscreen.tap(p.x,p.y);assert.equal(await chosen(page,kind),true);
      const session=await page.context().newCDPSession(page),r=await page.locator('#previewWrap').boundingBox(),before=await documentState(page),z=await page.evaluate(()=>zoom);
      p=await center(page,kind);let a={x:r.x+r.width-25,y:p.y,id:1},b={...p,id:2};
      await touch(session,'touchStart',[a]);await touch(session,'touchStart',[a,b]);
      a={...a,x:a.x-25};b={...b,x:b.x+25};await touch(session,'touchMove',[a,b]);await touch(session,'touchEnd',[b]);await touch(session,'touchEnd',[]);
      assert.ok(await page.evaluate(()=>zoom)<z*.95);assert.equal(await chosen(page,kind),true);assert.deepEqual(await documentState(page),before);
    });
    test(`V54 ${kind}: an extra finger during page zoom cannot select or move the object`,async page=>{
      await prepare(page,kind);const session=await page.context().newCDPSession(page),p=await center(page,kind),before=await documentState(page);
      let a={...p,x:p.x-35},b={...p,x:p.x+35,id:2},c={...p,y:p.y+35,id:3};
      await touch(session,'touchStart',[a,b]);await touch(session,'touchStart',[a,b,c]);
      a={...a,x:a.x-20};b={...b,x:b.x+20};await touch(session,'touchMove',[a,b,c]);
      // CDP touchEnd lists the contacts being lifted, not the remaining ones.
      await touch(session,'touchEnd',[a]);await touch(session,'touchEnd',[b]);
      // Let compatibility-click suppression expire while the extra finger stays.
      await page.waitForTimeout(550);await touch(session,'touchMove',[{...c,y:c.y+10}]);await touch(session,'touchEnd',[]);
      assert.equal(await chosen(page,kind),false);assert.deepEqual(await documentState(page),before);
    });
  }
  for(const kind of ['table','formula','graph'])test(`V54 ${kind}: a second finger cancels the selected object drag before page zoom`,async page=>{
    await prepare(page,kind);let p=await center(page,kind);await page.touchscreen.tap(p.x,p.y);
    const session=await page.context().newCDPSession(page),before=await documentState(page),z=await page.evaluate(()=>zoom);p=await center(page,kind);
    let a={...p},b={x:p.x+70,y:p.y+25,id:2};await touch(session,'touchStart',[a]);a={...a,y:a.y+25};await touch(session,'touchMove',[a]);
    assert.notDeepEqual((await documentState(page)).document,before.document);
    await touch(session,'touchStart',[a,b]);assert.deepEqual(await documentState(page),before);
    b={...b,x:b.x+40};await touch(session,'touchMove',[a,b]);await touch(session,'touchEnd',[]);
    assert.ok(await page.evaluate(()=>zoom)>z*1.3);assert.equal(await chosen(page,kind),true);assert.deepEqual(await documentState(page),before);
  });
};
