'use strict';
// All geometry uses the same 1000 x 1600 page as PencilEngine.
const ImageEditor = (() => {
  const el = id => document.getElementById(id), clone = x => JSON.parse(JSON.stringify(x));
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const fullCrop = () => ({left:0,top:0,right:1,bottom:1});
  let images = [], minimumPages = 1, selectedId = null, active = false, busy = false, ticket = 0, pending = null;
  let gesture = null, pointers = new Map(), crop = null, cropStart = null, frame = null;
  const selected = () => images.find(im => im.id === selectedId && im.page === currentPage);
  const src = asset => `https://hinote.local/images/${asset}`;
  const newId = () => 'im_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,12);
  const factor = () => .675 * zoom;
  const normalizeAngle = a => ((a % 360) + 360) % 360;
  function sanitize(list) {
    if (!Array.isArray(list) || list.length > 200) throw Error('El borrador supera 200 imágenes');
    const ids = new Set(), perPage=new Map();
    return list.map(raw => {
      if (!raw || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id || '') || ids.has(raw.id) || !/^[a-f0-9]{64}$/.test(raw.asset || '')) throw Error('Imagen de borrador inválida');
      ids.add(raw.id);
      const im = {id:raw.id,asset:raw.asset};
      for (const [key,low,high] of [['page',0,499],['x',-3200,3200],['y',-3200,3200],['width',1,3200],['height',1,3200],['angle',-360,360],['pixelWidth',1,2560],['pixelHeight',1,2560]]) {
        if (!Number.isFinite(raw[key]) || raw[key]<low || raw[key]>high) throw Error('Transformación de imagen inválida');
        im[key]=raw[key];
      }
      if (!Number.isInteger(im.page)) throw Error('Página de imagen inválida');
      perPage.set(im.page,(perPage.get(im.page)||0)+1);if(perPage.get(im.page)>20)throw Error('Cada página admite hasta 20 imágenes');
      const c=raw.crop;
      if (!c || ![c.left,c.top,c.right,c.bottom].every(Number.isFinite) || c.left<0 || c.top<0 || c.right>1 || c.bottom>1 || c.right-c.left<.01 || c.bottom-c.top<.01) throw Error('Recorte de imagen inválido');
      im.crop={left:c.left,top:c.top,right:c.right,bottom:c.bottom}; return im;
    });
  }
  function state() { return {images:clone(images),minimumPages}; }
  function restore(data) {
    images=sanitize(data.images || []); minimumPages=clamp(Math.floor(Number(data.minimumPages)||1),1,500); selectedId=null;
    if (typeof currentPage !== 'undefined') render();
  }
  function count() { return Math.max(1,minimumPages,composition?.page_count||1,...images.map(im=>im.page+1)); }
  function position(node, im) {
    const k=factor(); Object.assign(node.style,{left:`${im.x*k}px`,top:`${im.y*k}px`,width:`${im.width*k}px`,height:`${im.height*k}px`,transform:`rotate(${im.angle}deg)`});
  }
  function selection() {
    const im=selected(), box=el('imageSelection'); box.classList.toggle('hidden',!active||!im||exporting||busy);
    if(im)position(box,im);
  }
  function renderGrid() {
    const c=el('gridCanvas'), ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    if(el('gridCheck').checked){
      const step=(composition?.layout?.grid_step || 58.8)*.675;
      ctx.strokeStyle='rgba(115,160,180,.18)';ctx.lineWidth=.405;ctx.beginPath();
      for(let x=0;x<=675;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,1080);}
      for(let y=0;y<=1080;y+=step){ctx.moveTo(0,y);ctx.lineTo(675,y);}
      ctx.stroke();
    }
  }
  function render() {
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    const layer=el('imageLayer'), visible=images.filter(im=>im.page===currentPage), keep=new Set(visible.map(im=>im.id));
    for(const node of [...layer.children]) if(!keep.has(node.dataset.id))node.remove();
    for(const im of visible){
      let node=[...layer.children].find(n=>n.dataset.id===im.id);
      if(!node){node=document.createElement('div');node.className='pageImage';node.dataset.id=im.id;const img=new Image();img.draggable=false;img.alt='Imagen de la nota';img.onerror=()=>toast('No se pudo cargar una imagen. Intenta reemplazarla.');node.append(img);}
      const img=node.firstChild,url=src(im.asset);if(img.getAttribute('src')!==url)img.src=url;
      const cw=im.crop.right-im.crop.left,ch=im.crop.bottom-im.crop.top;
      Object.assign(img.style,{width:`${100/cw}%`,height:`${100/ch}%`,left:`${-im.crop.left*100/cw}%`,top:`${-im.crop.top*100/ch}%`});
      position(node,im);layer.append(node);
    }
    renderGrid(); selection(); updateControls();
  }
  function scheduleRender(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;render();});}
  function updateControls(){
    const im=selected();
    document.querySelectorAll('[data-image-action]').forEach(n=>n.disabled=exporting||busy||!im);
    el('insertImage').disabled=exporting||busy||images.length>=200;
    el('imageNewPage').disabled=exporting||busy||count()>=500;
    if(im && document.activeElement!==el('imageAngle'))el('imageAngle').value=Math.round(normalizeAngle(im.angle)*10)/10;
    if(im && document.activeElement!==el('imagePage'))el('imagePage').value=im.page+1;
    el('imageHint').classList.toggle('hidden',!active);
  }
  function modified(){
    currentPage=clamp(currentPage,0,count()-1);queueDraft();controls();render();
    el('pageBadge').textContent=`Página ${currentPage+1}/${count()}`;
  }
  function edit(op){
    if(exporting||busy||ime)return; finishGesture(false);checkpoint();op();checkpoint();modified();
  }
  function mode(enabled){finishGesture(false);active=enabled;render();}
  function select(id){selectedId=id;selection();updateControls();}
  function insert(replace=false){
    if(exporting||busy)return;
    if(!replace && images.length>=200){toast('La nota admite hasta 200 imágenes');return;}
    if(!replace && images.filter(im=>im.page===currentPage).length>=20){toast('Cada página admite hasta 20 imágenes. Añade otra página.');return;}
    if(!window.AndroidBridge?.requestImage){toast('Inserta imágenes desde la app Android');return;}
    finishGesture(false);pending={id:replace?selectedId:null,page:currentPage};busy=true;updateControls();controls();
    try{AndroidBridge.requestImage(++ticket);}catch(e){busy=false;pending=null;updateControls();controls();toast(e.message);}
  }
  window.onImageImported=(id,raw,error)=>{
    if(id!==ticket)return;const target=pending;busy=false;pending=null;updateControls();controls();
    if(error){toast(error);return;}if(!raw||!target)return;
    try{
      const a=JSON.parse(raw);
      if(!/^[a-f0-9]{64}$/.test(a.asset)||!(a.pixelWidth>0&&a.pixelHeight>0))throw Error('Imagen inválida');
      edit(()=>{
        let im=target.id?images.find(i=>i.id===target.id):null;
        if(im){im.asset=a.asset;im.pixelWidth=a.pixelWidth;im.pixelHeight=a.pixelHeight;im.crop=fullCrop();im.height=im.width*a.pixelHeight/a.pixelWidth;fit(im);}
        else{
          const scale=Math.min(700/a.pixelWidth,900/a.pixelHeight);
          im={id:newId(),asset:a.asset,page:target.page,x:80,y:150,width:a.pixelWidth*scale,height:a.pixelHeight*scale,angle:0,pixelWidth:a.pixelWidth,pixelHeight:a.pixelHeight,crop:fullCrop()};
          images.push(im);
        }
        currentPage=im.page;selectedId=im.id;
      });
      document.querySelector('[data-tab="images"]').click();drawCurrent();
      if(!composition&&!composing)refreshPreview();
      toast('Imagen guardada. Puedes moverla, girarla o recortarla.');
    }catch(e){toast(e.message);}
  };
  function fit(im){
    const k=Math.min(1,1500/im.width,1500/im.height);im.width=Math.max(12,im.width*k);im.height=Math.max(12,im.height*k);
    // Keep the center on the page; rotated corners may intentionally cross its edge.
    const cx=clamp(im.x+im.width/2,0,1000),cy=clamp(im.y+im.height/2,0,1600);im.x=cx-im.width/2;im.y=cy-im.height/2;
    im.angle=normalizeAngle(im.angle);
  }
  function setAngle(value){if(!Number.isFinite(value))return;edit(()=>{const im=selected();if(im)im.angle=normalizeAngle(value);});}
  function reorder(front){edit(()=>{const im=selected();if(!im)return;images.splice(images.indexOf(im),1);front?images.push(im):images.unshift(im);});}
  function point(event){const rect=el('canvasShell').getBoundingClientRect(),k=factor();return {x:(event.clientX-rect.left)/k,y:(event.clientY-rect.top)/k};}
  function local(p,im){const r=-im.angle*Math.PI/180,dx=p.x-im.x-im.width/2,dy=p.y-im.y-im.height/2;return {x:dx*Math.cos(r)-dy*Math.sin(r),y:dx*Math.sin(r)+dy*Math.cos(r)};}
  function hit(p){return [...images].reverse().find(im=>{if(im.page!==currentPage)return false;const q=local(p,im);return Math.abs(q.x)<=im.width/2&&Math.abs(q.y)<=im.height/2;});}
  function pointerData(e){return {clientX:e.clientX,clientY:e.clientY};}
  const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  const direction=(a,b)=>Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI;
  function startPair(){
    const [a,b]=[...pointers.values()];if(!a||!b)return;
    const im=selected();const mid={clientX:(a.clientX+b.clientX)/2,clientY:(a.clientY+b.clientY)/2};
    gesture={...gesture,type:gesture?.image&&im?'pairImage':'pairView',base:im?clone(im):null,start:point(mid),distance:Math.max(1,distance(a,b)),direction:direction(a,b),zoom,mid,
      scrollX:el('previewWrap').scrollLeft,scrollY:el('previewWrap').scrollTop};
  }
  function pointerDown(e){
    if(exporting||busy||e.button>0||!el('cropDialog').classList.contains('hidden'))return;
    e.preventDefault();pointers.set(e.pointerId,pointerData(e));el('previewWrap').setPointerCapture(e.pointerId);
    if(pointers.size>2)return;
    if(pointers.size===2){startPair();return;}
    const p=point(e),handle=e.target.dataset.handle;const im=active?(handle?selected():hit(p)):null;
    if(active)select(im?.id||null);
    if(im){checkpoint();gesture={type:handle==='rotate'?'rotate':handle?'resize':'move',image:true,handle,base:clone(im),original:state(),start:p,angle:Math.atan2(p.y-im.y-im.height/2,p.x-im.x-im.width/2)*180/Math.PI};}
    else gesture={type:'pan',image:false,start:pointerData(e),scrollX:el('previewWrap').scrollLeft,scrollY:el('previewWrap').scrollTop};
  }
  function pointerMove(e){
    if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();pointers.set(e.pointerId,pointerData(e));
    const g=gesture,im=selected();
    if(pointers.size>=2){
      const [a,b]=[...pointers.values()],ratio=distance(a,b)/g.distance,mid={clientX:(a.clientX+b.clientX)/2,clientY:(a.clientY+b.clientY)/2};
      if(g.type==='pairImage'&&im){
        const p=point(mid),base=g.base;let k=clamp(ratio,Math.max(12/base.width,12/base.height),Math.min(1500/base.width,1500/base.height));
        im.width=base.width*k;im.height=base.height*k;
        im.x=base.x+base.width/2+(p.x-g.start.x)-im.width/2;im.y=base.y+base.height/2+(p.y-g.start.y)-im.height/2;
        im.angle=base.angle+direction(a,b)-g.direction;fit(im);scheduleRender();
      }else if(g.type==='pairView'){
        const wrap=el('previewWrap'),r=wrap.getBoundingClientRect();zoom=clamp(g.zoom*ratio,.25,2.5);applyZoom();
        const actual=zoom/g.zoom;wrap.scrollLeft=(g.scrollX+g.mid.clientX-r.left)*actual-(mid.clientX-r.left);wrap.scrollTop=(g.scrollY+g.mid.clientY-r.top)*actual-(mid.clientY-r.top);
      }return;
    }
    if(g.type==='pan'){el('previewWrap').scrollLeft=g.scrollX+g.start.clientX-e.clientX;el('previewWrap').scrollTop=g.scrollY+g.start.clientY-e.clientY;return;}
    if(!im||!g.base)return;const p=point(e),base=g.base;
    if(g.type==='move'){im.x=base.x+p.x-g.start.x;im.y=base.y+p.y-g.start.y;}
    if(g.type==='rotate')im.angle=base.angle+Math.atan2(p.y-base.y-base.height/2,p.x-base.x-base.width/2)*180/Math.PI-g.angle;
    if(g.type==='resize'){
      const q=local(p,base),s=local(g.start,base),d=s.x*s.x+s.y*s.y;
      const k=clamp(d?(q.x*s.x+q.y*s.y)/d:1,Math.max(12/base.width,12/base.height),Math.min(1500/base.width,1500/base.height));
      im.width=base.width*k;im.height=base.height*k;im.x=base.x+(base.width-im.width)/2;im.y=base.y+(base.height-im.height)/2;
    }
    fit(im);scheduleRender();
  }
  function finishGesture(cancel){
    if(!gesture){pointers.clear();return;}
    const g=gesture;gesture=null;pointers.clear();
    if(g.image){if(cancel&&g.original){images=clone(g.original.images);minimumPages=g.original.minimumPages;}checkpoint();modified();}
  }
  function pointerUp(e){
    if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
    if(e.type==='pointercancel'){finishGesture(true);return;}
    if(pointers.size===0){finishGesture(false);return;}
    // After a two-finger gesture, the remaining finger pans/moves from its new position.
    const a=[...pointers.values()][0],im=selected();
    if(gesture?.image&&im)gesture={...gesture,type:'move',base:clone(im),start:point(a)};
    else gesture={type:'pan',image:false,start:a,scrollX:el('previewWrap').scrollLeft,scrollY:el('previewWrap').scrollTop};
  }
  function updateCrop(){
    if(!crop)return;
    for(const key of ['left','top','right','bottom'])el('crop'+key[0].toUpperCase()+key.slice(1)).value=Math.round(crop[key]*100);
    Object.assign(el('cropBox').style,{left:crop.left*100+'%',top:crop.top*100+'%',width:(crop.right-crop.left)*100+'%',height:(crop.bottom-crop.top)*100+'%'});
  }
  function openCrop(){const im=selected();if(!im||busy||exporting)return;finishGesture(false);crop=clone(im.crop);el('cropSource').src=src(im.asset);el('cropDialog').classList.remove('hidden');updateCrop();el('cancelCrop').focus();}
  function closeCrop(){crop=null;cropStart=null;el('cropDialog').classList.add('hidden');el('cropSource').removeAttribute('src');el('cropImage').focus();}
  function applyCrop(){
    const im=selected();if(!im||!crop)return;const next=clone(crop);closeCrop();
    edit(()=>{
      const old=im.crop,w=im.width/(old.right-old.left),h=im.height/(old.bottom-old.top);
      const dx=(next.left+next.right-old.left-old.right)*w/2,dy=(next.top+next.bottom-old.top-old.bottom)*h/2,r=im.angle*Math.PI/180;
      const cx=im.x+im.width/2+dx*Math.cos(r)-dy*Math.sin(r),cy=im.y+im.height/2+dx*Math.sin(r)+dy*Math.cos(r);
      im.width=w*(next.right-next.left);im.height=h*(next.bottom-next.top);im.x=cx-im.width/2;im.y=cy-im.height/2;im.crop=next;fit(im);
    });
  }
  for(const key of ['left','top','right','bottom'])el('crop'+key[0].toUpperCase()+key.slice(1)).addEventListener('input',e=>{
    if(!crop)return;crop[key]=Number(e.target.value)/100;
    if(key==='left')crop.left=Math.min(crop.left,crop.right-.01);if(key==='right')crop.right=Math.max(crop.right,crop.left+.01);
    if(key==='top')crop.top=Math.min(crop.top,crop.bottom-.01);if(key==='bottom')crop.bottom=Math.max(crop.bottom,crop.top+.01);updateCrop();
  });
  const cropPoint=e=>{const r=el('cropStage').getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};};
  el('cropStage').addEventListener('pointerdown',e=>{e.preventDefault();cropStart=cropPoint(e);el('cropStage').setPointerCapture(e.pointerId);});
  el('cropStage').addEventListener('pointermove',e=>{if(!cropStart||!crop)return;const p=cropPoint(e);const c={left:Math.min(cropStart.x,p.x),right:Math.max(cropStart.x,p.x),top:Math.min(cropStart.y,p.y),bottom:Math.max(cropStart.y,p.y)};if(c.right-c.left>=.01&&c.bottom-c.top>=.01){crop=c;updateCrop();}});
  for(const type of ['pointerup','pointercancel'])el('cropStage').addEventListener(type,()=>cropStart=null);
  el('cancelCrop').onclick=closeCrop;el('applyCrop').onclick=applyCrop;el('resetCrop').onclick=()=>{crop=fullCrop();updateCrop();};
  el('insertImage').onclick=()=>insert();el('replaceImage').onclick=()=>insert(true);el('cropImage').onclick=openCrop;
  el('rotateImageLeft').onclick=()=>setAngle((selected()?.angle||0)-90);el('rotateImageRight').onclick=()=>setAngle((selected()?.angle||0)+90);
  el('imageAngle').onchange=e=>setAngle(Number(e.target.value));
  el('imagePage').onchange=e=>{const page=Number(e.target.value)-1;if(!Number.isInteger(page)||page<0||page>=500){updateControls();return;}if(page!==currentPage&&images.filter(im=>im.page===page).length>=20){toast('La página destino ya tiene 20 imágenes');updateControls();return;}edit(()=>{const im=selected();if(im){im.page=page;currentPage=page;}});drawCurrent();};
  el('imageBack').onclick=()=>reorder(false);el('imageFront').onclick=()=>reorder(true);
  el('deleteImage').onclick=()=>edit(()=>{images=images.filter(im=>im.id!==selectedId);selectedId=null;});
  el('duplicateImage').onclick=()=>{if(images.length>=200||images.filter(im=>im.page===currentPage).length>=20){toast('Límite: 20 imágenes por página y 200 por nota');return;}edit(()=>{const im=selected();if(im){const copy=clone(im);copy.id=newId();copy.x+=25;copy.y+=25;fit(copy);images.push(copy);selectedId=copy.id;}});};
  el('imageNewPage').onclick=()=>{if(count()>=500)return;edit(()=>{minimumPages=count()+1;currentPage=minimumPages-1;selectedId=null;});drawCurrent();};
  el('previewWrap').addEventListener('pointerdown',pointerDown);
  el('previewWrap').addEventListener('pointermove',pointerMove);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])el('previewWrap').addEventListener(type,pointerUp);
  window.addEventListener('blur',()=>finishGesture(false));
  document.addEventListener('keydown',e=>{
    if(!el('cropDialog').classList.contains('hidden')){
      if(e.key==='Escape'){e.preventDefault();closeCrop();}
      if(e.key==='Tab'){const f=[...el('cropDialog').querySelectorAll('button,input')],i=f.indexOf(document.activeElement),n=e.shiftKey?(i-1+f.length)%f.length:(i+1)%f.length;e.preventDefault();f[n].focus();}return;
    }
    if(e.key==='Escape'&&active){finishGesture(true);select(null);}
  });
  return {state,restore,count,render,updateControls,mode,finishGesture,sanitize,selected,select,normalizeAngle,
    isBusy:()=>busy,exportJSON:()=>JSON.stringify(images),selection,modified};
})();
