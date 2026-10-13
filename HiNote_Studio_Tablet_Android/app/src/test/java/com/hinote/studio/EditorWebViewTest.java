package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
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
        int connections;
        boolean connectionAvailable=true;
        RecordingWebView(Context context){super(context);}
        @Override protected InputConnection createEditorConnection(EditorInfo attributes){connections++;return connectionAvailable?new BaseInputConnection(this,true):null;}
        @Override protected boolean deliverHardwareKey(KeyEvent event){delivered.add(event);return true;}
    }
    private static KeyEvent key(int action,int code,int modifiers){return new KeyEvent(1,2,action,code,0,modifiers,4,0,0,InputDevice.SOURCE_KEYBOARD);}
    @Test public void coldPhysicalModeInitializesNativeComposerOnceBeforeUnmodifiedKeyPairs(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode","physical").commit();
        var web=new RecordingWebView(activity);activity.setContentView(web);var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();web.setEditing(true);
        try{
            assertFalse(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
            // Robolectric cannot run Chromium's composer. Check its connection
            // lifecycle and unchanged input stream; no app-side text conversion.
            for(int code:new int[]{KeyEvent.KEYCODE_APOSTROPHE,KeyEvent.KEYCODE_A,KeyEvent.KEYCODE_SPACE,KeyEvent.KEYCODE_GRAVE,KeyEvent.KEYCODE_N}){
                KeyEvent down=key(KeyEvent.ACTION_DOWN,code,KeyEvent.META_ALT_RIGHT_ON),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
                web.dispatchKeyEvent(down);web.dispatchKeyEvent(up);
                assertEquals(1,web.connections);assertSame(down,web.delivered.get(web.delivered.size()-2));assertSame(up,web.delivered.get(web.delivered.size()-1));
                assertFalse(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
            }
            keyboard.setMode("virtual");keyboard.setMode("physical");web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_E,0));assertEquals(1,web.connections);
            web.onWindowFocusChanged(false);web.onWindowFocusChanged(true);web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_APOSTROPHE,0));assertEquals(2,web.connections);
            web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_E,0));assertEquals(2,web.connections);
            web.setEditing(true);web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_I,0));assertEquals(3,web.connections); // another DOM field
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void systemCreatedConnectionIsReusedAndUnavailableConnectionsCanRetry(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();web.setEditing(true);
        try{
            web.onCreateInputConnection(new EditorInfo());web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_APOSTROPHE,0));assertEquals(1,web.connections);
            web.setEditing(true);web.connectionAvailable=false;web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_SHIFT_LEFT,0));assertEquals(2,web.connections);
            web.connectionAvailable=true;web.dispatchKeyEvent(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,KeyEvent.META_SHIFT_ON));assertEquals(3,web.connections);
            web.dispatchKeyEvent(key(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_A,KeyEvent.META_SHIFT_ON));assertEquals(3,web.connections);
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void firstPhysicalCharacterAndKeyUpReachEditorExactlyOnce(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();keyboard.setMode("auto");
        try{
            assertTrue(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
            KeyEvent down=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_O,KeyEvent.META_SHIFT_ON),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
            assertTrue(web.dispatchKeyEventPreIme(down));assertTrue(web.dispatchKeyEventPreIme(up));
            assertEquals(2,web.delivered.size());assertSame(down,web.delivered.get(0));assertSame(up,web.delivered.get(1));
            assertEquals(KeyEvent.META_SHIFT_ON,web.delivered.get(0).getMetaState());
            assertFalse(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
            assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
            keyboard.stop();keyboard.start();keyboard.windowFocused();
            assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
            assertTrue(web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DEL,0)));assertEquals(3,web.delivered.size());
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void virtualOverrideKeepsPhysicalPairsTogetherWithoutHidingIme(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();keyboard.setMode("virtual");
        try{
            assertTrue(web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0)));assertTrue(web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_A,0)));assertEquals(2,web.delivered.size());
            assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
            keyboard.setMode("auto");KeyEvent soft=new KeyEvent(1,2,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,-1,0,KeyEvent.FLAG_SOFT_KEYBOARD,InputDevice.SOURCE_KEYBOARD);
            web.dispatchKeyEventPreIme(soft);assertEquals(2,web.delivered.size());
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }

    @Test public void modifiersAndReleasesStayTogetherAcrossImeGateAndModeChanges(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();keyboard.setMode("auto");
        try{
            for(int code:new int[]{KeyEvent.KEYCODE_SHIFT_LEFT,KeyEvent.KEYCODE_SHIFT_RIGHT,KeyEvent.KEYCODE_CTRL_LEFT,KeyEvent.KEYCODE_ALT_RIGHT,KeyEvent.KEYCODE_FUNCTION,KeyEvent.KEYCODE_CAPS_LOCK}){
                web.delivered.clear();KeyEvent down=key(KeyEvent.ACTION_DOWN,code,0),up=KeyEvent.changeAction(down,KeyEvent.ACTION_UP);
                assertTrue(web.dispatchKeyEventPreIme(down));keyboard.setMode("virtual");
                web.dispatchKeyEvent(up);assertEquals(2,web.delivered.size());assertSame(down,web.delivered.get(0));assertSame(up,web.delivered.get(1));
                web.releaseHardwareKeys();assertEquals(2,web.delivered.size());keyboard.setMode("auto");
            }
            web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_SHIFT_LEFT,KeyEvent.META_SHIFT_ON));
            int before=web.delivered.size();web.onWindowFocusChanged(false);assertEquals(before+1,web.delivered.size());
            KeyEvent release=web.delivered.get(before);assertEquals(KeyEvent.ACTION_UP,release.getAction());assertEquals(0,release.getMetaState());assertTrue(release.isCanceled());
            web.releaseHardwareKeys();assertEquals(before+1,web.delivered.size());
            keyboard.stop();assertTrue(WindowManager.LayoutParams.mayUseInputMethod(activity.getWindow().getAttributes().flags));
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void fnArrowsBecomeNavigationWithoutDroppingShiftOrLosingKeyUp(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();
        try{
            int[] arrows={KeyEvent.KEYCODE_DPAD_LEFT,KeyEvent.KEYCODE_DPAD_RIGHT,KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_DPAD_DOWN};
            int[] expected={KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.KEYCODE_MOVE_END,KeyEvent.KEYCODE_PAGE_UP,KeyEvent.KEYCODE_PAGE_DOWN};
            for(int i=0;i<arrows.length;i++){
                web.delivered.clear();KeyEvent down=key(KeyEvent.ACTION_DOWN,arrows[i],KeyEvent.META_FUNCTION_ON|KeyEvent.META_SHIFT_ON);
                web.dispatchKeyEventPreIme(down);web.dispatchKeyEvent(key(KeyEvent.ACTION_UP,arrows[i],0));
                assertEquals(2,web.delivered.size());assertEquals(expected[i],web.delivered.get(0).getKeyCode());assertTrue(web.delivered.get(0).isShiftPressed());assertFalse(web.delivered.get(0).isFunctionPressed());assertEquals(expected[i],web.delivered.get(1).getKeyCode());
                assertEquals(down.getDeviceId(),web.delivered.get(0).getDeviceId());
            }
            KeyEvent home=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.META_SHIFT_ON);assertSame(home,EditorWebView.navigationKey(home));
            KeyEvent volume=key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_VOLUME_UP,0);assertFalse(keyboard.routeBeforeIme(volume));
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
}
