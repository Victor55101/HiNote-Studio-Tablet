module.exports=({test,setup,assert,openMath})=>{
  const categories=['functions','calculus','greek','matrix','basic'];
  test('V54.4 formula categories keep the active field and caret on touch and mouse',async page=>{
    for(const pointer of ['touch','mouse']){
      await setup(page);await openMath(page);
      const field=page.locator('.mathSlot').first();await field.fill('abc');await field.evaluate(n=>n.setSelectionRange(1,1));
      for(const category of categories){
        const button=page.locator('[data-category='+category+']');if(pointer==='touch')await button.tap();else await button.click();
        assert.equal(await field.evaluate(n=>document.activeElement===n),true,category+' '+pointer);
        assert.deepEqual(await field.evaluate(n=>[n.selectionStart,n.selectionEnd]),[1,1]);
      }
      await page.keyboard.type('X');assert.equal(await field.inputValue(),'aXbc');await page.click('#mathCancel');
    }
  });
  test('V54.4 category changes preserve a backward selection in a nested formula in every keyboard mode',async page=>{
    for(const mode of ['auto','physical','virtual']){
      await setup(page);await page.evaluate(mode=>onKeyboardState(JSON.stringify({nativeGate:true,mode,suppress:mode==='physical'})),mode);await openMath(page);
      await page.locator('.mathSlot').first().fill('x');await page.click('[data-template=fraction]');
      const field=page.getByLabel('Denominador',{exact:true});await field.fill('abcdef');await field.evaluate(n=>n.setSelectionRange(1,5,'backward'));
      for(const category of categories)await page.locator('[data-category='+category+']').tap();
      assert.equal(await field.evaluate(n=>document.activeElement===n),true,mode);
      assert.deepEqual(await field.evaluate(n=>[n.selectionStart,n.selectionEnd,n.selectionDirection]),[1,5,'backward']);
      await page.keyboard.type('Y');assert.equal(await field.inputValue(),'aYf');await page.click('#mathCancel');
    }
  });
  test('V54.4 keyboard activation keeps category buttons available for keyboard navigation',async page=>{
    await setup(page);await openMath(page);await page.locator('.mathSlot').first().fill('abc');
    for(const category of categories){
      const button=page.locator('[data-category='+category+']');await button.focus();await page.keyboard.press('Enter');
      assert.equal(await button.evaluate(n=>document.activeElement===n),true);assert.equal(await button.evaluate(n=>n.classList.contains('accent')),true);
    }
  });
};
