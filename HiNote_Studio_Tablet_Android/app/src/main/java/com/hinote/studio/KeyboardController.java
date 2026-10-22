package com.hinote.studio;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.hardware.input.InputManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.ViewTreeObserver;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import org.json.JSONObject;

/** App-local keyboard policy. Never changes Android's global IME settings. */
final class KeyboardController implements InputManager.InputDeviceListener {
    private final Activity activity;private final WebView web;private final InputManager inputs;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private volatile String mode;private volatile boolean hardware,physicalInput;
    private boolean active,keyObserved,touchPending,restartForTouch,nonEditingTouch;
    private volatile boolean imeVisible;
    private final ViewTreeObserver.OnGlobalLayoutListener layoutListener=this::checkImeVisibility;
    private long touchStarted,interactionRevision;
    KeyboardController(Activity activity,WebView web){
        this.activity=activity;this.web=web;inputs=(InputManager)activity.getSystemService(Context.INPUT_SERVICE);
        mode=activity.getPreferences(Context.MODE_PRIVATE).getString("keyboard-mode","auto");
        if(!validMode(mode))mode="auto";
    }
    static boolean validMode(String value){return "auto".equals(value)||"virtual".equals(value)||"physical".equals(value);}
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
    void start(){if(active)return;active=true;if(inputs!=null)inputs.registerInputDeviceListener(this,handler);activity.getWindow().getDecorView().getViewTreeObserver().addOnGlobalLayoutListener(layoutListener);
        // Floating keyboards can change IME visibility without resizing a view.
        if(android.os.Build.VERSION.SDK_INT>=30)web.setOnApplyWindowInsetsListener((view,insets)->{setImeVisibility(insets.isVisible(android.view.WindowInsets.Type.ime()));return view.onApplyWindowInsets(insets);});
        checkImeVisibility();refresh();}
    void stop(){active=false;cancelTouch();if(inputs!=null)inputs.unregisterInputDeviceListener(this);activity.getWindow().getDecorView().getViewTreeObserver().removeOnGlobalLayoutListener(layoutListener);if(android.os.Build.VERSION.SDK_INT>=30)web.setOnApplyWindowInsetsListener(null);handler.removeCallbacksAndMessages(null);activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);}
    private void checkImeVisibility(){
        boolean visible;
        android.view.View decor=activity.getWindow().getDecorView();
        if(android.os.Build.VERSION.SDK_INT>=30){android.view.WindowInsets insets=decor.getRootWindowInsets();visible=insets!=null&&insets.isVisible(android.view.WindowInsets.Type.ime());}
        else{Rect frame=new Rect();decor.getWindowVisibleDisplayFrame(frame);visible=decor.getRootView().getHeight()-frame.bottom>160*activity.getResources().getDisplayMetrics().density;}
        setImeVisibility(visible);
    }
    private void setImeVisibility(boolean visible){if(visible!=imeVisible){imeVisible=visible;if(active)web.evaluateJavascript("window.onKeyboardVisibility && window.onKeyboardVisibility("+visible+");",null);}}
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
    // Keep Shift/Ctrl/Alt/Fn and their releases out of a separate IME stream.
    boolean routeBeforeIme(KeyEvent event){return active&&hardwareKey(event);}
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
        // One transition, not a hide request per keystroke. The window stays
        // disconnected from the soft IME until an editable field is touched.
        if(changed)publish();
    }
    private void cancelTouch(){touchPending=false;interactionRevision++;}
    private boolean touchAllowed(){return active&&touchPending&&SystemClock.uptimeMillis()-touchStarted<2000&&!"physical".equals(mode);}
    // Called only for a touch/pen gesture on a writable DOM field. Restoring
    // inputmode precedes its default focus action; nothing consumes the touch.
    void beginTouchInput(){
        if(!touchAllowed())return;
        restartForTouch|=suppress(mode,physicalInput)||nonEditingTouch;nonEditingTouch=false;physicalInput=false;publish();
    }
    // A command may restore the caret without being a request to type. Keep
    // an already visible IME for formatting, but never reopen a dismissed one.
    void cancelTouchInput(boolean previewNavigation){
        if(!active||!touchPending)return;
        cancelTouch();checkImeVisibility();
        if("auto".equals(mode)&&(previewNavigation||!imeVisible)){nonEditingTouch=true;publish();}
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
                // Allow the window flag change to reach WindowManager before
                // reconnecting the same focused editor. Never blur/refocus it.
                if(restartForTouch){ime.restartInput(web);restartForTouch=false;}
                // Explicit user request (0), not SHOW_IMPLICIT or SHOW_FORCED:
                // allow the IME with hardware attached, without changing globals.
                ime.showSoftInput(web,0);touchPending=false;
            },50);
        });
    }
    void setMode(String value){
        if(!validMode(value))return;
        boolean wasSuppressed=suppress(mode,physicalInput)||nonEditingTouch;cancelTouch();mode=value;nonEditingTouch=false;
        restartForTouch|=wasSuppressed&&!suppress(mode,physicalInput);
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode",mode).apply();publish();
    }
    String state(){return "{\"nativeGate\":true,\"mode\":"+JSONObject.quote(mode)+",\"hardware\":"+hardware+",\"interaction\":"+JSONObject.quote(physicalInput?"physical":"touch")+",\"suppress\":"+(suppress(mode,physicalInput)||nonEditingTouch)+",\"imeVisible\":"+imeVisible+"}";}
    void publish(){
        if(!active)return;
        applyWindowPolicy(suppress(mode,physicalInput)||nonEditingTouch);
        web.evaluateJavascript("window.onKeyboardState && window.onKeyboardState("+JSONObject.quote(state())+");",null);
    }
    private void applyWindowPolicy(boolean blocked){
        int flag=WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM;
        boolean wasBlocked=(activity.getWindow().getAttributes().flags&flag)!=0;
        if(blocked!=wasBlocked){
            if(blocked){
                // inputmode=none and ALWAYS_HIDDEN are not a persistent gate:
                // WebView/IME can request a new composition UI on physical keys.
                // Keep key focus, but prevent this window from being an IME
                // target. Do not use NOT_FOCUSABLE, null input connections or
                // reconstruct typed text: normal WebView editing must keep working.
                InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if(ime!=null&&activity.hasWindowFocus())ime.hideSoftInputFromWindow(web.getWindowToken(),0);
                activity.getWindow().addFlags(flag);restartForTouch=true;
            }else activity.getWindow().clearFlags(flag);
        }
        int softMode=blocked?WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN:WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED;
        if(activity.getWindow().getAttributes().softInputMode!=softMode){activity.getWindow().setSoftInputMode(softMode);activity.getWindow().getDecorView().requestApplyInsets();web.requestLayout();}
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){keyObserved=false;refresh();}
}
