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
        boolean windowFocused=true;
        @Override public boolean hasWindowFocus(){return windowFocused;}
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
    static class Keyboard extends KeyboardController {
        boolean fullPanel;
        Keyboard(Activity activity,WebView web){super(activity,web);}
        @Override protected boolean fullKeyboardPanelVisible(){return fullPanel;}
    }
    private static KeyEvent key(){return new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);}
    private static final class Session implements AutoCloseable {
        final ActivityController<Host> activity=Robolectric.buildActivity(Host.class).setup();
        final Browser web=new Browser(activity.get());final Keyboard keyboard=new Keyboard(activity.get(),web);
        final ServiceController<Service> service=Robolectric.buildService(Service.class).create();
        final InputMethodManager ime=(InputMethodManager)activity.get().getSystemService(Context.INPUT_METHOD_SERVICE);
        Session(){this(false);}
        Session(boolean virtualEnabled){
            activity.get().setContentView(web);web.requestFocus();
            Configuration c=activity.get().getResources().getConfiguration();c.keyboard=Configuration.KEYBOARD_QWERTY;c.hardKeyboardHidden=Configuration.HARDKEYBOARDHIDDEN_NO;
            Settings.Secure.putInt(activity.get().getContentResolver(),"show_ime_with_hard_keyboard",virtualEnabled?1:0);
            service.get().backend.virtualEnabled=virtualEnabled;
            keyboard.start();keyboard.setMode("physical");service.get().connect();idle();
        }
        void idle(){shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(450));}
        void up(){keyboard.observe(KeyEvent.changeAction(key(),KeyEvent.ACTION_UP));}
        int pending()throws Exception{return new JSONObject(keyboard.state()).getInt("pendingPhysicalInput");}
        void apply()throws Exception{keyboard.inputApplied(pending());up();idle();}
        void finger(){
            MotionEvent touch=MotionEvent.obtain(1,1,MotionEvent.ACTION_DOWN,100,100,0);touch.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            keyboard.observe(touch);touch.recycle();keyboard.beginTouchInput();keyboard.requestTouchKeyboard();idle();
        }
        @Override public void close(){keyboard.stop();service.destroy();web.destroy();activity.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();}
    }
    @Test public void manifestRegistersOnlyMinimalOptionalKeyboardService()throws Exception{
        Context app=RuntimeEnvironment.getApplication();
        assertEquals("com.hinote.studio.keyboardtrial59",app.getPackageName());
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
            assertTrue(new JSONObject(s.keyboard.state()).getBoolean("nativeGate"));
            s.keyboard.setMode("virtual");assertEquals(2,s.service.get().backend.mode);s.idle();
            assertTrue(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.observe(key());s.up();assertEquals(2,s.service.get().backend.mode);
            s.keyboard.setMode("auto");assertEquals(0,s.service.get().backend.mode);
            s.finger();assertEquals(2,s.service.get().backend.mode);
            s.keyboard.observe(key());assertEquals(2,s.service.get().backend.mode);s.apply();
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
            s.activity.get().windowFocused=false;s.keyboard.windowBlurred();assertEquals(0,s.service.get().backend.mode);
            s.keyboard.keyboardAccessChanged();s.idle();assertEquals(0,s.service.get().backend.mode);
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
            child.setFocusableInTouchMode(true);root.addView(child);s.activity.get().setContentView(root);
            // Lay out the replacement hierarchy before requesting focus. A
            // zero-size child is not an eligible key target in Android 12.
            root.measure(View.MeasureSpec.makeMeasureSpec(800,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(600,View.MeasureSpec.EXACTLY));
            root.layout(0,0,800,600);assertTrue(child.requestFocus());assertSame(child,root.getFocusedChild());
            assertTrue(root.dispatchKeyEventPreIme(key()));
            assertEquals(2,s.service.get().backend.mode);s.keyboard.inputApplied(s.pending());
            assertTrue(root.dispatchKeyEventPreIme(KeyEvent.changeAction(key(),KeyEvent.ACTION_UP)));s.idle();
            assertEquals(0,s.service.get().backend.mode);
            assertEquals("physical",new JSONObject(s.keyboard.state()).getString("interaction"));
        }
    }
    @Test public void firstPhysicalKeyClosesOnlyAfterItsInputAndRelease()throws Exception{
        try(Session s=new Session()){
            s.keyboard.setMode("auto");s.finger();
            assertEquals(2,s.service.get().backend.mode);assertTrue(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.observe(key());int request=s.pending();assertTrue(request>0);
            // The IME still has its original view/connection while accepting H.
            assertEquals(2,s.service.get().backend.mode);assertTrue(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.inputApplied(request);
            shadowOf(Looper.getMainLooper()).idle();assertEquals(2,s.service.get().backend.mode);
            s.up();s.idle();assertEquals(0,s.service.get().backend.mode);
            assertEquals(0,s.pending());
            // Robolectric does not run the IME's settings observer. Remaining
            // visible here proves we did not send the redundant hide which
            // would remove real candidates; the emulator checks the final UI.
            assertTrue(shadowOf(s.ime).isSoftInputVisible());
        }
    }
    @Test public void staleInputAcknowledgementCannotCloseANewerTouchRequest()throws Exception{
        try(Session s=new Session()){
            s.keyboard.setMode("auto");s.finger();s.keyboard.observe(key());int request=s.pending();s.up();
            s.finger();assertEquals(2,s.service.get().backend.mode);
            s.keyboard.inputApplied(request);s.idle();assertEquals(2,s.service.get().backend.mode);
        }
    }
    @Test public void delayedShowIsClosedInSoloFisicoButCompactCandidatesAreLeftAlone(){
        try(Session s=new Session()){
            s.keyboard.setMode("virtual");s.keyboard.setMode("physical");
            s.keyboard.fullPanel=true;s.ime.showSoftInput(s.web,0);
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(350));assertFalse(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.fullPanel=false;s.ime.showSoftInput(s.web,0);
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500));assertTrue(shadowOf(s.ime).isSoftInputVisible());
        }
    }
    @Test public void physicalCaretTapClosesLateKeysEvenWithoutAFieldFocusChange(){
        try(Session s=new Session()){
            s.keyboard.setMode("physical");s.idle();s.ime.showSoftInput(s.web,0);
            s.keyboard.fullPanel=true;s.keyboard.editingFieldTouched();assertFalse(shadowOf(s.ime).isSoftInputVisible());
            s.keyboard.fullPanel=false;s.ime.showSoftInput(s.web,0);s.keyboard.editingFieldTouched();s.idle();
            assertTrue(shadowOf(s.ime).isSoftInputVisible());
        }
    }
    @Test public void enabledPreferenceWaitsForTheFirstNativeEditBeforeClosingKeys()throws Exception{
        try(Session s=new Session(true)){
            s.keyboard.setMode("auto");s.finger();assertEquals(0,s.service.get().backend.mode);
            s.keyboard.observe(key());assertEquals(0,s.service.get().backend.mode);
            s.apply();assertEquals(1,s.service.get().backend.mode);
            assertEquals("physical",new JSONObject(s.keyboard.state()).getString("interaction"));
            assertEquals("physical",new JSONObject(s.keyboard.state()).getString("keyboardAssist"));
            s.finger();assertEquals(0,s.service.get().backend.mode);
            assertEquals(1,Settings.Secure.getInt(s.activity.get().getContentResolver(),"show_ime_with_hard_keyboard",0));
            s.keyboard.setMode("physical");assertEquals(1,s.service.get().backend.mode);
            s.activity.get().windowFocused=false;s.keyboard.windowBlurred();assertEquals(0,s.service.get().backend.mode);
            s.keyboard.keyboardAccessChanged();s.idle();assertEquals(0,s.service.get().backend.mode);
        }
    }
}
