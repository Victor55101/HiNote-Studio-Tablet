package com.hinote.studio;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import org.json.*;
import java.io.*;
import java.util.UUID;

/** Runs on the existing single worker. Keeps selectors and candidate review
 * separate from the currently active profile and the immutable note snapshot. */
final class CalibrationTasks {
    static final int IMPORT=504,SAVE=505;
    interface Host {
        void result(int ticket,String data,String error);
        void status(int ticket,String text);
        void ui(Runnable action);
    }
    private final Activity activity;
    private final File project,session;
    private final Host host;
    private File candidate,output,work;
    private JSONObject pending;
    private int ticket;

    CalibrationTasks(Activity activity, File project, File session, Host host){this.activity=activity;this.project=project;this.session=session;this.host=host;}
    private PyObject module(){return Python.getInstance().getModule("calibration");}
    private String project(){return project.getPath();}
    private File work() throws IOException {
        File result=new File(session,"calibration-"+UUID.randomUUID().toString().replace("-",""));
        if(!result.mkdirs())throw new IOException("No se pudo preparar la calibración");
        return result;
    }
    void beginImport(String raw,int ticket)throws Exception{
        this.ticket=ticket;pending=new JSONObject(raw);
        if(candidate!=null)throw new IOException("Revisa o descarta la importación pendiente primero");
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
        activity.startActivityForResult(intent,IMPORT);
    }
    void imported(Uri source, MainActivity.TaskToken token)throws Exception{
        work=work();
        boolean keep=false;
        try{
            File local=new File(work,"source.input");
            copy(activity.getContentResolver().openInputStream(source),new FileOutputStream(local),32L*1024*1024,token);
            token.check();host.status(ticket,"Comprobando plantilla y trazos…");
            String response;
            try(InputStream in=new FileInputStream(local)){
                if(in.read()==0x1f && in.read()==0x8b){
                    response=module().callAttr("import_backup",project(),local.getPath(),work.getPath(),token).toString();
                }else{
                    JSONArray pages=new JSONArray(module().callAttr("prepare_import",local.getPath(),work.getPath(),token).toString());
                    JSONArray guides=new JSONArray();
                    for(int i=0;i<pages.length();i++){token.check();guides.put(CalibrationGuide.read(new File(pages.getJSONObject(i).getString("guide"))));}
                    response=module().callAttr("extract",project(),work.getPath(),guides.toString(),pending.optString("name","Mi letra"),pending.optString("target",""),token).toString();
                }
            }
            token.check();candidate=work;keep=true;host.result(ticket,response,null);
        }finally{if(!keep)remove(work);work=null;}
    }
    /** Returns true while waiting for the save picker, false when finished. */
    boolean run(String action,String raw,int ticket,MainActivity.TaskToken token)throws Exception{
        this.ticket=ticket;JSONObject args=new JSONObject(raw);
        token.check();PyObject mod=module();
        if(action.equals("commit")){
            if(candidate==null)throw new IOException("La revisión caducó. Vuelve a importar el archivo.");
            String response=mod.callAttr("commit",project(),candidate.getPath(),token).toString();
            remove(candidate);candidate=null;host.result(ticket,response,null);return false;
        }
        if(action.equals("discard")){
            remove(candidate);candidate=null;host.result(ticket,"{\"discarded\":true}",null);return false;
        }
        if(action.equals("template")||action.equals("backup")){
            work=work();
            if(action.equals("template")){
                JSONArray plan=new JSONArray(mod.callAttr("action",project(),"templatePlan",raw,token).toString());
                for(int i=0;i<plan.length();i++){
                    token.check();host.status(ticket,"Preparando guía "+(i+1)+" / "+plan.length()+"…");
                    CalibrationGuide.render(plan.getJSONObject(i),new File(work,"guide-"+i+".png"),new File(work,"thumb-"+i+".jpg"));
                }
                output=new File(mod.callAttr("build_template",project(),work.getPath(),plan.toString(),token).toString());
            }else{
                output=new File(work,"Calibracion-HiNote.hnprofile");
                mod.callAttr("export_profile",project(),args.getString("id"),output.getPath(),token);
            }
            token.check();host.status(ticket,"Elige dónde guardar el archivo…");
            host.ui(()->{
                try{
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/octet-stream");intent.putExtra(Intent.EXTRA_TITLE,output.getName());activity.startActivityForResult(intent,SAVE);
                }catch(Exception e){failed(e);}
            });
            return true;
        }
        if(action.equals("preview")){
            work=work();
            try{
                String sample=args.optString("text","Hola Ñandú 123 _- ¡Hola!");
                if(sample.length()>600)throw new IOException("La prueba admite hasta 600 caracteres");
                JSONObject doc=new JSONObject().put("paragraphs",new JSONArray().put(new JSONObject().put("segments",new JSONArray().put(
                    new JSONObject().put("text",sample).put("scale",1).put("thickness",0)))));
                PyObject backend=Python.getInstance().getModule("mobile_backend");
                JSONObject info=new JSONObject(backend.callAttr("compose",project(),work.getPath(),doc.toString(),new JSONObject().put("profile",args.getString("id")).toString(),token).toString());
                String json=backend.callAttr("page_preview",work.getPath(),info.getString("snapshot"),0).toString();
                File png=new File(work,"preview.png");PageRenderer.render(json,png,false,58.8,new JSONArray(),true,token::check);
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                copy(new FileInputStream(png),bytes,4L*1024*1024,token);
                JSONObject response=new JSONObject().put("preview","data:image/png;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP)).put("warnings",info.optJSONArray("warnings"));
                host.result(ticket,response.toString(),null);
            }finally{remove(work);work=null;}
            return false;
        }
        host.result(ticket,mod.callAttr("action",project(),action,raw,token).toString(),null);return false;
    }
    void saved(Uri destination,MainActivity.TaskToken token)throws Exception{
        try{
            token.check();if(output==null||!output.isFile())throw new IOException("El archivo ya no está disponible");
            copy(new FileInputStream(output),activity.getContentResolver().openOutputStream(destination,"wt"),64L*1024*1024,token);
            token.check();host.result(ticket,"{\"fileSaved\":true}",null);
        }catch(Exception e){try{DocumentsContract.deleteDocument(activity.getContentResolver(),destination);}catch(Exception ignored){}throw e;}
        finally{remove(work);work=null;output=null;}
    }
    void cancelled(){remove(work);work=null;output=null;host.result(ticket,"{\"cancelled\":true}",null);}
    void failed(Throwable error){remove(work);work=null;output=null;host.result(ticket,null,error.getMessage()==null?"No se pudo completar la calibración":error.getMessage());}
    void failed(int ticket,Throwable error){this.ticket=ticket;failed(error);}
    static void copy(InputStream input,OutputStream output,long limit,MainActivity.TaskToken token)throws Exception{
        try(InputStream in=input;OutputStream out=output){
            if(in==null||out==null)throw new IOException("No se pudo abrir el archivo");
            byte[] buffer=new byte[65536];long count=0;int n;
            while((n=in.read(buffer))!=-1){token.check();count+=n;if(count>limit)throw new IOException("Archivo demasiado grande");out.write(buffer,0,n);}
            out.flush();
        }
    }
    private static void remove(File dir){if(dir==null)return;File[] files=dir.listFiles();if(files!=null)for(File file:files)remove(file);dir.delete();}
}
