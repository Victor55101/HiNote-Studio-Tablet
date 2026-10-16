'use strict';
const PdfEditor=(()=>{
  let busy=false,ticket=0,insertion=null,targetPage=0,targetPoint=null,blankBefore=0,awaitingLayout=false,resumePreview=false,progress='',followPoint=null;
  const isLine=line=>!!line?.[0]?.pdf;
  const newId=()=>window.crypto?.randomUUID?.()||`pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const slot=()=>withParagraph([],{pdfGap:true});
  function normalize(raw){
    if(!raw||!/^[a-f0-9]{64}$/.test(raw.asset||'')||!Number.isInteger(raw.index)||!Number.isInteger(raw.pages)||raw.pages<1||raw.pages>500||raw.index<0||raw.index>=raw.pages)throw Error('Página de PDF inválida');
    if(raw.after_page!==undefined&&(!Number.isInteger(raw.after_page)||raw.after_page<0||raw.after_page>498))throw Error('Posición de PDF inválida');
    if(raw.blank_before!==undefined&&(!Number.isInteger(raw.blank_before)||raw.blank_before<0||raw.blank_before>498))throw Error('Separación de PDF inválida');
    return {id:String(raw.id||newId()).slice(0,80),asset:raw.asset,index:raw.index,pages:raw.pages,name:String(raw.name||'Documento.pdf').slice(0,160),...(raw.after_page===undefined?{}:{after_page:raw.after_page}),...(raw.blank_before?{blank_before:raw.blank_before}:{})};
  }
  function block(line){
    const pdf=normalize(line[0].pdf),node=document.createElement('div');node.className='line pdfBlock';node.contentEditable='false';node.dataset.pdf=JSON.stringify(pdf);
    const view=document.createElement('button');view.type='button';view.className='btn';view.textContent=`PDF · ${pdf.name} · ${pdf.index+1}/${pdf.pages}`;
    view.onclick=()=>{const index=composition?.pdf_pages?.findIndex(p=>p?.id===pdf.id);if(index>=0){currentPage=index;drawCurrent();controls();}if(previewRevision!==revision){refreshPreview();toast('Preparando la página del PDF');}};
    const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Eliminar página';remove.onclick=()=>{
      if(busy||exporting)return;
      const page=composition?.pdf_pages?.findIndex(p=>p?.id===pdf.id);
      edit(lines=>{const index=lines.findIndex(l=>l[0]?.pdf?.id===pdf.id);if(index<0)return;
        lines.splice(index,1);if(!lines.length)lines.push([]);
        if(page>=0)ImageEditor.splicePages(page,1,0);
        const point={line:Math.min(index,lines.length-1),offset:0};return {lines,selection:{start:point,end:{...point}}};
      });refreshPreview();
    };
    node.append(view,remove);return node;
  }
  // Insert at the engine's page boundary. The optional table row and UTF-16
  // offset let a PDF separate wrapped text without relocating its suffix.
  function insertAt(lines,point,pdfs,mark){
    const at=Math.min(point.line,lines.length),line=lines[at],offset=point.offset||0;
    const blocks=pdfs.flatMap(pdf=>[[{text:'\uFFFC',pdf:normalize(pdf)}],slot()]);
    let replacement,afterIndex;
    if(point.row!==undefined&&TableEditor.isLine(line)){
      const tail=TableEditor.split(line[0].tableId,point.row);replacement=[line,slot(),...blocks,tail];afterIndex=replacement.length-1;
    }else if(line&&!isBlockLine(line)&&offset>0&&offset<lineText(line).length){
      const meta=paragraphOf(line),tail={...meta};if(tail.list)tail.list={...tail.list,continuation:true,continuationMarker:tail.list.continuationMarker||listMarkers(lines)[at]};
      replacement=[withParagraph(sliceSegments(line,0,offset),meta),slot(),...blocks,withParagraph(sliceSegments(line,offset),tail)];afterIndex=replacement.length-1;
    }else{
      const endOfLine=line&&!isBlockLine(line)&&offset>=lineText(line).length&&offset>0;
      const position=at+(endOfLine?1:0);
      const prefix=position>0&&paragraphOf(lines[position-1]).pdfGap&&!lineText(lines[position-1])?[]:[slot()];
      replacement=[...prefix,...blocks];lines.splice(position,0,...replacement);
      const move=p=>p.line>=position?{...p,line:p.line+replacement.length}:p;
      return {lines,selection:mark?{...mark,start:move(mark.start),end:move(mark.end)}:null};
    }
    lines.splice(at,1,...replacement);
    const move=p=>p.line<at?p:p.line>at?{...p,line:p.line+replacement.length-1}:p.offset<offset?{...p,line:at}:{...p,line:at+afterIndex,offset:Math.max(0,p.offset-offset)};
    return {lines,selection:mark?{...mark,start:move(mark.start),end:move(mark.end)}:null};
  }
  function hasAnchors(){return readLines().some(l=>Number.isInteger(l[0]?.pdf?.after_page));}
  function migrate(result){
    if(!hasAnchors()||!result.page_ends)return false;
    const source=readLines(),groups=new Map();
    source.forEach(line=>{const pdf=line[0]?.pdf;if(!Number.isInteger(pdf?.after_page))return;
      const point=result.page_ends[pdf.after_page];if(!point)throw Error('No se pudo ubicar una página del PDF');
      const key=JSON.stringify(point);if(!groups.has(key))groups.set(key,{point,pdfs:[]});const copy={...pdf};delete copy.after_page;groups.get(key).pdfs.push({after:pdf.after_page,pdf:copy});
    });
    const wasBusy=busy;busy=false;
    try{edit((lines,mark)=>{
      const filtered=lines.filter(l=>!Number.isInteger(l[0]?.pdf?.after_page));
      const translate=p=>({...p,line:lines.slice(0,p.line).filter(l=>!Number.isInteger(l[0]?.pdf?.after_page)).length});
      let state={lines:filtered,selection:mark?{...mark,start:translate(mark.start),end:translate(mark.end)}:null};
      const ordered=[...groups.values()].sort((a,b)=>b.point.line-a.point.line||(b.point.row||0)-(a.point.row||0)||b.point.offset-a.point.offset);
      for(const group of ordered){const point=translate(group.point);let previous=result.page_ends.findIndex(p=>JSON.stringify(p)===JSON.stringify(group.point));const pdfs=group.pdfs.sort((a,b)=>a.after-b.after).map(x=>{const pdf={...x.pdf,blank_before:Math.max(0,x.after-previous)};previous=x.after+1;return pdf;});state=insertAt(state.lines,point,pdfs,state.selection);}
      return state;
    });}finally{busy=wasBusy;}
    followPoint=null;if(awaitingLayout)insertion=bookmark();return true;
  }
  function openPicker(){
    awaitingLayout=false;progress='Seleccionando PDF…';controls();$('status').textContent='Selecciona un PDF para insertar…';
    try{AndroidBridge.requestPdf(++ticket);}catch(e){window.onPdfImported(ticket,null,e.message);}
  }
  function request(){
    if(busy||exporting||folderBusy||ImageEditor.isBusy()||CalibrationUI.isBusy()||NotebookUI.isBusy())return;
    if(!window.AndroidBridge?.requestPdf)return toast('Inserta PDF desde la app Android');
    captureSelection();insertion=bookmark();targetPage=currentPage;resumePreview=composing;saveDraft();
    clearTimeout(refreshTimer);clearTimeout(qualityTimer);busy=true;
    if(previewRevision!==revision||composing||!composition?.page_ends||hasAnchors()){
      awaitingLayout=true;progress='Ubicando PDF…';controls();refreshPreview();
    }else{locate(composition);openPicker();}
  }
  function locate(result){blankBefore=Math.max(0,targetPage-result.page_count+1);targetPoint=result.page_ends?.[Math.min(targetPage,result.page_count-1)];}
  function composed(result){
    if(migrate(result)){refreshPreview();return true;}
    if(awaitingLayout){locate(result);if(!targetPoint){failed('No se pudo ubicar la página de inserción');return false;}openPicker();}
    if(followPoint&&result.page_ends){const p=followPoint,index=result.page_ends.findIndex((end,i)=>!result.pdf_pages?.[i]&&(end.line>p.line||end.line===p.line&&end.offset>=p.offset));if(index>=0)currentPage=index;followPoint=null;}
    return false;
  }
  function noteCaret(){const mark=bookmark();if(!mark||!collapsed(mark)||markerSelection)return;const lines=readLines();if(!isBlockLine(lines[mark.start.line])&&lines.slice(0,mark.start.line).some(isLine))followPoint={...mark.start};}
  function failed(message){if(!awaitingLayout)return;awaitingLayout=false;busy=false;controls();resumeEditor(insertion);if(message)toast(message);}
  window.onPdfImportProgress=(id,message)=>{if(id===ticket&&busy&&!awaitingLayout){progress=message;$('status').textContent=message;window.StudioUI?.meta();}};
  window.onPdfImported=(id,raw,error)=>{
    if(id!==ticket||!busy||awaitingLayout)return;busy=false;controls();
    if(error||!raw){$('status').textContent=error?'No se pudo abrir el PDF':'Inserción cancelada';resumeEditor(insertion);if(error)toast(error);if(resumePreview)refreshPreview();return;}
    try{
      const pdf=JSON.parse(raw);normalize({...pdf,index:0});
      if(ImageEditor.count()+pdf.pages>500)throw Error('La nota admite hasta 500 páginas');
      const source=readLines();
      if(source.length+pdf.pages*2+2>10000)throw Error('El documento admite hasta 10000 párrafos');
      if(characterCount()+pdf.pages*3+2>MAX_CHARS)throw Error('El documento admite hasta 200000 caracteres');
      if(insertion)restoreSelection(insertion);
      edit((lines,mark)=>{
        const refs=Array.from({length:pdf.pages},(_,index)=>normalize({...pdf,index,id:newId(),...(index===0&&blankBefore?{blank_before:blankBefore}:{})}));
        const result=insertAt(lines,targetPoint,refs,mark);ImageEditor.splicePages(targetPage+1,0,pdf.pages);return result;
      });followPoint=null;currentPage=targetPage+1;drawCurrent();refreshPreview();toast(`PDF insertado: ${pdf.pages} ${pdf.pages===1?'página':'páginas'}`);
    }catch(e){$('status').textContent='No se pudo insertar el PDF';toast(e.message);resumeEditor(insertion);}
  };
  return {isLine,normalize,block,request,composed,failed,hasAnchors,noteCaret,isBusy:()=>busy,status:()=>progress};
})();
