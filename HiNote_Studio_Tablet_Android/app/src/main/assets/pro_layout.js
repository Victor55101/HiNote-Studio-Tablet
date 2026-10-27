'use strict';
// Geometry is computed without raster round-trips. This exact plan is exported.
const ProLayout = (() => {
  const narrow = ch => `ilIjtfr1'".,;:!|\``.includes(ch);
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  function gap(a,b,spacing) {
    const s=(a.scale+b.scale)/2;
    return clamp(4.8+spacing*.72-(narrow(a.ch)?.45:0)-(narrow(b.ch)?.45:0)-('.,;:!?)]}>»'.includes(b.ch)?1.15:0)-('([<{«¿¡'.includes(a.ch)?.85:0)+('.,;:!?'.includes(a.ch)?.65:0),1.6,11)*s;
  }
  function chars(segments) {
    const out=[];let offset=0;
    for(const seg of segments||[]){
      // Segmenter preserves UTF-16 offsets of decomposed accents and emoji.
      const text=String(seg.text||''),groups=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('es',{granularity:'grapheme'}).segment(text)].map(g=>[g.segment,g.index]):[...text].reduce((a,ch)=>{const prev=a.at(-1);if(prev&&/\p{M}/u.test(ch))prev[0]+=ch;else a.push([ch,a.reduce((n,g)=>n+g[0].length,0)]);return a;},[]);
      for(const [cluster,index] of groups)for(const ch of cluster.normalize('NFC'))out.push({ch,offset:offset+index,end:offset+index+cluster.length,style:seg});
      offset+=text.length;
    }return out;
  }
  function prepare(segments,bank,config,counts={}) {
    return chars(segments).map(c=>{
      const st=c.style,body=Math.max(.35,+st.scale||1),scale=body*(['sub','sup'].includes(st.script)?.65:1),variants=bank.glyphs[c.ch];
      const ordinal=counts[c.ch]||0;counts[c.ch]=ordinal+1;
      // Per-character occurrence: typing another letter does not reshuffle ink.
      const variant=(Math.imul(c.ch.codePointAt(0),2654435761)+ordinal*17+12345)>>>0;
      const glyph=variants?.[variant%variants.length];
      const box=glyph?.bbox||[0,0,0,0],italic=st.italic?.2:0;
      return {...c,body,scale,v:glyph?variant%variants.length:-1,glyph,left:(box[0]-Math.max(0,box[3])*italic)*scale,right:(box[2]-Math.min(0,box[1])*italic)*scale,
        shift:(st.script==='sup'?-25:st.script==='sub'?11:0)*body,space:!glyph&&c.ch!=='\n',width:(c.ch==='\t'?config.word_spacing*4:/\s/u.test(c.ch)?config.word_spacing:28)*scale};
    });
  }
  function positions(items,spacing) {
    let x=0,prev=null,pending=0;const placed=[];
    for(const item of items){
      if(item.space){placed.push({...item,origin:prev?x+prev.right+pending:x+pending});pending+=item.width;continue;}
      if(item.ch==='\n')continue;
      x+=prev?prev.right-item.left+(pending||gap(prev,item,spacing)):pending;
      pending=0;placed.push({...item,origin:x});prev=item;
    }
    return {placed,width:prev?x+prev.right+pending:pending};
  }
  function paragraph(para,bank,config) {
    const grid=bank.grid||58.8,items=prepare(para.segments,bank,config),list=para.list;
    const marker=list&&!list.hide_marker?prepare([{text:String(list.marker||'•'),scale:list.marker_scale||1,color:list.marker_color,opacity:list.marker_opacity,thickness:list.marker_thickness,bold:list.marker_bold,italic:list.marker_italic,underline:list.marker_underline}],bank,config):[];
    const m=positions(marker,config.letter_spacing),markerWidth=Math.max(grid,m.width+12),indent=clamp(+(list?.indent_squares??0),0,12)*grid;
    let left=list?indent+markerWidth+14:80+clamp(+para.indent_squares||0,0,12)*grid;
    if(para.list_exit){const e=para.list_exit;left=e.indent*grid;if(e.stage==='body')left+=Math.max(grid,positions(prepare([{...e.style,text:e.marker}],bank,config),config.letter_spacing).width+12)+14;}
    const available=Math.max(30,921-left),rows=[];let current=[],i=0;
    const flush=()=>{rows.push(positions(current,config.letter_spacing));current=[];};
    while(i<items.length){
      if(items[i].ch==='\n'){const end=items[i].offset;flush();rows.at(-1).breakAt=end;i++;continue;}
      let token=[];
      if(items[i].space)token=[items[i++]];else while(i<items.length&&!items[i].space&&items[i].ch!=='\n')token.push(items[i++]);
      if(positions([...current,...token],config.letter_spacing).width<=available){current.push(...token);continue;}
      if(current.length)flush();
      for(const item of token){if(current.length&&positions([...current,item],config.letter_spacing).width>available)flush();current.push(item);}
    }
    if(current.length||!rows.length||items.at(-1)?.ch==='\n')flush();
    const result=rows.map((r,n)=>{
      const max=Math.max(1,...r.placed.map(c=>c.body),n===0&&list?+list.marker_scale||1:1),height=grid*Math.max(config.line_grid_rows,max>1.75?3:max>1.35?2:1);
      const glyphs=r.placed.filter(c=>c.glyph),top=Math.min(-40,...glyphs.map(c=>(c.glyph.bbox[1]+(bank.offsets[c.ch]||0))*c.scale+c.shift)),bottom=Math.max(0,...glyphs.map(c=>(c.glyph.bbox[3]+(bank.offsets[c.ch]||0))*c.scale+c.shift));
      return {...r,left,height,top,bottom,marker:n===0?m.placed.map(c=>({...c,origin:c.origin+indent+(markerWidth-m.width)/2})):[]};
    });return result;
  }
  function create(bank) {
    let cache=new Map();
    function layout(document,config) {
      const pages=[{items:[],rows:[]}],warnings=new Set();let y=115;
      const page=()=>pages.at(-1),next=()=>{if(pages.length>=500)throw Error('El documento supera 500 páginas');pages.push({items:[],rows:[]});y=115;};
      const keys=new Set();
      document.paragraphs.forEach((para,line)=>{
        if(para.type)throw Error('Este objeto se edita en la vista clásica');
        const key=JSON.stringify([para,config]);keys.add(key);let rows=cache.get(key);
        if(!rows){rows=paragraph(para,bank,config);cache.set(key,rows);}
        let emptyOffset=0;
        rows.forEach(row=>{
          if(y+row.bottom>1545)next();
          const carets=[];
          const add=(c,isMarker)=>{
            if(!c.glyph){if(!/\s/u.test(c.ch))warnings.add(c.ch);return;}
            page().items.push({...c,line,offset:isMarker?-c.offset-1:c.offset,x:(isMarker?0:row.left)+c.origin,y:y+(bank.offsets[c.ch]||0)*c.scale+c.shift});
          };
          row.marker.forEach(c=>add(c,true));
          row.placed.forEach((c,k)=>{
            const x=row.left+c.origin+(c.glyph?c.left:0);
            carets.push({line,offset:c.offset,x,y});
            const following=row.placed[k+1],right=c.space?x+c.width:row.left+c.origin+c.right;
            carets.push({line,offset:c.end,x:following?row.left+following.origin+(following.glyph?following.left:0):right,y});
            add(c,false);emptyOffset=c.end;
          });
          if(!carets.length)carets.push({line,offset:emptyOffset,x:row.left,y});
          if(row.breakAt!=null)emptyOffset=row.breakAt+1;
          page().rows.push({line,y,top:y+row.top,height:row.height,carets});y+=row.height;
        });
      });
      for(const key of cache.keys())if(!keys.has(key))cache.delete(key);
      return {pages,warnings:[...warnings].map(ch=>`Sin muestra para «${ch}»; se dejó espacio.`)};
    }
    return {layout};
  }
  return {create,chars};
})();
if(typeof module!=='undefined')module.exports=ProLayout;
