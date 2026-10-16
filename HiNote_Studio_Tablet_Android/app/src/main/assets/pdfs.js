'use strict';
const PdfEditor=(()=>{
  let busy=false,ticket=0,insertion=null,targetPage=0,resumePreview=false,progress='';
  const isLine=line=>!!line?.[0]?.pdf;
  const newId=()=>window.crypto?.randomUUID?.()||`pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function normalize(raw){
    if(!raw||!/^[a-f0-9]{64}$/.test(raw.asset||'')||!Number.isInteger(raw.index)||!Number.isInteger(raw.pages)||raw.pages<1||raw.pages>500||raw.index<0||raw.index>=raw.pages)throw Error('Página de PDF inválida');
    if(raw.after_page!==undefined&&(!Number.isInteger(raw.after_page)||raw.after_page<0||raw.after_page>498))throw Error('Posición de PDF inválida');
    return {id:String(raw.id||newId()).slice(0,80),asset:raw.asset,index:raw.index,pages:raw.pages,name:String(raw.name||'Documento.pdf').slice(0,160),...(raw.after_page===undefined?{}:{after_page:raw.after_page})};
  }
  function block(line){
    const pdf=normalize(line[0].pdf),node=document.createElement('div');node.className='line pdfBlock';node.contentEditable='false';node.dataset.pdf=JSON.stringify(pdf);
    const view=document.createElement('button');view.type='button';view.className='btn';view.textContent=`PDF · ${pdf.name} · ${pdf.index+1}/${pdf.pages}`;
    if(pdf.after_page!==undefined)view.textContent+=` · Hoja ${pdf.after_page+2}`;
    view.onclick=()=>{const index=pdf.after_page===undefined?composition?.pdf_pages?.findIndex(p=>p?.id===pdf.id):pdf.after_page+1;if(index>=0){currentPage=index;drawCurrent();controls();}if(previewRevision!==revision){refreshPreview();toast('Preparando la página del PDF');}};
    const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Eliminar página';remove.onclick=()=>{
      if(busy||exporting)return;
      edit((lines,mark)=>{const index=lines.findIndex(l=>l[0]?.pdf?.id===pdf.id);if(index<0)return;
        lines.splice(index,1);if(!lines.length)lines.push([]);
        if(pdf.after_page!==undefined){shiftPages(lines,pdf.after_page+1,-1);ImageEditor.splicePages(pdf.after_page+1,1,0);}
        const point={line:Math.min(index,lines.length-1),offset:0};return {lines,selection:{start:point,end:{...point}}};
      });currentPage=Math.min(currentPage,ImageEditor.count()-1);refreshPreview();
    };
    node.append(view,remove);return node;
  }
  function shiftPages(lines,from,delta){for(const line of lines){const pdf=line[0]?.pdf;if(Number.isInteger(pdf?.after_page)&&pdf.after_page+1>=from)pdf.after_page+=delta;}}
  function request(){
    if(busy||exporting||folderBusy||ImageEditor.isBusy()||CalibrationUI.isBusy()||NotebookUI.isBusy())return;
    if(!window.AndroidBridge?.requestPdf)return toast('Inserta PDF desde la app Android');
    captureSelection();insertion=bookmark();targetPage=currentPage;resumePreview=composing;saveDraft();
    clearTimeout(refreshTimer);clearTimeout(qualityTimer);
    if(composing){revision++;composing=false;AndroidBridge.invalidateCompose(revision);}
    progress='Seleccionando PDF…';busy=true;controls();$('status').textContent='Selecciona un PDF para insertar…';
    try{AndroidBridge.requestPdf(++ticket);}catch(e){window.onPdfImported(ticket,null,e.message);}
  }
  window.onPdfImportProgress=(id,message)=>{if(id===ticket&&busy){progress=message;$('status').textContent=message;window.StudioUI?.meta();}};
  window.onPdfImported=(id,raw,error)=>{
    if(id!==ticket||!busy)return;busy=false;controls();
    if(error||!raw){$('status').textContent=error?'No se pudo abrir el PDF':'Inserción cancelada';resumeEditor(insertion);if(error)toast(error);if(resumePreview)refreshPreview();return;}
    try{
      const pdf=JSON.parse(raw);normalize({...pdf,index:0});
      if(ImageEditor.count()+pdf.pages>500)throw Error('La nota admite hasta 500 páginas');
      const source=readLines();
      if(source.length+pdf.pages>10000)throw Error('El documento admite hasta 10000 párrafos');
      if(source.reduce((n,line)=>n+lineText(line).length,0)+source.length-1+pdf.pages*2+TableEditor.count()+MathGraphEditor.count()>MAX_CHARS)throw Error('El documento admite hasta 200000 caracteres');
      if(insertion)restoreSelection(insertion);
      edit((lines,mark)=>{
        shiftPages(lines,targetPage+1,pdf.pages);
        const blocks=Array.from({length:pdf.pages},(_,index)=>[{text:'\uFFFC',pdf:normalize({...pdf,index,id:newId(),after_page:targetPage+index})}]);
        lines.push(...blocks);ImageEditor.splicePages(targetPage+1,0,pdf.pages);
        return {lines,selection:mark};
      });currentPage=targetPage+1;drawCurrent();refreshPreview();toast(`PDF insertado después de la página ${targetPage+1}: ${pdf.pages} ${pdf.pages===1?'página':'páginas'}`);
    }catch(e){$('status').textContent='No se pudo insertar el PDF';toast(e.message);resumeEditor(insertion);}
  };
  return {isLine,normalize,block,request,isBusy:()=>busy,status:()=>progress};
})();
