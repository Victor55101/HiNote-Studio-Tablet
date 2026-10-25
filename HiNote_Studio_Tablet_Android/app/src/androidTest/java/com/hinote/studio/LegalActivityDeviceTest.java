package com.hinote.studio;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs the real native UI on Android; browser mocks cannot cover this viewer. */
@RunWith(AndroidJUnit4.class)
public class LegalActivityDeviceTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private final Context context=instrumentation.getTargetContext();
    private LegalActivity start(boolean welcome,String theme){
        context.getSharedPreferences("hinote-appearance",0).edit().putString("theme",theme).commit();
        if(welcome)context.getSharedPreferences("hinote-legal",0).edit().clear().commit();
        Intent intent=new Intent(context,LegalActivity.class).putExtra(LegalActivity.EXTRA_WELCOME,welcome).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        LegalActivity activity=(LegalActivity)instrumentation.startActivitySync(intent);instrumentation.waitForIdleSync();return activity;
    }
    private View tagged(LegalActivity activity,String tag){View found=activity.getWindow().getDecorView().findViewWithTag(tag);assertNotNull(tag,found);assertTrue(found.isShown());return found;}
    private void click(LegalActivity activity,String tag){instrumentation.runOnMainSync(()->assertTrue(tagged(activity,tag).performClick()));instrumentation.waitForIdleSync();}
    private String text(LegalActivity activity,String tag){
        AtomicReference<String> value=new AtomicReference<>();instrumentation.runOnMainSync(()->value.set(((TextView)tagged(activity,tag)).getText().toString()));return value.get();
    }
    private void assertNative(View root){
        assertFalse(root instanceof WebView);assertFalse(root instanceof EditText);
        if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++)assertNative(group.getChildAt(i));}
    }
    private void screenshot(String name)throws Exception{
        instrumentation.waitForIdleSync();Thread.sleep(150);
        Bitmap image=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(image);
        File directory=new File(context.getExternalFilesDir(null),"legal-test-screens");assertTrue(directory.isDirectory()||directory.mkdirs());
        try(FileOutputStream out=new FileOutputStream(new File(directory,name+".png"))){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out));}finally{image.recycle();}
    }
    @Test public void actualPrivacyAndLicensesAreVisibleInBothThemesAndSystemBackReturns()throws Exception{
        for(String theme:new String[]{"light","dark"}){
            LegalActivity activity=start(false,theme);
            try{
                instrumentation.runOnMainSync(()->assertNative(activity.getWindow().getDecorView()));
                assertTrue(text(activity,"legal-version").contains(BuildConfig.VERSION_NAME));screenshot("about-"+theme);
                click(activity,"legal-privacy");String policy=text(activity,"legal-document");
                assertTrue(policy.length()>3000);assertTrue(policy.contains("Hugo Zoé Islas Vázquez"));assertTrue(policy.contains("soporte.hinotestudio@gmail.com"));
                instrumentation.runOnMainSync(()->{TextView article=(TextView)tagged(activity,"legal-document");assertNotNull(article.getLayout());assertTrue(article.getLineCount()>20);});
                screenshot("privacy-"+theme);
                instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);instrumentation.waitForIdleSync();
                assertEquals("Acerca de HiNote Studio",text(activity,"legal-heading"));
                click(activity,"legal-licenses");screenshot("licenses-"+theme);click(activity,"legal-license-2");
                assertTrue(text(activity,"legal-license-text").contains("PYTHON SOFTWARE FOUNDATION"));screenshot("license-detail-"+theme);
                click(activity,"legal-back");assertEquals("Licencias de componentes",text(activity,"legal-heading"));
                click(activity,"legal-back");assertEquals("Acerca de HiNote Studio",text(activity,"legal-heading"));
            }finally{instrumentation.runOnMainSync(activity::finish);instrumentation.waitForIdleSync();}
        }
    }
    @Test public void initialWelcomeIsBriefAndDismissalIsStoredWithoutConsentFlags()throws Exception{
        LegalActivity activity=start(true,"light");
        try{
            assertEquals("Bienvenido a HiNote Studio",text(activity,"legal-heading"));assertEquals("Continuar",text(activity,"legal-back"));
            assertTrue(LegalActivity.needsWelcome(context));screenshot("welcome-light");
            click(activity,"legal-privacy");click(activity,"legal-back");assertEquals("Continuar",text(activity,"legal-back"));
            click(activity,"legal-back");assertFalse(LegalActivity.needsWelcome(context));
        }finally{instrumentation.runOnMainSync(activity::finish);instrumentation.waitForIdleSync();}
    }
    @Test public void editorAutomaticallyShowsWelcomeAndLogoReturnsToTheSameDraft()throws Exception{
        context.getSharedPreferences("hinote-legal",0).edit().clear().commit();
        Instrumentation.ActivityMonitor first=instrumentation.addMonitor(LegalActivity.class.getName(),null,false);
        MainActivity editor=(MainActivity)instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Activity initial=first.waitForActivityWithTimeout(30000);instrumentation.removeMonitor(first);assertTrue(initial instanceof LegalActivity);
        LegalActivity welcome=(LegalActivity)initial;
        try{
            assertEquals("Bienvenido a HiNote Studio",text(welcome,"legal-heading"));click(welcome,"legal-back");
            WebView[] web=new WebView[1];instrumentation.runOnMainSync(()->web[0]=findWeb(editor.getWindow().getDecorView()));assertNotNull(web[0]);
            String prepare="document.getElementById('autoPreview').checked=false;renderLines(migrateTextLists([[{text:'Borrador de prueba',...DEFAULT_STYLE}]]));restoreSelection({start:{line:0,offset:4},end:{line:0,offset:8}});JSON.stringify({lines:readLines(),selection:bookmark()})";
            String before=javascript(web[0],prepare);
            Instrumentation.ActivityMonitor next=instrumentation.addMonitor(LegalActivity.class.getName(),null,false);
            javascript(web[0],"document.getElementById('aboutBtn').click();true");
            Activity opened=next.waitForActivityWithTimeout(10000);instrumentation.removeMonitor(next);assertTrue(opened instanceof LegalActivity);
            LegalActivity about=(LegalActivity)opened;
            assertEquals("Acerca de HiNote Studio",text(about,"legal-heading"));click(about,"legal-privacy");click(about,"legal-back");click(about,"legal-back");
            assertEquals(before,javascript(web[0],"JSON.stringify({lines:readLines(),selection:bookmark()})"));
            assertFalse(LegalActivity.needsWelcome(context));
        }finally{instrumentation.runOnMainSync(()->{if(!welcome.isFinishing())welcome.finish();editor.finish();});instrumentation.waitForIdleSync();}
    }
    private WebView findWeb(View root){
        if(root instanceof WebView)return (WebView)root;
        if(root instanceof ViewGroup){ViewGroup parent=(ViewGroup)root;for(int i=0;i<parent.getChildCount();i++){WebView found=findWeb(parent.getChildAt(i));if(found!=null)return found;}}
        return null;
    }
    private String javascript(WebView web,String script)throws Exception{
        AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        instrumentation.runOnMainSync(()->web.evaluateJavascript(script,result->{value.set(result);done.countDown();}));
        assertTrue("WebView callback",done.await(10,TimeUnit.SECONDS));instrumentation.waitForIdleSync();return value.get();
    }
}
