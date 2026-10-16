module.exports=({test,setup,select,assert})=>{
  const deliver=async(page,pages=1,name='Documento.pdf')=>page.evaluate(({pages,name})=>onPdfImported(bridgeCalls.filter(c=>c[0]==='import-pdf').at(-1)[1],JSON.stringify({asset:'a'.repeat(64),pages,name}),null),{pages,name});
  const refs=page=>page.evaluate(()=>serializeDocument().paragraphs.filter(p=>p.type==='pdf').map(p=>p.pdf));
  test('V51 PDF cancellation errors and retries always restore editing',async page=>{
    await setup(page,'No perder texto');await select(page,{line:0,offset:4});await page.click('[data-tab=insert]');
    for(const kind of ['cancel','error','invalid']){
      await page.locator('#insertPdf').tap();
      await page.evaluate(kind=>{const t=bridgeCalls.filter(c=>c[0]==='import-pdf').at(-1)[1];onPdfImported(t,kind==='invalid'?'{}':null,kind==='error'?'PDF protegido':null);},kind);
      assert.equal(await page.getAttribute('#editor','contenteditable'),'true');assert.equal(await page.isDisabled('#insertPdf'),false);assert.equal((await refs(page)).length,0);
      assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:0,offset:4});
    }
    await page.locator('#insertPdf').tap();await deliver(page);assert.equal((await refs(page)).length,1);
    await deliver(page);assert.equal((await refs(page)).length,1,'duplicate callbacks cannot insert twice');
  });
  test('V51 PDF native refusal cannot leave controls disabled',async page=>{
    await setup(page,'Documento');await page.click('[data-tab=insert]');
    await page.evaluate(()=>AndroidBridge.requestPdf=id=>onPdfImported(id,null,'Espera a que termine la operación actual'));
    await page.locator('#insertPdf').tap();assert.equal(await page.getAttribute('#editor','contenteditable'),'true');assert.equal(await page.isDisabled('#insertPdf'),false);
  });
  test('V51 PDF insertion during composition cancels obsolete work and renders its target',async page=>{
    await setup(page,'Texto largo '.repeat(1500));await page.evaluate(()=>{composition={snapshot:'old',page_count:47};currentPage=7;composing=true;controls();});
    const before=await page.evaluate(()=>revision);await page.click('[data-tab=insert]');await page.locator('#insertPdf').tap();
    assert.equal(await page.evaluate(()=>composing),false);assert.ok(await page.evaluate(()=>revision)>before);
    // Preview navigation while the picker is open cannot move the captured target.
    await page.evaluate(()=>currentPage=12);await deliver(page);
    assert.equal((await refs(page))[0].after_page,7);assert.equal(await page.evaluate(()=>currentPage),8);
    assert.equal(await page.evaluate(()=>composing),true);assert.equal(await page.getAttribute('#editor','contenteditable'),'true');
    assert.equal(await page.evaluate(()=>bridgeCalls.filter(c=>c[0]==='preferred-page').at(-1)[1]),8);
  });
  test('V51 PDF insertion between PDF pages shifts later PDFs and images with undo',async page=>{
    await setup(page,'Texto original');await page.evaluate(()=>{
      composition={snapshot:'mock',page_count:3};currentPage=0;
      const image=(id,page)=>({id,page,asset:'b'.repeat(64),x:80,y:150,width:100,height:100,angle:0,pixelWidth:100,pixelHeight:100,crop:{left:0,top:0,right:1,bottom:1}});
      ImageEditor.restore({images:[image('first',0),image('last',2)],minimumPages:3});controls();
    });await page.click('[data-tab=insert]');await page.locator('#insertPdf').tap();await deliver(page,2,'A.pdf');
    assert.deepEqual(await page.evaluate(()=>ImageEditor.state().images.map(i=>i.page)),[0,4]);
    await page.evaluate(()=>{composing=false;currentPage=1;composition.page_count=5;controls();});
    await page.locator('#insertPdf').tap();await deliver(page,1,'B.pdf');
    const ordered=(await refs(page)).sort((a,b)=>a.after_page-b.after_page);assert.deepEqual(ordered.map(p=>[p.name,p.index,p.after_page]),[['A.pdf',0,0],['B.pdf',0,1],['A.pdf',1,2]]);
    assert.deepEqual(await page.evaluate(()=>ImageEditor.state().images.map(i=>i.page)),[0,5]);
    await page.locator('.pdfBlock').filter({hasText:'B.pdf'}).getByRole('button',{name:'Eliminar página'}).click();
    assert.deepEqual((await refs(page)).map(p=>p.after_page),[0,1]);assert.deepEqual(await page.evaluate(()=>ImageEditor.state().images.map(i=>i.page)),[0,4]);
    await page.click('#undoBtn');assert.equal((await refs(page)).length,3);assert.deepEqual(await page.evaluate(()=>ImageEditor.state().images.map(i=>i.page)),[0,5]);
  });
};
