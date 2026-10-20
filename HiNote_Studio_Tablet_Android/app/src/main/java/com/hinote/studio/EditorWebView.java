package com.hinote.studio;

import android.content.Context;
import android.os.SystemClock;
import android.text.InputType;
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
        if(connection!=null)configureEditorInfo(attributes);
        return connection;
    }
    static void configureEditorInfo(EditorInfo attributes){
        int type=attributes.inputType,variation=type&InputType.TYPE_MASK_VARIATION;
        if((type&InputType.TYPE_MASK_CLASS)==InputType.TYPE_CLASS_TEXT
            &&(type&InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)==0
            &&(variation==InputType.TYPE_TEXT_VARIATION_NORMAL||variation==InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT
                ||variation==InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE||variation==InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE)){
            attributes.inputType|=InputType.TYPE_TEXT_FLAG_AUTO_CORRECT;
        }
        // Keep landscape editing in the app; the IME still owns its UI.
        attributes.imeOptions|=EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_FULLSCREEN;
    }
    private void prepareHardwareInput(){
        // Fallback for unhandled hardware keys arriving before Android creates
        // the focused editor's connection. Reuse Chromium's dead-key composer;
        // never recreate the connection between an accent and its letter.
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
    private boolean ownsShortcutRelease(KeyEvent event){
        KeyEvent down=pressed.get(((long)event.getDeviceId()<<32)|(event.getKeyCode()&0xffffffffL));
        return event.getAction()==KeyEvent.ACTION_UP&&down!=null&&keyboard.routeBeforeIme(down);
    }
    @Override public boolean dispatchKeyEventPreIme(KeyEvent event){
        if(keyboard!=null&&KeyboardController.hardwareKey(event))keyboard.observe(event);
        if(keyboard!=null&&(keyboard.routeBeforeIme(event)||ownsShortcutRelease(event))){
            route(event);
            return true; // no second delivery to the IME or Chromium
        }
        return super.dispatchKeyEventPreIme(event);
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        // Android reaches this stage after the IME had the opportunity to
        // consume/compose text. Deliver unhandled hardware events exactly once.
        boolean handled=keyboard!=null&&KeyboardController.hardwareKey(event)?route(event):super.dispatchKeyEvent(event);
        int key=event.getKeyCode();
        return handled||(editing&&key>=KeyEvent.KEYCODE_DPAD_UP&&key<=KeyEvent.KEYCODE_DPAD_RIGHT);
    }
    void releaseHardwareKeys(){
        for(KeyEvent down:pressed.values())deliverHardwareKey(new KeyEvent(down.getDownTime(),SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,down.getKeyCode(),0,0,down.getDeviceId(),down.getScanCode(),down.getFlags()|KeyEvent.FLAG_CANCELED,down.getSource()));
        pressed.clear();
    }
    @Override public void onWindowFocusChanged(boolean focused){if(!focused){releaseHardwareKeys();connectionReady=false;}super.onWindowFocusChanged(focused);}
}
