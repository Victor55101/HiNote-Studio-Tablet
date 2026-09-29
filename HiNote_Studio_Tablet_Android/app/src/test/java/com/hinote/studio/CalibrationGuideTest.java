package com.hinote.studio;

import android.graphics.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.*;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, manifest=Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class CalibrationGuideTest {
    private File dir,png,thumb;
    private JSONObject guide;
    @Before public void setup()throws Exception{
        dir=Files.createTempDirectory("guide-test-").toFile();png=new File(dir,"guide.png");thumb=new File(dir,"thumb.jpg");
        guide=new JSONObject().put("v",1).put("id","0123456789abcdef0123456789abcdef").put("page",0).put("pages",2).put("chars","aÑá_•*¡!€±→√");
        CalibrationGuide.render(guide,png,thumb);
    }
    @Test public void guideRoundTripsItsUnicodeCharactersAndVersion()throws Exception{
        JSONObject read=CalibrationGuide.read(png);assertEquals(guide.getString("chars"),read.getString("chars"));assertEquals(guide.getString("id"),read.getString("id"));
        assertEquals(2,read.getInt("pages"));assertEquals(1,read.getInt("v"));
        File diagnostic=new File("build/reports/tests/calibration-guide.png");diagnostic.getParentFile().mkdirs();Files.copy(png.toPath(),diagnostic.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
    @Test public void survivesJpegReencodingAndResolutionChange()throws Exception{
        Bitmap b=BitmapFactory.decodeFile(png.getPath());Bitmap scaled=Bitmap.createScaledBitmap(b,800,1280,true);File jpg=new File(dir,"reencoded.jpg");
        try(FileOutputStream out=new FileOutputStream(jpg)){scaled.compress(Bitmap.CompressFormat.JPEG,85,out);}finally{scaled.recycle();b.recycle();}
        assertEquals(guide.getString("chars"),CalibrationGuide.read(jpg).getString("chars"));
    }
    @Test public void damagedCodeAndCropAreRejected()throws Exception{
        Bitmap b=BitmapFactory.decodeFile(png.getPath()).copy(Bitmap.Config.ARGB_8888,true);
        Canvas c=new Canvas(b);Paint p=new Paint();p.setColor(Color.WHITE);c.drawRect(20,1460,400,1490,p);
        File broken=new File(dir,"broken.png");try(FileOutputStream out=new FileOutputStream(broken)){b.compress(Bitmap.CompressFormat.PNG,100,out);}b.recycle();
        assertThrows(IOException.class,()->CalibrationGuide.read(broken));
        Bitmap crop=Bitmap.createBitmap(300,800,Bitmap.Config.ARGB_8888);File wrong=new File(dir,"cropped.png");
        try(FileOutputStream out=new FileOutputStream(wrong)){crop.compress(Bitmap.CompressFormat.PNG,100,out);}crop.recycle();
        assertThrows(IOException.class,()->CalibrationGuide.read(wrong));
    }
    @Test public void widthChangesPreviewWithoutMovingItsCenter()throws Exception{
        long[] coverage=new long[3];
        for(int level=1;level<=3;level++){
            File image=new File(dir,"ink-"+level+".png");
            PageRenderer.render("{\"strokes\":[[\"#000000\",100,[[100,100,1],[300,100,1]],"+(level/3.0)+"]]}",image,false,58.8,new JSONArray(),true,()->{});
            Bitmap b=BitmapFactory.decodeFile(image.getPath());double weightedY=0;
            // Thin subpixel lines may cover the same number of pixels while
            // differing in alpha. Measure ink coverage, not a binary threshold.
            for(int y=0;y<b.getHeight();y++)for(int x=60;x<220;x++){
                int alpha=Color.alpha(b.getPixel(x,y));coverage[level-1]+=alpha;weightedY+=(y+.5)*alpha;
            }
            assertTrue(coverage[level-1]>0);assertEquals(67.5,weightedY/coverage[level-1],.6);b.recycle();
            File diagnostic=new File("build/reports/tests/ink-"+level+".png");diagnostic.getParentFile().mkdirs();
            Files.copy(image.toPath(),diagnostic.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        assertTrue("1 < 2: "+coverage[0]+" / "+coverage[1],coverage[0]<coverage[1]);
        assertTrue("2 < 3: "+coverage[1]+" / "+coverage[2],coverage[1]<coverage[2]);
    }
}
