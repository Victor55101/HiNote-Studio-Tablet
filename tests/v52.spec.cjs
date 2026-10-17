module.exports=({test,setup,select,lines,assert})=>{
  const layout=async(page,ends,count=ends.length)=>page.evaluate(({ends,count})=>{composition={snapshot:'v52',page_count:count,page_ends:ends};previewRevision=revision;composing=false;controls();},{ends,count});
  const insert=async(page,pages=2)=>{await page.click('[data-tab=insert]');await page.locator('#insertPdf').tap();await page.evaluate(pages=>onPdfImported(bridgeCalls.filter(c=>c[0]==='import-pdf').at(-1)[1],JSON.stringify({asset:'a'.repeat(64),pages,name:'Prueba.pdf'}),null),pages);};
  const composeReal=async page=>{
    const input=await page.evaluate(()=>({doc:serializeDocument(),settings:settings()}));
    const {spawnSync}=require('node:child_process');
    const run=spawnSync('python3',['-c',`import json,sys,tempfile\nfrom pathlib import Path\nsys.path.insert(0,'HiNote_Studio_Tablet_Android/app/src/main/python')\nimport mobile_backend\nx=json.load(sys.stdin)\nwith tempfile.TemporaryDirectory() as d: print(mobile_backend.compose('HiNote_Studio_Tablet_Android/app/src/main/assets',d,json.dumps(x['doc']),json.dumps(x['settings'])))`],{input:JSON.stringify(input),encoding:'utf8',timeout:60000});
    assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);await page.evaluate(result=>onComposeResult(revision,JSON.stringify(result)),result);return result;
  };
  test('V52 PDF blocks follow actual text flow with editable slots before between and after pages',async page=>{
    await setup(page,'Primera\nSegunda\nTercera');await select(page,{line:2,offset:3});
    await layout(page,[{line:1,offset:0},{line:2,offset:0},{line:3,offset:0}]);await insert(page);
    assert.deepEqual(await page.evaluate(()=>readLines().map(l=>l[0]?.pdf?'PDF':lineText(l))),['Primera','','PDF','','PDF','','Segunda','Tercera']);
    assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:7,offset:3});
    await select(page,{line:3,offset:0});await page.keyboard.type('Entre PDF');
    await select(page,{line:5,offset:0});await page.keyboard.type('Después del PDF');
    require('node:fs').mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/V52-PDF-flow.png'});
    const result=await composeReal(page);assert.deepEqual(result.pdf_pages.map(Boolean),[false,true,false,true,false]);assert.equal(await page.evaluate(()=>currentPage),4);
    await page.evaluate(()=>saveDraft());await page.reload();
    assert.deepEqual(await page.evaluate(()=>readLines().filter(l=>paragraphOf(l).pdfGap).map(lineText)),['','Entre PDF','Después del PDF']);
    await select(page,{line:3,offset:0});await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');
    assert.ok(await page.evaluate(()=>editor.contains(getSelection().focusNode)));
  });
  test('V52 PDF divides a wrapped list without duplicate number and preserves following selection',async page=>{
    await setup(page,'1. Antes después\n2. Otro');await select(page,{line:0,offset:8},{line:1,offset:2});
    await layout(page,[{line:0,offset:6},{line:2,offset:0}]);await insert(page,1);
    assert.deepEqual(await page.evaluate(()=>readLines().filter(l=>!isBlockLine(l)&&!paragraphOf(l).pdfGap).map(lineText)),['Antes ','después','Otro']);
    assert.deepEqual(await page.evaluate(()=>listMarkers(readLines()).filter(Boolean)),['1.','2.']);
    assert.deepEqual(await page.evaluate(()=>bookmark().start),{line:4,offset:2});
    await select(page,{line:4,offset:7});await page.keyboard.press('Enter');await page.keyboard.type('Nuevo');
    assert.deepEqual(await page.evaluate(()=>listMarkers(readLines()).filter(Boolean)),['1.','2.','3.']);
    await page.click('#undoBtn');assert.equal(await page.locator('.pdfBlock').count(),1);
  });
  test('V52 old anchored PDF draft migrates to the matching paragraph and remains writable',async page=>{
    await setup(page,'Antes\nDespués');await page.evaluate(()=>{
      const ls=readLines();ls.push(...[0,1].map(index=>[{text:'\uFFFC',pdf:{id:'old-'+index,asset:'a'.repeat(64),index,pages:2,name:'Anterior.pdf',after_page:index}}]));renderLines(ls);changed();
      onComposeResult(revision,JSON.stringify({snapshot:'migrate',page_count:4,page_ends:[{line:1,offset:0},{line:1,offset:0},{line:1,offset:0},{line:2,offset:0}],warnings:[]}));
    });
    assert.deepEqual(await page.evaluate(()=>readLines().map(l=>l[0]?.pdf?'PDF':lineText(l))),['Antes','','PDF','','PDF','','Después']);
    assert.ok(await page.evaluate(()=>readLines().filter(l=>l[0]?.pdf).every(l=>l[0].pdf.after_page===undefined)));
    await select(page,{line:3,offset:0});await page.keyboard.type('Intermedio');
    const result=await composeReal(page);assert.deepEqual(result.pdf_pages.map(Boolean),[false,true,false,true,false]);
  });
  test('V52 long V51 paragraph migrates using real engine boundaries without losing text',async page=>{
    const text='Texto económico con palabras y acentos. '.repeat(130);await setup(page,'1. '+text);
    await page.evaluate(()=>{const ls=readLines();ls.push(...[0,1].map(index=>[{text:'\uFFFC',pdf:{id:'legacy-'+index,asset:'a'.repeat(64),index,pages:2,name:'Anterior.pdf',after_page:index}}]));renderLines(ls);changed();});
    const before=await composeReal(page),after=await composeReal(page);
    assert.equal(after.page_count,before.page_count);assert.deepEqual(after.pdf_pages.map(Boolean),before.pdf_pages.map(Boolean));
    assert.equal(await page.evaluate(()=>readLines().filter(l=>!isBlockLine(l)).map(lineText).join('')),text);
    assert.equal(await page.locator('.pdfBlock').count(),2);
  });
  test('V52 insertion within table pages divides at a whole row and undo restores the table',async page=>{
    await setup(page);await page.evaluate(()=>{
      const t={id:'table-v52',widths:[5,5,5],rows:Array.from({length:20},(_,i)=>({height:4,cells:Array.from({length:3},()=>({segments:[{text:'Fila '+i,...DEFAULT_STYLE}],align:'left',valign:'top',size:0}))})),left:1,gap:0,mode:'standard',border:2,color:'#000000',repeat_header:true};
      TableEditor.restore({tables:{[t.id]:t}});renderLines([[{text:'\uFFFC',tableId:t.id}]]);changed();
    });const before=await composeReal(page);await insert(page,1);
    const doc=await page.evaluate(()=>serializeDocument()),parts=doc.paragraphs.filter(p=>p.table);
    assert.equal(parts.length,2);assert.equal(parts[0].table.rows.length,before.page_ends[0].row);
    assert.equal(parts[0].table.rows.length+parts[1].table.rows.length,21);
    const after=await composeReal(page);assert.ok(after.pdf_pages[1]);
    await page.click('#undoBtn');assert.equal(await page.locator('.pdfBlock').count(),0);assert.equal(await page.locator('.tableBlock').count(),1);
    assert.equal(await page.evaluate(()=>serializeDocument().paragraphs[0].table.rows.length),20);
  });
  test('V52 PDF after an image-only page retains its physical insertion position',async page=>{
    await setup(page,'Texto');await page.evaluate(()=>{ImageEditor.restore({images:[{id:'later',page:3,asset:'b'.repeat(64),x:80,y:150,width:100,height:100,angle:0,pixelWidth:100,pixelHeight:100,crop:{left:0,top:0,right:1,bottom:1}}]});currentPage=3;});
    await layout(page,[{line:1,offset:0}]);await insert(page,1);const info=await composeReal(page);
    assert.equal(info.pdf_pages.findIndex(Boolean),4);assert.equal(info.page_count,5);assert.equal(await page.evaluate(()=>ImageEditor.state().images[0].page),3);
  });
  test('V52 deleting content discards obsolete page floors and clamps preview navigation',async page=>{
    await setup(page,'Texto');await page.evaluate(()=>{ImageEditor.restore({minimumPages:10,images:[]});composition={snapshot:'old',page_count:10};currentPage=9;renderLines([[]]);changed();onComposeResult(revision,JSON.stringify({snapshot:'empty',page_count:1,warnings:[]}));});
    assert.equal(await page.evaluate(()=>ImageEditor.count()),1);assert.equal(await page.evaluate(()=>currentPage),0);assert.equal(await page.isDisabled('#nextPage'),true);
    await page.evaluate(()=>saveDraft());await page.reload();assert.equal(await page.evaluate(()=>ImageEditor.count()),1);
  });
  test('V52 rendering progress is compact and stale callbacks cannot advance it',async page=>{
    await setup(page,'Prueba');await layout(page,[{line:1,offset:0}],13);await page.evaluate(()=>changed());await page.click('#refreshBtn');
    await page.evaluate(()=>onWorkProgress('compose',revision,4));assert.equal(await page.textContent('#viewState'),'4/≈13');
    await page.evaluate(()=>onWorkProgress('compose',revision-1,12));assert.equal(await page.textContent('#viewState'),'4/≈13');
    await page.evaluate(()=>onWorkProgress('compose',revision,14));assert.equal(await page.textContent('#viewState'),'14/≈15');
    await page.click('#cancelBtn');assert.equal(await page.evaluate(()=>composing),false);
  });
  test('V52 Backspace removes marker then alignment then joins in exactly one press',async page=>{
    for(const level of [0,1,2]){
      await setup(page,'1. Uno\n2. Dos\n3. Tres');await select(page,{line:1,offset:3});
      if(level)await page.evaluate(level=>{const ls=readLines();for(const l of ls){const m=paragraphOf(l);m.list.level=level;}renderLines(ls);restoreSelection({start:{line:1,offset:3},end:{line:1,offset:3}});},level);
      await page.keyboard.press('Enter');await page.keyboard.press('Backspace');assert.equal(await page.evaluate(()=>paragraphOf(readLines()[2]).list),undefined);
      for(let i=0;i<Math.max(1,level+1);i++)await page.keyboard.press('Backspace');
      assert.equal(await page.evaluate(()=>paragraphOf(readLines()[2]).listExit),undefined);
      await page.keyboard.press('Backspace');assert.deepEqual(await lines(page),['Uno','Dos','Tres']);
      assert.deepEqual(await page.evaluate(()=>listMarkers(readLines())),['1.','2.','3.']);
    }
  });
  test('V52 Enter on empty indented list removes marker instead of creating an outer number',async page=>{
    await setup(page,'1. Uno\n2. Dos');await select(page,{line:0,offset:3});await page.keyboard.press('Enter');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>paragraphOf(readLines()[1]).list),undefined);
    assert.deepEqual(await page.evaluate(()=>listMarkers(readLines())),['1.','','2.']);
  });
  test('V52 automatic preview resumes after delayed profile loading on cold start',async page=>{
    await setup(page,'Borrador recuperado');await page.evaluate(()=>{$('autoPreview').checked=true;saveDraft();});
    await page.addInitScript(()=>{AndroidBridge.requestCalibration=(action,args,id)=>{window.v52Catalog=id;};});
    await page.reload();await page.waitForFunction(()=>window.v52Catalog);await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>bridgeCalls.some(c=>c[0]==='compose')),false);
    await page.evaluate(()=>onCalibrationResult(v52Catalog,JSON.stringify({profiles:[{id:'original',name:'Original',found:[],missing:[],fallback:[],unavailable:[]}],groups:{},problems:[]}),null));
    await page.waitForFunction(()=>bridgeCalls.some(c=>c[0]==='compose'));
    assert.equal(await page.evaluate(()=>composing),true);assert.deepEqual(await lines(page),['Borrador recuperado']);
  });
};
