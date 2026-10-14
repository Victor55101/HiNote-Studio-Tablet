/* Behavior-level regressions for V46 paragraph lists and insertion formatting. */
module.exports=({test,setup,select,lines,paste,assert})=>{
  const markers=page=>page.evaluate(()=>listMarkers(readLines()));
  const runs=(page,i=0)=>page.evaluate(i=>readLines()[i].filter(s=>!s.paragraph),i);
  const list=async(page,type='num_dot')=>{
    await page.click('[data-tab=text]');if(!await page.isVisible('#listType'))await page.click('#listToggle');
    await page.selectOption('#listType',type);
  };
  test('V46 cursor remains visible while arrows and extended selection cross long text',async page=>{
    await setup(page,Array.from({length:90},(_,i)=>'Línea '+i+' para mover el cursor').join('\n'));
    await select(page,{line:0,offset:7});
    const visible=()=>page.evaluate(()=>{const s=getSelection(),r=document.createRange();r.setStart(s.focusNode,s.focusOffset);r.collapse(true);const a=r.getBoundingClientRect(),b=document.querySelector('.editorScroll').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;});
    for(let i=0;i<45;i++){await page.keyboard.press('ArrowDown');assert.ok(await visible(),'Caret lost on down '+i);}
    assert.ok(await page.locator('.editorScroll').evaluate(n=>n.scrollTop)>100);
    for(let i=0;i<35;i++){await page.keyboard.press('Shift+ArrowUp');assert.ok(await visible(),'Caret lost on up '+i);}
    assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
  });
  test('V46 changing format without a selection styles the first typed character only',async page=>{
    await setup(page,'Hola');await select(page,{line:0,offset:4});
    await page.selectOption('#sizeSel','90');await page.fill('#hexInput','#2468AC');await page.fill('#opacity','60');await page.selectOption('#thicknessSel','4');
    await select(page,{line:0,offset:4});await page.keyboard.type(' mundo');
    const r=await runs(page);assert.equal(r[0].text,'Hola');assert.equal(r[0].scale,1);
    assert.deepEqual(r[1],{text:' mundo',scale:.9,color:'#2468AC',opacity:60,thickness:4});
    await select(page,{line:0,offset:2});assert.equal(await page.inputValue('#sizeSel'),'100');
    await page.keyboard.type('X');assert.equal((await runs(page))[0].text,'HoXla');assert.equal((await runs(page))[0].scale,1);
  });
  test('V46 empty paragraphs and Enter inherit insertion format and persist after reload',async page=>{
    await setup(page);await page.selectOption('#sizeSel','150');await page.click('#superscriptBtn');
    await select(page,{line:0,offset:0});await page.keyboard.type('a');await page.keyboard.press('Enter');await page.keyboard.type('b');
    assert.equal((await runs(page,1))[0].scale,1.5);assert.equal((await runs(page,1))[0].script,'sup');
    await page.keyboard.press('Enter');await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');
    await select(page,{line:2,offset:0});assert.equal(await page.inputValue('#sizeSel'),'150');await page.keyboard.type('c');assert.equal((await runs(page,2))[0].script,'sup');
  });
  test('V46 subscript and superscript are exclusive and preserve mixed text properties',async page=>{
    await setup(page,'H2O x2');await select(page,{line:0,offset:1},{line:0,offset:2});await page.click('#subscriptBtn');
    await select(page,{line:0,offset:5},{line:0,offset:6});await page.click('#superscriptBtn');await page.selectOption('#thicknessSel','3');
    let r=await runs(page);assert.equal(r.find(s=>s.script==='sub').text,'2');assert.equal(r.find(s=>s.script==='sup').text,'2');
    await select(page,{line:0,offset:0},{line:0,offset:6});assert.equal(await page.getAttribute('#subscriptBtn','aria-pressed'),'mixed');
    await page.click('#subscriptBtn');r=await runs(page);assert.ok(r.every(s=>s.script==='sub'));assert.equal(r.at(-1).thickness,3);
    await page.click('#subscriptBtn');assert.ok((await runs(page)).every(s=>!s.script));await page.click('#undoBtn');assert.ok((await runs(page)).every(s=>s.script==='sub'));
  });
  test('V46 a selected mixed range gets one requested size without changing its neighbors',async page=>{
    await setup(page,'abcdef');await select(page,{line:0,offset:2},{line:0,offset:4});await page.selectOption('#sizeSel','150');
    await select(page,{line:0,offset:1},{line:0,offset:5});assert.equal(await page.inputValue('#sizeSel'),'mixed');await page.selectOption('#sizeSel','90');
    assert.deepEqual((await runs(page)).map(s=>[s.text,s.scale]),[['a',1],['bcde',.9],['f',1]]);
  });
  test('V46 native composition is allowed to commit accents before styling',async page=>{
    await setup(page,'Hugo ');await select(page,{line:0,offset:5});await page.selectOption('#sizeSel','90');await select(page,{line:0,offset:5});
    await page.evaluate(()=>{editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));const s=getSelection(),r=s.getRangeAt(0),n=document.createTextNode('á');r.insertNode(n);s.collapse(n,1);editor.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',isComposing:true,bubbles:true}));});
    assert.equal((await runs(page))[0].text,'Hugo á');
    await page.evaluate(()=>editor.dispatchEvent(new CompositionEvent('compositionend',{data:'á',bubbles:true})));
    assert.deepEqual((await runs(page)).map(s=>[s.text,s.scale]),[['Hugo ',1],['á',.9]]);
  });
  test('V46 case style applies to selection or new typing in its cursor context',async page=>{
    await setup(page,'Hola ');await select(page,{line:0,offset:5});await page.selectOption('#caseSel','upper');await select(page,{line:0,offset:5});await page.keyboard.type('mundo');
    assert.deepEqual(await lines(page),['Hola MUNDO']);await select(page,{line:0,offset:2});await page.keyboard.type('x');assert.deepEqual(await lines(page),['Hoxla MUNDO']);
  });
  test('V46 list markers are structural and renumber after splitting or deleting paragraphs',async page=>{
    await setup(page,'Manzana\nPera\nUva');await select(page,{line:0,offset:0},{line:2,offset:3});await list(page);
    assert.deepEqual(await markers(page),['1.','2.','3.']);assert.deepEqual(await lines(page),['Manzana','Pera','Uva']);
    await select(page,{line:0,offset:3});await page.keyboard.press('Enter');assert.deepEqual(await markers(page),['1.','2.','3.','4.']);
    await select(page,{line:1,offset:0},{line:2,offset:0});await page.keyboard.press('Delete');assert.deepEqual(await markers(page),['1.','2.','3.']);
    await page.click('#undoBtn');assert.deepEqual(await markers(page),['1.','2.','3.','4.']);
  });
  test('V46 Shift Enter wraps inside one list item while Enter creates the next item',async page=>{
    await setup(page,'Primero');await select(page,{line:0,offset:7});await list(page);await select(page,{line:0,offset:7});
    await page.keyboard.press('Shift+Enter');await page.keyboard.type('misma lista');assert.deepEqual(await lines(page),['Primero\nmisma lista']);assert.deepEqual(await markers(page),['1.']);
    await page.keyboard.press('Enter');await page.keyboard.type('Segundo');assert.deepEqual(await markers(page),['1.','2.']);
    const doc=await page.evaluate(()=>serializeDocument());assert.equal(doc.paragraphs[0].segments.map(s=>s.text).join(''),'Primero\nmisma lista');
  });
  test('V46 list membership survives interruption and can continue or restart independently',async page=>{
    await setup(page,'uno\ndos\nexplicación\ntres\ncuatro');await select(page,{line:0,offset:0},{line:1,offset:3});await list(page);
    await select(page,{line:3,offset:0},{line:4,offset:6});await page.click('#applyList');assert.deepEqual(await markers(page),['1.','2.','','1.','2.']);
    await select(page,{line:3,offset:2});await page.click('#continueList');assert.deepEqual(await markers(page),['1.','2.','','3.','4.']);
    await page.click('#restartList');assert.deepEqual(await markers(page),['1.','2.','','1.','2.']);
    await page.fill('#listStart','7');await page.click('#setListStart');assert.deepEqual(await markers(page),['1.','2.','','7.','8.']);
    await page.evaluate(()=>saveDraft());await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await markers(page),['1.','2.','','7.','8.']);
  });
  test('V46 multilevel counters reset children and indentation remains independent',async page=>{
    await setup(page,'Tema\nUno\nDos\nTema siguiente\nSubtema');await select(page,{line:0,offset:0},{line:4,offset:7});await list(page,'multi_decimal');
    await select(page,{line:1,offset:0},{line:2,offset:3});await page.click('#indentBtn');
    await select(page,{line:4,offset:0});await page.keyboard.press('Tab');assert.deepEqual(await markers(page),['1.','1.1.','1.2.','2.','2.1.']);
    await page.fill('#listIndent','4');await page.press('#listIndent','Tab');assert.equal((await markers(page))[4],'2.1.');assert.equal(await page.evaluate(()=>paragraphOf(readLines()[4]).list.level),1);
    await select(page,{line:4,offset:0});await page.keyboard.press('Shift+Tab');assert.deepEqual(await markers(page),['1.','1.1.','1.2.','2.','3.']);
  });
  test('V46 Backspace removes only the marker and empty Enter exits list levels',async page=>{
    await setup(page,'uno\ndos');await select(page,{line:0,offset:0},{line:1,offset:3});await list(page);
    await select(page,{line:1,offset:0});await page.keyboard.press('Backspace');assert.deepEqual(await lines(page),['uno','dos']);assert.deepEqual(await markers(page),['1.','']);
    await page.click('#applyList');await select(page,{line:1,offset:3});await page.keyboard.press('Enter');await select(page,{line:2,offset:0});await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>paragraphOf(readLines()[2]).list.level),0);await page.keyboard.press('Enter');assert.equal((await markers(page))[2],'');
  });
  test('V46 deleting only item text keeps the marker and numbering',async page=>{
    await setup(page,'uno\ndos\ntres');await select(page,{line:0,offset:0},{line:2,offset:4});await list(page);
    await select(page,{line:1,offset:0},{line:1,offset:3});await page.keyboard.press('Backspace');assert.deepEqual(await lines(page),['uno','','tres']);assert.deepEqual(await markers(page),['1.','2.','3.']);
  });
  test('V46 typed markers auto-convert and undo restores the literal prefix',async page=>{
    await setup(page);await page.keyboard.type('1. ');assert.deepEqual(await markers(page),['1.']);assert.deepEqual(await lines(page),['']);
    await page.keyboard.press('Control+z');assert.deepEqual(await lines(page),['1. ']);assert.deepEqual(await markers(page),['']);
    await setup(page);await page.keyboard.type('* ');await page.keyboard.type('Texto');assert.deepEqual(await markers(page),['*']);assert.deepEqual(await lines(page),['Texto']);
  });
  test('V46 marker ink stays independent of formatted item text',async page=>{
    await setup(page,'Elemento');await select(page,{line:0,offset:0},{line:0,offset:8});await list(page);await page.selectOption('#sizeSel','150');await page.fill('#hexInput','#FF3344');
    const doc=await page.evaluate(()=>serializeDocument());assert.equal(doc.paragraphs[0].list.marker_scale,1);assert.equal(doc.paragraphs[0].list.marker_color,'#000000');assert.equal(doc.paragraphs[0].segments[0].scale,1.5);
    const gap=await page.locator('#editor .line').evaluate(node=>{const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(text,0);r.setEnd(text,1);return r.getBoundingClientRect().left-node.getBoundingClientRect().left;});assert.ok(gap>=30,'Body text must leave visible space for its marker');
  });
  test('V46 rich internal copy preserves runs and creates a separate list instance',async page=>{
    await setup(page,'uno\ndos\n');await select(page,{line:0,offset:0},{line:1,offset:3});await list(page);await page.click('#subscriptBtn');
    await page.evaluate(()=>{const data=new DataTransfer();editor.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));window.copyData=data;});
    await select(page,{line:2,offset:0});await page.evaluate(()=>editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:copyData,bubbles:true,cancelable:true})));
    assert.deepEqual(await markers(page),['1.','2.','1.','2.']);assert.equal((await runs(page,2))[0].script,'sub');
    assert.notEqual(await page.evaluate(()=>paragraphOf(readLines()[0]).list.id),await page.evaluate(()=>paragraphOf(readLines()[2]).list.id));
  });
  test('V46 plain paste uses destination format and survives structured draft serialization',async page=>{
    await setup(page,'Inicio ');await select(page,{line:0,offset:7});await page.selectOption('#sizeSel','90');await select(page,{line:0,offset:7});await paste(page,'pegar\ntexto');assert.equal((await runs(page,1))[0].scale,.9);
    await page.evaluate(()=>saveDraft());const doc=await page.evaluate(()=>serializeDocument());await page.reload();await page.waitForSelector('#editor .line');assert.deepEqual(await page.evaluate(()=>serializeDocument()),doc);
  });
  test('V46 plain numbered paste joins the destination without duplicate marker text',async page=>{
    await setup(page,'uno');await select(page,{line:0,offset:3});await list(page);await select(page,{line:0,offset:3});await page.keyboard.press('Enter');
    await paste(page,'1. dos\n2. tres');assert.deepEqual(await lines(page),['uno','dos','tres']);assert.deepEqual(await markers(page),['1.','2.','3.']);
  });
  test('V46 pasted decimal descendants belong to the same root and renumber together',async page=>{
    await setup(page);await paste(page,'1. Tema\n1.1. Uno\n1.2. Dos\n2. Tema siguiente\n2.1. Subtema');
    assert.deepEqual(await markers(page),['1.','1.1.','1.2.','2.','2.1.']);
    assert.equal(await page.evaluate(()=>new Set(readLines().map(l=>paragraphOf(l).list.id)).size),1);
    await select(page,{line:1,offset:3});await page.keyboard.press('Enter');assert.deepEqual(await markers(page),['1.','1.1.','1.2.','1.3.','2.','2.1.']);
    await select(page,{line:2,offset:0},{line:3,offset:0});await page.keyboard.press('Delete');assert.deepEqual(await markers(page),['1.','1.1.','1.2.','2.','2.1.']);
  });
  test('V46 migration preserves the actual marker ink after differently styled indentation',async page=>{
    const raw=await page.evaluate(()=>JSON.stringify({version:38,lines:[[{text:'    ',...DEFAULT_STYLE},{text:'1. ',...DEFAULT_STYLE,color:'#CC4455',thickness:4},{text:'Texto',...DEFAULT_STYLE}]],settings:{},title:'Nota'}));
    await page.addInitScript(raw=>{if(!sessionStorage.getItem('v46-migration-seeded')){localStorage.setItem('native-draft',raw);sessionStorage.setItem('v46-migration-seeded','true');}},raw);
    await page.reload();await page.waitForSelector('#editor .line');const doc=await page.evaluate(()=>serializeDocument());
    assert.equal(doc.paragraphs[0].list.marker_color,'#CC4455');assert.equal(doc.paragraphs[0].list.marker_thickness,4);assert.equal(doc.paragraphs[0].segments[0].color,'#000000');
  });
};
