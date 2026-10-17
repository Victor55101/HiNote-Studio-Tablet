package com.hinote.studio;

import android.content.Context;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.WebView;
import java.util.HashMap;
import java.util.Map;

/** Keep physical key pairs together; never inject events into other apps. */
class EditorWebView extends WebView {
    private KeyboardController keyboard;
    private final Map<Long,KeyEvent> pressed=new HashMap<>();
    private boolean editing,connectionReady;
    EditorWebView(Context context){super(context);}
    void setKeyboard(KeyboardController controller){keyboard=controller;}
    void setEditing(boolean value){editing=value;connectionReady=false;}
    protected InputConnection createEditorConnection(EditorInfo attributes){return super.onCreateInputConnection(attributes);}
    @Override public InputConnection onCreateInputConnection(EditorInfo attributes){
        InputConnection connection=createEditorConnection(attributes);
        connectionReady=connection!=null;
        return connection;
    }
    private void prepareHardwareInput(){
        // On a cold physical-only start Android does not ask an IME-blocked
        // window for its connection. Chromium then dispatches raw keys without
        // its native dead-key composer. Initialize the ordinary WebView
        // connection once per focused editor, without showing/restarting an IME.
        // Never recreate it between an accent and the following key.
        if(!connectionReady&&(editing||onCheckIsTextEditor()))onCreateInputConnection(new EditorInfo());
    }
    protected boolean deliverHardwareKey(KeyEvent event){return super.dispatchKeyEvent(event);}
    static KeyEvent navigationKey(KeyEvent event){
        if(!event.isFunctionPressed())return event;
        int code=event.getKeyCode(),mapped=code;
        if(code==KeyEvent.KEYCODE_DPAD_LEFT)mapped=KeyEvent.KEYCODE_MOVE_HOME;
        else if(code==KeyEvent.KEYCODE_DPAD_RIGHT)mapped=KeyEvent.KEYCODE_MOVE_END;
        else if(code==KeyEvent.KEYCODE_DPAD_UP)mapped=KeyEvent.KEYCODE_PAGE_UP;
        else if(code==KeyEvent.KEYCODE_DPAD_DOWN)mapped=KeyEvent.KEYCODE_PAGE_DOWN;
        return mapped==code?event:new KeyEvent(event.getDownTime(),event.getEventTime(),event.getAction(),mapped,event.getRepeatCount(),event.getMetaState()&~KeyEvent.META_FUNCTION_ON,event.getDeviceId(),event.getScanCode(),event.getFlags(),event.getSource());
    }
    private boolean route(KeyEvent event){
        prepareHardwareInput();
        long key=((long)event.getDeviceId()<<32)|(event.getKeyCode()&0xffffffffL);
        KeyEvent down=pressed.get(key),sent=navigationKey(event);
        if(event.getAction()==KeyEvent.ACTION_DOWN)pressed.put(key,sent);
        else if(event.getAction()==KeyEvent.ACTION_UP){
            pressed.remove(key);
            // Fn can be released before the arrow: its key-up still matches.
            if(down!=null&&sent.getKeyCode()!=down.getKeyCode())sent=new KeyEvent(event.getDownTime(),event.getEventTime(),KeyEvent.ACTION_UP,down.getKeyCode(),0,event.getMetaState()&~KeyEvent.META_FUNCTION_ON,event.getDeviceId(),event.getScanCode(),event.getFlags(),event.getSource());
        }
        boolean handled=deliverHardwareKey(sent);
        if(keyboard!=null)keyboard.observe(event);
        return handled;
    }
    @Override public boolean dispatchKeyEventPreIme(KeyEvent event){
        if(keyboard!=null&&keyboard.routeBeforeIme(event)){
            route(event);
            return true; // no second delivery to the IME or Chromium
        }
        return super.dispatchKeyEventPreIme(event);
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        // The disconnected IME can send keys directly here instead of pre-IME.
        boolean handled=keyboard!=null&&keyboard.routeBeforeIme(event)?route(event):super.dispatchKeyEvent(event);
        int key=event.getKeyCode();
        return handled||(editing&&key>=KeyEvent.KEYCODE_DPAD_UP&&key<=KeyEvent.KEYCODE_DPAD_RIGHT);
    }
    void releaseHardwareKeys(){
        for(KeyEvent down:pressed.values())deliverHardwareKey(new KeyEvent(down.getDownTime(),SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,down.getKeyCode(),0,0,down.getDeviceId(),down.getScanCode(),down.getFlags()|KeyEvent.FLAG_CANCELED,down.getSource()));
        pressed.clear();
    }
    @Override public void onWindowFocusChanged(boolean focused){if(!focused){releaseHardwareKeys();connectionReady=false;}super.onWindowFocusChanged(focused);}
}
