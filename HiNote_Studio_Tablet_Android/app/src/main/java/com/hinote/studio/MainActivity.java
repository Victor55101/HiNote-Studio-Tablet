package com.hinote.studio;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import com.chaquo.python.android.AndroidPlatform;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import org.json.JSONObject;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    private static final int REQUEST_SAVE=501;
    private static final Object ENGINE_START_LOCK=new Object();
    private WebView webView;
    private PyObject backend;
    private File sessionDir;
    private ThreadPoolExecutor worker;
    private volatile boolean destroyed;
    private volatile String startupError,latestSnapshot;
    private final AtomicInteger revision=new AtomicInteger(),pageRevision=new AtomicInteger();
    private final AtomicBoolean exporting=new AtomicBoolean();
    private volatile Future<?> composeJob,pageJob;
    private volatile ExportJob pendingExport;

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(15,23,42)); getWindow().setNavigationBarColor(Color.rgb(15,23,42));
        sessionDir=new File(getCacheDir(),"hinote-session-"+UUID.randomUUID());
        worker=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8)){
            @Override protected void terminated(){deleteTree(sessionDir);}
        };
        worker.execute(()->{
            try{
                File[] old=getCacheDir().listFiles();
                if(old!=null)for(File f:old)if(f.getName().startsWith("hinote-session-")&&!f.equals(sessionDir)&&System.currentTimeMillis()-f.lastModified()>86400000L)deleteTree(f);
                synchronized(ENGINE_START_LOCK){
                    copyEngineAsset("glyphs_v22.json");copyEngineAsset("template_1stroke.hinote");
                    if(!Python.isStarted())Python.start(new AndroidPlatform(getApplicationContext()));
                }
                backend=Python.getInstance().getModule("mobile_backend");
            }catch(Exception e){startupError=message(e);}
        });
        webView=new WebView(this);WebSettings ws=webView.getSettings();
        ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setBuiltInZoomControls(false);
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return !url.startsWith("file:///android_asset/");}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                disposeWebView(view);webView=null;
                Toast.makeText(MainActivity.this,"Recuperando el editor desde el borrador…",Toast.LENGTH_LONG).show();recreate();return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());webView.addJavascriptInterface(new Bridge(),"AndroidBridge");
        setContentView(webView);webView.loadUrl("file:///android_asset/index.html");
    }
    private void copyEngineAsset(String name)throws Exception{
        File out=new File(getFilesDir(),name);if(out.isFile()&&out.length()>0)return;
        File partial=new File(getFilesDir(),name+".part");
        try(InputStream in=getAssets().open(name);FileOutputStream stream=new FileOutputStream(partial)){
            byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)stream.write(buffer,0,n);stream.getFD().sync();
        }
        if(!partial.renameTo(out))throw new IOException("No se pudo preparar "+name);
    }
    private void ready()throws IOException{
        if(startupError!=null)throw new IOException(startupError);
        if(backend==null)throw new IOException("El motor todavía no está disponible");
    }
    /** Public methods are called by Python through Chaquopy. */
    public final class TaskToken{
        private final int id;private final String kind;private final AtomicBoolean cancelled;
        TaskToken(String kind,int id,AtomicBoolean cancelled){this.kind=kind;this.id=id;this.cancelled=cancelled;}
        public boolean isCancelled(){return destroyed||Thread.currentThread().isInterrupted()||cancelled.get()||(kind.equals("compose")&&revision.get()!=id)||(kind.equals("page")&&pageRevision.get()!=id);}
        public void check(){if(isCancelled())throw new CancellationException("Operación cancelada");}
        public void onProgress(int page){if(!isCancelled())send("onWorkProgress",quote(kind)+","+id+","+page);}
    }
    private void removeQueued(Future<?> job){if(job!=null){job.cancel(false);if(job instanceof Runnable)worker.remove((Runnable)job);}}
    public final class Bridge{
        @JavascriptInterface public void invalidateCompose(int id){revision.set(id);removeQueued(composeJob);pageRevision.incrementAndGet();removeQueued(pageJob);}
        @JavascriptInterface public void requestCompose(String doc,String settings,int id){
            if(destroyed||exporting.get())return;revision.set(id);removeQueued(composeJob);
            TaskToken token=new TaskToken("compose",id,new AtomicBoolean());
            composeJob=worker.submit(()->{
                String created=null;
                try{
                    token.check();ready();
                    String result=backend.callAttr("compose",getFilesDir().getPath(),sessionDir.getPath(),doc,settings,token).toString();
                    created=new JSONObject(result).getString("snapshot");token.check();
                    String old=latestSnapshot;latestSnapshot=created;
                    if(old!=null)backend.callAttr("remove_snapshot",sessionDir.getPath(),old);
                    send("onComposeResult",id+","+quote(result));
                }catch(Exception e){
                    if(created!=null)backend.callAttr("remove_snapshot",sessionDir.getPath(),created);
                    if(!token.isCancelled())send("onComposeResult",id+","+quote(errorJson(e)));
                }
            });
        }
        @JavascriptInterface public void requestPage(String snapshot,int index,boolean grid,int id){
            if(destroyed||exporting.get())return;pageRevision.set(id);removeQueued(pageJob);
            TaskToken token=new TaskToken("page",id,new AtomicBoolean());
            pageJob=worker.submit(()->{
                try{
                    token.check();ready();
                    JSONObject info=new JSONObject(backend.callAttr("snapshot_info",sessionDir.getPath(),snapshot).toString());
                    File jpg=thumbnail(snapshot,index,grid,info,token);token.check();
                    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    try(InputStream in=new FileInputStream(jpg)){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);}
                    String data="data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);
                    send("onPageResult",id+","+quote(snapshot)+","+index+","+quote(data)+",null");
                }catch(Exception e){if(!token.isCancelled())send("onPageResult",id+","+quote(snapshot)+","+index+",null,"+quote(message(e)));}
            });
        }
        @JavascriptInterface public void requestSave(String snapshot,String title,boolean grid){
            if(destroyed||!exporting.compareAndSet(false,true))return;
            if(!snapshot.equals(latestSnapshot)){finishExport(false,"Actualiza la vista antes de guardar");return;}
            ExportJob job=new ExportJob(snapshot,title,grid);pendingExport=job;
            runOnUiThread(()->{
                if(destroyed)return;
                try{
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/octet-stream");
                    String safe=job.title.replaceAll("[\\\\/:*?\"<>|]","_");intent.putExtra(Intent.EXTRA_TITLE,safe+".hinote");startActivityForResult(intent,REQUEST_SAVE);
                }catch(Exception e){finishExport(false,message(e));}
            });
        }
        @JavascriptInterface public void cancelExport(){ExportJob job=pendingExport;if(job!=null)job.cancelled.set(true);}
    }
    private static final class ExportJob{
        final String snapshot,title;final boolean grid;final AtomicBoolean cancelled=new AtomicBoolean();
        ExportJob(String snapshot,String title,boolean grid){this.snapshot=snapshot;this.grid=grid;String clean=title==null?"":title.trim();this.title=clean.isEmpty()?"Nueva nota":clean.substring(0,Math.min(128,clean.length()));}
    }
    private File thumbnail(String snapshot,int index,boolean grid,JSONObject info,TaskToken token)throws Exception{
        if(index<0||index>=info.getInt("page_count"))throw new IOException("Página fuera de rango");
        File file=new File(new File(sessionDir,snapshot),"page-"+index+(grid?"-grid.jpg":"-plain.jpg"));
        if(!file.isFile()){
            String json=backend.callAttr("page_preview",sessionDir.getPath(),snapshot,index).toString();
            PageRenderer.render(json,file,grid,info.getJSONObject("layout").getDouble("grid_step"),token::check);
        }
        return file;
    }
    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);if(code!=REQUEST_SAVE)return;
        ExportJob job=pendingExport;
        if(result!=RESULT_OK||data==null||data.getData()==null||job==null){finishExport(false,"Guardado cancelado");return;}
        Uri uri=data.getData();
        worker.execute(()->{
            File output=new File(sessionDir,"export-"+UUID.randomUUID()+".hinote");TaskToken token=new TaskToken("export",0,job.cancelled);
            try{
                token.check();ready();JSONObject info=new JSONObject(backend.callAttr("snapshot_info",sessionDir.getPath(),job.snapshot).toString());
                for(int i=0;i<info.getInt("page_count");i++){token.check();thumbnail(job.snapshot,i,job.grid,info,token);token.onProgress(i+1);}
                send("onExportStage",quote("Empaquetando y comprobando la nota…"));
                backend.callAttr("export_snapshot",getFilesDir().getPath(),sessionDir.getPath(),job.snapshot,job.title,job.grid,output.getPath(),token);
                send("onExportStage",quote("Escribiendo el archivo…"));
                try(InputStream in=new FileInputStream(output);OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
                    if(out==null)throw new IOException("No se pudo abrir el destino");
                    byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){token.check();out.write(buffer,0,n);}out.flush();
                }
                token.check();finishExport(true,"HiNote guardado correctamente");
            }catch(Exception e){
                try{DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}
                finishExport(false,token.isCancelled()?"Guardado cancelado":message(e));
            }finally{output.delete();}
        });
    }
    private void finishExport(boolean ok,String message){pendingExport=null;exporting.set(false);send("onExportComplete",ok+","+quote(message));}
    private static String message(Exception e){return e.getMessage()==null?e.getClass().getSimpleName():e.getMessage();}
    private static String errorJson(Exception e){return "{\"error\":"+quote(message(e))+"}";}
    private static String quote(String value){return JSONObject.quote(value==null?"":value).replace("\u2028","\\u2028").replace("\u2029","\\u2029");}
    private void send(String function,String arguments){runOnUiThread(()->{if(!destroyed&&webView!=null)webView.evaluateJavascript("window."+function+" && window."+function+"("+arguments+");",null);});}
    private static void deleteTree(File file){if(file==null)return;File[] children=file.listFiles();if(children!=null)for(File child:children)deleteTree(child);file.delete();}
    private static void disposeWebView(WebView view){view.removeJavascriptInterface("AndroidBridge");if(view.getParent() instanceof ViewGroup)((ViewGroup)view.getParent()).removeView(view);view.destroy();}
    @Override protected void onPause(){if(webView!=null)webView.evaluateJavascript("window.saveDraft && window.saveDraft();",null);super.onPause();}
    @Override protected void onDestroy(){destroyed=true;if(worker!=null)worker.shutdownNow();if(webView!=null){disposeWebView(webView);webView=null;}super.onDestroy();}
}
