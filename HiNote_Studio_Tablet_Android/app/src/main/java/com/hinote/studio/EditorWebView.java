package com.hinote.studio;

import android.content.Context;
import android.view.KeyEvent;
import android.webkit.WebView;
import java.util.HashSet;
import java.util.Set;

/** Deliver real hardware keys to Chromium before an open IME can swallow them. */
class EditorWebView extends WebView {
    private KeyboardController keyboard;
    private final Set<Long> directKeys=new HashSet<>();
    private boolean editing;
    EditorWebView(Context context){super(context);}
    void setKeyboard(KeyboardController controller){keyboard=controller;}
    void setEditing(boolean value){editing=value;}
    protected boolean deliverHardwareKey(KeyEvent event){return super.dispatchKeyEvent(event);}
    @Override public boolean dispatchKeyEventPreIme(KeyEvent event){
        long key=((long)event.getDeviceId()<<32)|(event.getKeyCode()&0xffffffffL);
        boolean down=event.getAction()==KeyEvent.ACTION_DOWN;
        if(keyboard!=null&&((down&&keyboard.routeBeforeIme(event))||directKeys.contains(key))){
            if(down)directKeys.add(key);else directKeys.remove(key);
            // Send the original event once, including modifiers, repeat count,
            // dead keys and the matching key-up. Then change the window policy.
            // Returning true prevents a second trip through the soft IME.
            deliverHardwareKey(event);
            keyboard.observe(event);
            return true;
        }
        return super.dispatchKeyEventPreIme(event);
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        boolean handled=super.dispatchKeyEvent(event);
        int key=event.getKeyCode();
        return handled||(editing&&key>=KeyEvent.KEYCODE_DPAD_UP&&key<=KeyEvent.KEYCODE_DPAD_RIGHT);
    }
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(!focused)directKeys.clear();}
}
