package com.hinote.studio;

import android.content.Context;
import android.view.KeyEvent;
import android.widget.FrameLayout;

/** Observe physical input before an IME can consume it in WebView's input proxy. */
final class EditorInputLayout extends FrameLayout {
    private final KeyboardController keyboard;
    EditorInputLayout(Context context,KeyboardController keyboard){super(context);this.keyboard=keyboard;}
    @Override public boolean dispatchKeyEventPreIme(KeyEvent event){
        keyboard.observe(event);
        return super.dispatchKeyEventPreIme(event);
    }
}
