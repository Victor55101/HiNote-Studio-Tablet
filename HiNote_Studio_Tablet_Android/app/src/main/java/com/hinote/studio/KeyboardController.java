package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.hardware.input.InputManager;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import org.json.JSONObject;

/** App-local keyboard policy. Never changes Android's global IME settings. */
final class KeyboardController implements InputManager.InputDeviceListener {
    private final Activity activity;private final WebView web;private final InputManager inputs;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private volatile String mode;private volatile boolean hardware;private boolean active,keyObserved;
    KeyboardController(Activity activity,WebView web){
        this.activity=activity;this.web=web;inputs=(InputManager)activity.getSystemService(Context.INPUT_SERVICE);
        mode=activity.getPreferences(Context.MODE_PRIVATE).getString("keyboard-mode","auto");
        if(!validMode(mode))mode="auto";
    }
    static boolean validMode(String value){return "auto".equals(value)||"virtual".equals(value)||"physical".equals(value);}
    static boolean suppress(String mode,boolean hardware){return "physical".equals(mode)||("auto".equals(mode)&&hardware);}
    static boolean physicalKey(KeyEvent event){
        return event.getAction()==KeyEvent.ACTION_DOWN&&(event.getFlags()&KeyEvent.FLAG_SOFT_KEYBOARD)==0
            &&event.getDeviceId()!=KeyCharacterMap.VIRTUAL_KEYBOARD&&event.isFromSource(InputDevice.SOURCE_KEYBOARD)
            &&(event.isPrintingKey()||event.getKeyCode()==KeyEvent.KEYCODE_DEL||event.getKeyCode()==KeyEvent.KEYCODE_ENTER||event.getKeyCode()==KeyEvent.KEYCODE_TAB);
    }
    void start(){if(active)return;active=true;if(inputs!=null)inputs.registerInputDeviceListener(this,handler);refresh();}
    void stop(){active=false;keyObserved=false;if(inputs!=null)inputs.unregisterInputDeviceListener(this);handler.removeCallbacksAndMessages(null);}
    void refresh(){
        boolean found=false;if(inputs!=null)for(int id:inputs.getInputDeviceIds()){
            InputDevice device=inputs.getInputDevice(id);
            if(device!=null&&!device.isVirtual()&&(android.os.Build.VERSION.SDK_INT<27||device.isEnabled())&&device.supportsSource(InputDevice.SOURCE_KEYBOARD)&&device.getKeyboardType()==InputDevice.KEYBOARD_TYPE_ALPHABETIC){found=true;break;}
        }
        Configuration config=activity.getResources().getConfiguration();
        hardware=found||keyObserved||(config.keyboard==Configuration.KEYBOARD_QWERTY&&config.hardKeyboardHidden==Configuration.HARDKEYBOARDHIDDEN_NO);publish();
    }
    void observe(KeyEvent event){if(physicalKey(event)){keyObserved=true;if(!hardware){hardware=true;publish();}hideIfNeeded();}}
    void setMode(String value){if(!validMode(value))return;mode=value;activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode",mode).apply();publish();}
    String state(){return "{\"mode\":"+JSONObject.quote(mode)+",\"hardware\":"+hardware+",\"suppress\":"+suppress(mode,hardware)+"}";}
    void publish(){
        if(!active)return;
        activity.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|(suppress(mode,hardware)?WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN:WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED));
        web.evaluateJavascript("window.onKeyboardState && window.onKeyboardState("+JSONObject.quote(state())+");",null);hideIfNeeded();
    }
    void hideIfNeeded(){
        if(active&&suppress(mode,hardware)&&activity.hasWindowFocus()){
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime!=null)ime.hideSoftInputFromWindow(web.getWindowToken(),0);
        }
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){keyObserved=false;refresh();}
}
