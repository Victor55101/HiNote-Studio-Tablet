from pathlib import Path
import re

ROOT = Path('HiNote_Studio_Tablet_Android')

# ---------- MainActivity: async preview composition ----------
p = ROOT / 'app/src/main/java/com/hinote/studio/MainActivity.java'
s = p.read_text(encoding='utf-8')
s = s.replace('import android.provider.Settings;\n', '')
s = s.replace('import com.chaquo.python.AndroidPlatform;\n', 'import com.chaquo.python.android.AndroidPlatform;\n')
if 'ThreadPoolExecutor' not in s:
    s = s.replace('import java.io.OutputStream;\n', 'import java.io.OutputStream;\nimport java.util.concurrent.LinkedBlockingQueue;\nimport java.util.concurrent.ThreadPoolExecutor;\nimport java.util.concurrent.TimeUnit;\n')
    s = s.replace('    private String pendingDoc, pendingSettings, pendingThumbs, pendingTitle;\n',
                  '    private String pendingDoc, pendingSettings, pendingThumbs, pendingTitle;\n'
                  '    private final ThreadPoolExecutor composeExecutor = new ThreadPoolExecutor(\n'
                  '            1, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());\n')

if 'public void requestCompose(' not in s:
    anchor = '''        @JavascriptInterface
        public void requestSave(String title, String documentJson, String settingsJson, String thumbnailsJson) {'''
    method = '''        @JavascriptInterface
        public void requestCompose(String documentJson, String settingsJson, int requestId) {
            composeExecutor.getQueue().clear();
            composeExecutor.execute(() -> {
                String result;
                try {
                    result = backend.callAttr("compose", getFilesDir().getAbsolutePath(), documentJson, settingsJson).toString();
                } catch (Exception e) {
                    result = "{\\\"error\\\":" + quoteJson(e.getMessage()) + "}";
                }
                final String payload = result;
                runOnUiThread(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript(
                                "window.onComposeResult(" + requestId + "," + quoteJson(payload) + ");", null);
                    }
                });
            });
        }

'''
    if anchor not in s:
        raise RuntimeError('MainActivity requestSave anchor not found')
    s = s.replace(anchor, method + anchor)

if 'composeExecutor.shutdownNow();' not in s:
    anchor = '''    @Override
    public void onBackPressed() {'''
    destroy = '''    @Override
    protected void onDestroy() {
        composeExecutor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

'''
    s = s.replace(anchor, destroy + anchor)
p.write_text(s, encoding='utf-8')

# ---------- HTML UI: async preview + persistent absolute formatting ----------
p = ROOT / 'app/src/main/assets/index.html'
s = p.read_text(encoding='utf-8')
s = s.replace(
    "const editor=$('editor'); let composition=null, currentPage=0, zoom=1, refreshTimer=null;",
    "const editor=$('editor'); let composition=null, currentPage=0, zoom=1, refreshTimer=null; let composeRequestId=0, savedRange=null;"
)

s = re.sub(
    r"function scheduleRefresh\(\)\{clearTimeout\(refreshTimer\);refreshTimer=setTimeout\(refreshPreview,450\)\}\s*editor\.addEventListener\('input',scheduleRefresh\);",
    """function editorCharCount(){return (editor.innerText||'').length}
function scheduleRefresh(){
  clearTimeout(refreshTimer); composeRequestId++;
  const n=editorCharCount(); const delay=n>3000?1900:n>1400?1350:n>600?950:650;
  $('status').textContent='Vista pendiente…';
  refreshTimer=setTimeout(refreshPreview,delay);
}
editor.addEventListener('input',()=>{savedRange=null;scheduleRefresh()});""",
    s,
    count=1,
)

start = s.index('function selectedTextNodes(range)')
end = s.index("$('caseSel').addEventListener", start)
selection_block = r'''function rangeInsideEditor(r){if(!r)return false;const c=r.commonAncestorContainer;return c===editor||editor.contains(c.nodeType===1?c:c.parentNode)}
function captureSelection(){const sel=getSelection();if(sel&&sel.rangeCount&&!sel.isCollapsed){const r=sel.getRangeAt(0);if(rangeInsideEditor(r))savedRange=r.cloneRange()}}
document.addEventListener('selectionchange',captureSelection);
document.querySelector('.toolbar').addEventListener('pointerdown',captureSelection,true);
function activeRange(){const sel=getSelection();if(sel&&sel.rangeCount&&!sel.isCollapsed&&rangeInsideEditor(sel.getRangeAt(0)))return sel.getRangeAt(0).cloneRange();return savedRange?savedRange.cloneRange():null}
function selectedTextNodes(range){const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);const out=[];let n;while(n=walker.nextNode()){if(!n.nodeValue.length)continue;try{if(range.intersectsNode(n))out.push(n)}catch{}}return out}
function inheritedStyle(node){let scale=1,color='#000000',opacity=100;const chain=[];let el=node.parentElement;while(el&&el!==editor){chain.push(el);el=el.parentElement}chain.reverse().forEach(el=>{if(el.dataset.scale)scale=parseFloat(el.dataset.scale);if(el.dataset.color)color=el.dataset.color;if(el.dataset.opacity)opacity=parseFloat(el.dataset.opacity)});return {scale,color,opacity}}
function rgba(hex,opacity){const h=(hex||'#000000').replace('#','');const n=parseInt(h,16)||0;return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${Math.max(.01,Math.min(1,(opacity??100)/100))})`}
function styleSpan(span,st){span.dataset.scale=String(st.scale);span.dataset.color=st.color;span.dataset.opacity=String(st.opacity);span.style.fontSize=(17*parseFloat(st.scale))+'px';span.style.color=rgba(st.color,st.opacity);span.style.opacity='1'}
function wrapPart(node,a,b,patch){if(a>=b)return;const txt=node.nodeValue;const before=txt.slice(0,a),mid=txt.slice(a,b),after=txt.slice(b);const base=inheritedStyle(node);const span=document.createElement('span');span.textContent=mid;styleSpan(span,{scale:patch.scale??base.scale,color:patch.color??base.color,opacity:patch.opacity??base.opacity});const frag=document.createDocumentFragment();if(before)frag.append(document.createTextNode(before));frag.append(span);if(after)frag.append(document.createTextNode(after));node.replaceWith(frag)}
function normalizeEditorStyles(){for(const line of lineElements()){const tokens=collectStyledTokens(line);const segs=mergeSegments(tokens);const frag=document.createDocumentFragment();for(const x of segs){if(!x.text)continue;if(x.scale===1&&x.color==='#000000'&&x.opacity===100)frag.append(document.createTextNode(x.text));else{const sp=document.createElement('span');sp.textContent=x.text;styleSpan(sp,x);frag.append(sp)}}if(!frag.childNodes.length)line.innerHTML='<br>';else line.replaceChildren(frag)}}
function applySelectionStyle(patch){const range=activeRange();if(!range||range.collapsed){toast('Selecciona texto primero');return}const nodes=selectedTextNodes(range);nodes.reverse().forEach(n=>{let a=0,b=n.nodeValue.length;if(n===range.startContainer)a=range.startOffset;if(n===range.endContainer)b=range.endOffset;wrapPart(n,a,b,patch)});normalizeEditorStyles();savedRange=null;scheduleRefresh()}
$('colorPick').addEventListener('input',()=>{$('hexInput').value=$('colorPick').value.toUpperCase()});$('hexInput').addEventListener('change',()=>{let v=$('hexInput').value.trim();if(!v.startsWith('#'))v='#'+v;if(/^#[0-9A-Fa-f]{6}$/.test(v))$('colorPick').value=v});
$('sizeSel').addEventListener('change',()=>{if(activeRange())applySelectionStyle({scale:parseInt($('sizeSel').value)/100})});
$('applyFormat').onclick=()=>applySelectionStyle({color:$('colorPick').value.toUpperCase(),opacity:parseFloat($('opacity').value)});
'''
s = s[:start] + selection_block + s[end:]

s = s.replace("const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed){toast('Selecciona texto primero');$('caseSel').value='';return}const r=sel.getRangeAt(0);",
              "const r=activeRange();if(!r||r.collapsed){toast('Selecciona texto primero');$('caseSel').value='';return}")
s = s.replace("n.nodeValue=n.nodeValue.slice(0,a)+m+n.nodeValue.slice(b)});$('caseSel').value='';scheduleRefresh()",
              "n.nodeValue=n.nodeValue.slice(0,a)+m+n.nodeValue.slice(b)});normalizeEditorStyles();savedRange=null;$('caseSel').value='';scheduleRefresh()")
s = re.sub(r"function selectedLines\(\)\{const sel=getSelection\(\);const lines=lineElements\(\);if\(!sel\.rangeCount\|\|sel\.isCollapsed\)\{const l=currentLine\(\);return l\?\[l\]:\[\]\}const r=sel\.getRangeAt\(0\);",
           "function selectedLines(){const lines=lineElements();const r=activeRange();if(!r||r.collapsed){const l=currentLine();return l?[l]:[]}", s, count=1)

old_refresh = re.compile(r"function refreshPreview\(\)\{if\(!window\.AndroidBridge\).*?\}\n\$\('refreshBtn'\)\.onclick=refreshPreview;", re.S)
new_refresh = r'''function refreshPreview(){if(!window.AndroidBridge){$('status').textContent='Abre esta interfaz dentro de la app Android';return}clearTimeout(refreshTimer);const id=++composeRequestId;$('status').textContent='Componiendo en segundo plano…';try{AndroidBridge.requestCompose(JSON.stringify(serializeDocument()),JSON.stringify(settings()),id)}catch(e){$('status').textContent='Error';toast(e.message||String(e))}}
window.onComposeResult=(id,raw)=>{if(id<composeRequestId)return;try{const data=JSON.parse(raw);if(data.error)throw new Error(data.error);composition=data;currentPage=Math.min(currentPage,Math.max(0,data.pages.length-1));drawCurrent();$('status').textContent=(data.warnings?.length?data.warnings.length+' aviso(s)':'Listo')}catch(e){$('status').textContent='Error';toast(e.message||String(e))}};
$('refreshBtn').onclick=refreshPreview;'''
s, n = old_refresh.subn(new_refresh, s, count=1)
if n != 1:
    raise RuntimeError('refreshPreview block not found')

s = s.replace('wrap_tolerance:12', 'wrap_tolerance:5')
s = s.replace('ensureLines();setTimeout(refreshPreview,450);', 'ensureLines();setTimeout(refreshPreview,650);')

s = re.sub(r"\$\('exportBtn'\)\.onclick=\(\)=>\{if\(!composition\)refreshPreview\(\);setTimeout\(\(\)=>\{if\(!composition\)return;try\{const thumbs=composition\.pages\.map\(pageThumbData\);\$\('status'\)\.textContent='Elige dónde guardar…';AndroidBridge\.requestSave\(\$\('noteTitle'\)\.value\|\|'Nueva nota',JSON\.stringify\(serializeDocument\(\)\),JSON\.stringify\(settings\(\)\),JSON\.stringify\(thumbs\)\)\}catch\(e\)\{toast\(e\.message\)\}\},100\)\};",
           "$('exportBtn').onclick=()=>{if(!composition){toast('Actualiza la vista antes de guardar');refreshPreview();return}try{const thumbs=composition.pages.map(pageThumbData);$('status').textContent='Elige dónde guardar…';AndroidBridge.requestSave($('noteTitle').value||'Nueva nota',JSON.stringify(serializeDocument()),JSON.stringify(settings()),JSON.stringify(thumbs))}catch(e){toast(e.message)}};",
           s, count=1)
p.write_text(s, encoding='utf-8')

# ---------- Composer: small right-edge safety, not a huge margin ----------
p = ROOT / 'app/src/main/python/handwriting_composer.py'
s = p.read_text(encoding='utf-8')
s = s.replace('wrap_tolerance=12.0,', 'wrap_tolerance=5.0,')
s = s.replace('right_limit = float(page_width) - float(margin_right) + float(wrap_tolerance)',
              'right_limit = float(page_width) - float(margin_right) + float(wrap_tolerance) - 4.0')
p.write_text(s, encoding='utf-8')

print('V20 patch applied')
