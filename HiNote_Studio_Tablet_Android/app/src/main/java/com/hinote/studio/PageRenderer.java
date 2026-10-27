package com.hinote.studio;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
/** One page at a time. The export grid is drawn by HiNote, without a paper image. */
final class PageRenderer {
    static void renderForExport(String json, File destination, JSONArray images, Runnable check) throws Exception {
        render(json,destination,true,58.8,images,false,1,null,check);
    }
    static void renderForExport(String json, File destination, JSONArray images, File pdf, Runnable check) throws Exception {
        render(json,destination,true,58.8,images,false,1,pdf,check);
    }
    static void renderPreview(String json, File destination, int resolution, File pdf, Runnable check) throws Exception {
        render(json,destination,false,0,new JSONArray(),true,resolution>1?2:1,pdf,check);
    }
    static void render(String json, File destination, boolean grid, double gridStep, Runnable check) throws Exception {
        render(json, destination, grid, gridStep, new JSONArray(), false, check);
    }
    static void render(String json, File destination, boolean grid, double gridStep, JSONArray images, boolean inkOnly, Runnable check) throws Exception {
        render(json, destination, grid, gridStep, images, inkOnly, 1, null, check);
    }
    static void renderPreview(String json, File destination, int resolution, Runnable check) throws Exception {
        render(json, destination, false, 0, new JSONArray(), true, resolution > 1 ? 2 : 1, null, check);
    }
    private static void render(String json, File destination, boolean grid, double gridStep, JSONArray images, boolean inkOnly, int resolution, File pdf, Runnable check) throws Exception {
        check.run();
        // At most 1350 x 2160 (11.2 MiB), one page at a time. Export size is unchanged.
        Bitmap bitmap=Bitmap.createBitmap(675*resolution,1080*resolution,Bitmap.Config.ARGB_8888);
        File partial=new File(destination.getPath()+".part");
        try {
            Canvas canvas=new Canvas(bitmap); canvas.drawColor(inkOnly ? Color.TRANSPARENT : Color.WHITE);
            if(pdf!=null){
                Bitmap background=ImageStore.decode(pdf,2160);
                try{canvas.drawBitmap(background,null,new android.graphics.Rect(0,0,bitmap.getWidth(),bitmap.getHeight()),new Paint(Paint.FILTER_BITMAP_FLAG));}finally{background.recycle();}
            }
            canvas.scale(.675f*resolution,.675f*resolution);
            Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
            if(grid && !inkOnly && pdf==null){
                paint.setColor(Color.argb(46,115,160,180)); paint.setStrokeWidth(.6f);
                float step=(float)Math.max(1,gridStep);
                for(float x=0;x<=1000;x+=step)canvas.drawLine(x,0,x,1600,paint);
                for(float y=0;y<=1600;y+=step)canvas.drawLine(0,y,1000,y,paint);
            }
            if (!inkOnly) for (int i = 0; i < images.length(); i++) {
                check.run(); JSONObject im = images.getJSONObject(i);
                Bitmap source = ImageStore.decode(new File(im.getString("path")), 1600);
                canvas.save();
                try {
                    float x=(float)im.getDouble("x"), y=(float)im.getDouble("y");
                    float w=(float)im.getDouble("width"), h=(float)im.getDouble("height");
                    canvas.rotate((float)im.getDouble("angle"), x+w/2, y+h/2);
                    paint.setAlpha(255); paint.setFilterBitmap(true);
                    canvas.drawBitmap(source, null, new RectF(x,y,x+w,y+h), paint);
                } finally { canvas.restore(); source.recycle(); }
            }
            paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
            JSONArray strokes=new JSONObject(json).getJSONArray("strokes");
            for(int s=0;s<strokes.length();s++){
                check.run(); JSONArray stroke=strokes.getJSONArray(s);
                paint.setColor(Color.parseColor(stroke.getString(0)));
                paint.setAlpha((int)Math.round(255*stroke.getDouble(1)/100.0));
                JSONArray points=stroke.getJSONArray(2);
                // Native Rotulador width is stored independently of pressure.
                // Preserve old preview behavior if an older cached page lacks it.
                float widthScale=stroke.length()>3?(float)(stroke.getDouble(3)/(2.0/3.0)):1f;
                if(points.length()==1){
                    JSONArray p=points.getJSONArray(0);
                    canvas.drawCircle((float)p.getDouble(0),(float)p.getDouble(1),widthScale*(.8f+(float)Math.max(.1,p.getDouble(2))*1.2f)/2,paint);
                }
                for(int i=1;i<points.length();i++){
                    JSONArray a=points.getJSONArray(i-1),b=points.getJSONArray(i);
                    float pressure=(float)Math.max(.1,(a.getDouble(2)+b.getDouble(2))/2);
                    paint.setStrokeWidth(widthScale*(.8f+pressure*1.2f));
                    canvas.drawLine((float)a.getDouble(0),(float)a.getDouble(1),(float)b.getDouble(0),(float)b.getDouble(1),paint);
                }
            }
            check.run();
            try(FileOutputStream out=new FileOutputStream(partial)){
                if(!bitmap.compress(inkOnly ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG,90,out))throw new IOException("No se pudo crear la miniatura");
            }
            if(!partial.renameTo(destination))throw new IOException("No se pudo guardar la miniatura");
        } finally {bitmap.recycle(); partial.delete();}
    }
}
