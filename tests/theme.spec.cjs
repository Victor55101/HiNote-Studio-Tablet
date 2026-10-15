module.exports=({test,setup,select,lines,assert,openTable})=>{
  const fs=require('node:fs'),path=require('node:path');
  async function settled(page){await page.waitForFunction(()=>!document.documentElement.classList.contains('themeChanging'));}
  async function color(page,selector,property='backgroundColor'){return page.locator(selector).first().evaluate((e,p)=>getComputedStyle(e)[p],property);}
  test('V48 one icon-only toggle animates both themes and persists across cold reload',async page=>{
    assert.equal(await page.locator('#themeToggle').count(),1);assert.equal((await page.textContent('#themeToggle')).trim(),'');
    assert.equal(await page.getAttribute('html','data-theme'),'light');
    assert.equal(await color(page,'.themeSun','opacity'),'1');assert.equal(await color(page,'.themeMoon','opacity'),'0');
    await page.locator('#themeToggle').tap();
    assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.match(await page.getAttribute('#themeToggle','aria-label'),/Cambiar a claro/);
    assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('themeChanging')));
    assert.notEqual(await color(page,'.themeMoon','transitionDuration'),'0s');await settled(page);
    assert.equal(await color(page,'body'),'rgb(22, 27, 32)');assert.equal(await color(page,'.themeMoon','opacity'),'1');
    await page.reload();await page.waitForSelector('#editor .line');
    assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('themeChanging')),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('native-theme')),'dark');
    await page.locator('#themeToggle').tap();await settled(page);assert.equal(await color(page,'body'),'rgb(244, 245, 243)');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hinote-ui-theme')),'light');
    // Rapid repeated clicks leave one final state and no stale animation class.
    await page.evaluate(()=>{for(let i=0;i<7;i++)document.getElementById('themeToggle').click();});await settled(page);
    assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.equal(await color(page,'.themeSun','opacity'),'0');
  });
  test('V48 theme keeps active insertion format, caret, selection, ink and document revision intact',async page=>{
    await setup(page,'Hola mundo');await select(page,{line:0,offset:5});
    await page.evaluate(()=>applyStyle({scale:.9,script:'sup'}));
    const before=await page.evaluate(()=>({document:serializeDocument(),mark:bookmark(),state:typingState,revision}));
    await page.locator('#themeToggle').tap();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
    assert.deepEqual(await page.evaluate(()=>({document:serializeDocument(),mark:bookmark(),state:typingState,revision})),before);
    await page.keyboard.type('X');assert.deepEqual(await lines(page),['Hola Xmundo']);
    assert.equal(await page.evaluate(()=>readLines()[0].find(s=>s.text==='X').script),'sup');
    await select(page,{line:0,offset:0},{line:0,offset:4});const mark=await page.evaluate(()=>bookmark());
    await page.locator('#themeToggle').tap();assert.deepEqual(await page.evaluate(()=>bookmark()),mark);
    await page.keyboard.type('Buen');assert.deepEqual(await lines(page),['Buen Xmundo']);
    await page.fill('#noteTitle','Título');await page.locator('#themeToggle').tap();assert.equal(await page.evaluate(()=>document.activeElement.id),'noteTitle');
    await page.keyboard.type(' X');assert.equal(await page.inputValue('#noteTitle'),'Título X');
  });
  test('V48 stored black text and list ink adapt visually without changing exported colors',async page=>{
    await setup(page,'Primero\nSegundo');await select(page,{line:0,offset:0},{line:1,offset:7});
    await page.evaluate(()=>{applyStyle({scale:.9,opacity:80});modifyLists('apply');});
    const original=await page.evaluate(()=>JSON.stringify(serializeDocument()));
    assert.equal(await color(page,'#editor .line span','color'),'rgba(36, 50, 61, 0.8)');
    await page.locator('#themeToggle').tap();await settled(page);
    assert.equal(await color(page,'#editor .line span','color'),'rgba(230, 235, 239, 0.8)');
    assert.equal(await page.locator('#editor .line').first().evaluate(e=>getComputedStyle(e,'::before').color),'rgba(230, 235, 239, 0.8)');
    assert.equal(await page.evaluate(()=>JSON.stringify(serializeDocument())),original);
    await page.evaluate(()=>applyStyle({color:'#B83E48'}));await page.locator('#themeToggle').tap();await settled(page);
    assert.equal(await color(page,'#editor .line span','color'),'rgba(184, 62, 72, 0.8)');
  });
  test('V48 shared palette reaches menus, table, formula, graph, colors and calibrations in both themes',async page=>{
    for(const theme of ['light','dark']){
      await setup(page,'Apuntes de química\nEl agua se representa como H₂O.\nLa energía: E = mc².');
      await page.evaluate(t=>HiNoteTheme.apply(t),theme);
      const panel=theme==='light'?'rgb(255, 255, 255)':'rgb(28, 35, 41)';
      await page.locator('[data-select-for=keyboardMode]').tap();assert.equal(await color(page,'.selectMenu'),panel);await page.keyboard.press('Escape');
      await page.click('[data-tab=insert]');await page.click('#insertTable');assert.equal(await color(page,'.tableCard'),panel);assert.equal(await color(page,'#tableGrid td'),'rgb(255, 255, 255)');
      fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-table.png`)});
      await page.click('#tableDone');await page.click('#insertFormula');assert.equal(await color(page,'.mathCard'),panel);assert.equal(await color(page,'.formulaStage'),'rgb(255, 255, 255)');
      await page.click('[data-category=calculus]');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-category=calculus]')).backgroundColor===getComputedStyle(document.documentElement).getPropertyValue('--active').trim() || document.querySelector('[data-category=calculus]').getAnimations().every(a=>a.playState==='finished'));assert.equal(await color(page,'[data-category=calculus]'),'rgb('+ (theme==='light'?'227, 239, 243':'37, 60, 71') +')');
      await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-formula.png`)});await page.click('#mathCancel');
      await page.click('#insertGraph');assert.equal(await color(page,'.mathCard'),panel);assert.equal(await color(page,'.graphViewport'),'rgb(255, 255, 255)');await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-graph.png`)});await page.click('#mathCancel');
      await page.click('[data-tab=text]');await page.locator('[data-color-for=colorPick]').tap();assert.equal(await color(page,'.colorCard'),panel);await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-color.png`)});await page.click('#colorDone');
      await page.click('[data-tab=calibration]');await page.click('#manageCalibration');assert.equal(await color(page,'.calibrationCard'),panel);await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-calibrations.png`)});await page.click('#closeCalibration');
      await page.click('[data-tab=text]');await page.screenshot({path:path.join(__dirname,`../test-results/v48-${theme}-editor.png`)});
    }
  });
  test('V48 reduced motion and keyboard activation work and header actions remain reachable',async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.focus('#themeToggle');await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.equal(await color(page,'.themeSun','transitionDuration'),'0s');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('themeChanging')),false);
    await page.keyboard.press('Space');assert.equal(await page.getAttribute('html','data-theme'),'light');
    for(const width of [1536,1280,1024,900,768,600,390]){
      await page.setViewportSize({width,height:900});
      const rects=await page.evaluate(()=>['themeToggle','exportBtn','exportNotesBtn'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
      for(const r of rects){assert.ok(r.x>=0&&r.right<=width,`${width} ${JSON.stringify(r)}`);assert.ok(r.width>=40&&r.height>=40);}
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,`${width}: actions overlap`);}
      assert.equal(await color(page,'.logo'),'rgb(255, 255, 255)');
    }
  });
};
