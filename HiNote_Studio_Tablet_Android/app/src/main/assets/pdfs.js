'use strict';
const PdfEditor=(()=>{
  let busy=false,ticket=0,insertion=null;
  const isLine=line=>!!line?.[0]?.pdf;
  const newId=()=>window.crypto?.randomUUID?.()||`pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function normalize(raw){
    if(!raw||!/^[a-f0-9]{64}$/.test(raw.asset||'')||!Number.isInteger(raw.index)||!Number.isInteger(raw.pages)||raw.pages<1||raw.pages>500||raw.index<0||raw.index>=raw.pages)throw Error('Página de PDF inválida');
    return {id:String(raw.id||newId()).slice(0,80),asset:raw.asset,index:raw.index,pages:raw.pages,name:String(raw.name||'Documento.pdf').slice(0,160)};
  }
  function block(line){
    const pdf=normalize(line[0].pdf),node=document.createElement('div');node.className='line pdfBlock';node.contentEditable='false';node.dataset.pdf=JSON.stringify(pdf);
    const view=document.createElement('button');view.type='button';view.className='btn';view.textContent=`PDF · ${pdf.name} · ${pdf.index+1}/${pdf.pages}`;
    view.onclick=()=>{const index=composition?.pdf_pages?.findIndex(p=>p?.id===pdf.id);if(index>=0){currentPage=index;drawCurrent();controls();}else{refreshPreview();toast('Preparando la página del PDF');}};
    const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Eliminar página';remove.onclick=()=>edit((lines,mark)=>{const index=lines.findIndex(l=>l[0]?.pdf?.id===pdf.id);if(index<0)return;lines.splice(index,1);if(!lines.length)lines.push([]);const point={line:Math.min(index,lines.length-1),offset:0};return {lines,selection:{start:point,end:{...point}}};});
    node.append(view,remove);return node;
  }
  function request(){
    if(busy||exporting||folderBusy||CalibrationUI.isBusy()||NotebookUI.isBusy())return;
    if(!window.AndroidBridge?.requestPdf)return toast('Inserta PDF desde la app Android');
    captureSelection();insertion=bookmark();saveDraft();busy=true;controls();
    try{AndroidBridge.requestPdf(++ticket);}catch(e){busy=false;controls();toast(e.message);}
  }
  window.onPdfImported=(id,raw,error)=>{
    if(id!==ticket)return;busy=false;controls();if(error){toast(error);return;}if(!raw){resumeEditor(insertion);return;}
    try{
      const pdf=JSON.parse(raw);normalize({...pdf,index:0});
      if(readLines().filter(isLine).length+pdf.pages>500)throw Error('La nota admite hasta 500 páginas de PDF');
      if(insertion)restoreSelection(insertion);
      edit((lines,mark)=>{
        const before=sliceSegments(lines[mark.start.line],0,mark.start.offset),after=sliceSegments(lines[mark.end.line],mark.end.offset),meta=paragraphOf(lines[mark.start.line]);
        const blocks=Array.from({length:pdf.pages},(_,index)=>[{text:'\uFFFC',pdf:normalize({...pdf,index,id:newId()})}]);
        const replacement=[...(before.length?[withParagraph(before,meta)]:[]),...blocks,withParagraph(after,meta)];
        lines.splice(mark.start.line,mark.end.line-mark.start.line+1,...replacement);
        const point={line:mark.start.line+replacement.length-1,offset:0};return {lines,selection:{start:point,end:{...point}}};
      });toast(`PDF insertado: ${pdf.pages} ${pdf.pages===1?'página':'páginas'}`);
    }catch(e){toast(e.message);}
  };
  return {isLine,normalize,block,request,isBusy:()=>busy};
})();
