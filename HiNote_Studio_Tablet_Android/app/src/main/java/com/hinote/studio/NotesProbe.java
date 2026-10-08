package com.hinote.studio;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ComponentInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground, user-initiated inspection of public clipboard and shared streams. */
final class NotesProbe {
    static final int SAVE_REPORT = 3101, SAVE_TEMPORARY=3102, MAX_STREAM = 2 * 1024 * 1024;
    interface Host { void result(int ticket, String data, String error); }
    private final Activity activity;
    private final Host host;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {Thread thread=new Thread(r,"notes-probe");thread.setDaemon(true);return thread;});
    private final AtomicFile reportFile;
    private volatile Intent received;
    private volatile boolean closed;
    private JSONObject report;
    private byte[] pendingReport;
    private int reportTicket;
    private File pendingTemporary;
    private int temporaryTicket;

    NotesProbe(Activity activity, Host host) {
        this.activity=activity; this.host=host;reportFile=new AtomicFile(new File(activity.getFilesDir(),"notes-probe-report.json"));
        try(InputStream in=reportFile.openRead()) { report=new JSONObject(new String(readBounded(in,512000),StandardCharsets.UTF_8)); }
        catch(Exception ignored) { report=new JSONObject(); }
    }
    static boolean shared(Intent intent) {
        return intent!=null && (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()));
    }
    void receive(Intent intent) { if(shared(intent)) received=new Intent(intent); }
    boolean hasShared() { return received!=null; }
    private ClipboardManager clipboard() { return (ClipboardManager)activity.getSystemService(Activity.CLIPBOARD_SERVICE); }
    static String sha(byte[] bytes) throws Exception {
        StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))result.append(String.format("%02x",b&255));return result.toString();
    }
    static String shortText(String value) { return value==null?"":value.substring(0,Math.min(256,value.length())); }
    static JSONObject describeClip(ClipData clip) throws Exception {
        JSONObject result=new JSONObject();JSONArray items=new JSONArray(),mimes=new JSONArray();
        result.put("present",clip!=null);
        if(clip!=null) {
            for(int i=0;i<clip.getDescription().getMimeTypeCount() && i<16;i++)mimes.put(shortText(clip.getDescription().getMimeType(i)));
            result.put("item_count",clip.getItemCount());
            for(int i=0;i<clip.getItemCount() && i<16;i++) {
                ClipData.Item item=clip.getItemAt(i);JSONObject data=new JSONObject();CharSequence text=item.getText();
                if(text!=null) {String value=text.subSequence(0,Math.min(65536,text.length())).toString();data.put("text_length",text.length()).put("text_sha256",sha(value.getBytes(StandardCharsets.UTF_8))).put("text_truncated",text.length()>65536);
                    if("PRUEBA-A".equals(value)||"PRUEBA-B".equals(value))data.put("control_text",value);}
                if(item.getHtmlText()!=null) {String value=item.getHtmlText();data.put("html_length",value.length()).put("html_sha256",sha(value.substring(0,Math.min(65536,value.length())).getBytes(StandardCharsets.UTF_8)));}
                if(item.getUri()!=null) data.put("uri_scheme",shortText(item.getUri().getScheme())).put("uri_authority",shortText(item.getUri().getAuthority())).put("uri_sha256",sha(item.getUri().toString().getBytes(StandardCharsets.UTF_8)));
                if(item.getIntent()!=null) data.put("intent",describeIntent(item.getIntent()));
                items.put(data);
            }
        }
        result.put("mime_types",mimes).put("items",items).put("items_truncated",clip!=null&&clip.getItemCount()>16);
        result.put("fingerprint",sha(result.toString().getBytes(StandardCharsets.UTF_8)));return result;
    }
    static JSONObject describeIntent(Intent intent) throws Exception {
        JSONObject data=new JSONObject().put("action",shortText(intent.getAction())).put("type",shortText(intent.getType()));
        if(intent.getData()!=null)data.put("data_sha256",sha(intent.getData().toString().getBytes(StandardCharsets.UTF_8)));
        JSONArray keys=new JSONArray();Bundle extras=intent.getExtras();
        if(extras!=null) {List<String> sorted=new ArrayList<>(extras.keySet());java.util.Collections.sort(sorted);for(int i=0;i<sorted.size()&&i<40;i++)keys.put(shortText(sorted.get(i)));}
        return data.put("extra_keys",keys);
    }
    static byte[] readBounded(InputStream in,int limit) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
        while((n=in.read(buffer,0,Math.min(buffer.length,limit+1-out.size())))!=-1) {
            if(Thread.currentThread().isInterrupted())throw new IOException("Prueba cancelada");out.write(buffer,0,n);
            if(out.size()>limit)throw new IOException("El contenido supera el límite de inspección ("+limit+" bytes)");
        }
        return out.toByteArray();
    }
    static String signature(byte[] bytes) {
        if(bytes.length>=8&&bytes[0]==(byte)137&&bytes[1]==80&&bytes[2]==78&&bytes[3]==71)return "PNG (imagen)";
        if(bytes.length>=3&&bytes[0]==(byte)255&&bytes[1]==(byte)216&&bytes[2]==(byte)255)return "JPEG (imagen)";
        if(bytes.length>=4&&bytes[0]==80&&bytes[1]==75&&bytes[2]==3&&bytes[3]==4)return "ZIP (requiere revisar el formato; no demuestra tinta editable)";
        if(bytes.length>=5&&new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-"))return "PDF";
        return "Formato no identificado; no se interpreta como trazos";
    }
    private JSONObject inspectUri(Uri uri) throws Exception {
        JSONObject info=new JSONObject().put("scheme",shortText(uri.getScheme())).put("authority",shortText(uri.getAuthority()));
        if(!"content".equals(uri.getScheme()))return info.put("status","Solo se inspeccionan URI content con permisos públicos");
        try {
            info.put("mime",shortText(activity.getContentResolver().getType(uri)));
            try(InputStream in=activity.getContentResolver().openInputStream(uri)) {
                if(in==null)throw new IOException("El proveedor no abrió el contenido");byte[] bytes=readBounded(in,MAX_STREAM);
                info.put("bytes",bytes.length).put("sha256",sha(bytes)).put("signature",signature(bytes)).put("status","Lectura pública permitida");
            }
        } catch(Exception error) {info.put("status",shortText(error.getClass().getSimpleName()+": "+error.getMessage()));}
        return info;
    }
    private JSONObject device() throws Exception {
        JSONObject device=new JSONObject().put("manufacturer",Build.MANUFACTURER).put("model",Build.MODEL).put("release",Build.VERSION.RELEASE).put("sdk",Build.VERSION.SDK_INT);
        try {
            PackageInfo notes=activity.getPackageManager().getPackageInfo("com.huawei.hinote",PackageManager.GET_ACTIVITIES|PackageManager.GET_PROVIDERS|PackageManager.GET_SERVICES|PackageManager.GET_RECEIVERS);
            JSONObject info=new JSONObject().put("package",notes.packageName).put("version",notes.versionName);JSONArray components=new JSONArray();
            components(components,"activity",notes.activities);components(components,"provider",notes.providers);components(components,"service",notes.services);components(components,"receiver",notes.receivers);
            info.put("exported_components",components).put("interpretation","Un componente exportado no garantiza que acepte trazos; se necesita un contrato y permisos compatibles.");device.put("notes",info);
        } catch(PackageManager.NameNotFoundException error) {device.put("notes_status","No visible o no instalado como com.huawei.hinote");}
        return device;
    }
    private static void components(JSONArray list,String type,ComponentInfo[] items)throws Exception {
        if(items==null)return;for(ComponentInfo info:items)if(info.exported&&list.length()<120) {
            JSONObject item=new JSONObject().put("kind",type).put("name",info.name).put("enabled",info.enabled);
            if(info instanceof ProviderInfo) {ProviderInfo provider=(ProviderInfo)info;item.put("authority",provider.authority).put("read_permission",provider.readPermission==null?"":provider.readPermission).put("write_permission",provider.writePermission==null?"":provider.writePermission);}
            else if(info instanceof android.content.pm.ActivityInfo)item.put("permission",((android.content.pm.ActivityInfo)info).permission);
            else if(info instanceof android.content.pm.ServiceInfo)item.put("permission",((android.content.pm.ServiceInfo)info).permission);
            list.put(item);
        }
    }
    private synchronized JSONObject record(String kind,JSONObject value) throws Exception {
        report.put("app","HiNote Studio V"+BuildConfig.VERSION_CODE+" Pruebas").put("device",device()).put("manual_baseline","PRUEBA-A permaneció en Chrome después de copiar tres rayas con el lazo. Notes pudo pegarlas aunque después se copió PRUEBA-B en Chrome.")
            .put("transfer_tests",TransferJournal.read(activity)).put("transfer_service_connected",NotesTransferService.available());
        JSONArray events=report.optJSONArray("events");if(events==null)events=new JSONArray();
        JSONArray keep=new JSONArray();for(int i=Math.max(0,events.length()-23);i<events.length();i++)keep.put(events.get(i));
        keep.put(new JSONObject().put("time_ms",System.currentTimeMillis()).put("kind",kind).put("data",value));report.put("events",keep);
        FileOutputStream out=null;try {out=reportFile.startWrite();out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));reportFile.finishWrite(out);}
        catch(Exception error) {if(out!=null)reportFile.failWrite(out);throw error;}return new JSONObject(report.toString());
    }
    private void reply(int ticket,JSONObject result,String error) { if(!closed)host.result(ticket,result==null?null:result.toString(),error); }
    void request(String action,String raw,int ticket) {
        activity.runOnUiThread(()->{
            if(closed)return;
            try {
                if("save-report".equals(action)) {saveReport(raw,ticket);return;}
                if("transfer-settings".equals(action)){
                    activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                    transferReply(ticket,"Activa «HiNote · Pruebas de trazos», vuelve aquí y pulsa la prueba. Activar el servicio por sí solo no dibuja nada.");return;
                }
                if("transfer-stop".equals(action)){NotesTransferService.stopFromApp();transferReply(ticket,"Prueba detenida. El último gesto iniciado puede terminar.");return;}
                if("transfer-sample-redraw".equals(action)){startRedraw(TransferInk.parse(TransferInk.SAMPLE),ticket);return;}
                if("transfer-resume".equals(action)){
                    try{NotesTransferService.arm("bridge",null);launchNotes();transferReply(ticket,"Abre el cuaderno temporal, activa el lazo de Notes y usa el panel flotante.");}
                    catch(Exception error){NotesTransferService.stopFromApp();throw error;}return;
                }
                if("transfer-save".equals(action)){saveTemporary(ticket);return;}
                if("seed-a".equals(action)||"seed-b".equals(action)) {
                    String text="seed-a".equals(action)?"PRUEBA-A":"PRUEBA-B";ClipData clip=ClipData.newPlainText("Control HiNote",text);clipboard().setPrimaryClip(clip);
                    JSONObject descriptor=describeClip(clip);activity.getSharedPreferences("notes-probe",0).edit().putString("baseline",descriptor.getString("fingerprint")).apply();
                    worker.execute(()->{try {reply(ticket,new JSONObject().put("report",record(action,descriptor)).put("message",text+" copiado. Ve a Notes, copia tres rayas con el lazo y vuelve a Examinar copiado."),null);}catch(Exception error){reply(ticket,null,error.getMessage());}});return;
                }
                if("inspect".equals(action)) {
                    if(!activity.hasWindowFocus())throw new IOException("Vuelve a HiNote Pruebas y pulsa Examinar copiado con la app visible");
                    final ClipData clip=clipboard().getPrimaryClip();final String baseline=activity.getSharedPreferences("notes-probe",0).getString("baseline","");
                    worker.execute(()->{
                        try {JSONObject data=describeClip(clip);JSONArray streams=new JSONArray();
                            if(clip!=null)for(int i=0;i<clip.getItemCount()&&i<16;i++)if(clip.getItemAt(i).getUri()!=null)streams.put(inspectUri(clip.getItemAt(i).getUri()));
                            data.put("streams",streams);boolean same=!baseline.isEmpty()&&baseline.equals(data.getString("fingerprint"));
                            data.put("same_public_descriptor_as_control",same).put("interpretation",same?"El portapapeles público conserva el control. Es compatible con un copiado interno de Notes; no demuestra que no exista otra API pública.":"El descriptor público cambió o falta el control. Revisa MIME y URI; un cambio no garantiza tinta editable.");
                            reply(ticket,new JSONObject().put("report",record(action,data)).put("message",data.getString("interpretation")),null);
                        }catch(Exception error){reply(ticket,null,error.getMessage());}
                    });return;
                }
                if("inspect-share".equals(action)) {
                    final Intent intent=received;if(intent==null)throw new IOException("En Notes selecciona las rayas con el lazo, pulsa Compartir y elige HiNote Studio Pruebas");
                    worker.execute(()->{try {
                        JSONObject data=describeIntent(intent);List<Uri> uris=new ArrayList<>();
                        if(Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {ArrayList<Uri> many=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(many!=null)for(Uri uri:many)if(uris.size()<16&&uri!=null)uris.add(uri);}
                        else {Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(uri!=null)uris.add(uri);}
                        if(intent.getClipData()!=null)for(int i=0;i<intent.getClipData().getItemCount()&&uris.size()<16;i++){Uri uri=intent.getClipData().getItemAt(i).getUri();if(uri!=null&&!uris.contains(uri))uris.add(uri);}
                        JSONArray streams=new JSONArray();for(Uri uri:uris)streams.put(inspectUri(uri));data.put("streams",streams).put("interpretation","Compartir y copiar con el lazo son rutas distintas. PNG/JPEG solo permiten transferir una imagen, no sus trazos editables.");
                        reply(ticket,new JSONObject().put("report",record(action,data)).put("message","Contenido compartido examinado. Revisa MIME y firma en el informe."),null);
                    }catch(Exception error){reply(ticket,null,error.getMessage());}});return;
                }
                if("observations".equals(action)) {JSONObject values=new JSONObject(raw);worker.execute(()->{try{reply(ticket,new JSONObject().put("report",record(action,values)).put("message","Resultado registrado en el informe."),null);}catch(Exception error){reply(ticket,null,error.getMessage());}});return;}
                if("report".equals(action)) {transferReply(ticket,NotesTransferService.available()?"Accesibilidad conectada. Elige una prueba; después marca la zona e inicia desde el panel flotante de Notes.":"Primero activa el servicio con el botón Accesibilidad. Los dos modos son experimentales; su compatibilidad se verifica en tu tablet.");return;}
                throw new IOException("Prueba desconocida");
            }catch(Exception error){reply(ticket,null,error.getMessage());}
        });
    }
    private void transferReply(int ticket,String message){
        worker.execute(()->{try{reply(ticket,new JSONObject().put("report",record("transfer_status",new JSONObject())).put("message",message),null);}catch(Exception error){reply(ticket,null,error.getMessage());}});
    }
    private void launchNotes() throws IOException {
        Intent launch=activity.getPackageManager().getLaunchIntentForPackage(NotesTransferService.NOTES);
        if(launch==null)throw new IOException("No se encontró Huawei Notes (com.huawei.hinote) en la tablet");activity.startActivity(launch);
    }
    void startRedraw(TransferInk ink,int ticket){
        activity.runOnUiThread(()->{if(closed)return;try{
            NotesTransferService.arm("redraw",ink);launchNotes();
            transferReply(ticket,"Prueba preparada con "+ink.strokes.size()+" trazos. En Notes activa escritura con dedo y lápiz, marca la zona vacía y pulsa Dibujar.");
        }catch(Exception error){NotesTransferService.stopFromApp();reply(ticket,null,error.getMessage());}});
    }
    static Intent temporaryIntent(Uri uri,boolean send){
        Intent intent=send?new Intent(Intent.ACTION_SEND).setType("application/octet-stream").putExtra(Intent.EXTRA_STREAM,uri):new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/octet-stream");
        intent.setPackage(NotesTransferService.NOTES).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("HiNote temporal de trazos",uri));return intent;
    }
    void openBridge(File file,int ticket){
        activity.runOnUiThread(()->{if(closed)return;try{
            Uri uri=ProbeFileProvider.uri(activity,file);
            activity.getSharedPreferences("notes-probe",0).edit().putString("last_temporary",uri.toString()).apply();
            TransferJournal.event(activity,"bridge","native_notebook_created",0,1,"Archivo .hinote de una página; no es una imagen ni un portapapeles privado simulado");
            if(!NotesTransferService.available()){transferReply(ticket,"Temporal listo. Activa Accesibilidad; después usa Guardar temporal para importarlo en Notes y Continuar con el lazo.");return;}
            Intent intent=temporaryIntent(uri,false);
            if(intent.resolveActivity(activity.getPackageManager())==null)intent=temporaryIntent(uri,true);
            if(intent.resolveActivity(activity.getPackageManager())==null){transferReply(ticket,"Notes no anunció una apertura directa compatible. Pulsa Guardar temporal, impórtalo con Notes y después Continuar con el lazo.");return;}
            NotesTransferService.arm("bridge",null);activity.startActivity(intent);
            TransferJournal.event(activity,"bridge","public_open_requested",0,1,intent.getAction());
            transferReply(ticket,"Completa la importación en Notes y abre el temporal. Activa su lazo; marca la zona y pulsa Trazar lazo. Si no se abrió, vuelve y usa Guardar temporal.");
        }catch(Exception error){NotesTransferService.stopFromApp();reply(ticket,null,"No se pudo abrir automáticamente: "+error.getMessage()+". Usa Guardar temporal y Continuar con el lazo.");}});
    }
    private void saveTemporary(int ticket)throws Exception{
        String uri=activity.getSharedPreferences("notes-probe",0).getString("last_temporary","");
        if(uri.isEmpty())throw new IOException("Primero prepara las tres rayas o la página actual del modo 2");
        pendingTemporary=ProbeFileProvider.resolve(activity,Uri.parse(uri));temporaryTicket=ticket;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,"HiNote-Temporal-Trazos.hinote");
        activity.startActivityForResult(intent,SAVE_TEMPORARY);
    }
    void publishPage(String action,File file,int page,int ticket) {
        activity.runOnUiThread(()->{if(closed)return;try {
            Uri uri=ProbeFileProvider.uri(activity,file);String mime=file.getName().endsWith(".png")?"image/png":"application/octet-stream";
            ClipData clip=ClipData.newUri(activity.getContentResolver(),"HiNote página "+(page+1),uri);
            if("page-share".equals(action)) {
                Intent share=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                share.setClipData(clip);
                activity.startActivity(Intent.createChooser(share,"Probar página en Huawei Notes"));
            } else clipboard().setPrimaryClip(clip);
            String message="page-png".equals(action)?"Página copiada como PNG. Pega en Notes y comprueba si aparece como imagen.":"page-share".equals(action)?"Se abrió Compartir con un .hinote de una página. Abrir un cuaderno no equivale a pegar trazos con el lazo.":"URI del .hinote copiada. Mantén pulsado en Notes y prueba Pegar; la compatibilidad con trazos no está confirmada.";
            JSONObject value=new JSONObject().put("mime",mime).put("page",page+1).put("bytes",file.length()).put("native_lasso_verified",false);
            worker.execute(()->{try{reply(ticket,new JSONObject().put("report",record(action,value)).put("message",message),null);}catch(Exception error){reply(ticket,null,error.getMessage());}});
        }catch(Exception error){reply(ticket,null,error.getMessage());}});
    }
    private void saveReport(String raw,int ticket)throws Exception {
        JSONObject observations=new JSONObject(raw);reportTicket=ticket;
        worker.execute(()->{try {pendingReport=record("observations",observations).toString(2).getBytes(StandardCharsets.UTF_8);
            activity.runOnUiThread(()->{if(closed)return;try {Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"HiNote-V"+BuildConfig.VERSION_CODE+"-Prueba-Notes.json");activity.startActivityForResult(intent,SAVE_REPORT);}catch(Exception error){reply(ticket,null,error.getMessage());}});
        }catch(Exception error){reply(ticket,null,error.getMessage());}});
    }
    boolean activityResult(int code,int result,Intent intent) {
        if(code==SAVE_TEMPORARY){
            final File file=pendingTemporary;pendingTemporary=null;final int ticket=temporaryTicket;
            if(result!=Activity.RESULT_OK||intent==null||intent.getData()==null||file==null){reply(ticket,null,"Guardado del temporal cancelado");return true;}
            worker.execute(()->{try(InputStream in=new FileInputStream(file);OutputStream out=activity.getContentResolver().openOutputStream(intent.getData(),"wt")){
                if(out==null)throw new IOException("No se pudo abrir el destino");byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){if(closed||Thread.currentThread().isInterrupted())throw new IOException("Guardado cancelado");out.write(buffer,0,n);}
                TransferJournal.event(activity,"bridge","temporary_saved",0,1,"Importación manual disponible");reply(ticket,new JSONObject().put("message","Temporal guardado. Impórtalo desde Huawei Notes y abre su página. Vuelve aquí y pulsa Continuar con el lazo."),null);
            }catch(Exception error){reply(ticket,null,error.getMessage());}});return true;
        }
        if(code!=SAVE_REPORT)return false;final byte[] bytes=pendingReport;pendingReport=null;final int ticket=reportTicket;
        if(result!=Activity.RESULT_OK||intent==null||intent.getData()==null||bytes==null) {reply(ticket,new JSONObject(),"Guardado del informe cancelado");return true;}
        worker.execute(()->{try(OutputStream out=activity.getContentResolver().openOutputStream(intent.getData(),"wt")) {if(out==null)throw new IOException("No se pudo abrir el destino");out.write(bytes);reply(ticket,new JSONObject().put("message","Informe guardado. Puedes enviarlo junto con lo que haya pegado Notes."),null);}catch(Exception error){reply(ticket,null,error.getMessage());}});return true;
    }
    void close() {closed=true;worker.shutdownNow();}
}
