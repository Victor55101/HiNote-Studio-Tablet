package com.hinote.studio;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Test-only host: production native classes and the production keyboard Javascript. */
public final class HarnessActivity extends Activity {
    EditorWebView web;KeyboardController keyboard;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);web=new EditorWebView(this);web.getSettings().setJavaScriptEnabled(true);
        keyboard=new KeyboardController(this,web);web.setKeyboard(keyboard);
        web.addJavascriptInterface(new Bridge(),"AndroidBridge");
        web.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView view,String url){keyboard.publish();}});
        EditorInputLayout root=new EditorInputLayout(this,keyboard);root.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root);
        web.loadUrl("file:///android_asset/index.html");
    }
    public final class Bridge {
        @JavascriptInterface public String getKeyboardState(){return keyboard.state();}
        @JavascriptInterface public void setKeyboardMode(String mode){runOnUiThread(()->keyboard.setMode(mode));}
        @JavascriptInterface public void beginTouchKeyboard(){runOnUiThread(keyboard::beginTouchInput);}
        @JavascriptInterface public void requestTouchKeyboard(){runOnUiThread(keyboard::requestTouchKeyboard);}
        @JavascriptInterface public void keyboardInputApplied(int request){runOnUiThread(()->keyboard.inputApplied(request));}
        @JavascriptInterface public void requestPhysicalKeyboardHide(){runOnUiThread(keyboard::editingFieldTouched);}
        @JavascriptInterface public void setEditingField(boolean editing){runOnUiThread(()->{
            web.setEditing(editing);if(editing)keyboard.editingFieldFocused();else keyboard.editingFieldBlurred();
        });}
    }
    @Override protected void onResume(){super.onResume();if(keyboard!=null)keyboard.start();}
    @Override protected void onPause(){if(keyboard!=null)keyboard.stop();super.onPause();}
    @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(keyboard!=null){if(focus)keyboard.windowFocused();else keyboard.windowBlurred();}}
    @Override public boolean dispatchKeyEvent(KeyEvent event){boolean handled=super.dispatchKeyEvent(event);if(keyboard!=null)keyboard.observe(event);return handled;}
    @Override public boolean dispatchTouchEvent(MotionEvent event){if(keyboard!=null)keyboard.observe(event);return super.dispatchTouchEvent(event);}
    @Override public boolean dispatchGenericMotionEvent(MotionEvent event){if(keyboard!=null)keyboard.observe(event);return super.dispatchGenericMotionEvent(event);}
    @Override public void onDestroy(){if(keyboard!=null)keyboard.stop();if(web!=null)web.destroy();super.onDestroy();}
}
