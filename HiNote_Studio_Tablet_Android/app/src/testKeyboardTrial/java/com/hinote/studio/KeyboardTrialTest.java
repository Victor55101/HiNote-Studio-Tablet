package com.hinote.studio;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.content.res.XmlResourceParser;
import android.os.Looper;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import java.time.Duration;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

/** Real controller/service lifecycle with a recording public-mode backend, not a SwiftKey simulation. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=31)
public class KeyboardTrialTest {
    public static class Host extends Activity {
        @Override public boolean hasWindowFocus(){return true;}
    }
    public static class Service extends KeyboardAccessService {
        final SoftKeyboardOverrideTest.Backend backend=new SoftKeyboardOverrideTest.Backend();
        boolean disabled;
        @Override protected SoftKeyboardOverride.Backend createBackend(){return backend;}
        @Override protected void requestSystemCleanup(){disabled=true;}
        void connect(){onServiceConnected();}
    }
    static class Browser extends WebView {
        boolean writable=true;
        Browser(Context context){super(context);}
        @Override public boolean hasFocus(){return true;}
        @Override public void evaluateJavascript(String script,ValueCallback<String> callback){if(callback!=null)callback.onReceiveValue(writable?"true":"false");}
    }
    private static KeyEvent key(){return new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);}
    private static final class Session implements AutoCloseable {
        final ActivityController<Host> activity=Robolectric.buildActivity(Host.class).setup();
        final Browser web=new Browser(activity.get());final KeyboardController keyboard=new KeyboardController(activity.get(),web);
        final ServiceController<Service> service=Robolectric.buildService(Service.class).create();
        final InputMethodManager ime=(InputMethodManager)activity.get().getSystemService(Context.INPUT_METHOD_SERVICE);
        Session(){
            activity.get().setContentView(web);web.requestFocus();
            Configuration c=activity.get().getResources().getConfiguration();c.keyboard=Configuration.KEYBOARD_QWERTY;c.hardKeyboardHidden=Configuration.HARDKEYBOARDHIDDEN_NO;
            Settings.Secure.putInt(activity.get().getContentResolver(),"show_ime_with_hard_keyboard",0);
            keyboard.start();keyboard.setMode("physical");service.get().connect();idle();
        }
        void idle(){shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(450));}
        void finger(){
            MotionEvent touch=MotionEvent.obtain(1,1,MotionEvent.ACTION_DOWN,100,100,0);touch.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            keyboard.observe(touch);touch.recycle();keyboard.beginTouchInput();keyboard.requestTouchKeyboard();idle();
        }
        @Override public void close(){keyboard.stop();service.destroy();web.destroy();activity.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();}
    }
    @Test public void manifestRegistersOnlyMinimalOptionalKeyboardService()throws Exception{
        Context app=RuntimeEnvironment.getApplication();
        assertEquals("com.hinote.studio.keyboardtrial57",app.getPackageName());
        ServiceInfo info=app.getPackageManager().getServiceInfo(new ComponentName(app,KeyboardAccessService.class),PackageManager.GET_META_DATA);
        assertTrue(info.exported);assertEquals("android.permission.BIND_ACCESSIBILITY_SERVICE",info.permission);
        try(XmlResourceParser xml=app.getResources().getXml(info.metaData.getInt("android.accessibilityservice"))){
            while(xml.next()!=XmlResourceParser.START_TAG){}
            String ns="http://schemas.android.com/apk/res/android";
            // Omitting accessibilityEventTypes means zero events; numeric 0
            // is not a valid AAPT flags literal for this attribute.
            assertEquals(0,xml.getAttributeIntValue(ns,"accessibilityEventTypes",0));
            for(String capability:new String[]{"canRetrieveWindowContent","canRequestFilterKeyEvents","canPerformGestures","canRequestTouchExplorationMode","isAccessibilityTool"})
                assertFalse(capability,xml.getAttributeBooleanValue(ns,capability,true));
        }
    }
    @Test public void connectionAloneDoesNothingThenExplicitVirtualAndPhysicalRequestsAlternate()throws Exception{
        try(Session s=new Session()){
            assertTrue(KeyboardAccessService.available());assertTrue(s.service.get().backend.requests.isEmpty());
            s.keyboard.setMode("virtual");assertEquals(2,s.service.get().backend.mode);s.idle();
            assertTrue(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.observe(key());assertEquals(2,s.service.get().backend.mode);
            s.keyboard.setMode("auto");assertEquals(0,s.service.get().backend.mode);
            s.finger();assertEquals(2,s.service.get().backend.mode);
            s.keyboard.observe(key());assertEquals(0,s.service.get().backend.mode);s.idle();
            assertEquals(0,s.service.get().backend.mode);
            assertTrue(new JSONObject(s.keyboard.state()).getBoolean("imeConnected"));
        }
    }
    @Test public void pauseReleasesModeAndCancelsAllDelayedOpenings(){
        try(Session s=new Session()){
            s.keyboard.setMode("virtual");assertEquals(2,s.service.get().backend.mode);
            s.keyboard.stop();assertEquals(0,s.service.get().backend.mode);
            s.ime.hideSoftInputFromWindow(s.web.getWindowToken(),0);s.idle();
            assertFalse(shadowOf(s.ime).isSoftInputVisible());assertEquals(0,s.service.get().backend.mode);
        }
    }
    @Test public void losingWindowFocusReleasesModeEvenWhileActivityRemainsResumed(){
        try(Session s=new Session()){
            s.keyboard.setMode("virtual");assertEquals(2,s.service.get().backend.mode);
            s.keyboard.windowBlurred();assertEquals(0,s.service.get().backend.mode);
            s.ime.hideSoftInputFromWindow(s.web.getWindowToken(),0);s.idle();
            assertFalse(shadowOf(s.ime).isSoftInputVisible());assertEquals(0,s.service.get().backend.mode);
        }
    }
    @Test public void rejectedOverrideIsReportedWithoutRepeatedGlobalRequests()throws Exception{
        try(Session s=new Session()){
            s.service.get().backend.accepts=false;s.keyboard.setMode("virtual");s.idle();
            assertEquals("refused",new JSONObject(s.keyboard.state()).getString("keyboardAssist"));
            s.keyboard.publish();s.keyboard.setMode("virtual");s.idle();
            assertEquals(java.util.List.of(2),s.service.get().backend.requests);
        }
    }
    @Test public void anotherAccessibilityPolicyIsNeitherReplacedNorResetOnExit(){
        try(Session s=new Session()){
            s.service.get().backend.mode=1;s.keyboard.setMode("virtual");s.idle();s.keyboard.stop();
            assertTrue(s.service.get().backend.requests.isEmpty());assertEquals(1,s.service.get().backend.mode);
        }
    }
    @Test public void failedReleaseDisconnectsOwnServiceForSystemCleanup(){
        try(Session s=new Session()){
            s.keyboard.setMode("virtual");s.service.get().backend.accepts=false;s.keyboard.stop();
            assertTrue(s.service.get().disabled);
        }
    }
    @Test public void revokedServiceRestoresItsModeAndReportsMissingPermission()throws Exception{
        try(Session s=new Session()){
            s.keyboard.setMode("virtual");s.service.get().onUnbind(new Intent());s.idle();
            assertEquals(0,s.service.get().backend.mode);assertFalse(KeyboardAccessService.available());
            assertEquals("permission",new JSONObject(s.keyboard.state()).getString("keyboardAssist"));
        }
    }
    @Test public void preImeRootObservesPhysicalTypingEvenWhenTheChildConsumesIt()throws Exception{
        try(Session s=new Session()){
            s.keyboard.setMode("auto");s.finger();assertEquals(2,s.service.get().backend.mode);
            EditorInputLayout root=new EditorInputLayout(s.activity.get(),s.keyboard);
            View child=new View(s.activity.get()){@Override public boolean dispatchKeyEventPreIme(KeyEvent event){return true;}};
            child.setFocusableInTouchMode(true);root.addView(child);s.activity.get().setContentView(root);child.requestFocus();
            assertTrue(root.dispatchKeyEventPreIme(key()));
            assertEquals(0,s.service.get().backend.mode);
            assertEquals("physical",new JSONObject(s.keyboard.state()).getString("interaction"));
        }
    }
}
