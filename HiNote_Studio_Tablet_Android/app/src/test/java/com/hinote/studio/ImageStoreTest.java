package com.hinote.studio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.media.ExifInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, manifest=Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class ImageStoreTest {
    private File directory, source;
    private ImageStore store;
    private Context context;
    @Before public void setup() throws Exception {
        context=RuntimeEnvironment.getApplication();
        directory=Files.createTempDirectory("image-test-").toFile();store=new ImageStore(directory);
        source=new File(directory,"original.png");
        Bitmap bitmap=Bitmap.createBitmap(100,80,Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.TRANSPARENT);
        for(int x=30;x<70;x++)for(int y=20;y<60;y++)bitmap.setPixel(x,y,Color.RED);
        try(FileOutputStream out=new FileOutputStream(source)){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
    }
    private JSONObject importSource() throws Exception {return store.importImage(context.getContentResolver(), Uri.fromFile(source));}
    private JSONObject image(JSONObject asset) throws Exception {
        return new JSONObject().put("id","image1").put("asset",asset.getString("asset")).put("page",0)
            .put("x",100).put("y",200).put("width",300).put("height",240).put("angle",320)
            .put("crop",new JSONObject().put("left",.25).put("top",0).put("right",.75).put("bottom",1));
    }
    @Test public void importsTransparentPngAndDeduplicates() throws Exception {
        JSONObject a=importSource(),b=importSource();assertEquals(a.getString("asset"),b.getString("asset"));
        assertTrue(a.getBoolean("alpha"));assertEquals(100,a.getInt("pixelWidth"));
        Bitmap bitmap=BitmapFactory.decodeFile(store.asset(a.getString("asset"),false).getPath());
        assertEquals(0,Color.alpha(bitmap.getPixel(0,0)));assertEquals(Color.RED,bitmap.getPixel(50,40));bitmap.recycle();
        assertTrue(store.asset(a.getString("asset"),true).isFile());
    }
    @Test public void cropKeepsSourceAndRotationRemainsMetadata() throws Exception {
        JSONObject a=importSource();File work=new File(directory,"export");assertTrue(work.mkdir());
        JSONArray result=store.prepareExport(new JSONArray().put(image(a)).toString(),work,1,()->{});
        JSONObject i=result.getJSONObject(0);assertEquals(320,i.getDouble("angle"),0);
        Bitmap crop=BitmapFactory.decodeFile(i.getString("path"));assertEquals(50,crop.getWidth());assertEquals(80,crop.getHeight());crop.recycle();
        Bitmap original=BitmapFactory.decodeFile(store.asset(a.getString("asset"),false).getPath());assertEquals(100,original.getWidth());original.recycle();
    }
    @Test public void decodesByContentNotExtension() throws Exception {
        File renamed=new File(directory,"really-png.jpg");Files.copy(source.toPath(),renamed.toPath());
        Bitmap b=ImageStore.decode(renamed,512);assertTrue(b.hasAlpha());b.recycle();
    }
    @Test public void webpWithTransparencyIsNormalizedToPng() throws Exception {
        Bitmap bitmap=BitmapFactory.decodeFile(source.getPath());File webp=new File(directory,"input.webp");
        try(FileOutputStream out=new FileOutputStream(webp)){bitmap.compress(Bitmap.CompressFormat.WEBP,100,out);}bitmap.recycle();
        JSONObject imported=store.importImage(context.getContentResolver(),Uri.fromFile(webp));
        assertTrue(store.asset(imported.getString("asset"),false).getName().endsWith(".png"));
        Bitmap decoded=BitmapFactory.decodeFile(store.asset(imported.getString("asset"),false).getPath());
        assertEquals(0,Color.alpha(decoded.getPixel(0,0)));decoded.recycle();
    }
    @Test public void jpgExifOrientationIsAppliedOnce() throws Exception {
        Bitmap bitmap=Bitmap.createBitmap(120,80,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.BLUE);
        File jpg=new File(directory,"photo.jpg");try(FileOutputStream out=new FileOutputStream(jpg)){bitmap.compress(Bitmap.CompressFormat.JPEG,95,out);}bitmap.recycle();
        ExifInterface exif=new ExifInterface(jpg.getPath());exif.setAttribute(ExifInterface.TAG_ORIENTATION,"6");exif.saveAttributes();
        JSONObject imported=store.importImage(context.getContentResolver(),Uri.fromFile(jpg));
        assertEquals(80,imported.getInt("pixelWidth"));assertEquals(120,imported.getInt("pixelHeight"));
        assertTrue(store.asset(imported.getString("asset"),false).getName().endsWith(".jpg"));
    }
    @Test public void oversizedImageIsSampledBeforeDecoding() throws Exception {
        Bitmap b=Bitmap.createBitmap(3000,1500,Bitmap.Config.ARGB_8888);b.eraseColor(Color.GREEN);
        File large=new File(directory,"large.jpg");try(FileOutputStream out=new FileOutputStream(large)){b.compress(Bitmap.CompressFormat.JPEG,85,out);}b.recycle();
        Bitmap small=ImageStore.decode(large,512);assertTrue(small.getWidth()<=512);assertTrue(small.getAllocationByteCount()<=512*512*4);small.recycle();
    }
    @Test public void rejectsInvalidPathsAndCrop() throws Exception {
        assertThrows(java.io.IOException.class,()->store.asset("../original",false));
        JSONObject im=image(importSource());im.getJSONObject("crop").put("left",.9);
        assertThrows(java.io.IOException.class,()->store.prepareExport(new JSONArray().put(im).toString(),directory,1,()->{}));
    }
    @Test public void inkPreviewIsTransparentAndImagesStayBelowInk() throws Exception {
        File ink=new File(directory,"ink.png");
        String strokes="{\"strokes\":[[\"#000000\",100,[[150,240,8],[300,240,8]]]]}";
        PageRenderer.render(strokes,ink,false,58.8,new JSONArray(),true,()->{});
        Bitmap b=BitmapFactory.decodeFile(ink.getPath());assertEquals(0,Color.alpha(b.getPixel(0,0)));assertTrue(Color.alpha(b.getPixel(135,162))>200);b.recycle();
        JSONObject im=new JSONObject().put("path",source.getPath()).put("x",100).put("y",200).put("width",300).put("height",240).put("angle",0);
        File page=new File(directory,"page.jpg");PageRenderer.render(strokes,page,false,58.8,new JSONArray().put(im),false,()->{});
        b=BitmapFactory.decodeFile(page.getPath());assertTrue(Color.red(b.getPixel(135,162))<80);assertTrue(Color.red(b.getPixel(169,216))>180);b.recycle();
    }
}
