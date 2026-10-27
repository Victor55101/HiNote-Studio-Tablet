package com.hinote.studio;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.os.SystemClock;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.InputConnection;
import org.json.JSONObject;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Android WebView, Python glyph transport, input connection and exporter. */
@RunWith(AndroidJUnit4.class)
public class ProEditorDeviceTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private WebView web;
    private WebView find(View view){
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
            WebView result=find(((ViewGroup)view).getChildAt(i));if(result!=null)return result;
        }
        return null;
    }
    private String js(String source)throws Exception{
        AtomicReference<String> result=new AtomicReference<>();CountDownLatch latch=new CountDownLatch(1);
        instrumentation.runOnMainSync(()->web.evaluateJavascript(source,value->{result.set(value);latch.countDown();}));
        assertTrue(latch.await(15,TimeUnit.SECONDS));return result.get();
    }
    private void waitFor(String predicate)throws Exception{
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){if("true".equals(js(predicate)))return;Thread.sleep(150);}
        fail("Timed out: "+predicate+"; "+js("JSON.stringify({text:readLines().map(lineText),focus:document.activeElement?.id,selection:bookmark(),hint:document.getElementById('proHint')?.textContent})"));
    }
    @Test public void realWebViewTypesLiveAndExportsTheSameGeometry()throws Exception{
        assertTrue(BuildConfig.PRO_EDITOR);
        Context context=instrumentation.getTargetContext();
        context.getSharedPreferences("hinote-legal",0).edit().putBoolean("welcome_seen_v1",true).commit();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            instrumentation.runOnMainSync(()->web=find(activity.getWindow().getDecorView()));assertNotNull(web);
            waitFor("!!window.ProEditor?.active");
            js("renderLines([[{text:'Apuntes con mi escritura',...DEFAULT_STYLE}]]);restoreSelection({start:{line:0,offset:23},end:{line:0,offset:23}},false);changed();true");
            js("editor.blur();zoom=.65;applyZoom();true");
            instrumentation.runOnMainSync(()->{web.requestFocus();((InputMethodManager)context.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0);});
            Thread.sleep(600);
            JSONObject point=new JSONObject(js("(()=>{const c=ProEditor.testPlan().pages[0].rows[0].carets.at(-1),r=$('canvasShell').getBoundingClientRect();const w=$('previewWrap').getBoundingClientRect();return {x:r.left+c.x*.675*zoom,y:Math.max(w.top+8,Math.min(w.bottom-8,r.top+(c.y-20)*.675*zoom))}})()"));
            int[] location=new int[2];instrumentation.runOnMainSync(()->web.getLocationOnScreen(location));
            double ratio=web.getWidth()/Double.parseDouble(js("window.innerWidth"));
            System.out.println("PRO_DEVICE "+js("JSON.stringify({viewport:[innerWidth,innerHeight,devicePixelRatio],focus:document.activeElement.id,preview:$('previewWrap').getBoundingClientRect().toJSON(),canvas:$('canvasShell').getBoundingClientRect().toJSON()})")+" point="+point+" ratio="+ratio);
            long now=SystemClock.uptimeMillis();
            for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){
                MotionEvent event=MotionEvent.obtain(now,now+(action==MotionEvent.ACTION_UP?100:0),action,location[0]+(float)(point.getDouble("x")*ratio),location[1]+(float)(point.getDouble("y")*ratio),0);
                event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                try{assertTrue(instrumentation.getUiAutomation().injectInputEvent(event,true));}finally{event.recycle();}
            }
            Thread.sleep(500);instrumentation.waitForIdleSync();
            assertEquals(js("JSON.stringify({focus:document.activeElement.id,text:readLines().map(lineText),keyboard:window.hinoteKeyboardCanShow?.()})"),"true",js("document.activeElement===editor"));
            instrumentation.runOnMainSync(()->{
                InputConnection connection=web.onCreateInputConnection(new EditorInfo());
                assertNotNull("Native IME input connection",connection);
                assertTrue(connection.commitText(" Pro",1));
            });
            waitFor("lineText(readLines()[0]).includes(' Pro')");
            assertEquals("true",js("document.body.classList.contains('proUnified') && ProEditor.testPlan().pages[0].items.length>10"));
            js("$('noteTitle').value='Prueba del editor Pro';saveDraft();refreshPreview();true");
            waitFor("!composing && composition?.layout?.engine==='hinote-live-v1'");
            assertEquals("true",js("previewRevision===revision && composition.stroke_counts[0]>0"));
            js("zoom=.8;applyZoom();true");Thread.sleep(250);
            String output=InstrumentationRegistry.getArguments().getString("additionalTestOutputDir");
            File directory=output==null?context.getExternalFilesDir(null):new File(output,"pro-test-screens");
            assertTrue(directory.isDirectory()||directory.mkdirs());Bitmap screenshot=instrumentation.getUiAutomation().takeScreenshot();
            try(FileOutputStream file=new FileOutputStream(new File(directory,"pro-editor-android.png"))){assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG,100,file));}finally{screenshot.recycle();}
            try(FileOutputStream file=new FileOutputStream(new File(directory,"pro-android-metrics.json"))){file.write(js("JSON.stringify(ProEditor.metrics())").getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        }finally{instrumentation.runOnMainSync(activity::finish);}
    }
}
