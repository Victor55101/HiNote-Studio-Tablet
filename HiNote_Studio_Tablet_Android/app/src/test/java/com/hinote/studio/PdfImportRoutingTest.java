package com.hinote.studio;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.util.HashSet;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

/** Exercise the real activity-result dispatcher, without starting Python/Pdfium. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class PdfImportRoutingTest {
    private MainActivity activity;
    private RecordingWebView web;
    private static Field field(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f;}
    private int request(String name)throws Exception{return field(name).getInt(null);}
    private AtomicBoolean importing()throws Exception{return (AtomicBoolean)field("importing").get(activity);}
    private static class RecordingWebView extends WebView {
        String script="";
        RecordingWebView(){super(RuntimeEnvironment.getApplication());}
        @Override public void evaluateJavascript(String text,ValueCallback<String> callback){script=text;}
    }
    @Before public void setup()throws Exception{
        activity=Robolectric.buildActivity(MainActivity.class).get();
        web=new RecordingWebView();field("webView").set(activity,web);field("importTicket").setInt(activity,7);
    }
    @Test public void pdfLaunchHasItsOwnRequestCodeAndMimeType()throws Exception{
        HashSet<Integer> codes=new HashSet<>();
        for(int code:new int[]{request("REQUEST_SAVE"),request("REQUEST_IMAGE"),request("REQUEST_FOLDER"),request("REQUEST_PDF"),CalibrationTasks.IMPORT,CalibrationTasks.SAVE,NotebookTasks.IMPORT,NotebookTasks.SAVE})assertTrue("Request-code collision: "+code,codes.add(code));
        activity.new Bridge().requestPdf(7);
        var started=Shadows.shadowOf(activity).getNextStartedActivityForResult();
        assertEquals(request("REQUEST_PDF"),started.requestCode);
        assertEquals(Intent.ACTION_OPEN_DOCUMENT,started.intent.getAction());assertEquals("application/pdf",started.intent.getType());
        assertTrue(importing().get());
    }
    @Test public void cancellingPdfReleasesImportAndNotifiesEditor()throws Exception{
        importing().set(true);activity.onActivityResult(request("REQUEST_PDF"),Activity.RESULT_CANCELED,null);
        assertFalse(importing().get());assertTrue(web.script.contains("onPdfImported(7,null,null)"));
    }
    @Test public void nativeBusyRejectionAlwaysNotifiesThePdfCaller()throws Exception{
        importing().set(true);activity.new Bridge().requestPdf(8);
        assertTrue(web.script.contains("onPdfImported(8,null,"));assertTrue(web.script.contains("Espera"));assertTrue(importing().get());
    }
    @Test public void selectedPdfRoutesToItsWorkerAndFailureUnlocksEditor()throws Exception{
        ThreadPoolExecutor executor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1)){
            @Override public void execute(Runnable task){task.run();}
        };
        try{
            field("worker").set(activity,executor);importing().set(true);
            activity.onActivityResult(request("REQUEST_PDF"),Activity.RESULT_OK,new Intent().setData(Uri.parse("content://test/document.pdf")));
            assertFalse(importing().get());assertTrue(web.script.contains("onPdfImported(7,null,"));assertTrue(web.script.contains("preparar la importación de PDF"));
        }finally{executor.shutdownNow();}
    }
    @Test public void rejectedWorkerQueueAlsoUnlocksEditor()throws Exception{
        ThreadPoolExecutor executor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1));executor.shutdown();
        field("worker").set(activity,executor);importing().set(true);
        activity.onActivityResult(request("REQUEST_PDF"),Activity.RESULT_OK,new Intent().setData(Uri.parse("content://test/document.pdf")));
        assertFalse(importing().get());assertTrue(web.script.contains("onPdfImported(7,null,"));assertTrue(web.script.contains("ocupado"));
    }
}
