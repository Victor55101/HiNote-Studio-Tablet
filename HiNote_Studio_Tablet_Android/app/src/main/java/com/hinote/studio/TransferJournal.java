package com.hinote.studio;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Persistent, bounded diagnostics. Never stores note text, geometry or screen contents. */
final class TransferJournal {
    static synchronized JSONObject read(Context context){
        try(InputStream in=new AtomicFile(new File(context.getFilesDir(),"notes-transfer-report.json")).openRead()){
            return new JSONObject(new String(NotesProbe.readBounded(in,180000),StandardCharsets.UTF_8));
        }catch(Exception ignored){return new JSONObject();}
    }
    static synchronized void event(Context context,String mode,String stage,int completed,int total,String detail){
        AtomicFile file=new AtomicFile(new File(context.getFilesDir(),"notes-transfer-report.json"));FileOutputStream out=null;
        try{
            JSONObject report=read(context);JSONArray old=report.optJSONArray("events"),events=new JSONArray();
            if(old!=null)for(int i=Math.max(0,old.length()-63);i<old.length();i++)events.put(old.get(i));
            JSONObject item=new JSONObject().put("time_ms",System.currentTimeMillis()).put("mode",mode).put("stage",stage)
                .put("completed_gestures",completed).put("total_gestures",total).put("detail",detail==null?"":detail.substring(0,Math.min(500,detail.length())))
                .put("native_ink_verified",false);
            events.put(item);report.put("events",events).put("last",item)
                .put("interpretation","Los gestos completados y los clics no prueban tinta editable ni que Notes haya copiado. La verificación la registra el usuario.");
            out=file.startWrite();out.write(report.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);
        }catch(Exception ignored){if(out!=null)file.failWrite(out);}
    }
}
