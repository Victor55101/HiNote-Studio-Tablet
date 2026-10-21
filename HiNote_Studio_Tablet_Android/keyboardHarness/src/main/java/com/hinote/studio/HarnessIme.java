package com.hinote.studio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.inputmethodservice.InputMethodService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.TextView;

/** CI-only IME in another process. Delays commits and can reproduce a late key-panel show. */
public final class HarnessIme extends InputMethodService {
    private static HarnessIme instance;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private View keyView;
    private boolean lateKeys;
    private long finishedAt;
    private int typed,dropped,selections;
    @Override public void onCreate(){super.onCreate();instance=this;}
    @Override public void onDestroy(){instance=null;super.onDestroy();}
    private View panel(String label,int height){
        TextView view=new TextView(this);view.setText(label);view.setTextSize(24);
        view.setBackgroundColor(0xffcdd8dd);view.setLayoutParams(new ViewGroup.LayoutParams(-1,Math.round(height*getResources().getDisplayMetrics().density)));
        return view;
    }
    @Override public View onCreateInputView(){return keyView=panel("TEST KEYS",240);}
    @Override public View onCreateCandidatesView(){return panel("uno ¹    dos ²    tres ³",48);}
    @Override public void onStartInput(EditorInfo info,boolean restarting){super.onStartInput(info,restarting);setCandidatesViewShown(true);}
    @Override public boolean onEvaluateInputViewShown(){return lateKeys||super.onEvaluateInputViewShown();}
    @Override public boolean onShowInputRequested(int flags,boolean changed){return lateKeys||super.onShowInputRequested(flags,changed);}
    @Override public void onFinishInputView(boolean finishing){finishedAt=SystemClock.uptimeMillis();lateKeys=false;super.onFinishInputView(finishing);}
    @Override public boolean onKeyDown(int code,KeyEvent event){
        if(KeyEvent.isModifierKey(code))return true;
        if(event.isCtrlPressed()&&code>=KeyEvent.KEYCODE_1&&code<=KeyEvent.KEYCODE_3){
            InputConnection target=getCurrentInputConnection();
            if(target!=null){target.commitText(new String[]{"uno","dos","tres"}[code-KeyEvent.KEYCODE_1],1);selections++;setCandidatesViewShown(true);}
            return true;
        }
        int unicode=event.getUnicodeChar();
        if(unicode==0||event.isCtrlPressed()||event.isMetaPressed())return super.onKeyDown(code,event);
        long time=event.getEventTime();
        handler.postDelayed(()->{
            // Reproduce a provider discarding work made stale by a close/reset
            // during the original physical event. Appending a synthetic replay
            // in the editor cannot satisfy the native typed counter assertion.
            if(finishedAt>time){dropped++;return;}
            InputConnection target=getCurrentInputConnection();
            if(target!=null){target.commitText(new String(Character.toChars(unicode)),1);typed++;setCandidatesViewShown(true);}
        },60);
        return true;
    }
    @Override public boolean onKeyUp(int code,KeyEvent event){return true;}
    public static final class CommandReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context context,Intent intent){
            HarnessIme ime=instance;Bundle state=new Bundle();state.putBoolean("connected",ime!=null);
            if(ime!=null){
                if("late".equals(intent.getStringExtra("command")))ime.handler.postDelayed(()->{ime.lateKeys=true;ime.requestShowSelf(0);},75);
                state.putBoolean("keys",ime.keyView!=null&&ime.keyView.isShown());
                state.putBoolean("input",ime.getCurrentInputConnection()!=null);
                state.putInt("typed",ime.typed);state.putInt("dropped",ime.dropped);state.putInt("selections",ime.selections);
            }
            setResultCode(1);setResultExtras(state);
        }
    }
}
