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
    private boolean active,keyObserved,touchPending,visibilityApplied,softKeyboardSuppressed;
    private long touchStarted,interactionRevision;
    KeyboardController(Activity activity,WebView web){
        this.activity=activity;this.web=web;inputs=(InputManager)activity.getSystemService(Context.INPUT_SERVICE);
        mode=activity.getPreferences(Context.MODE_PRIVATE).getString("keyboard-mode","auto");
        if(!validMode(mode))mode="auto";
    }
    static boolean validMode(String value){return "auto".equals(value)||"virtual".equals(value)||"physical".equals(value);}
    // Suppress the soft input view, never the native IME connection.
    // Connection is informational. Auto follows actual interaction, even when
    // the NearLink keyboard stays connected throughout a touch editing session.
    static boolean suppress(String mode,boolean physicalInput){return "physical".equals(mode)||("auto".equals(mode)&&physicalInput);}
    static boolean hardwareKey(KeyEvent event){
        return (event.getAction()==KeyEvent.ACTION_DOWN||event.getAction()==KeyEvent.ACTION_UP)
            &&(event.getFlags()&KeyEvent.FLAG_SOFT_KEYBOARD)==0
            &&event.getDeviceId()!=KeyCharacterMap.VIRTUAL_KEYBOARD
            &&event.isFromSource(InputDevice.SOURCE_KEYBOARD)&&!event.isSystem();
    }
    static boolean physicalKey(KeyEvent event){return event.getAction()==KeyEvent.ACTION_DOWN&&hardwareKey(event);}
    static boolean physicalPointer(MotionEvent event){
        int action=event.getActionMasked();
        if(action!=MotionEvent.ACTION_DOWN&&action!=MotionEvent.ACTION_MOVE&&action!=MotionEvent.ACTION_HOVER_MOVE
            &&action!=MotionEvent.ACTION_SCROLL&&action!=MotionEvent.ACTION_BUTTON_PRESS)return false;
        // Touchpad events commonly use SOURCE_MOUSE with TOOL_TYPE_FINGER.
        return event.isFromSource(InputDevice.SOURCE_MOUSE)||event.isFromSource(InputDevice.SOURCE_TOUCHPAD)
            ||event.isFromSource(InputDevice.SOURCE_MOUSE_RELATIVE);
    }
    void start(){if(active)return;active=true;if(inputs!=null)inputs.registerInputDeviceListener(this,handler);refresh();}
    void stop(){active=false;visibilityApplied=false;cancelTouch();if(inputs!=null)inputs.unregisterInputDeviceListener(this);handler.removeCallbacksAndMessages(null);activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);}
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
    // Text, Space, dead keys and ordinary modifiers must reach the selected IME
    // first so it can compose and correct words. Only editor shortcuts/navigation
    // bypass it; AltGr (Ctrl+Alt) is text input, not a Ctrl shortcut.
    boolean routeBeforeIme(KeyEvent event){
        if(!active||!hardwareKey(event))return false;
        int code=event.getKeyCode();
        return (event.isCtrlPressed()&&!event.isAltPressed())||event.isMetaPressed()||event.isFunctionPressed()
            ||(code>=KeyEvent.KEYCODE_DPAD_UP&&code<=KeyEvent.KEYCODE_DPAD_RIGHT)
            ||code==KeyEvent.KEYCODE_MOVE_HOME||code==KeyEvent.KEYCODE_MOVE_END
            ||code==KeyEvent.KEYCODE_PAGE_UP||code==KeyEvent.KEYCODE_PAGE_DOWN||code==KeyEvent.KEYCODE_TAB;
    }
    void windowFocused(){
        refresh();
        // Drop any stale resize frame from the IME in the previous activity.
        activity.getWindow().getDecorView().requestApplyInsets();
        web.requestLayout();web.invalidate();
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
        // Close the keys once when switching to physical input. Repeated keys
        // must not dismiss the IME's candidates or finish the composing word.
        if(changed)publish();
    }
    private void cancelTouch(){touchPending=false;interactionRevision++;}
    private boolean touchAllowed(){return active&&touchPending&&SystemClock.uptimeMillis()-touchStarted<2000&&!"physical".equals(mode);}
    // Called only for a touch/pen gesture on a writable DOM field. Restoring
    // inputmode precedes its default focus action; nothing consumes the touch.
    void beginTouchInput(){
        if(!touchAllowed())return;
        physicalInput=false;publish();
    }
    void requestTouchKeyboard(){
        if(!touchAllowed()||suppress(mode,physicalInput))return;
        long request=interactionRevision;
        web.evaluateJavascript("Boolean(window.hinoteKeyboardCanShow && window.hinoteKeyboardCanShow())",value->{
            if(!"true".equals(value)||request!=interactionRevision||!touchAllowed())return;
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime==null)return;
            handler.postDelayed(()->{
                if(request!=interactionRevision||!touchAllowed()||suppress(mode,physicalInput)||!activity.hasWindowFocus()||!web.hasFocus())return;
                // A completed finger/pen tap is an explicit request in both
                // Auto and Virtual, including with a connected NearLink keyboard.
                // Keep the existing input connection; do not use SHOW_FORCED.
                ime.showSoftInput(web,0);touchPending=false;
            },50);
        });
    }
    void setMode(String value){
        if(!validMode(value))return;
        cancelTouch();mode=value;
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode",mode).apply();publish();
        if("virtual".equals(mode))showForModeSelection();
    }
    String state(){return "{\"nativeGate\":false,\"imeConnected\":true,\"mode\":"+JSONObject.quote(mode)+",\"hardware\":"+hardware+",\"interaction\":"+JSONObject.quote(physicalInput?"physical":"touch")+",\"suppress\":"+suppress(mode,physicalInput)+"}";}
    void publish(){
        if(!active)return;
        applyWindowPolicy();
        web.evaluateJavascript("window.onKeyboardState && window.onKeyboardState("+JSONObject.quote(state())+");",null);
    }
    private void applyWindowPolicy(){
        // inputmode=none prevents WebView's automatic opening while preserving
        // its ordinary text InputConnection. A window-level disconnect would
        // also remove native candidates, correction and hardware composition.
        int flag=WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM;
        if((activity.getWindow().getAttributes().flags&flag)!=0)activity.getWindow().clearFlags(flag);
        boolean blocked=suppress(mode,physicalInput);
        int softMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            |(blocked?WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN:WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
        if(activity.getWindow().getAttributes().softInputMode!=softMode){
            activity.getWindow().setSoftInputMode(softMode);
            activity.getWindow().getDecorView().requestApplyInsets();web.requestLayout();
        }
        if(blocked&&(!visibilityApplied||!softKeyboardSuppressed))hideSoftKeyboard();
        visibilityApplied=true;softKeyboardSuppressed=blocked;
    }
    // Called on an actual DOM editor change, not on input/composition updates.
    // A title, table or dialog must honor Solo físico too, without losing focus.
    void editingFieldFocused(){if(active&&suppress(mode,physicalInput))hideSoftKeyboard();}
    private void hideSoftKeyboard(){
        InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if(ime!=null&&activity.hasWindowFocus())ime.hideSoftInputFromWindow(web.getWindowToken(),0);
    }
    private void showForModeSelection(){
        if(!active)return;
        long request=interactionRevision;
        // The published state restores the field's original inputmode first.
        web.evaluateJavascript("Boolean(window.hinoteKeyboardCanShow && window.hinoteKeyboardCanShow())",value->{
            if(!"true".equals(value)||request!=interactionRevision||!active||!"virtual".equals(mode)
                ||!activity.hasWindowFocus()||!web.hasFocus())return;
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime!=null)ime.showSoftInput(web,0);
        });
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){keyObserved=false;refresh();}
}
