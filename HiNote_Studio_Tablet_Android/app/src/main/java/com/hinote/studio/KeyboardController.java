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
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Keyboard policy; only the opt-in trial may acquire the temporary accessibility override. */
class KeyboardController implements InputManager.InputDeviceListener,KeyboardAccessService.Client {
    private final Activity activity;private final WebView web;private final InputManager inputs;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private volatile String mode;private volatile boolean hardware,physicalInput;
    private boolean active,keyObserved,touchPending,visibilityApplied,softKeyboardSuppressed;
    private long touchStarted,interactionRevision,editorRevision;
    private final Set<Long> heldKeys=new HashSet<>();
    private int inputSequence;
    private volatile int pendingInput;
    private boolean inputApplied,pendingNeedsText,pendingDeadKey;
    private long closeSequence,verifyCloseUntil,pendingVerifyUntil;
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
    void start(){if(active)return;active=true;KeyboardAccessService.watch(this);if(inputs!=null)inputs.registerInputDeviceListener(this,handler);refresh();}
    void stop(){active=false;visibilityApplied=false;cancelTouch();cancelPendingInput();cancelCloseVerification();heldKeys.clear();KeyboardAccessService.unwatch(this);if(inputs!=null)inputs.unregisterInputDeviceListener(this);handler.removeCallbacksAndMessages(null);activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);}
    @Override public void keyboardAccessChanged(){
        if(!active)return;
        if(!nativeVisibilityControl()){cancelPendingInput();heldKeys.clear();}
        publish();
        if(BuildConfig.KEYBOARD_TRIAL&&"virtual".equals(mode))showForModeSelection();
    }
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
        // The IME needs modifiers and its own Ctrl shortcuts, including the
        // numbered candidates. Only shortcuts actually owned by this editor
        // bypass it. Unknown chords stay available to the keyboard provider.
        if(KeyEvent.isModifierKey(code))return false;
        boolean editorChord=code==KeyEvent.KEYCODE_A||code==KeyEvent.KEYCODE_B||code==KeyEvent.KEYCODE_I
            ||code==KeyEvent.KEYCODE_U||code==KeyEvent.KEYCODE_Z||code==KeyEvent.KEYCODE_Y
            ||code==KeyEvent.KEYCODE_C||code==KeyEvent.KEYCODE_X||code==KeyEvent.KEYCODE_V;
        return (editorChord&&((event.isCtrlPressed()&&!event.isAltPressed())||event.isMetaPressed()))||event.isFunctionPressed()
            ||(code>=KeyEvent.KEYCODE_DPAD_UP&&code<=KeyEvent.KEYCODE_DPAD_RIGHT)
            ||code==KeyEvent.KEYCODE_MOVE_HOME||code==KeyEvent.KEYCODE_MOVE_END
            ||code==KeyEvent.KEYCODE_PAGE_UP||code==KeyEvent.KEYCODE_PAGE_DOWN||code==KeyEvent.KEYCODE_TAB;
    }
    void windowFocused(){
        refresh();
        // Drop any stale resize frame from the IME in the previous activity.
        activity.getWindow().getDecorView().requestApplyInsets();
        web.requestLayout();web.invalidate();
        if(BuildConfig.KEYBOARD_TRIAL&&"virtual".equals(mode))showForModeSelection();
    }
    void windowBlurred(){
        if(!BuildConfig.KEYBOARD_TRIAL)return;
        // Multi-window activities may stay resumed while another app has focus.
        // Release the global override there too, not just during onPause.
        cancelTouch();cancelPendingInput();cancelCloseVerification();heldKeys.clear();KeyboardAccessService.releaseKeys(this);
    }
    void observe(KeyEvent event){
        if(!active||!hardwareKey(event))return;
        if(!nativeVisibilityControl()){
            if(physicalKey(event)){keyObserved=true;hardware=true;usePhysicalInput();}return;
        }
        long identity=((long)event.getDeviceId()<<32)|(event.getKeyCode()&0xffffffffL);
        if(event.getAction()==KeyEvent.ACTION_DOWN){
            boolean first=heldKeys.add(identity);
            keyObserved=true;hardware=true;
            if(first){
                // When the system preference is on, queue the native input-view
                // suppression before this original key reaches the IME. No
                // inputmode change, replay, or hide after its candidates arrive.
                if(!physicalInput&&suppress(mode,true)&&KeyboardAccessService.virtualKeysEnabled(this))
                    KeyboardAccessService.physicalKeys(this);
                long previousVerification=verifyCloseUntil;
                boolean defer=nativeVisibilityControl()&&suppress(mode,true)
                    &&(!physicalInput||previousVerification>SystemClock.uptimeMillis());
                cancelCloseVerification();
                if(defer&&pendingInput==0){pendingInput=++inputSequence;inputApplied=false;pendingNeedsText=false;pendingDeadKey=false;pendingVerifyUntil=previousVerification;}
                if(pendingInput!=0&&!KeyEvent.isModifierKey(event.getKeyCode())&&!routeBeforeIme(event))pendingNeedsText=true;
                if(pendingInput!=0&&(event.getUnicodeChar()&KeyCharacterMap.COMBINING_ACCENT)!=0)pendingDeadKey=true;
                usePhysicalInput();
            }
        }else if(heldKeys.remove(identity)&&pendingInput!=0){
            int request=pendingInput;
            if(!pendingNeedsText)inputApplied=true;
            finishPendingInput(request);
            // A dead key may legitimately await its following letter. Do not
            // reset the IME's accent state just because it has not emitted text.
            if(!pendingDeadKey)handler.postDelayed(()->{
                if(request==pendingInput&&heldKeys.isEmpty()){inputApplied=true;finishPendingInput(request);}
            },400);
        }
    }
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
        if(changed||pendingInput!=0)publish();
    }
    private boolean nativeVisibilityControl(){return BuildConfig.KEYBOARD_TRIAL&&KeyboardAccessService.available();}
    private void cancelPendingInput(){pendingInput=0;inputApplied=false;pendingNeedsText=false;pendingDeadKey=false;pendingVerifyUntil=0;}
    // The DOM acknowledges after its input/default-prevented edit has run.
    // No character is copied or replayed: the original event visits the IME once.
    void inputApplied(int request){if(request!=0&&request==pendingInput){inputApplied=true;finishPendingInput(request);}}
    private void finishPendingInput(int request){
        if(request!=pendingInput||!inputApplied||!heldKeys.isEmpty())return;
        handler.post(()->{
            if(!active||request!=pendingInput||!inputApplied||!heldKeys.isEmpty())return;
            long verification=pendingVerifyUntil;
            cancelPendingInput();publish();
            if(verification>SystemClock.uptimeMillis())verifyPhysicalClose(verification);
        });
    }
    private void cancelTouch(){touchPending=false;interactionRevision++;}
    private boolean touchAllowed(){return active&&touchPending&&SystemClock.uptimeMillis()-touchStarted<2000&&!"physical".equals(mode);}
    // Called only for a touch/pen gesture on a writable DOM field. Restoring
    // inputmode precedes its default focus action; nothing consumes the touch.
    void beginTouchInput(){
        if(!touchAllowed())return;
        cancelPendingInput();cancelCloseVerification();physicalInput=false;publish();
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
                requestKeys(ime,request,false);touchPending=false;
            },50);
        });
    }
    void setMode(String value){
        if(!validMode(value))return;
        cancelTouch();cancelPendingInput();cancelCloseVerification();mode=value;
        // Reselecting Solo físico is also an explicit close request.
        if("physical".equals(mode)&&nativeVisibilityControl())visibilityApplied=false;
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("keyboard-mode",mode).apply();publish();
        if("virtual".equals(mode))showForModeSelection();
    }
    String state(){return "{\"nativeGate\":"+nativeVisibilityControl()+",\"pendingPhysicalInput\":"+pendingInput+",\"imeConnected\":true,\"mode\":"+JSONObject.quote(mode)+",\"hardware\":"+hardware+",\"interaction\":"+JSONObject.quote(physicalInput?"physical":"touch")+",\"suppress\":"+suppress(mode,physicalInput)
        +",\"keyboardTrial\":"+BuildConfig.KEYBOARD_TRIAL+",\"keyboardAssist\":"+JSONObject.quote(BuildConfig.KEYBOARD_TRIAL?KeyboardAccessService.status():"off")+"}";}
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
        // Do not close or reconfigure the IME between the first physical DOWN
        // and its text acknowledgement/UP. This used to consume the first key.
        if(blocked&&pendingInput!=0)return;
        boolean nativePolicy=blocked&&activity.hasWindowFocus()&&web.hasFocus()&&KeyboardAccessService.physicalKeys(this);
        int softMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            |(blocked&&!nativePolicy?WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN:WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
        if(activity.getWindow().getAttributes().softInputMode!=softMode){
            activity.getWindow().setSoftInputMode(softMode);
            activity.getWindow().getDecorView().requestApplyInsets();web.requestLayout();
        }
        if(blocked&&(!visibilityApplied||!softKeyboardSuppressed)){
            // Releasing IGNORE_HARD_KEYBOARD re-evaluates the IME's input view
            // itself. An additional hide would also erase the candidates which
            // were just generated by the first physical character.
            visibilityApplied=nativePolicy||hideSoftKeyboard();
            if(visibilityApplied&&nativeVisibilityControl())verifyPhysicalClose();
        }
        else if(!blocked)visibilityApplied=true;
        softKeyboardSuppressed=blocked;
    }
    // Called on an actual DOM editor change, not on input/composition updates.
    // A title, table or dialog must honor Solo físico too, without losing focus.
    void editingFieldFocused(){
        editorRevision++;
        if(!active)return;
        if(suppress(mode,physicalInput)){
            if(pendingInput==0&&heldKeys.isEmpty()){visibilityApplied=false;publish();}
        }
        else if(BuildConfig.KEYBOARD_TRIAL&&"virtual".equals(mode))showForModeSelection();
    }
    void editingFieldBlurred(){editorRevision++;}
    void editingFieldTouched(){
        if(active&&"physical".equals(mode)&&pendingInput==0&&heldKeys.isEmpty()){
            if(!nativeVisibilityControl()||fullKeyboardPanelVisible()){
                visibilityApplied=false;publish();
                if(nativeVisibilityControl()&&fullKeyboardPanelVisible())hideSoftKeyboard();
            }
            else verifyPhysicalClose();
        }
    }
    private void cancelCloseVerification(){closeSequence++;verifyCloseUntil=0;}
    private void verifyPhysicalClose(){
        verifyPhysicalClose(SystemClock.uptimeMillis()+650);
    }
    private void verifyPhysicalClose(long until){
        long request=++closeSequence;verifyCloseUntil=until;
        // A previously queued show request can arrive after hide. Verify this
        // explicit transition for a bounded interval, without repeatedly hiding
        // a compact candidates/tools bar or interrupting a held physical key.
        for(int delay:new int[]{120,320,600}){
            if(SystemClock.uptimeMillis()+delay>until)continue;
            handler.postDelayed(()->{
            if(!active||request!=closeSequence||!suppress(mode,physicalInput)||pendingInput!=0||!heldKeys.isEmpty()
                ||!activity.hasWindowFocus()||!web.hasFocus())return;
            if(fullKeyboardPanelVisible())hideSoftKeyboard();
            },delay);
        }
    }
    protected boolean fullKeyboardPanelVisible(){
        int bottom=0;
        if(android.os.Build.VERSION.SDK_INT>=30){
            WindowInsets insets=web.getRootWindowInsets();
            if(insets!=null&&insets.isVisible(WindowInsets.Type.ime()))
                bottom=Math.max(0,insets.getInsets(WindowInsets.Type.ime()).bottom-insets.getInsets(WindowInsets.Type.navigationBars()).bottom);
        }else{
            android.graphics.Rect visible=new android.graphics.Rect();web.getWindowVisibleDisplayFrame(visible);
            bottom=Math.max(0,web.getRootView().getHeight()-visible.bottom);
        }
        // Conservative docked-panel check, used only during the 650 ms close
        // verification. The initial explicit hide also handles floating keys.
        return bottom>160*activity.getResources().getDisplayMetrics().density;
    }
    private boolean hideSoftKeyboard(){
        InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if(ime==null||!activity.hasWindowFocus()||web.getWindowToken()==null)return false;
        ime.hideSoftInputFromWindow(web.getWindowToken(),0);return true;
    }
    private void showForModeSelection(){
        if(!active)return;
        long request=interactionRevision;
        // The published state restores the field's original inputmode first.
        web.evaluateJavascript("Boolean(window.hinoteKeyboardCanShow && window.hinoteKeyboardCanShow())",value->{
            if(!"true".equals(value)||request!=interactionRevision||!active||!"virtual".equals(mode)
                ||!activity.hasWindowFocus()||!web.hasFocus())return;
            InputMethodManager ime=(InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if(ime!=null)requestKeys(ime,request,true);
        });
    }
    private void requestKeys(InputMethodManager ime,long request,boolean virtualSelection){
        long editor=editorRevision;
        boolean overriding=KeyboardAccessService.allowKeys(this);
        ime.showSoftInput(web,0);
        if(!overriding)return;
        // The accessibility setting travels to the IME in another process.
        // Retry only this explicit request, with a bounded delay, while its
        // editor, activity and mode remain current. No restart/composition reset.
        for(int delay:new int[]{120,350})handler.postDelayed(()->{
            if(!active||request!=interactionRevision||editor!=editorRevision||suppress(mode,physicalInput)
                ||(virtualSelection&&!"virtual".equals(mode))||!activity.hasWindowFocus()||!web.hasFocus())return;
            web.evaluateJavascript("Boolean(window.hinoteKeyboardCanShow && window.hinoteKeyboardCanShow())",value->{
                if("true".equals(value)&&active&&request==interactionRevision&&editor==editorRevision&&!suppress(mode,physicalInput)
                    &&activity.hasWindowFocus()&&web.hasFocus()&&KeyboardAccessService.allowKeys(this))ime.showSoftInput(web,0);
            });
        },delay);
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){keyObserved=false;refresh();}
}
