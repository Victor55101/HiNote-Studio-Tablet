package com.hinote.studio;

import android.content.ContentResolver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.Locale;

/** Originals are retained verbatim. Only the requested PDF page is rasterized. */
final class PdfStore {
    private final File directory, previews;
    PdfStore(File files, File cache) throws IOException {
        directory=new File(files,"pdfs-v50");previews=new File(cache,"pdf-previews-v50");
        if((!directory.isDirectory()&&!directory.mkdirs())||(!previews.isDirectory()&&!previews.mkdirs()))throw new IOException("No se pudo preparar la importación de PDF");
    }
    File asset(String id) throws IOException {
        if(!ImageStore.validAsset(id))throw new IOException("PDF inválido");
        File file=new File(directory,id+".pdf");
        if(!file.isFile())throw new IOException("Falta el PDF del borrador. Vuelve a insertarlo.");
        return file;
    }
    JSONObject importPdf(ContentResolver resolver,Uri uri) throws Exception {
        File temp=File.createTempFile("import-",".part",directory);
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");long bytes=0;
            try(InputStream in=resolver.openInputStream(uri);FileOutputStream out=new FileOutputStream(temp)){
                if(in==null)throw new IOException("No se pudo abrir el PDF");
                byte[] buffer=new byte[65536];int n;
                while((n=in.read(buffer))!=-1){bytes+=n;if(bytes>64L*1024*1024)throw new IOException("Cada PDF admite hasta 64 MB");
                    if(Thread.currentThread().isInterrupted())throw new IOException("Importación cancelada");
                    digest.update(buffer,0,n);out.write(buffer,0,n);}
                out.getFD().sync();
            }
            int pages;
            try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(temp,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){
                pages=pdf.getPageCount();if(pages<1||pages>500)throw new IOException("El PDF debe tener entre 1 y 500 páginas");
            }catch(SecurityException e){throw new IOException("El PDF está protegido con contraseña. Usa una copia sin contraseña.",e);}
            StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(Locale.ROOT,"%02x",b&255));
            String id=hash.toString();File target=new File(directory,id+".pdf");
            if(!target.isFile()){
                long used=0;File[] files=directory.listFiles();if(files!=null)for(File f:files)used+=f.length();
                if(used>512L*1024*1024||directory.getUsableSpace()<20L*1024*1024)throw new IOException("No hay espacio suficiente para conservar el PDF");
                if(!temp.renameTo(target))throw new IOException("No se pudo conservar el PDF");
            }
            String name="Documento.pdf";
            try(Cursor c=resolver.query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst()&&!c.isNull(0))name=c.getString(0);}catch(RuntimeException ignored){}
            return new JSONObject().put("asset",id).put("pages",pages).put("name",name.substring(0,Math.min(160,name.length())));
        }finally{temp.delete();}
    }
    synchronized File preview(JSONObject ref,int resolution,Runnable check) throws Exception {
        String id=ref.getString("asset");int index=ref.getInt("index"),factor=resolution>1?2:1;
        File source=asset(id),destination=new File(previews,id+"-"+index+"-"+factor+".png");
        if(destination.isFile()){destination.setLastModified(System.currentTimeMillis());return destination;}
        check.run();Bitmap bitmap=Bitmap.createBitmap(675*factor,1080*factor,Bitmap.Config.ARGB_8888);
        File partial=new File(destination.getPath()+".part");
        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(source,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){
            if(index<0||index>=pdf.getPageCount())throw new IOException("Página de PDF fuera de rango");
            bitmap.eraseColor(Color.WHITE);
            try(PdfRenderer.Page page=pdf.openPage(index)){
                float scale=Math.min((float)bitmap.getWidth()/page.getWidth(),(float)bitmap.getHeight()/page.getHeight());
                Matrix transform=new Matrix();transform.setScale(scale,scale);transform.postTranslate((bitmap.getWidth()-page.getWidth()*scale)/2,(bitmap.getHeight()-page.getHeight()*scale)/2);
                page.render(bitmap,null,transform,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            }
            check.run();try(FileOutputStream out=new FileOutputStream(partial)){if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,out))throw new IOException("No se pudo mostrar el PDF");}
            if(!partial.renameTo(destination))throw new IOException("No se pudo conservar la vista del PDF");
        }finally{bitmap.recycle();partial.delete();}
        File[] cached=previews.listFiles();if(cached!=null&&cached.length>8){java.util.Arrays.sort(cached,java.util.Comparator.comparingLong(File::lastModified));for(int i=0;i<cached.length-8;i++)if(!cached[i].equals(destination))cached[i].delete();}
        return destination;
    }
}
