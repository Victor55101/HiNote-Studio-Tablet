package com.hinote.studio;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import java.io.IOException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Persistent SAF directory access. All provider I/O runs on the export worker. */
final class ExportFolder {
    private static final int ACCESS=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    private final ContentResolver resolver;
    private final SharedPreferences preferences;
    ExportFolder(Context context){
        resolver=context.getContentResolver();preferences=context.getSharedPreferences("export-folder",Context.MODE_PRIVATE);
    }
    Uri selected(){String raw=preferences.getString("uri","");return raw.isEmpty()?null:Uri.parse(raw);}
    String describe(){
        try{return new JSONObject().put("configured",selected()!=null).put("label",preferences.getString("label","")).toString();}
        catch(Exception e){return "{\"configured\":false,\"label\":\"\"}";}
    }
    void remember(Uri tree,int flags)throws Exception{
        if(tree==null||!DocumentsContract.isTreeUri(tree)||(flags&ACCESS)!=ACCESS)
            throw new IOException("Elige una carpeta con permiso de lectura y escritura");
        Uri old=selected();boolean taken=false;
        try{
            String label=inspect(tree);
            resolver.takePersistableUriPermission(tree,flags&ACCESS);taken=true;
            if(!preferences.edit().putString("uri",tree.toString()).putString("label",label).commit())
                throw new IOException("No se pudo recordar la carpeta");
        }catch(Exception e){if(taken&&!tree.equals(old))release(tree);throw e;}
        if(old!=null&&!old.equals(tree))release(old);
    }
    void clear()throws IOException{
        Uri old=selected();
        if(!preferences.edit().clear().commit())throw new IOException("No se pudo quitar la carpeta");
        if(old!=null)release(old);
    }
    private void release(Uri tree){try{resolver.releasePersistableUriPermission(tree,ACCESS);}catch(Exception ignored){}}
    private static Uri document(Uri tree){return DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));}
    private String inspect(Uri tree)throws IOException{
        try(Cursor c=resolver.query(document(tree),new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_FLAGS},null,null,null)){
            if(c==null||!c.moveToFirst()||!DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(1))
                    ||(c.getInt(2)&DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE)==0)
                throw new IOException("La carpeta no permite crear archivos");
            String label=c.getString(0);
            if("com.android.externalstorage.documents".equals(tree.getAuthority())){
                String id=DocumentsContract.getTreeDocumentId(tree);int colon=id.indexOf(':');
                if(colon>=0)label=(id.startsWith("primary:")?"Almacenamiento interno":"Tarjeta "+id.substring(0,colon))+" / "+id.substring(colon+1);
            }
            return label==null?"Carpeta elegida":label;
        }
    }
    void validate(Uri tree)throws IOException{
        try{
            boolean allowed=false;
            for(UriPermission p:resolver.getPersistedUriPermissions())
                if(p.getUri().equals(tree)&&p.isReadPermission()&&p.isWritePermission()){allowed=true;break;}
            if(!allowed)throw new IOException("Permiso de carpeta perdido");
            inspect(tree);
        }catch(Exception e){throw new IOException("La carpeta de guardado ya no está disponible. Vuelve a elegirla en Guardado.",e);}
    }
    static String fileName(String title){
        String stem=(title==null?"":title.trim()).replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]","_");
        if(stem.toLowerCase(Locale.ROOT).endsWith(".hinote"))stem=stem.substring(0,stem.length()-7);
        if(stem.isEmpty())stem="Nueva nota";
        return stem.substring(0,Math.min(128,stem.length()))+".hinote";
    }
    Uri create(Uri tree,String title,Runnable check)throws Exception{
        validate(tree);check.run();
        String name=fileName(title),stem=name.substring(0,name.length()-7);boolean exists=false;long suffix=0;
        Pattern numbered=Pattern.compile(Pattern.quote(stem)+" \\((\\d{1,9})\\)\\.hinote",Pattern.CASE_INSENSITIVE);
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));
        try(Cursor c=resolver.query(children,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){
            if(c==null)throw new IOException("No se pudieron comprobar los nombres en la carpeta");
            while(c.moveToNext()){
                check.run();String existing=c.getString(0);if(existing==null)continue;
                if(name.equalsIgnoreCase(existing))exists=true;
                Matcher match=numbered.matcher(existing);if(match.matches())suffix=Math.max(suffix,Long.parseLong(match.group(1)));
            }
        }
        if(exists)name=stem+" ("+(suffix+1)+").hinote";
        check.run();Uri created=DocumentsContract.createDocument(resolver,document(tree),"application/octet-stream",name);
        if(created==null)throw new IOException("No se pudo crear el archivo en la carpeta elegida");
        return created;
    }
    String displayName(Uri uri,String fallback){
        try(Cursor c=resolver.query(uri,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){
            return c!=null&&c.moveToFirst()?c.getString(0):fallback;
        }catch(Exception e){return fallback;}
    }
}
