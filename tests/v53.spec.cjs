module.exports=({test,setup,select,lines,assert,openMath,graphPane})=>{
  const startPdf=async(page,pages=3)=>{
    await page.evaluate(()=>{composition={snapshot:'v53',page_count:1,page_ends:[{line:readLines().length,offset:0}]};previewRevision=revision;composing=false;controls();});
    await page.click('[data-tab=insert]');await page.locator('#insertPdf').tap();
    await page.evaluate(pages=>onPdfImported(bridgeCalls.filter(c=>c[0]==='import-pdf').at(-1)[1],JSON.stringify({asset:'a'.repeat(64),pages,name:'Prueba.pdf'}),null),pages);
  };
  const gaps=page=>page.evaluate(()=>readLines().filter(l=>paragraphOf(l).pdfGap).length);
  const caret=page=>page.evaluate(()=>{const n=$('typingCaret');if(!n||getComputedStyle(n).display==='none')return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};});
  test('V53 graph arrows point away from zero for negative positive and mixed ranges',async page=>{
    await setup(page);await openMath(page,'graph');await graphPane(page,'axes');
    for(const [xmin,xmax,ymin,ymax,names] of [[-40000,0,-6,0,['x-negative','y-negative']],[-40000,-20000,-6,-2,['x-negative','y-negative']],[0,6,0,6,['x-positive','y-positive']],[-6,6,-6,6,['x-negative','x-positive','y-negative','y-positive']],[-6,0,2,6,['x-negative','y-positive']]]){
      await page.evaluate(values=>{for(const [key,value] of Object.entries(values)){const n=$('graph_'+key);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));}},{xmin,xmax,xstep:xmin===-40000?20000:2,ymin,ymax,ystep:2});
      const heads=await page.locator('#graphSVG [data-axis-arrow]').evaluateAll(ns=>ns.map(n=>({name:n.dataset.axisArrow,points:n.getAttribute('points').split(' ').map(p=>p.split(',').map(Number))})));
      assert.deepEqual(heads.map(h=>h.name).sort(),names.sort());
      for(const h of heads){const [a,t,b]=h.points;if(h.name==='x-negative')assert.ok(t[0]<a[0]&&t[0]<b[0]);if(h.name==='x-positive')assert.ok(t[0]>a[0]&&t[0]>b[0]);if(h.name==='y-negative')assert.ok(t[1]>a[1]&&t[1]>b[1]);if(h.name==='y-positive')assert.ok(t[1]<a[1]&&t[1]<b[1]);}
    }
    await page.uncheck('#graph_arrows');assert.equal(await page.locator('[data-axis-arrow]').count(),0);
    require('node:fs').mkdirSync('test-results',{recursive:true});await page.check('#graph_arrows');await page.screenshot({path:'test-results/V53-negative-axes.png'});
  });
  test('V53 deleting PDF pages removes duplicate and orphan writing spaces immediately',async page=>{
    await setup(page,'Texto');await startPdf(page);assert.equal(await gaps(page),4);
    for(const remaining of [2,1,0]){
      await page.locator('.pdfBlock').first().getByRole('button',{name:'Eliminar página'}).click();
      assert.equal(await page.locator('.pdfBlock').count(),remaining);assert.equal(await gaps(page),remaining?remaining+1:0);
      assert.equal(await page.locator('#editor [data-placeholder]').count(),0);
    }
    assert.deepEqual(await lines(page),['Texto']);await page.click('#undoBtn');assert.equal(await page.locator('.pdfBlock').count(),1);assert.equal(await gaps(page),2);
    await page.click('#redoBtn');assert.deepEqual(await lines(page),['Texto']);
  });
  test('V53 deleting PDFs preserves text written between them and removes its orphan page decoration',async page=>{
    await setup(page,'Antes');await startPdf(page,2);await select(page,{line:3,offset:0});await page.keyboard.type('Mi texto');
    assert.equal(await page.locator('.pdfTextPage').count(),1);
    await page.locator('.pdfBlock').last().getByRole('button',{name:'Eliminar página'}).click();
    await page.locator('.pdfBlock').first().getByRole('button',{name:'Eliminar página'}).click();
    assert.deepEqual(await lines(page),['Antes','Mi texto']);assert.equal(await gaps(page),0);assert.equal(await page.locator('.pdfTextPage').count(),0);
    await page.evaluate(()=>saveDraft());await page.reload();assert.deepEqual(await lines(page),['Antes','Mi texto']);
  });
  test('V53 V52 orphan PDF spaces are cleaned when restoring the draft',async page=>{
    await setup(page);await page.evaluate(()=>{renderLines([[],...Array.from({length:4},()=>withParagraph([],{pdfGap:true}))]);saveDraft();});
    await page.reload();assert.deepEqual(await lines(page),['']);assert.equal(await gaps(page),0);assert.equal(await page.locator('#editor [data-placeholder]').count(),0);
  });
  test('V53 pending script caret shrinks shifts and grows immediately without typing',async page=>{
    await setup(page,'Base');await select(page,{line:0,offset:4});
    const normal=await page.evaluate(()=>{const r=getSelection().getRangeAt(0).getBoundingClientRect();return {y:r.y,height:r.height};}),before=await page.evaluate(()=>characterCount());
    await page.locator('#superscriptBtn').tap();const sup=await caret(page);assert.ok(sup&&sup.height<normal.height*.8);assert.ok(sup.y<normal.y);
    await page.locator('#subscriptBtn').tap();const sub=await caret(page);assert.ok(sub&&sub.height<normal.height*.8);assert.ok(sub.y>sup.y);
    assert.equal(await page.getAttribute('#superscriptBtn','aria-pressed'),'false');
    await page.locator('#subscriptBtn').tap();assert.equal(await caret(page),null);assert.equal(await page.evaluate(()=>characterCount()),before);assert.deepEqual(await lines(page),['Base']);
    await page.locator('#superscriptBtn').tap();await page.keyboard.type('h');assert.equal(await caret(page),null);
    await page.locator('#superscriptBtn').tap();const restored=await caret(page);assert.ok(restored&&restored.height>sup.height*1.3);
    await page.keyboard.type('H');const runs=await page.evaluate(()=>readLines()[0]);assert.equal(runs.find(s=>s.text==='h').script,'sup');assert.equal(runs.at(-1).script,undefined);assert.equal(await caret(page),null);
    assert.ok(!(await page.evaluate(()=>JSON.stringify(serializeDocument()))).includes('\u200b'));
  });
  test('V53 empty-line caret and size controls preview their pending height and preserve IME',async page=>{
    await setup(page);await select(page,{line:0,offset:0});await page.locator('#subscriptBtn').tap();const small=await caret(page);assert.ok(small);
    await page.selectOption('#sizeSel','200');const large=await caret(page);assert.ok(large.height>small.height*1.7);
    await page.evaluate(()=>editor.dispatchEvent(new CompositionEvent('compositionstart')));assert.equal(await caret(page),null);
    await page.evaluate(()=>editor.dispatchEvent(new CompositionEvent('compositionend')));assert.ok(await caret(page));assert.deepEqual(await lines(page),['']);
    require('node:fs').mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/V53-pending-caret.png'});
  });
  test('V53 pending caret follows editor scroll and clears on navigation or a text selection',async page=>{
    await setup(page,Array.from({length:40},()=>('Línea de texto')).join('\n'));await select(page,{line:39,offset:5});await page.evaluate(()=>scrollCaretIntoView());
    await page.locator('#superscriptBtn').tap();const before=await caret(page);assert.ok(before);
    const delta=await page.evaluate(()=>{const n=editor.parentElement,old=n.scrollTop;n.scrollTop-=35;return n.scrollTop-old;});
    await page.waitForTimeout(50);const after=await caret(page);assert.ok(Math.abs((after.y-before.y)+delta)<2);
    await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>!editor.classList.contains('pendingCaret'));assert.equal(await caret(page),null);
    await select(page,{line:39,offset:2},{line:39,offset:6});await page.locator('#subscriptBtn').tap();assert.equal(await caret(page),null);assert.deepEqual(await lines(page),Array(40).fill('Línea de texto'));
  });
  test('V53 touch and hover cannot leave inactive text formatting buttons visually pressed',async page=>{
    for(const theme of ['dark','light']){
      await setup(page,'Formato');await page.evaluate(theme=>HiNoteTheme.apply(theme),theme);
      await select(page,{line:0,offset:7});
      for(const id of ['boldBtn','italicBtn','underlineBtn','subscriptBtn','superscriptBtn']){
        const button=page.locator('#'+id);await button.tap();assert.equal(await button.getAttribute('aria-pressed'),'true');await page.waitForTimeout(150);
        const active=await button.evaluate(n=>getComputedStyle(n).backgroundColor);
        await button.tap();await button.hover();await page.waitForTimeout(150);
        assert.equal(await button.getAttribute('aria-pressed'),'false');assert.equal(await button.evaluate(n=>n.classList.contains('active')),false);
        const off=await button.evaluate(n=>({background:getComputedStyle(n).backgroundColor,shadow:getComputedStyle(n).boxShadow,tap:getComputedStyle(n).webkitTapHighlightColor}));assert.notEqual(off.background,active);assert.equal(off.shadow,'none');assert.equal(off.tap,'rgba(0, 0, 0, 0)');
      }
    }
  });
};
