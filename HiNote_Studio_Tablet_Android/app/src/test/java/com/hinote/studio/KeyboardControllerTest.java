package com.hinote.studio;

import android.view.InputDevice;
import android.view.KeyEvent;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class KeyboardControllerTest {
    @Test public void automaticModeRestoresVirtualKeyboardWhenHardwareDisconnects(){
        assertTrue(KeyboardController.suppress("auto",true));assertFalse(KeyboardController.suppress("auto",false));
        assertFalse(KeyboardController.suppress("virtual",true));assertTrue(KeyboardController.suppress("physical",false));
        assertFalse(KeyboardController.validMode("anything"));
    }
    @Test public void imeAndVolumeKeysNeverCountAsTypingOnHardware(){
        KeyEvent real=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);
        KeyEvent virtual=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,-1,0,0,InputDevice.SOURCE_KEYBOARD);
        KeyEvent soft=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,0,4,0,KeyEvent.FLAG_SOFT_KEYBOARD,InputDevice.SOURCE_KEYBOARD);
        KeyEvent volume=new KeyEvent(1,1,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_VOLUME_UP,0,0,4,0,0,InputDevice.SOURCE_KEYBOARD);
        assertTrue(KeyboardController.physicalKey(real));assertFalse(KeyboardController.physicalKey(virtual));assertFalse(KeyboardController.physicalKey(soft));assertFalse(KeyboardController.physicalKey(volume));
    }
}
