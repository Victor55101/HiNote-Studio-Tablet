package com.hinote.studio;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import static org.junit.Assert.*;

/** Pdfium itself runs in PdfStoreDeviceTest. This JVM tests our storage,
 * cancellation boundary and real Skia composition above a PDF raster. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class PdfStoreTest {
    @Test public void rejectsMissingAndInvalidAssetReferences()throws Exception{
        File directory=Files.createTempDirectory("pdf-test-").toFile();PdfStore store=new PdfStore(directory,directory);
        assertThrows(java.io.IOException.class,()->store.asset("../original"));
        assertThrows(java.io.IOException.class,()->store.asset("a".repeat(64)));
    }
    @Test public void cancelledPreviewDoesNotOpenPdfOrWritePartialFiles()throws Exception{
        File directory=Files.createTempDirectory("pdf-test-").toFile();PdfStore store=new PdfStore(directory,directory);
        String id="a".repeat(64);File source=new File(directory,"pdfs-v50/"+id+".pdf");Files.write(source.toPath(),new byte[]{1,2,3});
        JSONObject ref=new JSONObject().put("asset",id).put("index",0);
        assertThrows(IllegalStateException.class,()->store.preview(ref,1,()->{throw new IllegalStateException("cancelled");}));
        assertEquals(0,new File(directory,"pdf-previews-v50").listFiles().length);
        assertArrayEquals(new byte[]{1,2,3},Files.readAllBytes(source.toPath()));
    }
    @Test public void pdfBackgroundKeepsItsSizeAndInkIsAboveIt()throws Exception{
        File directory=Files.createTempDirectory("pdf-test-").toFile(),background=new File(directory,"page.png");
        Bitmap source=Bitmap.createBitmap(675,1080,Bitmap.Config.ARGB_8888);source.eraseColor(Color.BLUE);
        try(FileOutputStream out=new FileOutputStream(background)){source.compress(Bitmap.CompressFormat.PNG,100,out);}source.recycle();
        String ink="{\"strokes\":[[\"#000000\",100,[[150,800,8],[700,800,8]]]]}";
        for(int resolution:new int[]{1,2}){
            File preview=new File(directory,"preview-"+resolution+".png");PageRenderer.renderPreview(ink,preview,resolution,background,()->{});
            Bitmap b=BitmapFactory.decodeFile(preview.getPath());assertEquals(675*resolution,b.getWidth());assertEquals(1080*resolution,b.getHeight());
            assertEquals(Color.BLUE,b.getPixel(300*resolution,600*resolution));assertTrue(Color.blue(b.getPixel(300*resolution,540*resolution))<80);b.recycle();
        }
        File output=new File(directory,"native.jpg");PageRenderer.renderForExport(ink,output,new JSONArray(),background,()->{});
        Bitmap b=BitmapFactory.decodeFile(output.getPath());assertTrue(Color.blue(b.getPixel(300,540))<80);assertTrue(Color.blue(b.getPixel(300,600))>180);b.recycle();
    }
}
