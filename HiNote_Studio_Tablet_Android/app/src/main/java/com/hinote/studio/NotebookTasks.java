package com.hinote.studio;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import org.json.*;
import java.io.*;
import java.util.*;

/** Native document pickers and a bounded, streaming copy on the existing worker. */
final class NotebookTasks {
    static final int IMPORT=506,SAVE=507;
    interface Host {
        void result(int ticket,String data,String error);
        void status(int ticket,String text);
        void ui(Runnable action);
    }
    private final Activity activity;
    private final File directory;
    private final Host host;
    private final Map<String,File> sources=new LinkedHashMap<>();
    private File work,output;
    private int ticket;
    NotebookTasks(Activity activity,File session,Host host){this.activity=activity;this.directory=new File(session,"notebooks");this.host=host;}
    private PyObject module(){return Python.getInstance().getModule("notebook_merger");}
    private void directory()throws IOException{if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("No se pudo preparar la combinación");}
    void beginImport(int id)throws Exception{
        ticket=id;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);activity.startActivityForResult(intent,IMPORT);
    }
    void imported(List<Uri> uris,MainActivity.TaskToken token)throws Exception{
        directory();
        if(uris.isEmpty()||sources.size()+uris.size()>8)throw new IOException("Selecciona hasta 8 cuadernos en total");
        JSONArray result=new JSONArray();Map<String,File> created=new LinkedHashMap<>();
        try{
            long total=0;for(File file:sources.values())total+=file.length();
            for(Uri uri:uris){
                token.check();host.status(ticket,"Leyendo cuaderno "+(result.length()+1)+" / "+uris.size()+"…");
                String id=UUID.randomUUID().toString().replace("-","");File local=new File(directory,id+".hinote");created.put(id,local);
                CalibrationTasks.copy(activity.getContentResolver().openInputStream(uri),new FileOutputStream(local),128L*1024*1024,token);
                total+=local.length();if(total>256L*1024*1024)throw new IOException("Los cuadernos seleccionados superan 256 MB");
                JSONObject info=new JSONObject(module().callAttr("inspect_notebook",local.getPath(),token).toString());info.put("id",id);result.put(info);
            }
            token.check();sources.putAll(created);host.result(ticket,new JSONObject().put("sources",result).toString(),null);
        }catch(Exception e){for(File file:created.values())file.delete();throw e;}
    }
    private File source(String id)throws IOException{File file=sources.get(id);if(file==null||!file.isFile())throw new IOException("Cuaderno no disponible. Vuelve a agregarlo.");return file;}
    void run(String action,String raw,int id,MainActivity.TaskToken token)throws Exception{
        ticket=id;directory();JSONObject args=new JSONObject(raw);token.check();
        if(action.equals("remove")){String sourceId=args.getString("source");File file=sources.remove(sourceId);if(file!=null)file.delete();host.result(ticket,new JSONObject().put("removed",sourceId).toString(),null);return;}
        if(action.equals("thumbnail")){
            File thumb=new File(directory,"thumbnail-"+UUID.randomUUID()+".input");
            try{
                module().callAttr("thumbnail",source(args.getString("source")).getPath(),args.getString("page"),thumb.getPath(),token);
                Bitmap image=ImageStore.decode(thumb,512);
                try{ByteArrayOutputStream bytes=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.JPEG,85,bytes);token.check();host.result(ticket,new JSONObject().put("preview","data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP)).toString(),null);}
                finally{image.recycle();}
            }finally{thumb.delete();}
            return;
        }
        if(!action.equals("merge"))throw new IOException("Operación de cuaderno desconocida");
        work=new File(directory,"merge-"+UUID.randomUUID());if(!work.mkdirs())throw new IOException("No se pudo preparar el cuaderno nuevo");output=new File(work,"merged.hinote");
        JSONObject paths=new JSONObject();for(Map.Entry<String,File> entry:sources.entrySet())paths.put(entry.getKey(),entry.getValue().getPath());
        module().callAttr("merge_notebooks",paths.toString(),raw,output.getPath(),new File(work,"resources").getPath(),token);
        token.check();host.status(ticket,"Copia comprobada. Elige dónde guardar el cuaderno nuevo…");
        String title=args.optString("title","Cuaderno combinado");
        host.ui(()->{try{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/octet-stream");intent.putExtra(Intent.EXTRA_TITLE,ExportFolder.fileName(title));activity.startActivityForResult(intent,SAVE);}catch(Exception e){failed(e);}});
    }
    void saved(Uri destination,MainActivity.TaskToken token)throws Exception{
        try{token.check();if(output==null||!output.isFile())throw new IOException("La copia preparada ya no está disponible");CalibrationTasks.copy(new FileInputStream(output),activity.getContentResolver().openOutputStream(destination,"wt"),512L*1024*1024,token);token.check();host.result(ticket,"{\"fileSaved\":true}",null);}
        catch(Exception e){try{DocumentsContract.deleteDocument(activity.getContentResolver(),destination);}catch(Exception ignored){}throw e;}
        finally{cleanup();}
    }
    void cancelled(){cleanup();host.result(ticket,"{\"cancelled\":true}",null);}
    void failed(Throwable error){cleanup();host.result(ticket,null,error.getMessage()==null?"No se pudo combinar el cuaderno":error.getMessage());}
    void failed(int id,Throwable error){ticket=id;failed(error);}
    private void cleanup(){remove(work);work=null;output=null;}
    private static void remove(File dir){if(dir==null)return;File[] children=dir.listFiles();if(children!=null)for(File child:children)remove(child);dir.delete();}
}
