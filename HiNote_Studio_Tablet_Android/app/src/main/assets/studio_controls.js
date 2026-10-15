'use strict';
/* Shared controls retain the original select elements as the model/API. */
(()=>{
  const $=id=>document.getElementById(id), controls=new Map();
  let opened=null, popup=null, shield=null, activeIndex=-1, typeAhead='', typedAt=0, completedTap=null, selectContext=null;
  const textSelects=new Set(['sizeSel','thicknessSel','caseSel','listType','listFormatTarget']);
  function fieldContext(){
    const field=writable(document.activeElement);if(!field)return null;
    if(field===editor)return {field,mark:bookmark()};
    if(typeof field.selectionStart==='number')return {field,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection};
    const s=getSelection();if(!s?.rangeCount||!field.contains(s.focusNode))return {field};
    const r=s.getRangeAt(0),length=(node,offset)=>{const p=document.createRange();p.setStart(field,0);p.setEnd(node,offset);return p.toString().length;};
    return {field,from:length(r.startContainer,r.startOffset),to:length(r.endContainer,r.endOffset),backward:s.anchorNode===r.endContainer&&s.anchorOffset===r.endOffset&&!s.isCollapsed};
  }
  function resumeField(context){
    if(!context)return false;let field=context.field;
    if(field===editor)return resumeEditor(context.mark);
    if(!field.isConnected&&field.classList.contains('cellEditor'))field=[...document.querySelectorAll('.cellEditor')].find(n=>n.dataset.row===field.dataset.row&&n.dataset.col===field.dataset.col);
    if(!field?.isConnected&&context.field.classList.contains('mathSlot'))field=[...document.querySelectorAll('.mathSlot')].find(n=>n.dataset.path===context.field.dataset.path);
    if(!field?.isConnected||field.disabled||field.readOnly||field.closest('[inert]'))return false;
    field.focus({preventScroll:true});
    if(context.start!==undefined)field.setSelectionRange(Math.min(context.start,field.value.length),Math.min(context.end,field.value.length),context.direction);
    else if(context.from!==undefined){
      const point=offset=>{const w=document.createTreeWalker(field,NodeFilter.SHOW_TEXT);let n,last;while(n=w.nextNode()){last=n;if(offset<=n.length)return [n,offset];offset-=n.length;}return last?[last,last.length]:[field,0];};
      const s=getSelection();s.setBaseAndExtent(...point(context.backward?context.to:context.from),...point(context.backward?context.from:context.to));
    }
    return true;
  }
  // WebView can retarget a compatibility click after pointerup removes a menu.
  // Keep that completed gesture isolated; the next deliberate press is free.
  function absorbTap(e){if(Number.isFinite(e.clientX)&&Number.isFinite(e.clientY))completedTap={x:e.clientX,y:e.clientY,until:Date.now()+800};}
  window.addEventListener('pointerdown',()=>completedTap=null,true);
  function stopRetargetedMouse(e){
    if(completedTap&&Date.now()<completedTap.until&&(e.detail>0||e.sourceCapabilities?.firesTouchEvents)&&Math.hypot(e.clientX-completedTap.x,e.clientY-completedTap.y)<32){e.preventDefault();e.stopImmediatePropagation();}
  }
  // The compatibility mousedown can change focus before its click is blocked.
  for(const event of ['mousedown','mouseup','click'])window.addEventListener(event,stopRetargetedMouse,true);
  function label(select){
    if(select.getAttribute('aria-label'))return select.getAttribute('aria-label');
    const l=select.labels?.[0]?.cloneNode(true);l?.querySelectorAll('select,button,.selectControl').forEach(n=>n.remove());
    return l?.textContent.trim()||select.id;
  }
  function options(select){return [...select.options].filter(o=>!o.hidden);}
  function closeSelect(focus=true){
    if(!opened)return false;const c=controls.get(opened),context=selectContext;opened=null;selectContext=null;popup?.remove();popup=null;shield?.remove();shield=null;
    c.button.setAttribute('aria-expanded','false');c.button.removeAttribute('aria-activedescendant');
    if(focus&&!resumeField(context)&&c.button.isConnected)c.button.focus({preventScroll:true});return true;
  }
  function choose(select,value){
    const context=selectContext;closeSelect(false);select.value=value;
    select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();
    if(textSelects.has(select.id))resumeEditor();else resumeField(context);
  }
  function highlight(index){
    if(!opened)return;const choices=options(opened);activeIndex=Math.max(0,Math.min(choices.length-1,index));
    [...popup.children].forEach((n,i)=>n.classList.toggle('highlighted',i===activeIndex));
    const item=popup.children[activeIndex];if(item){controls.get(opened).button.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}
  }
  function place(){
    if(!opened)return;const c=controls.get(opened),r=c.button.getBoundingClientRect();
    if(!r.width||c.button.closest('[inert]')){closeSelect(false);return;}
    const view=window.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0,w=view?.width||innerWidth,h=view?.height||innerHeight;
    const width=Math.min(w-20,Math.max(r.width,190)),below=top+h-r.bottom-12,above=r.top-top-12;
    const down=below>=Math.min(260,popup.scrollHeight)||below>=above,limit=Math.max(80,Math.min(320,down?below:above));
    Object.assign(popup.style,{width:width+'px',maxHeight:limit+'px',left:Math.max(left+10,Math.min(r.left,left+w-width-10))+'px',top:(down?r.bottom+7:Math.max(top+10,r.top-Math.min(popup.scrollHeight,limit)-7))+'px',transformOrigin:down?'top':'bottom'});
  }
  function openSelect(select){
    if(select.disabled)return;if(opened===select){closeSelect();return;}closeSelect(false);captureSelection();
    const c=controls.get(select);selectContext=fieldContext();
    if(textSelects.has(select.id)&&resumeEditor())selectContext={field:editor,mark:bookmark()};
    opened=select;popup=document.createElement('div');popup.className='selectMenu';popup.id=select.id+'-options';popup.setAttribute('role','listbox');popup.setAttribute('aria-label',label(select));
    shield=document.createElement('div');shield.className='selectShield';shield.setAttribute('aria-hidden','true');
    shield.onpointerdown=e=>e.stopPropagation();
    shield.onpointerup=e=>{e.stopPropagation();if(e.pointerType!=='mouse'){e.preventDefault();absorbTap(e);closeSelect();}};
    shield.onclick=e=>{e.preventDefault();e.stopPropagation();closeSelect();};
    popup.onpointerdown=e=>e.stopPropagation();popup.onpointerup=e=>e.stopPropagation();popup.onclick=e=>e.stopPropagation();
    for(const [i,o] of options(select).entries()){
      const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.id=select.id+'-option-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',String(o.selected));b.disabled=o.disabled||o.parentElement.disabled===true;b.textContent=o.label;b.dataset.value=o.value;
      let tap=null;
      b.onpointerdown=e=>{e.preventDefault();if(e.pointerType!=='mouse'){tap={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};b.setPointerCapture(e.pointerId);}};
      b.onpointermove=e=>{if(tap?.id===e.pointerId&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>=10)tap.moved=true;};
      b.onpointercancel=()=>tap=null;
      b.onpointerup=e=>{const start=tap;tap=null;if(start?.id===e.pointerId&&!start.moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<10){e.preventDefault();e.stopPropagation();absorbTap(e);choose(select,o.value);}};
      b.onclick=e=>{e.preventDefault();e.stopPropagation();if(opened===select)choose(select,o.value);};popup.append(b);
    }
    (select.closest('[role=dialog]')||document.body).append(shield,popup);c.button.setAttribute('aria-controls',popup.id);c.button.setAttribute('aria-expanded','true');if(selectContext?.field!==editor)c.button.focus({preventScroll:true});place();
    highlight(Math.max(0,options(select).findIndex(o=>o.selected)));
  }
  function key(select,event){
    const keys=['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'];
    if(!keys.includes(event.key)&&!(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Escape'){closeSelect();return;}
    if(!opened){openSelect(select);if(event.key==='Enter'||event.key===' ')return;}
    if(opened!==select)return;const list=options(select),enabled=i=>!list[i].disabled&&list[i].parentElement.disabled!==true;
    if(event.key==='Enter'||event.key===' '){if(enabled(activeIndex))choose(select,list[activeIndex].value);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      const d=event.key==='ArrowDown'?1:-1;let i=activeIndex;for(let n=0;n<list.length;n++){i=(i+d+list.length)%list.length;if(enabled(i)){highlight(i);break;}}
    }else if(event.key==='Home'||event.key==='End'){
      const indexes=list.map((_,i)=>i).filter(enabled);highlight(event.key==='Home'?indexes[0]:indexes.at(-1));
    }else{
      typeAhead=Date.now()-typedAt<800?typeAhead+event.key:event.key;typedAt=Date.now();
      const i=list.findIndex((o,i)=>enabled(i)&&o.label.toLocaleLowerCase().startsWith(typeAhead.toLocaleLowerCase()));if(i>=0)highlight(i);
    }
  }
  function build(select){
    if(controls.has(select))return;const wrapper=document.createElement('span');wrapper.className='selectControl';select.before(wrapper);wrapper.append(select);
    select.classList.add('nativeSelect');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const button=document.createElement('button');button.type='button';button.className='selectButton';button.dataset.selectFor=select.id;button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const text=document.createElement('span');text.className='selectValue';button.append(text,StudioUI.icon('chevron'));wrapper.append(button);controls.set(select,{wrapper,button,text});
    button.onclick=e=>{e.preventDefault();e.stopPropagation();openSelect(select);};button.onkeydown=e=>key(select,e);
    select.addEventListener('focus',()=>button.focus({preventScroll:true}));
    select.addEventListener('change',sync);
    if(select.size>1){
      wrapper.classList.add('selectListControl');button.classList.add('hidden');const list=document.createElement('div');list.className='selectList';list.setAttribute('role','listbox');list.setAttribute('aria-label',label(select));wrapper.append(list);controls.get(select).list=list;
    }
  }
  function sync(){
    for(const [select,c] of controls){
      const text=select.selectedOptions[0]?.label||'Elegir';if(c.text.textContent!==text)c.text.textContent=text;
      if(c.button.disabled!==select.disabled)c.button.disabled=select.disabled;
      const name=label(select)+': '+text;if(c.button.getAttribute('aria-label')!==name)c.button.setAttribute('aria-label',name);
      if(c.list){
        const signature=JSON.stringify(options(select).map(o=>[o.label,o.value,o.selected,o.disabled,select.disabled]));
        if(c.signature!==signature){c.signature=signature;c.list.replaceChildren();for(const o of options(select)){
          const b=document.createElement('button');b.type='button';b.textContent=o.label;b.dataset.value=o.value;b.setAttribute('role','option');b.setAttribute('aria-selected',String(o.selected));b.disabled=select.disabled||o.disabled;b.onclick=()=>choose(select,o.value);c.list.append(b);
        }}
      }
    }
    if(opened&&opened.disabled)closeSelect();
  }
  document.querySelectorAll('select').forEach(build);sync();
  new MutationObserver(records=>{
    let changed=false;for(const r of records){
      if(r.target instanceof Element&&r.target.closest('select'))changed=true;
      for(const n of r.addedNodes||[])if(n instanceof Element){if(n.matches('select')){build(n);changed=true;}n.querySelectorAll('select:not(.nativeSelect)').forEach(s=>{build(s);changed=true;});}
    }if(changed)sync();
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','selected','value','label']});
  const syncColors=StudioUI.syncColors;StudioUI.syncColors=()=>{syncColors();sync();};StudioUI.syncSelects=sync;StudioUI.absorbTap=absorbTap;
  StudioUI.fieldContext=fieldContext;StudioUI.resumeField=resumeField;
  document.addEventListener('input',sync);document.addEventListener('change',()=>queueMicrotask(sync));document.addEventListener('selectionchange',sync);
  document.addEventListener('keydown',e=>{
    if(!opened||e.isComposing)return;
    if(e.key==='Tab'){closeSelect(false);return;}
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeSelect();return;}
    key(opened,e);
  },true);
  window.addEventListener('resize',place);document.addEventListener('scroll',e=>{if(!e.target.closest?.('.selectMenu'))place();},true);window.visualViewport?.addEventListener('resize',place);

  // A single horizontal strip: image tools enter from the right, list tools
  // continue after the text controls. Neither changes the preview height.
  $('toolbarScroll').prepend($('panelImages'));
  const actions=document.createElement('div');actions.id='imageQuickActions';actions.className='imageQuickActions hidden';actions.setAttribute('role','group');actions.setAttribute('aria-label','Acciones de imagen');
  for(const [id,key] of [['cropImage','crop'],['rotateImageRight','rotate'],['duplicateImage','copy'],['replaceImage','replace'],['deleteImage','trash']]){
    const b=$(id),name=b.getAttribute('aria-label')||b.textContent.trim();b.setAttribute('aria-label',name);b.title=name;b.replaceChildren(StudioUI.icon(key));actions.append(b);
  }
  $('canvasShell').append(actions);
  actions.append($('imageAngle').closest('.field'));
  const angleReadout=document.createElement('output');angleReadout.id='imageRotationReadout';angleReadout.className='imageRotationReadout hidden';angleReadout.setAttribute('aria-label','Ángulo de giro');
  $('previewWrap').closest('.previewCard').append(angleReadout);
  ImageEditor.selection();
  for(const [id,key] of [['mathMoveUp','up'],['mathMoveDown','down'],['tableMoveUp','up'],['tableMoveDown','down']]){const b=$(id);b.textContent=b.textContent.replace(/^[↑↓]\s*/, '');b.prepend(StudioUI.icon(key));}


  // Back closes the foremost UI layer using its existing Cancel handler.
  window.hinoteHandleBack=()=>{
    if(closeSelect())return true;
    if(markerSelection){clearMarkerSelection();return true;}
    if(!$('colorDialog').classList.contains('hidden')){StudioUI.closeColor();return true;}
    for(const [dialog,button] of [['cropDialog','cancelCrop'],['mathDialog','mathCancel'],['tableDialog','tableCancel'],['calibrationDialog','closeCalibration'],['notebookDialog','notebookClose'],['probeDialog','probeClose']]){
      if($(dialog)&&!$(dialog).classList.contains('hidden')){$(button)?.click();return true;}
    }return false;
  };

  const writable=target=>{
    // selectstart targets the text node itself on Chromium/WebView. Treat it
    // like its editable parent; cancelling it also cancels a simple caret tap.
    const element=target instanceof Element?target:target?.parentElement;
    const n=element?.closest('input,textarea,[contenteditable]');
    if(!n||n.disabled||n.readOnly||n.closest('[inert]'))return null;
    return n.isContentEditable||n.matches('textarea,input:not([type]),input[type=text],input[type=search],input[type=number],input[type=email],input[type=url],input[type=tel],input[type=password]')?n:null;
  };
  // Buttons issue commands to the active editor; they must not become a new
  // physical-keyboard destination merely because they were tapped/clicked.
  document.addEventListener('pointerdown',e=>{
    const field=writable(document.activeElement),button=e.target.closest?.('button');
    if(field&&(button?.matches('.selectButton,.colorButton')||field===editor&&button?.closest('.toolbar,.topbar')))e.preventDefault();
  },true);
  for(const input of document.querySelectorAll('.toolbar input:not([type=color]):not([type=checkbox])'))input.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key==='Escape')&&!e.isComposing){e.preventDefault();e.stopPropagation();input.dispatchEvent(new Event('change',{bubbles:true}));resumeEditor();}
  });
  let editingField=null;
  function editing(){const field=writable(document.activeElement);if(field===editingField)return;editingField=field;window.AndroidBridge?.setEditingField?.(!!field);}
  document.addEventListener('focusin',editing);document.addEventListener('focusout',()=>queueMicrotask(editing));
  document.addEventListener('selectstart',e=>{if(!writable(e.target))e.preventDefault();});
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.isComposing)return;const root=writable(e.target);if(!root)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&root.isContentEditable){
      e.preventDefault();const r=document.createRange();r.selectNodeContents(root);const s=getSelection();s.removeAllRanges();s.addRange(r);return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    if(root.isContentEditable){
      e.preventDefault();const s=getSelection();if(!s.rangeCount)return;
      const anchor=s.anchorNode,ao=s.anchorOffset,focus=s.focusNode,fo=s.focusOffset;
      const fn=e.getModifierState?.('Fn'),boundary=e.key==='Home'||e.key==='End'||fn;
      const backwards=['ArrowLeft','ArrowUp','Home'].includes(e.key),direction=backwards?'backward':'forward';
      const granularity=boundary?(e.ctrlKey||e.metaKey?'documentboundary':'lineboundary'):['ArrowUp','ArrowDown'].includes(e.key)?(e.ctrlKey?'paragraphboundary':'line'):e.ctrlKey||e.metaKey?'word':'character';
      s.modify(e.shiftKey?'extend':'move',direction,granularity);
      if(!root.contains(s.anchorNode)||!root.contains(s.focusNode))s.setBaseAndExtent(anchor,ao,focus,fo);
      else if(root===editor){
        const n=s.focusNode.nodeType===1?s.focusNode:s.focusNode.parentElement,block=n.closest('[contenteditable=false]');
        if(block){const all=[...editor.children],at=all.indexOf(block);let target=null;for(let i=at+(backwards?-1:1);i>=0&&i<all.length;i+=backwards?-1:1)if(all[i].contentEditable!=='false'){target=all[i];break;}
          if(target){const r=document.createRange();r.selectNodeContents(target);r.collapse(!backwards);if(e.shiftKey)s.extend(r.startContainer,r.startOffset);else{s.removeAllRanges();s.addRange(r);}}
          else s.setBaseAndExtent(anchor,ao,focus,fo);
        }
      }
      root.focus({preventScroll:true});captureSelection();scrollCaretIntoView(root);
    }else if(root.selectionStart!==null&&root.selectionStart===root.selectionEnd){
      const p=root.selectionStart,len=root.value.length;
      if((e.key==='ArrowLeft'&&p===0)||(e.key==='ArrowRight'&&p===len))e.preventDefault();
      if(e.key==='ArrowUp'&&!root.value.slice(0,p).includes('\n')){e.preventDefault();root.setSelectionRange(0,e.shiftKey?p:0,e.shiftKey?'backward':'none');}
      if(e.key==='ArrowDown'&&!root.value.slice(p).includes('\n')){e.preventDefault();root.setSelectionRange(e.shiftKey?p:len,len);}
    }
  });
})();
