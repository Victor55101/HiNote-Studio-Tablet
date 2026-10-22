package com.hinote.studio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.inputmethodservice.InputMethodService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.TextView;

/** CI-only IME in another process. Delays commits and can reproduce a late key-panel show. */
public final class HarnessIme extends InputMethodService {
    static final int KEYS_COLOR=0xffc47c2b,CANDIDATES_COLOR=0xff527fa5;
    private static HarnessIme instance;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private View keyView,candidatesView;
    private boolean lateKeys;
    private int inputViewGeneration;
    private int typed,dropped,selections;
    private int inputType;
    @Override public void onCreate(){super.onCreate();instance=this;}
    @Override public void onDestroy(){instance=null;super.onDestroy();}
    private View panel(String label,int height){
        TextView view=new TextView(this);view.setText(label);view.setTextSize(24);
        // InputMethodService replaces the supplied LayoutParams with WRAP_CONTENT.
        // Enforce a realistic panel height so docked-pane detection is exercised.
        view.setMinimumHeight(Math.round(height*getResources().getDisplayMetrics().density));
        view.setBackgroundColor("TEST KEYS".equals(label)?KEYS_COLOR:CANDIDATES_COLOR);view.setLayoutParams(new ViewGroup.LayoutParams(-1,Math.round(height*getResources().getDisplayMetrics().density)));
        return view;
    }
    @Override public View onCreateInputView(){return keyView=panel("TEST KEYS",240);}
    @Override public View onCreateCandidatesView(){return candidatesView=panel("uno ¹    dos ²    tres ³",48);}
    private boolean hardwareCandidates(){return inputType!=0&&Settings.Secure.getInt(getContentResolver(),KeyboardPreferenceLease.SETTING,0)==0;}
    private void candidates(){
        setCandidatesViewShown(true);
        // Android 12's insets surface must be requested too. A provider which
        // offers a hardware candidates bar accepts this implicit request while
        // onEvaluateInputViewShown still keeps its keys closed. It reads the
        // actual OS setting, not the app's mode or its JavaScript state.
        if(hardwareCandidates())handler.post(()->{if(hardwareCandidates())requestShowSelf(android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);});
    }
    @Override public void onStartInput(EditorInfo info,boolean restarting){super.onStartInput(info,restarting);inputType=info.inputType;android.util.Log.i("HarnessIme","start input type="+inputType+" restart="+restarting);if(inputType!=0)candidates();}
    @Override public boolean onEvaluateInputViewShown(){return lateKeys||super.onEvaluateInputViewShown();}
    @Override public boolean onShowInputRequested(int flags,boolean changed){boolean show=lateKeys||hardwareCandidates()&&(flags&android.view.inputmethod.InputMethod.SHOW_EXPLICIT)==0||super.onShowInputRequested(flags,changed);android.util.Log.i("HarnessIme","show flags="+flags+" changed="+changed+" allowed="+show);return show;}
    @Override public void onFinishInputView(boolean finishing){inputViewGeneration++;lateKeys=false;super.onFinishInputView(finishing);}
    @Override public boolean onKeyDown(int code,KeyEvent event){
        android.util.Log.i("HarnessIme","key down="+code+" meta="+event.getMetaState()+" device="+event.getDeviceId());
        if(KeyEvent.isModifierKey(code))return true;
        if(event.isCtrlPressed()&&code>=KeyEvent.KEYCODE_1&&code<=KeyEvent.KEYCODE_3){
            InputConnection target=getCurrentInputConnection();
            if(target!=null){target.commitText(new String[]{"uno","dos","tres"}[code-KeyEvent.KEYCODE_1],1);selections++;candidates();}
            return true;
        }
        int unicode=event.getUnicodeChar();
        if(unicode==0||event.isCtrlPressed()||event.isMetaPressed())return super.onKeyDown(code,event);
        int generation=inputViewGeneration;
        handler.postDelayed(()->{
            // Reproduce a provider discarding work made stale by a close/reset
            // during the original physical event. Appending a synthetic replay
            // in the editor cannot satisfy the native typed counter assertion.
            if(inputViewGeneration!=generation){dropped++;return;}
            InputConnection target=getCurrentInputConnection();
            if(target!=null){target.commitText(new String(Character.toChars(unicode)),1);typed++;candidates();}
        },60);
        return true;
    }
    @Override public boolean onKeyUp(int code,KeyEvent event){return true;}
    public static final class CommandReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context context,Intent intent){
            HarnessIme ime=instance;Bundle state=new Bundle();state.putBoolean("connected",ime!=null);
            if(ime!=null){
                if("late".equals(intent.getStringExtra("command")))ime.handler.postDelayed(()->{ime.lateKeys=true;ime.requestShowSelf(0);},75);
                boolean visible=ime.isInputViewShown();
                state.putBoolean("window",visible);
                state.putBoolean("keys",visible&&ime.keyView!=null&&ime.keyView.isShown());
                state.putBoolean("candidates",visible&&ime.candidatesView!=null&&ime.candidatesView.isShown());
                state.putInt("paneHeight",ime.keyView==null?0:ime.keyView.getHeight());
                state.putBoolean("input",ime.getCurrentInputConnection()!=null);
                state.putInt("inputType",ime.inputType);
                state.putInt("typed",ime.typed);state.putInt("dropped",ime.dropped);state.putInt("selections",ime.selections);
            }
            setResultCode(1);setResultExtras(state);
        }
    }
}
