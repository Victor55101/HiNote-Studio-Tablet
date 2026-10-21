package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
import android.text.InputType;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,31},manifest=Config.NONE)
public class EditorWebViewTest {
    static class RecordingWebView extends EditorWebView {
        final List<KeyEvent> delivered=new ArrayList<>();
        int connections;boolean connectionAvailable=true;InputConnection nativeConnection;
        RecordingWebView(Context context){super(context);}
        @Override protected InputConnection createEditorConnection(EditorInfo attributes){
            connections++;return nativeConnection=connectionAvailable?new BaseInputConnection(this,true):null;
        }
        @Override protected boolean deliverHardwareKey(KeyEvent event){delivered.add(event);return true;}
    }
    private static KeyEvent key(int action,int code,int modifiers){
        return new KeyEvent(1,2,action,code,0,modifiers,4,0,0,InputDevice.SOURCE_KEYBOARD);
    }
    static class Session implements AutoCloseable {
        final org.robolectric.android.controller.ActivityController<Activity> host=Robolectric.buildActivity(Activity.class).setup();
        final Activity activity=host.get();final RecordingWebView web=new RecordingWebView(activity);
        final KeyboardController keyboard=new KeyboardController(activity,web);
        Session(){activity.setContentView(web);web.setKeyboard(keyboard);keyboard.start();web.setEditing(true);}
        void connected(){
            assertTrue(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
            assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
        }
        @Override public void close(){keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void textSpaceEnterDeleteAndDeadKeysReachImeFirstInEveryMode(){
        try(Session s=new Session()){
            for(String mode:new String[]{"auto","physical","virtual"}){
                s.keyboard.setMode(mode);s.web.delivered.clear();
                for(int code:new int[]{KeyEvent.KEYCODE_A,KeyEvent.KEYCODE_SPACE,KeyEvent.KEYCODE_ENTER,KeyEvent.KEYCODE_DEL,KeyEvent.KEYCODE_APOSTROPHE,KeyEvent.KEYCODE_GRAVE}){
                    KeyEvent down=key(KeyEvent.ACTION_DOWN,code,0),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
                    assertFalse(s.keyboard.routeBeforeIme(down));
                    assertFalse(s.web.dispatchKeyEventPreIme(down));assertFalse(s.web.dispatchKeyEventPreIme(up));
                    // Simulate an IME consuming this word: the app must not deliver it itself.
                    assertTrue(s.web.delivered.isEmpty());s.connected();
                }
            }
        }
    }
    @Test public void unhandledHardwarePairsReachEditorExactlyOnceAfterIme(){
        try(Session s=new Session()){
            KeyEvent down=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_O,KeyEvent.META_SHIFT_ON),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
            assertFalse(s.web.dispatchKeyEventPreIme(down));assertTrue(s.web.dispatchKeyEvent(down));
            assertFalse(s.web.dispatchKeyEventPreIme(up));assertTrue(s.web.dispatchKeyEvent(up));
            assertEquals(2,s.web.delivered.size());assertSame(down,s.web.delivered.get(0));assertSame(up,s.web.delivered.get(1));s.connected();
            s.keyboard.stop();s.keyboard.start();s.keyboard.windowFocused();s.connected();
        }
    }
    @Test public void coldHardwareFallbackReusesChromiumComposerAcrossAccentAndLetter(){
        try(Session s=new Session()){
            s.keyboard.setMode("physical");
            for(int code:new int[]{KeyEvent.KEYCODE_APOSTROPHE,KeyEvent.KEYCODE_A,KeyEvent.KEYCODE_SPACE,KeyEvent.KEYCODE_GRAVE,KeyEvent.KEYCODE_N}){
                KeyEvent down=key(KeyEvent.ACTION_DOWN,code,KeyEvent.META_ALT_RIGHT_ON),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
                s.web.dispatchKeyEvent(down);s.web.dispatchKeyEvent(up);assertEquals(1,s.web.connections);
                assertSame(down,s.web.delivered.get(s.web.delivered.size()-2));assertSame(up,s.web.delivered.get(s.web.delivered.size()-1));s.connected();
            }
            s.keyboard.setMode("virtual");s.keyboard.setMode("physical");s.web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_E,0));assertEquals(1,s.web.connections);
            s.web.onWindowFocusChanged(false);s.web.onWindowFocusChanged(true);s.web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_I,0));assertEquals(2,s.web.connections);
        }
    }
    @Test public void systemCreatedConnectionIsReusedAndUnavailableConnectionsCanRetry(){
        try(Session s=new Session()){
            s.web.onCreateInputConnection(new EditorInfo());s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_APOSTROPHE,0));assertEquals(1,s.web.connections);
            s.web.setEditing(true);s.web.connectionAvailable=false;s.web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_SHIFT_LEFT,0));assertEquals(2,s.web.connections);
            s.web.connectionAvailable=true;s.web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,KeyEvent.META_SHIFT_ON));assertEquals(3,s.web.connections);
            s.web.dispatchKeyEvent(key(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_A,KeyEvent.META_SHIFT_ON));assertEquals(3,s.web.connections);
        }
    }
    @Test public void altGrAndOrdinaryModifiersReachImeWhileCtrlShortcutsKeepTheirRelease(){
        try(Session s=new Session()){
            for(int code:new int[]{KeyEvent.KEYCODE_SHIFT_LEFT,KeyEvent.KEYCODE_SHIFT_RIGHT,KeyEvent.KEYCODE_ALT_RIGHT,KeyEvent.KEYCODE_CAPS_LOCK}){
                assertFalse(s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,code,0)));
                assertFalse(s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_UP,code,0)));
            }
            KeyEvent altGr=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_Q,KeyEvent.META_CTRL_ON|KeyEvent.META_ALT_RIGHT_ON|KeyEvent.META_ALT_ON);
            assertFalse(s.web.dispatchKeyEventPreIme(altGr));assertTrue(s.web.delivered.isEmpty());
            for(int code:new int[]{KeyEvent.KEYCODE_A,KeyEvent.KEYCODE_Z,KeyEvent.KEYCODE_B}){
                s.web.delivered.clear();KeyEvent down=key(KeyEvent.ACTION_DOWN,code,KeyEvent.META_CTRL_ON);
                assertTrue(s.web.dispatchKeyEventPreIme(down));s.keyboard.setMode("virtual");
                KeyEvent up=key(KeyEvent.ACTION_UP,code,0);assertTrue(s.web.dispatchKeyEventPreIme(up));
                assertEquals(2,s.web.delivered.size());assertSame(down,s.web.delivered.get(0));assertSame(up,s.web.delivered.get(1));
                s.web.releaseHardwareKeys();assertEquals(2,s.web.delivered.size());s.connected();
            }
        }
    }
    @Test public void candidateNumbersAndTheirModifiersVisitImeBeforeAnyEditorDelivery(){
        try(Session s=new Session()){
            for(int code:new int[]{KeyEvent.KEYCODE_CTRL_LEFT,KeyEvent.KEYCODE_CTRL_RIGHT,KeyEvent.KEYCODE_1,KeyEvent.KEYCODE_2,KeyEvent.KEYCODE_3,
                KeyEvent.KEYCODE_NUMPAD_1,KeyEvent.KEYCODE_NUMPAD_2,KeyEvent.KEYCODE_NUMPAD_3}){
                KeyEvent down=key(KeyEvent.ACTION_DOWN,code,KeyEvent.META_CTRL_ON),up=key(KeyEvent.ACTION_UP,code,0);
                assertFalse(s.keyboard.routeBeforeIme(down));assertFalse(s.web.dispatchKeyEventPreIme(down));assertFalse(s.web.dispatchKeyEventPreIme(up));
                // If the provider consumes the chord, it must never reach the editor.
                assertTrue(s.web.delivered.isEmpty());
            }
        }
    }
    @Test public void unhandledCandidateChordStillReachesEditorOnlyOnceAfterIme(){
        try(Session s=new Session()){
            KeyEvent down=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_2,KeyEvent.META_CTRL_ON),up=key(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_2,0);
            assertFalse(s.web.dispatchKeyEventPreIme(down));assertTrue(s.web.dispatchKeyEvent(down));
            assertFalse(s.web.dispatchKeyEventPreIme(up));assertTrue(s.web.dispatchKeyEvent(up));
            assertEquals(List.of(down,up),s.web.delivered);
        }
    }
    @Test public void focusLossReleasesOnlyKeysActuallyDeliveredToEditor(){
        try(Session s=new Session()){
            s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0));assertTrue(s.web.delivered.isEmpty());
            s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_B,KeyEvent.META_CTRL_ON));assertEquals(1,s.web.delivered.size());
            s.web.onWindowFocusChanged(false);assertEquals(2,s.web.delivered.size());
            KeyEvent release=s.web.delivered.get(1);assertEquals(KeyEvent.ACTION_UP,release.getAction());assertEquals(0,release.getMetaState());assertTrue(release.isCanceled());
            s.web.releaseHardwareKeys();assertEquals(2,s.web.delivered.size());
        }
    }
    @Test public void fnArrowsBecomeNavigationWithoutDroppingShiftOrLosingKeyUp(){
        try(Session s=new Session()){
            int[] arrows={KeyEvent.KEYCODE_DPAD_LEFT,KeyEvent.KEYCODE_DPAD_RIGHT,KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_DPAD_DOWN};
            int[] expected={KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.KEYCODE_MOVE_END,KeyEvent.KEYCODE_PAGE_UP,KeyEvent.KEYCODE_PAGE_DOWN};
            for(int i=0;i<arrows.length;i++){
                s.web.delivered.clear();KeyEvent down=key(KeyEvent.ACTION_DOWN,arrows[i],KeyEvent.META_FUNCTION_ON|KeyEvent.META_SHIFT_ON);
                s.web.dispatchKeyEventPreIme(down);s.web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_UP,arrows[i],0));
                assertEquals(2,s.web.delivered.size());assertEquals(expected[i],s.web.delivered.get(0).getKeyCode());
                assertTrue(s.web.delivered.get(0).isShiftPressed());assertFalse(s.web.delivered.get(0).isFunctionPressed());
                assertEquals(expected[i],s.web.delivered.get(1).getKeyCode());assertEquals(down.getDeviceId(),s.web.delivered.get(0).getDeviceId());
            }
            KeyEvent home=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.META_SHIFT_ON);assertSame(home,EditorWebView.navigationKey(home));
            assertFalse(s.keyboard.routeBeforeIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_VOLUME_UP,0)));
        }
    }
    @Test public void normalTextKeepsNativeConnectionWithAutocorrectionAndNoFullscreenExtraction(){
        try(Session s=new Session()){
            EditorInfo info=new EditorInfo();info.inputType=InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE;
            InputConnection actual=s.web.onCreateInputConnection(info);assertSame(s.web.nativeConnection,actual);
            assertNotEquals(0,info.inputType&InputType.TYPE_TEXT_FLAG_AUTO_CORRECT);
            assertNotEquals(0,info.inputType&InputType.TYPE_TEXT_FLAG_MULTI_LINE);
            assertNotEquals(0,info.imeOptions&EditorInfo.IME_FLAG_NO_EXTRACT_UI);assertNotEquals(0,info.imeOptions&EditorInfo.IME_FLAG_NO_FULLSCREEN);
            s.keyboard.setMode("physical");s.keyboard.setMode("virtual");s.keyboard.setMode("auto");assertEquals(1,s.web.connections);s.connected();
        }
    }
    @Test public void numericPasswordEmailAndExplicitLiteralFieldsKeepTheirInputHints(){
        for(int type:new int[]{InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD,
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS}){
            EditorInfo info=new EditorInfo();info.inputType=type;EditorWebView.configureEditorInfo(info);assertEquals(type,info.inputType);
        }
    }
}
