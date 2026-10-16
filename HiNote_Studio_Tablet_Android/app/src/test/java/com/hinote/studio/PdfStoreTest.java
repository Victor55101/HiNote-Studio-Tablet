package com.hinote.studio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
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
@Config(sdk=28,manifest=Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class PdfStoreTest {
    private File directory, source;
    private PdfStore store;
    private Context context;
    @Before public void setup()throws Exception{
        context=RuntimeEnvironment.getApplication();directory=Files.createTempDirectory("pdf-test-").toFile();
        store=new PdfStore(directory,directory);source=new File(directory,"original.pdf");
        try(PdfDocument document=new PdfDocument()){
            for(int i=0;i<2;i++){
                PdfDocument.Page page=document.startPage(new PdfDocument.PageInfo.Builder(i==0?200:300,i==0?300:200,i+1).create());
                page.getCanvas().drawColor(i==0?Color.RED:Color.BLUE);document.finishPage(page);
            }
            try(FileOutputStream out=new FileOutputStream(source)){document.writeTo(out);}
        }
    }
    private JSONObject imported()throws Exception{return store.importPdf(context.getContentResolver(),Uri.fromFile(source));}
    @Test public void importPreservesOriginalBytesAndDeduplicates()throws Exception{
        JSONObject a=imported(),b=imported();assertEquals(2,a.getInt("pages"));assertEquals(a.getString("asset"),b.getString("asset"));
        assertArrayEquals(Files.readAllBytes(source.toPath()),Files.readAllBytes(store.asset(a.getString("asset")).toPath()));
        assertEquals(1,new File(directory,"pdfs-v50").listFiles().length);
    }
    @Test public void lazyPagesKeepAspectAndInkIsAbovePdf()throws Exception{
        JSONObject ref=imported().put("index",1);File preview=store.preview(ref,1,()->{});
        Bitmap b=BitmapFactory.decodeFile(preview.getPath());assertEquals(675,b.getWidth());assertEquals(1080,b.getHeight());
        assertEquals(Color.WHITE,b.getPixel(300,20));assertEquals(Color.BLUE,b.getPixel(300,540));b.recycle();
        File output=new File(directory,"native.jpg");
        PageRenderer.renderForExport("{\"strokes\":[[\"#000000\",100,[[150,800,8],[700,800,8]]]]}",output,new JSONArray(),null,preview,()->{});
        b=BitmapFactory.decodeFile(output.getPath());assertTrue(Color.blue(b.getPixel(300,540))<80);assertTrue(Color.blue(b.getPixel(300,600))>180);b.recycle();
        assertEquals(1,new File(directory,"pdf-previews-v50").listFiles().length);
    }
    @Test public void invalidAndCancelledPagesLeaveNoPreview()throws Exception{
        JSONObject ref=imported().put("index",9);
        assertThrows(java.io.IOException.class,()->store.preview(ref,1,()->{}));
        ref.put("index",0);
        assertThrows(IllegalStateException.class,()->store.preview(ref,1,()->{throw new IllegalStateException("cancelled");}));
        assertEquals(0,new File(directory,"pdf-previews-v50").listFiles().length);
        assertThrows(java.io.IOException.class,()->store.asset("../original"));
    }
}
