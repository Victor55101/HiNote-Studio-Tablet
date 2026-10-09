package com.hinote.studio;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.AtomicFile;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Toast;
import com.chaquo.python.android.AndroidPlatform;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    private static final int REQUEST_SAVE=501, REQUEST_IMAGE=502, REQUEST_FOLDER=503;
    private static final Object ENGINE_START_LOCK=new Object();
    private WebView webView;
    private KeyboardController keyboardController;
    private PyObject backend;
    private File sessionDir;
    private ThreadPoolExecutor worker;
    private volatile boolean destroyed;
    private volatile String startupError,latestSnapshot;
    private final AtomicInteger revision=new AtomicInteger(),pageRevision=new AtomicInteger();
    private final AtomicBoolean exporting=new AtomicBoolean();
    private volatile Future<?> composeJob,pageJob;
    private volatile ExportJob pendingExport;
    private ImageStore imageStore;
    private ExportFolder exportFolder;
    private final AtomicBoolean choosingFolder=new AtomicBoolean();
    private AtomicFile draftFile;
    private final AtomicBoolean importing=new AtomicBoolean();
    private int importTicket;
    private final Object draftLock=new Object();
    private CalibrationTasks calibrationTasks;
    private final AtomicBoolean calibrating=new AtomicBoolean(),calibrationCancelled=new AtomicBoolean();
    private volatile int calibrationTicket;
    private NotebookTasks notebookTasks;
    private NotesProbe notesProbe;
    private final AtomicBoolean notebookBusy=new AtomicBoolean(),notebookCancelled=new AtomicBoolean();
    private volatile int notebookTicket;

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        draftFile=new AtomicFile(new File(getFilesDir(),"draft-v23.json"));
        exportFolder=new ExportFolder(this);
        try {imageStore=new ImageStore(getFilesDir());} catch(IOException e){startupError=message(e);}
        getWindow().setStatusBarColor(Color.rgb(15,23,42)); getWindow().setNavigationBarColor(Color.rgb(15,23,42));
        sessionDir=new File(getCacheDir(),"hinote-session-"+UUID.randomUUID());
        worker=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8)){
            @Override protected void terminated(){deleteTree(sessionDir);}
        };
        calibrationTasks=new CalibrationTasks(this,getFilesDir(),sessionDir,new CalibrationTasks.Host(){
            public void result(int ticket,String data,String error){
                calibrating.set(false);
                send("onCalibrationResult",ticket+","+(data==null?"null":quote(data))+","+(error==null?"null":quote(error)));
            }
            public void status(int ticket,String text){send("onCalibrationProgress",ticket+","+quote(text));}
            public void ui(Runnable action){runOnUiThread(action);}
        });
        notebookTasks=new NotebookTasks(this,sessionDir,new NotebookTasks.Host(){
            public void current(JSONObject args,File output,TaskToken token)throws Exception{prepareCurrentNotebook(args,output,token);}
            public void result(int ticket,String data,String error){notebookBusy.set(false);send("onNotebookResult",ticket+","+(data==null?"null":quote(data))+","+(error==null?"null":quote(error)));}
            public void status(int ticket,String text){send("onNotebookProgress",ticket+","+quote(text));}
            public void ui(Runnable action){runOnUiThread(action);}
        });
        worker.execute(()->{
            try{
                File[] old=getCacheDir().listFiles();
                if(old!=null)for(File f:old)if(f.getName().startsWith("hinote-session-")&&!f.equals(sessionDir)&&System.currentTimeMillis()-f.lastModified()>86400000L)deleteTree(f);
                synchronized(ENGINE_START_LOCK){
                    copyEngineAsset("glyphs_v24.json");copyEngineAsset("template_1stroke.hinote");copyEngineAsset("paper_base3_source.jpg");
                    if(!Python.isStarted())Python.start(new AndroidPlatform(getApplicationContext()));
                }
                backend=Python.getInstance().getModule("mobile_backend");
            }catch(Exception e){startupError=message(e);}
        });
        webView=new WebView(this);WebSettings ws=webView.getSettings();
        keyboardController=new KeyboardController(this,webView);
        webView.setOnTouchListener((view,event)->{if(event.getActionMasked()==android.view.MotionEvent.ACTION_UP)view.postDelayed(()->{if(keyboardController!=null)keyboardController.hideIfNeeded();},80);return false;});
        ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setBuiltInZoomControls(false);
        webView.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){if(keyboardController!=null)keyboardController.publish();}
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return !url.startsWith("file:///android_asset/");}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if("https".equals(uri.getScheme()) && "hinote.local".equals(uri.getHost())){
                    try{
                        if(!"GET".equals(request.getMethod()) || !uri.getPath().matches("/images/[a-f0-9]{64}"))throw new IOException();
                        File source=imageStore.asset(uri.getLastPathSegment(),true);
                        return new WebResourceResponse(source.getName().endsWith(".png")?"image/png":"image/jpeg",null,new FileInputStream(source));
                    }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0]));}
                }
                if(!"file".equals(uri.getScheme()) && !"data".equals(uri.getScheme()))
                    return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                disposeWebView(view);webView=null;
                Toast.makeText(MainActivity.this,"Recuperando el editor desde el borrador…",Toast.LENGTH_LONG).show();recreate();return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());webView.addJavascriptInterface(new Bridge(),"AndroidBridge");
        setContentView(webView);
        if(BuildConfig.NOTES_PROBE){
            notesProbe=new NotesProbe(this,(ticket,data,error)->send("onNotesProbeResult",ticket+","+(data==null?"null":quote(data))+","+(error==null?"null":quote(error))));
            notesProbe.receive(getIntent());
        }
        webView.loadUrl("file:///android_asset/index.html");
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
        public void onProgress(int page){if(!isCancelled()){if(kind.equals("notebook"))send("onNotebookProgress",id+","+quote("Copiando página "+page+"…"));else send("onWorkProgress",quote(kind)+","+id+","+page);}}
    }
    private void removeQueued(Future<?> job){if(job!=null){job.cancel(false);if(job instanceof Runnable)worker.remove((Runnable)job);}}
    public final class Bridge{
        @JavascriptInterface public boolean isNotesProbe(){return BuildConfig.NOTES_PROBE;}
        @JavascriptInterface public boolean hasProbeShare(){return BuildConfig.NOTES_PROBE&&notesProbe!=null&&notesProbe.hasShared();}
        @JavascriptInterface public void requestProbeAction(String action,String raw,int ticket){
            if(!BuildConfig.NOTES_PROBE||notesProbe==null||destroyed)return;
            if(action==null||raw==null||raw.length()>(action.startsWith("page-")?16000000:12000)){
                send("onNotesProbeResult",ticket+",null,"+quote("Solicitud de prueba inválida"));return;
            }
            if(!action.startsWith("page-")){notesProbe.request(action,raw,ticket);return;}
            if(!(action.equals("page-png")||action.equals("page-hinote")||action.equals("page-share")||action.equals("page-redraw")||action.equals("page-bridge")||action.equals("page-sample-bridge"))
                    ||notebookBusy.get()||calibrating.get()||importing.get()||choosingFolder.get()||!exporting.compareAndSet(false,true)){
                send("onNotesProbeResult",ticket+",null,"+quote("Espera a que termine la operación actual"));return;
            }
            removeQueued(composeJob);removeQueued(pageJob);
            worker.execute(()->prepareProbePage(action,raw,ticket));
        }
        @JavascriptInterface public void requestNotebookImport(int ticket){
            if(!beginNotebook(ticket))return;
            runOnUiThread(()->{try{notebookTasks.beginImport(ticket);}catch(Exception e){notebookTasks.failed(ticket,e);}});
        }
        @JavascriptInterface public void requestNotebookAction(String action,String raw,int ticket){
            if(raw==null||raw.length()>("current".equals(action)?16000000:100000)){send("onNotebookResult",ticket+",null,"+quote("Selección de páginas demasiado grande"));return;}
            if(!beginNotebook(ticket))return;
            worker.execute(()->{try{ready();notebookTasks.run(action,raw,ticket,new TaskToken("notebook",ticket,notebookCancelled));}
                catch(OutOfMemoryError e){notebookTasks.failed(ticket,new IOException("No hay memoria suficiente para este cuaderno"));}
                catch(Exception e){notebookTasks.failed(ticket,e);}});
        }
        @JavascriptInterface public void cancelNotebook(){notebookCancelled.set(true);}
        @JavascriptInterface public void requestCalibration(String action,String raw,int ticket){
            if(!beginCalibration(raw,ticket))return;
            worker.execute(()->{
                try{ready();calibrationTasks.run(action,raw,ticket,new TaskToken("calibration",ticket,calibrationCancelled));}
                catch(OutOfMemoryError e){calibrationTasks.failed(ticket,new IOException("No hay memoria suficiente para esta calibración. Usa una plantilla más pequeña."));}
                catch(Exception e){calibrationTasks.failed(ticket,e);}
            });
        }
        @JavascriptInterface public void requestCalibrationImport(String raw,int ticket){
            if(!beginCalibration(raw,ticket))return;
            runOnUiThread(()->{try{calibrationTasks.beginImport(raw,ticket);}catch(Exception e){calibrationTasks.failed(ticket,e);}});
        }
        @JavascriptInterface public void cancelCalibration(){calibrationCancelled.set(true);}
        @JavascriptInterface public String getExportFolder(){return exportFolder.describe();}
        @JavascriptInterface public void requestExportFolder(){
            if(destroyed||notebookBusy.get()||calibrating.get()||exporting.get()||importing.get()||!choosingFolder.compareAndSet(false,true)){
                folderResult("Espera a que termine la operación actual");return;
            }
            runOnUiThread(()->{
                try{
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                    if(android.os.Build.VERSION.SDK_INT>=26&&exportFolder.selected()!=null)intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,exportFolder.selected());
                    startActivityForResult(intent,REQUEST_FOLDER);
                }catch(Exception e){choosingFolder.set(false);folderResult(message(e));}
            });
        }
        @JavascriptInterface public void clearExportFolder(){
            if(destroyed||notebookBusy.get()||calibrating.get()||exporting.get()||importing.get()||!choosingFolder.compareAndSet(false,true)){
                folderResult("Espera a que termine la operación actual");return;
            }
            worker.execute(()->{String error=null;try{exportFolder.clear();}catch(Exception e){error=message(e);}finally{choosingFolder.set(false);}folderResult(error);});
        }
        @JavascriptInterface public String getDraft(){
            synchronized(draftLock){
                try{byte[] bytes=draftFile.readFully();return bytes.length<=4_000_000?new String(bytes,java.nio.charset.StandardCharsets.UTF_8):"";}
                catch(IOException e){return "";}
            }
        }
        @JavascriptInterface public boolean saveDraft(String raw){
            if(raw==null||raw.length()>4_000_000)return false;
            synchronized(draftLock){
                FileOutputStream out=null;
                try{new JSONObject(raw);out=draftFile.startWrite();out.write(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));draftFile.finishWrite(out);return true;}
                catch(Exception e){if(out!=null)draftFile.failWrite(out);return false;}
            }
        }
        @JavascriptInterface public void requestImage(int ticket){
            if(destroyed||notebookBusy.get()||calibrating.get()||exporting.get()||choosingFolder.get()||!importing.compareAndSet(false,true))return;
            importTicket=ticket;
            runOnUiThread(()->{
                try{
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp"});
                    startActivityForResult(intent,REQUEST_IMAGE);
                }catch(Exception e){importing.set(false);send("onImageImported",ticket+",null,"+quote(message(e)));}
            });
        }
        @JavascriptInterface public void invalidateCompose(int id){revision.set(id);removeQueued(composeJob);pageRevision.incrementAndGet();removeQueued(pageJob);}
        @JavascriptInterface public void requestCompose(String doc,String settings,int id){
            if(destroyed||notebookBusy.get()||calibrating.get()||exporting.get())return;revision.set(id);removeQueued(composeJob);
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
            requestPageHD(snapshot,index,grid,id,1);
        }
        @JavascriptInterface public void requestPageHD(String snapshot,int index,boolean grid,int id,int resolution){
            if(destroyed||notebookBusy.get()||calibrating.get()||exporting.get())return;pageRevision.set(id);removeQueued(pageJob);
            TaskToken token=new TaskToken("page",id,new AtomicBoolean());
            pageJob=worker.submit(()->{
                try{
                    token.check();ready();
                    JSONObject info=new JSONObject(backend.callAttr("snapshot_info",sessionDir.getPath(),snapshot).toString());
                    File jpg;
                    try{jpg=thumbnail(snapshot,index,resolution>1?2:1,info,token);}
                    catch(OutOfMemoryError lowMemory){token.check();jpg=thumbnail(snapshot,index,1,info,token);}
                    token.check();
                    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    try(InputStream in=new FileInputStream(jpg)){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);}
                    String data="data:image/png;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);
                    send("onPageResult",id+","+quote(snapshot)+","+index+","+quote(data)+",null");
                }catch(OutOfMemoryError e){if(!token.isCancelled())send("onPageResult",id+","+quote(snapshot)+","+index+",null,"+quote("No hay memoria suficiente para mostrar esta página"));}
                catch(Exception e){if(!token.isCancelled())send("onPageResult",id+","+quote(snapshot)+","+index+",null,"+quote(message(e)));}
            });
        }
        @JavascriptInterface public String getKeyboardState(){return keyboardController==null?"{}":keyboardController.state();}
        @JavascriptInterface public void setKeyboardMode(String mode){runOnUiThread(()->{if(!destroyed&&keyboardController!=null)keyboardController.setMode(mode);});}
        @JavascriptInterface public void requestOpenNotes(String snapshot,String title,boolean grid,String images,int pages){
            if(destroyed||notebookBusy.get()||calibrating.get()||importing.get()||choosingFolder.get()||!exporting.compareAndSet(false,true))return;
            if(snapshot==null||!snapshot.equals(latestSnapshot)){finishExport(false,"Actualiza la vista antes de exportar");return;}
            if(pages<1||pages>500||images==null||images.length()>300000){finishExport(false,"Demasiadas páginas o imágenes");return;}
            ExportJob job=new ExportJob(snapshot,title,images,pages,null);pendingExport=job;startNotesExport(job);
        }
        @JavascriptInterface public void requestSave(String snapshot,String title,boolean grid,String images,int pages){
            if(destroyed||notebookBusy.get()||calibrating.get()||importing.get()||choosingFolder.get()||!exporting.compareAndSet(false,true))return;
            if(!snapshot.equals(latestSnapshot)){finishExport(false,"Actualiza la vista antes de guardar");return;}
            if(pages<1||pages>500||images==null||images.length()>300000){finishExport(false,"Demasiadas páginas o imágenes");return;}
            ExportJob job=new ExportJob(snapshot,title,images,pages,exportFolder.selected());pendingExport=job;
            if(job.folder!=null){startExport(job,null);return;}
            runOnUiThread(()->{
                if(destroyed)return;
                try{
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/octet-stream");
                    intent.putExtra(Intent.EXTRA_TITLE,ExportFolder.fileName(job.title));startActivityForResult(intent,REQUEST_SAVE);
                }catch(Exception e){finishExport(false,message(e));}
            });
        }
        @JavascriptInterface public void cancelExport(){ExportJob job=pendingExport;if(job!=null)job.cancelled.set(true);}
    }
    private boolean beginCalibration(String raw,int ticket){
        if(raw==null||raw.length()>12000||destroyed||notebookBusy.get()||exporting.get()||importing.get()||choosingFolder.get()||!calibrating.compareAndSet(false,true)){
            send("onCalibrationResult",ticket+",null,"+quote("Espera a que termine la operación actual"));return false;
        }
        calibrationTicket=ticket;calibrationCancelled.set(false);
        revision.incrementAndGet();pageRevision.incrementAndGet();removeQueued(composeJob);removeQueued(pageJob);
        return true;
    }
    private boolean beginNotebook(int ticket){
        if(destroyed||exporting.get()||importing.get()||choosingFolder.get()||calibrating.get()||!notebookBusy.compareAndSet(false,true)){
            send("onNotebookResult",ticket+",null,"+quote("Espera a que termine la operación actual"));return false;
        }
        notebookTicket=ticket;notebookCancelled.set(false);revision.incrementAndGet();pageRevision.incrementAndGet();removeQueued(composeJob);removeQueued(pageJob);return true;
    }
    private static final class ExportJob{
        final String snapshot,title,images;final int pages;final Uri folder;final AtomicBoolean cancelled=new AtomicBoolean();
        ExportJob(String snapshot,String title,String images,int pages,Uri folder){this.snapshot=snapshot;this.folder=folder;this.images=images;this.pages=pages;String clean=title==null?"":title.trim();this.title=clean.isEmpty()?"Nueva nota":clean.substring(0,Math.min(128,clean.length()));}
    }
    private File thumbnail(String snapshot,int index,int resolution,JSONObject info,TaskToken token)throws Exception{
        if(index<0||index>=info.getInt("page_count"))throw new IOException("Página fuera de rango");
        File directory=new File(sessionDir,snapshot);
        File file=new File(directory,"page-"+index+(resolution>1?"-ink-hd.png":"-ink.png"));
        if(!file.isFile()){
            String json=backend.callAttr("page_preview",sessionDir.getPath(),snapshot,index).toString();
            PageRenderer.renderPreview(json,file,resolution,token::check);
        }
        // Keep only the current high-resolution page on disk, not an HD notebook.
        File[] cached=directory.listFiles();
        if(cached!=null)for(File old:cached)if(old.getName().endsWith("-ink-hd.png")&&!old.equals(file))old.delete();
        return file;
    }
    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);
        if(notesProbe!=null&&notesProbe.activityResult(code,result,data))return;
        if(code==NotebookTasks.IMPORT||code==NotebookTasks.SAVE){
            if(!notebookBusy.get())return;
            if(result!=RESULT_OK||data==null){notebookTasks.cancelled();return;}
            java.util.List<Uri> selected=new java.util.ArrayList<>();
            if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount()&&i<9;i++)selected.add(data.getClipData().getItemAt(i).getUri());}
            else if(data.getData()!=null)selected.add(data.getData());
            if(selected.isEmpty()){notebookTasks.cancelled();return;}
            worker.execute(()->{try{ready();TaskToken token=new TaskToken("notebook",notebookTicket,notebookCancelled);if(code==NotebookTasks.IMPORT)notebookTasks.imported(selected,token);else notebookTasks.saved(selected.get(0),token);}
                catch(OutOfMemoryError e){notebookTasks.failed(new IOException("No hay memoria suficiente para este cuaderno"));}
                catch(Exception e){notebookTasks.failed(e);}});return;
        }
        if(code==CalibrationTasks.IMPORT||code==CalibrationTasks.SAVE){
            if(!calibrating.get())return;
            if(result!=RESULT_OK||data==null||data.getData()==null){calibrationTasks.cancelled();return;}
            final Uri selected=data.getData();
            worker.execute(()->{
                try{ready();TaskToken token=new TaskToken("calibration",calibrationTicket,calibrationCancelled);
                    if(code==CalibrationTasks.IMPORT)calibrationTasks.imported(selected,token);else calibrationTasks.saved(selected,token);
                }catch(OutOfMemoryError e){calibrationTasks.failed(new IOException("No hay memoria suficiente para esta calibración"));}
                catch(Exception e){calibrationTasks.failed(e);}
            });return;
        }
        if(code==REQUEST_FOLDER){
            if(result!=RESULT_OK||data==null||data.getData()==null){choosingFolder.set(false);folderResult(null);return;}
            final Uri tree=data.getData();final int flags=data.getFlags();
            worker.execute(()->{String error=null;try{exportFolder.remember(tree,flags);}catch(Exception e){error=message(e);}finally{choosingFolder.set(false);}folderResult(error);});
            return;
        }
        if(code==REQUEST_IMAGE){
            final int ticket=importTicket;
            if(result!=RESULT_OK||data==null||data.getData()==null){importing.set(false);send("onImageImported",ticket+",null,null");return;}
            final Uri source=data.getData();
            worker.execute(()->{
                try{ready();JSONObject image=imageStore.importImage(getContentResolver(),source);send("onImageImported",ticket+","+quote(image.toString())+",null");}
                catch(OutOfMemoryError e){send("onImageImported",ticket+",null,"+quote("No hay memoria suficiente. Prueba una imagen más pequeña."));}
                catch(Exception e){send("onImageImported",ticket+",null,"+quote(message(e)));}
                finally{importing.set(false);}
            });
            return;
        }
        if(code!=REQUEST_SAVE)return;
        ExportJob job=pendingExport;
        if(result!=RESULT_OK||data==null||data.getData()==null||job==null){finishExport(false,"Guardado cancelado");return;}
        startExport(job,data.getData());
    }
    private void folderResult(String error){send("onExportFolder",quote(exportFolder.describe())+","+(error==null?"null":quote(error)));}
    private void prepareCurrentNotebook(JSONObject args,File output,TaskToken token)throws Exception{
        File work=new File(sessionDir,"export-"+UUID.randomUUID().toString().replace("-",""));String snapshot=null;
        try{
            JSONObject info=new JSONObject(backend.callAttr("compose",getFilesDir().getPath(),sessionDir.getPath(),args.getJSONObject("document").toString(),args.getJSONObject("settings").toString(),token).toString());
            snapshot=info.getString("snapshot");token.check();
            int pages=Math.max(info.getInt("page_count"),args.optInt("pages",1));JSONArray currentImages=args.getJSONArray("images");
            for(int i=0;i<currentImages.length();i++)pages=Math.max(pages,currentImages.getJSONObject(i).getInt("page")+1);
            if(pages<1||pages>500)throw new IOException("Máximo 500 páginas");
            prepareNativeNote(snapshot,args.optString("title","Documento abierto"),currentImages.toString(),pages,output,work,token);
        }finally{deleteTree(work);if(snapshot!=null)backend.callAttr("remove_snapshot",sessionDir.getPath(),snapshot);}
    }
    private void prepareNativeNote(String snapshot,String title,String rawImages,int pages,File output,File work,TaskToken token)throws Exception{
        JSONObject info=new JSONObject(backend.callAttr("snapshot_info",sessionDir.getPath(),snapshot).toString());
        if(!work.mkdirs())throw new IOException("No se pudo preparar la exportación");
        int count=Math.max(pages,info.getInt("page_count"));
        JSONArray images=imageStore.prepareExport(rawImages,work,count,token::check);
        for(int i=0;i<count;i++){
            token.check();if(work.getUsableSpace()<20L*1024*1024)throw new IOException("No queda suficiente espacio para exportar");
            JSONArray pageImages=new JSONArray();
            for(int j=0;j<images.length();j++)if(images.getJSONObject(j).getInt("page")==i)pageImages.put(images.getJSONObject(j));
            String json=i<info.getInt("page_count")?backend.callAttr("page_preview",sessionDir.getPath(),snapshot,i).toString():"{\"strokes\":[]}";
            PageRenderer.renderForExport(json,new File(work,"page-"+i+"-native.jpg"),pageImages,new File(getFilesDir(),"paper_base3_source.jpg"),token::check);
            token.onProgress(i+1);
        }
        token.check();backend.callAttr("export_snapshot",getFilesDir().getPath(),sessionDir.getPath(),snapshot,title,true,output.getPath(),token,images.toString(),count,work.getPath());
    }
    private void prepareProbePage(String action,String raw,int ticket){
        File work=new File(sessionDir,"export-probe-"+UUID.randomUUID().toString().replace("-",""));
        File output=null;String snapshot=null;TaskToken token=new TaskToken("probe",ticket,new AtomicBoolean());
        try{
            token.check();ready();JSONObject args=new JSONObject(raw);
            if("page-sample-bridge".equals(action)){
                if(!work.mkdirs())throw new IOException("No se pudo preparar el temporal");
                output=ProbeFileProvider.create(this,"hinote");
                PageRenderer.renderForExport(TransferInk.SAMPLE,new File(work,"page-0-native.jpg"),new JSONArray(),new File(getFilesDir(),"paper_base3_source.jpg"),token::check);
                backend.callAttr("export_transfer_sample",getFilesDir().getPath(),sessionDir.getPath(),TransferInk.SAMPLE,output.getPath(),work.getPath(),token);
                token.check();notesProbe.openBridge(output,ticket);output=null;return;
            }
            JSONObject info=new JSONObject(backend.callAttr("compose",getFilesDir().getPath(),sessionDir.getPath(),args.getJSONObject("document").toString(),args.getJSONObject("settings").toString(),token).toString());
            snapshot=info.getString("snapshot");token.check();
            JSONArray all=args.getJSONArray("images");int count=Math.max(info.getInt("page_count"),args.optInt("pages",1));
            for(int i=0;i<all.length();i++)count=Math.max(count,all.getJSONObject(i).getInt("page")+1);
            int page=args.getInt("page");if(count<1||count>500||page<0||page>=count)throw new IOException("Página fuera de rango");
            String json=page<info.getInt("page_count")?backend.callAttr("page_preview",sessionDir.getPath(),snapshot,page).toString():"{\"strokes\":[]}";
            if("page-redraw".equals(action)){
                for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getInt("page")==page)throw new IOException("Esta página contiene imágenes. Para esta prueba usa una página solo con trazos, fórmulas o gráficas.");
                TransferInk ink=TransferInk.parse(json);token.check();notesProbe.startRedraw(ink,ticket);return;
            }
            if("page-bridge".equals(action))for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getInt("page")==page)throw new IOException("El modo de trazos necesita una página sin imágenes. Elige otra página.");
            if("page-bridge".equals(action)&&new JSONObject(json).getJSONArray("strokes").length()==0)throw new IOException("Esta página no tiene trazos para copiar");
            if(!work.mkdirs())throw new IOException("No se pudo preparar la página de prueba");
            JSONArray selected=new JSONArray();
            for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getInt("page")==page){JSONObject image=new JSONObject(all.getJSONObject(i).toString());image.put("page",0);selected.put(image);}
            JSONArray images=imageStore.prepareExport(selected.toString(),work,1,token::check);
            output=ProbeFileProvider.create(this,"page-png".equals(action)?"png":"hinote");
            if("page-png".equals(action))PageRenderer.render(json,output,args.optBoolean("grid",true),40.0/.675,images,false,token::check);
            else{
                PageRenderer.renderForExport(json,new File(work,"page-0-native.jpg"),images,new File(getFilesDir(),"paper_base3_source.jpg"),token::check);
                backend.callAttr("export_probe_page",getFilesDir().getPath(),sessionDir.getPath(),snapshot,page,args.optString("title","Prueba")+" · Página "+(page+1),output.getPath(),token,images.toString(),count,work.getPath());
            }
            token.check();if("page-bridge".equals(action))notesProbe.openBridge(output,ticket);else notesProbe.publishPage(action,output,page,ticket);output=null;
        }catch(OutOfMemoryError error){send("onNotesProbeResult",ticket+",null,"+quote("No hay memoria suficiente para esta página"));}
        catch(Exception error){send("onNotesProbeResult",ticket+",null,"+quote(message(error)));}
        finally{if(output!=null)output.delete();deleteTree(work);if(snapshot!=null)backend.callAttr("remove_snapshot",sessionDir.getPath(),snapshot);exporting.set(false);}
    }
    private void startNotesExport(ExportJob job){
        worker.execute(()->{
            File output=null;File work=new File(sessionDir,"notes-export-"+UUID.randomUUID());TaskToken token=new TaskToken("export",0,job.cancelled);
            try{
                token.check();ready();output=NotesFileProvider.create(this,"hinote");
                send("onExportStage",quote("Preparando cuaderno para Huawei Notes…"));
                prepareNativeNote(job.snapshot,job.title,job.images,job.pages,output,work,token);token.check();
                final File shared=output;Uri uri=NotesFileProvider.uri(this,shared);
                runOnUiThread(()->{
                    try{token.check();NotesExport.open(this,uri);finishExport(true,"Cuaderno enviado a Huawei Notes. Completa la importación allí.");}
                    catch(Exception error){shared.delete();finishExport(false,token.isCancelled()?"Exportación cancelada":"No se pudo abrir Huawei Notes. Puedes usar Guardar .hinote.");}
                });output=null; // Keep the granted file after the activity leaves.
            }catch(Exception error){finishExport(false,token.isCancelled()?"Exportación cancelada":message(error));}
            catch(OutOfMemoryError error){finishExport(false,"No hay memoria suficiente para exportar este cuaderno.");}
            finally{if(output!=null)output.delete();deleteTree(work);}
        });
    }
    private void startExport(ExportJob job,Uri pickedDestination){
        worker.execute(()->{
            Uri uri=pickedDestination;
            File output=new File(sessionDir,"export-"+UUID.randomUUID()+".hinote");TaskToken token=new TaskToken("export",0,job.cancelled);
            File work=new File(sessionDir,"export-"+UUID.randomUUID().toString().replace("-",""));
            try{
                token.check();ready();
                if(job.folder!=null)exportFolder.validate(job.folder);
                send("onExportStage",quote("Preparando imágenes y recortes…"));
                prepareNativeNote(job.snapshot,job.title,job.images,job.pages,output,work,token);
                send("onExportStage",quote("Escribiendo el archivo…"));
                if(job.folder!=null)uri=exportFolder.create(job.folder,job.title,token::check);
                token.check();
                try(InputStream in=new FileInputStream(output);OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
                    if(out==null)throw new IOException("No se pudo abrir el destino");
                    byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){token.check();out.write(buffer,0,n);}out.flush();
                }
                token.check();finishExport(true,"Guardado: "+exportFolder.displayName(uri,ExportFolder.fileName(job.title)));
            }catch(OutOfMemoryError e){
                try{DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}
                finishExport(false,"No hay memoria suficiente para esta imagen. Reduce su tamaño.");
            }catch(Exception e){
                try{DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}
                finishExport(false,token.isCancelled()?"Guardado cancelado":message(e));
            }finally{output.delete();deleteTree(work);}
        });
    }
    private void finishExport(boolean ok,String message){pendingExport=null;exporting.set(false);send("onExportComplete",ok+","+quote(message));}
    private static String message(Exception e){return e.getMessage()==null?e.getClass().getSimpleName():e.getMessage();}
    private static String errorJson(Exception e){return "{\"error\":"+quote(message(e))+"}";}
    private static String quote(String value){return JSONObject.quote(value==null?"":value).replace("\u2028","\\u2028").replace("\u2029","\\u2029");}
    private void send(String function,String arguments){runOnUiThread(()->{if(!destroyed&&webView!=null)webView.evaluateJavascript("window."+function+" && window."+function+"("+arguments+");",null);});}
    private static void deleteTree(File file){if(file==null)return;File[] children=file.listFiles();if(children!=null)for(File child:children)deleteTree(child);file.delete();}
    private static void disposeWebView(WebView view){view.removeJavascriptInterface("AndroidBridge");if(view.getParent() instanceof ViewGroup)((ViewGroup)view.getParent()).removeView(view);view.destroy();}
    @Override protected void onResume(){super.onResume();if(keyboardController!=null)keyboardController.start();}
    @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus&&keyboardController!=null)keyboardController.refresh();}
    @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);if(keyboardController!=null)keyboardController.refresh();}
    @Override public boolean dispatchKeyEvent(android.view.KeyEvent event){if(keyboardController!=null)keyboardController.observe(event);return super.dispatchKeyEvent(event);}
    @Override protected void onPause(){if(keyboardController!=null)keyboardController.stop();if(webView!=null)webView.evaluateJavascript("window.saveDraft && window.saveDraft();",null);super.onPause();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(notesProbe!=null){notesProbe.receive(intent);send("onNotesProbeShared","");}}
    @Override protected void onDestroy(){destroyed=true;if(keyboardController!=null)keyboardController.stop();if(notesProbe!=null)notesProbe.close();if(worker!=null)worker.shutdownNow();if(webView!=null){disposeWebView(webView);webView=null;}super.onDestroy();}
}
