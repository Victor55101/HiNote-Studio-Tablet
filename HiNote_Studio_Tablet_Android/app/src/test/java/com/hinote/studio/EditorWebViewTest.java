package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.WindowManager;
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
        RecordingWebView(Context context){super(context);}
        @Override protected boolean deliverHardwareKey(KeyEvent event){delivered.add(event);return true;}
    }
    private static KeyEvent key(int action,int code,int modifiers){return new KeyEvent(1,2,action,code,0,modifiers,4,0,0,InputDevice.SOURCE_KEYBOARD);}
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
    @Test public void virtualOverrideDoesNotInterceptImeKeys(){
        var host=Robolectric.buildActivity(Activity.class).setup();var activity=host.get();var web=new RecordingWebView(activity);activity.setContentView(web);
        var keyboard=new KeyboardController(activity,web);web.setKeyboard(keyboard);keyboard.start();keyboard.setMode("virtual");
        try{
            web.dispatchKeyEventPreIme(key(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0));assertTrue(web.delivered.isEmpty());
            assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
            keyboard.setMode("auto");KeyEvent soft=new KeyEvent(1,2,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,-1,0,KeyEvent.FLAG_SOFT_KEYBOARD,InputDevice.SOURCE_KEYBOARD);
            web.dispatchKeyEventPreIme(soft);assertTrue(web.delivered.isEmpty());
        }finally{keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
}
