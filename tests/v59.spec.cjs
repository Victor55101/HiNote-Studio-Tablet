module.exports=({test,setup,select,assert})=>{
  test('V59 title shares the document header and leaves multiple editable rows above a docked keyboard',async page=>{
    await page.setViewportSize({width:1536,height:1000});await setup(page,'Texto para continuar');await select(page,{line:0,offset:5});
    const metrics=()=>page.evaluate(()=>{
      const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      return {heading:box('.documentHead h2'),title:box('#noteTitle'),head:box('.documentHead'),body:box('.editorScroll'),toolbar:box('.toolbar'),font:getComputedStyle(editor).fontSize,line:parseFloat(getComputedStyle(editor).lineHeight),zoom};
    });
    const before=await metrics();
    for(const height of [1000,560,920,1000]){
      await page.setViewportSize({width:1536,height});await page.waitForTimeout(50);const after=await metrics();
      assert.ok(after.title.x>=after.heading.right);assert.ok(after.title.y>=after.head.y&&after.title.bottom<=after.head.bottom);
      assert.ok(Math.abs((after.title.y+after.title.h/2)-(after.heading.y+after.heading.h/2))<1);
      assert.ok(after.body.y<=after.head.bottom+1,'No separate title row remains above the text');
      assert.ok(after.body.h>=after.line*2,'At least two text rows remain with the docked keyboard');
      assert.deepEqual(after.toolbar,before.toolbar);assert.equal(after.font,before.font);assert.equal(after.zoom,before.zoom);
    }
    await page.screenshot({path:'test-results/v59-title-docked.png'});
  });
  test('V59 long note names stay editable in the header without overlapping the character count',async page=>{
    await setup(page,'Documento');const title='Apuntes del semestre: '+('Economía '.repeat(10));await page.fill('#noteTitle',title);
    for(const width of [1536,1280,800,520]){
      await page.setViewportSize({width,height:850});await page.waitForTimeout(40);
      const m=await page.evaluate(()=>{const b=id=>document.querySelector(id).getBoundingClientRect();const t=b('#noteTitle'),c=b('#charCount'),h=b('.documentHead');return {width:t.width,titleEnd:t.right,countStart:c.left,headEnd:h.right,countEnd:c.right};});
      assert.ok(m.width>50);assert.ok(m.titleEnd<=m.countStart);assert.ok(m.countEnd<=m.headEnd);
      assert.equal(await page.inputValue('#noteTitle'),title);
    }
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');
    assert.equal(await page.inputValue('#noteTitle'),title);
  });
};
