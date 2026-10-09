package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.hardware.input.InputManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import org.json.JSONObject;

/** App-local keyboard policy. Never changes Android's global IME settings. */
final class KeyboardController implements InputManager.InputDeviceListener {
    private final Activity activity;private final WebView web;private final InputManager inputs;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private volatile String mode;private volatile boolean hardware,physicalInput;
    private boolean active,keyObserved,touchPending,restartForTouch;
    private long touchStarted,interactionRevision,lastHideRequest=-1000;
    KeyboardController(Activity activity,WebView web){
        this.activity=activity;this.web=web;inputs=(InputManager)activity.getSystemService(Context.INPUT_SERVICE);
        mode=activity.getPreferences(Context.MODE_PRIVATE).getString("keyboard-mode","auto");
        if(!validMode(mode))mode="auto";
    }
    static boolean validMode(String value){return "auto".equals(value)||"virtual".equals(value)||"physical".equals(value);}
    // Connection is informational. Auto follows actual interaction, even when
    // the NearLink keyboard stays connected throughout a touch editing session.
    static boolean suppress(String mode,boolean physicalInput){return "physical".equals(mode)||("auto".equals(mode)&&physicalInput);}
    static boolean physicalKey(KeyEvent event){
        return event.getAction()==KeyEvent.ACTION_DOWN&&(event.getFlags()&KeyEvent.FLAG_SOFT_KEYBOARD)==0
            &&event.getDeviceId()!=KeyCharacterMap.VIRTUAL_KEYBOARD&&event.isFromSource(InputDevice.SOURCE_KEYBOARD)
            &&(event.isPrintingKey()||event.getKeyCode()==KeyEvent.KEYCODE_DEL||event.getKeyCode()==KeyEvent.KEYCODE_FORWARD_DEL
                ||event.getKeyCode()==KeyEvent.KEYCODE_ENTER||event.getKeyCode()==KeyEvent.KEYCODE_TAB
                ||(event.getKeyCode()>=KeyEvent.KEYCODE_DPAD_UP&&event.getKeyCode()<=KeyEvent.KEYCODE_DPAD_RIGHT));
    }
    static boolean physicalPointer(MotionEvent event){
        int action=event.getActionMasked();
        if(action!=MotionEvent.ACTION_DOWN&&action!=MotionEvent.ACTION_MOVE&&action!=MotionEvent.ACTION_HOVER_MOVE
            &&action!=MotionEvent.ACTION_SCROLL&&action!=MotionEvent.ACTION_BUTTON_PRESS)return false;
        // Touchpad events commonly use SOURCE_MOUSE with TOOL_TYPE_FINGER.
        return event.isFromSource(InputDevice.SOURCE_MOUSE)||event.isFromSource(InputDevice.SOURCE_TOUCHPAD)
            ||event.isFromSource(InputDevice.SOURCE_MOUSE_RELATIVE);
    }
    void start(){if(active)return;active=true;if(inputs!=null)inputs.registerInputDeviceListener(this,handler);refresh();}
    void stop(){active=false;keyObserved=false;cancelTouch();if(inputs!=null)inputs.unregisterInputDeviceListener(this);handler.removeCallbacksAndMessages(null);}
    void refresh(){
        boolean found=false;if(inputs!=null)for(int id:inputs.getInputDeviceIds()){
            InputDevice device=inputs.getInputDevice(id);
            if(device!=null&&!device.isVirtual()&&(android.os.Build.VERSION.SDK_INT<27||device.isEnabled())&&device.supportsSource(InputDevice.SOURCE_KEYBOARD)&&device.getKeyboardType()==InputDevice.KEYBOARD_TYPE_ALPHABETIC){found=true;break;}
        }
        Configuration config=activity.getResources().getConfiguration();
        boolean wasConnected=hardware;
        hardware=found||keyObserved||(config.keyboard==Configuration.KEYBOARD_QWERTY&&config.hardKeyboardHidden==Configuration.HARDKEYBOARDHIDDEN_NO);
        if(wasConnected&&!hardware){physicalInput=false;cancelTouch();}publish();
    }
    void observe(KeyEvent event){if(physicalKey(event)){keyObserved=true;hardware=true;usePhysicalInput();}}
    void observe(MotionEvent event){
        if(physicalPointer(event)){usePhysicalInput();return;}
        if(event.isFromSource(InputDevice.SOURCE_TOUCHSCREEN)||event.isFromSource(InputDevice.SOURCE_STYLUS)){
            int action=event.getActionMasked();
            if(action==MotionEvent.ACTION_DOWN){cancelTouch();touchPending=true;touchStarted=SystemClock.uptimeMillis();}
            else if(action==MotionEvent.ACTION_CANCEL||action==MotionEvent.ACTION_POINTER_DOWN)cancelTouch();
        }
    }
    private void usePhysicalInput(){
        cancelTouch();boolean changed=!physicalInput;physicalInput=true;
        if(changed)publish();else hideIfNeeded();
    }
    private void cancelTouch(){touchPending=false;interactionRevision++;}
    private boolean touchAllowed(){return active&&touchPending&&SystemClock.uptimeMillis()-touchStarted<2000&&!"physical".equals(mode);}
    // Called only for a touch/pen gesture on a writable DOM field. Restoring
    // inputmode precedes its default focus action; nothing consumes the touch.
    void beginTouchInput(){
        if(!touchAllowed())return;
        restartForTouch|=suppress(mode,physicalInput);physicalInput=false;publish();
    }
    void requestTouchKeyboard(){
        if(!touchAllowed()||suppress(mode,physicalInput))return;
        long request=interactionRevision;
        web.evaluateJavascript("Boolean(window.hinoteKeyboardCanShow && window.hinoteKeyboardCanShow())",value->{
            if(!"true".equals(value)||request!=interactionRevision||!touchAllowed())return;
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime==null)return;
            if(restartForTouch){ime.restartInput(web);restartForTouch=false;}
            handler.postDelayed(()->{
                if(request!=interactionRevision||!touchAllowed()||suppress(mode,physicalInput)||!activity.hasWindowFocus()||!web.hasFocus())return;
                // Explicit user request (0), not SHOW_IMPLICIT or SHOW_FORCED:
                // allow the IME with hardware attached, without changing globals.
                ime.showSoftInput(web,0);touchPending=false;
            },50);
        });
    }
    void setMode(String value){
        if(!validMode(value))return;
        boolean wasSuppressed=suppress(mode,physicalInput);cancelTouch();mode=value;
        restartForTouch|=wasSuppressed&&!suppress(mode,physicalInput);
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode",mode).apply();publish();
    }
    String state(){return "{\"mode\":"+JSONObject.quote(mode)+",\"hardware\":"+hardware+",\"interaction\":"+JSONObject.quote(physicalInput?"physical":"touch")+",\"suppress\":"+suppress(mode,physicalInput)+"}";}
    void publish(){
        if(!active)return;
        activity.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|(suppress(mode,physicalInput)?WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN:WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED));
        web.evaluateJavascript("window.onKeyboardState && window.onKeyboardState("+JSONObject.quote(state())+");",null);hideIfNeeded();
    }
    void hideIfNeeded(){
        if(active&&suppress(mode,physicalInput)&&activity.hasWindowFocus()){
            long now=SystemClock.uptimeMillis();if(now-lastHideRequest<120)return;lastHideRequest=now;
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime!=null)ime.hideSoftInputFromWindow(web.getWindowToken(),0);
        }
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){keyObserved=false;refresh();}
}
