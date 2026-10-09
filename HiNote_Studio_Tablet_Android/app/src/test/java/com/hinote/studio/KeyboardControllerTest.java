package com.hinote.studio;

import android.app.Activity;
import android.content.res.Configuration;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.WebView;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class KeyboardControllerTest {
    @Test public void automaticModeUsesInteractionAndKeepsManualOverrides(){
        assertTrue(KeyboardController.suppress("auto",true));assertFalse(KeyboardController.suppress("auto",false));
        assertFalse(KeyboardController.suppress("virtual",true));assertTrue(KeyboardController.suppress("physical",false));
        assertFalse(KeyboardController.validMode("anything"));
    }
    private static KeyEvent physicalTyping(){return new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);}
    private static MotionEvent motion(int action,int source){
        MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords position=new MotionEvent.PointerCoords();position.x=100;position.y=100;position.pressure=1;
        return MotionEvent.obtain(1,1,action,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{position},0,0,1,1,4,0,source,0);
    }
    private static final class Session implements AutoCloseable {
        final ActivityController<Activity> host=Robolectric.buildActivity(Activity.class).setup();
        final Activity activity=host.get();final WebView web=new WebView(activity);
        final KeyboardController keyboard=new KeyboardController(activity,web);
        Session(){
            activity.setContentView(web);
            Configuration config=activity.getResources().getConfiguration();config.keyboard=Configuration.KEYBOARD_QWERTY;config.hardKeyboardHidden=Configuration.HARDKEYBOARDHIDDEN_NO;
            keyboard.start();keyboard.setMode("auto");
        }
        JSONObject state()throws Exception{return new JSONObject(keyboard.state());}
        void event(int action,int source){MotionEvent e=motion(action,source);try{keyboard.observe(e);}finally{e.recycle();}}
        void finger(){event(MotionEvent.ACTION_DOWN,InputDevice.SOURCE_TOUCHSCREEN);keyboard.beginTouchInput();}
        @Override public void close(){keyboard.stop();web.destroy();host.pause().stop().destroy();}
    }
    @Test public void touchAndPhysicalInputAlternateWithoutDisconnectingNearLink()throws Exception{
        try(Session s=new Session()){
            assertTrue(s.state().getBoolean("hardware"));assertFalse(s.state().getBoolean("suppress"));
            s.keyboard.observe(physicalTyping());assertTrue(s.state().getBoolean("suppress"));
            s.finger();assertTrue(s.state().getBoolean("hardware"));assertFalse(s.state().getBoolean("suppress"));
            s.keyboard.refresh();assertFalse(s.state().getBoolean("suppress"));
            s.event(MotionEvent.ACTION_HOVER_MOVE,InputDevice.SOURCE_MOUSE);assertTrue(s.state().getBoolean("suppress"));
            s.finger();assertFalse(s.state().getBoolean("suppress"));assertTrue(s.state().getBoolean("hardware"));
        }
    }
    @Test public void lateTouchRequestsCannotOverrideNewTypingOrManualPhysicalMode()throws Exception{
        try(Session s=new Session()){
            s.finger();s.keyboard.observe(physicalTyping());s.keyboard.beginTouchInput();s.keyboard.requestTouchKeyboard();
            assertTrue(s.state().getBoolean("suppress"));
            s.keyboard.setMode("physical");s.finger();assertTrue(s.state().getBoolean("suppress"));
            s.keyboard.setMode("virtual");s.keyboard.observe(physicalTyping());assertFalse(s.state().getBoolean("suppress"));
            s.keyboard.setMode("auto");assertTrue(s.state().getBoolean("suppress"));
            s.event(MotionEvent.ACTION_DOWN,InputDevice.SOURCE_TOUCHSCREEN);s.event(MotionEvent.ACTION_CANCEL,InputDevice.SOURCE_TOUCHSCREEN);
            s.keyboard.beginTouchInput();assertTrue(s.state().getBoolean("suppress"));
        }
    }
    @Test public void trackpadFingerSourceCountsAsPhysicalButScreenTouchAndHoverEntryDoNot(){
        for(int source:new int[]{InputDevice.SOURCE_MOUSE,InputDevice.SOURCE_TOUCHPAD,InputDevice.SOURCE_MOUSE_RELATIVE}){
            MotionEvent e=motion(MotionEvent.ACTION_HOVER_MOVE,source);assertTrue(KeyboardController.physicalPointer(e));e.recycle();
        }
        MotionEvent touch=motion(MotionEvent.ACTION_DOWN,InputDevice.SOURCE_TOUCHSCREEN),pen=motion(MotionEvent.ACTION_HOVER_MOVE,InputDevice.SOURCE_STYLUS),enter=motion(MotionEvent.ACTION_HOVER_ENTER,InputDevice.SOURCE_MOUSE);
        assertFalse(KeyboardController.physicalPointer(touch));assertFalse(KeyboardController.physicalPointer(pen));assertFalse(KeyboardController.physicalPointer(enter));touch.recycle();pen.recycle();enter.recycle();
    }
    @Test public void imeAndVolumeKeysNeverCountAsTypingOnHardware(){
        KeyEvent real=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);
        KeyEvent virtual=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,-1,0,0,InputDevice.SOURCE_KEYBOARD);
        KeyEvent soft=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,KeyEvent.FLAG_SOFT_KEYBOARD,InputDevice.SOURCE_KEYBOARD);
        KeyEvent volume=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_VOLUME_UP,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);
        assertTrue(KeyboardController.physicalKey(real));assertFalse(KeyboardController.physicalKey(virtual));assertFalse(KeyboardController.physicalKey(soft));assertFalse(KeyboardController.physicalKey(volume));
    }
}
