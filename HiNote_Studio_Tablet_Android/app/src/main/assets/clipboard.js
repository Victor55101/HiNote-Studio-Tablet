'use strict';
// Interchange uses ordinary HTML too: Android clipboard implementations may
// discard an app-specific MIME type while retaining text/html.
function clipboardHTML(lines,markers=[]) {
  const root=document.createElement('div');root.dataset.hinoteClipboard='60';root.style.fontSize='16px';root.style.whiteSpace='pre-wrap';
  for(let i=0;i<lines.length;i++){
    const line=lines[i],p=document.createElement('p'),meta={...paragraphOf(line)};
    delete meta.pdfGap;delete meta.listExit;
    if(Object.keys(meta).length)p.dataset.hinoteParagraph=JSON.stringify(meta);
    p.style.margin='0';
    if(meta.list&&markers[i]){
      const marker=document.createElement('span');marker.dataset.hinoteMarker='true';marker.textContent=markers[i]+' ';p.append(marker);
    }
    for(const run of line){
      if(run.paragraph)continue;
      const st=cleanStyle(run),span=document.createElement('span');span.dataset.hinoteStyle=JSON.stringify(st);
      span.style.fontSize=16*st.scale*(st.script ? .65 : 1)+'px';
      span.style.color=st.color;span.style.opacity=String(st.opacity/100);
      span.style.fontWeight=String(Math.min(900,(st.bold?700:400)+st.thickness*25));
      span.style.fontStyle=st.italic?'italic':'normal';span.style.textDecoration=st.underline?'underline':'none';
      const parts=run.text.split('\n');parts.forEach((text,j)=>{if(j)span.append(document.createElement('br'));span.append(document.createTextNode(text));});
      if(st.script){const script=document.createElement(st.script);script.style.fontSize='1em';script.append(span);p.append(script);}else p.append(span);
    }
    if(!p.childNodes.length)p.append(document.createElement('br'));root.append(p);
  }
  return root.outerHTML;
}
function parseClipboardHTML(html){
  if(!html||html.length>8*1024*1024)return null;
  // Template contents stay inert: no source nodes, handlers, stylesheet rules,
  // images, frames or scripts are inserted into the live document.
  const template=document.createElement('template');template.innerHTML=html;
  const block=/^(P|DIV|LI|H[1-6]|PRE|BLOCKQUOTE|SECTION|ARTICLE|TR)$/;
  const ignored=/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED|IMG|SVG|MATH|LINK|META|INPUT|TEXTAREA|BUTTON|SELECT)$/;
  const output=[],colors=new Map();let current=[],meta={},characters=0,visited=0;
  const flush=force=>{if(current.length||force)output.push(withParagraph(current,meta));current=[];meta={};if(output.length>10000)throw Error('Clipboard paragraphs');};
  const append=(text,state)=>{
    if(!text)return;characters+=text.length;if(characters>MAX_CHARS)throw Error('Clipboard size');
    current.push({text,...state.style,scale:state.font/(16*(state.style.script ? .65 : 1))});
  };
  function color(value){
    if(colors.has(value))return colors.get(value);
    if(!value||/^(inherit|currentcolor|unset)$/i.test(value)||!CSS.supports('color',value)||value.includes('var('))return null;
    const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
    const rgba=ctx.getImageData(0,0,1,1).data,result={color:'#'+[...rgba.slice(0,3)].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase(),opacity:rgba[3]/255};
    colors.set(value,result);return result;
  }
  function fontSize(value,parent){
    const m=value.match(/^([\d.]+)(px|pt|em|rem|%)$/i);if(!m)return null;
    const n=Number(m[1]);return m[2]==='pt'?n*4/3:m[2]==='em'?n*parent:m[2]==='rem'?n*16:m[2]==='%'?n*parent/100:n;
  }
  function walk(node,parent,lists=[],depth=0){
    if(++visited>100000||depth>100)throw Error('Clipboard structure');
    if(node.nodeType===Node.TEXT_NODE){
      let text=node.nodeValue.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
      if(!parent.pre){if(!text.trim()&&/[\n\t]/.test(text))return;text=text.replace(/[\t\n ]+/g,' ');}
      append(text,parent);return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE||ignored.test(node.tagName)||node.dataset.hinoteMarker==='true')return;
    const css=node.style;if(css.display==='none'||css.visibility==='hidden')return;
    let state={...parent,style:{...parent.style}};
    if(node.dataset.hinoteStyle){
      try{state.style=cleanStyle(JSON.parse(node.dataset.hinoteStyle));state.font=16*state.style.scale*(state.style.script ? .65 : 1);}catch(_){}
    }else{
      if(/^(B|STRONG)$/.test(node.tagName))state.style.bold=true;
      if(/^(I|EM)$/.test(node.tagName))state.style.italic=true;
      if(node.tagName==='U')state.style.underline=true;
      if(css.fontWeight)state.style.bold=/^(bold|bolder)$/.test(css.fontWeight)||Number(css.fontWeight)>=600;
      if(css.fontStyle)state.style.italic=/^(italic|oblique)/.test(css.fontStyle);
      if((css.textDecorationLine||css.textDecoration).includes('underline'))state.style.underline=true;
      const script=/^(SUB|SUP)$/.test(node.tagName)?node.tagName.toLowerCase():css.verticalAlign==='super'?'sup':css.verticalAlign==='sub'?'sub':null;
      const sized=fontSize(css.fontSize,state.font);
      if(script){state.style.script=script;if(sized===null&&script!==parent.style.script)state.font*=.65;}
      else if(css.verticalAlign==='baseline')delete state.style.script;
      if(sized!==null)state.font=sized;
      const ink=color(css.color||node.getAttribute('color'));
      if(ink){state.style.color=ink.color;state.style.opacity=parent.style.opacity*ink.opacity;}
      if(css.opacity)state.style.opacity*=bounded(css.opacity,0,1,1);
    }
    state.pre=parent.pre||node.tagName==='PRE'||/^(pre|pre-wrap|break-spaces)$/.test(css.whiteSpace);
    if(node.tagName==='BR'){
      if(node.parentElement?.childNodes.length!==1||!block.test(node.parentElement.tagName))append('\n',state);
      return;
    }
    if(node.tagName==='OL'||node.tagName==='UL'){
      const type=node.tagName==='UL'?'bullet':({a:'alpha_lower_dot',A:'alpha_upper_dot',i:'roman_lower_dot',I:'roman_upper_dot'})[node.getAttribute('type')]||'num_dot';
      lists=[...lists,{id:newListId(),type,start:Math.round(bounded(node.getAttribute('start')||1,1,999999,1))}];
    }
    const paragraph=block.test(node.tagName),nested=[...node.children].some(n=>block.test(n.tagName)||n.matches('ol,ul'));
    if(paragraph){
      flush(false);
      if(node.dataset.hinoteParagraph){try{meta=paragraphOf(withParagraph([],JSON.parse(node.dataset.hinoteParagraph)));delete meta.pdfGap;delete meta.listExit;}catch(_){}}
      else if(node.tagName==='LI'&&lists.length)meta={list:{...lists.at(-1),level:Math.min(8,lists.length-1),markerStyle:cleanStyle({...state.style,scale:state.font/16,script:'normal'})}};
    }
    for(const child of node.childNodes)walk(child,state,lists,depth+1);
    if(paragraph)flush(!nested);
  }
  const initial={style:cleanStyle(),font:16,pre:false};
  for(const node of template.content.childNodes)walk(node,initial);
  flush(false);return characters?migrateTextLists(output):null;
}
