package com.hinote.studio;

import android.os.Build;
import android.os.CancellationSignal;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsAnimationControlListener;
import android.view.WindowInsetsAnimationController;
import android.view.WindowInsetsController;

/** Hide the visible panel promptly without finishing the IME's pending edit. */
final class KeyboardTransition {
    private final Api30 control;
    KeyboardTransition(View view){control=BuildConfig.KEYBOARD_TRIAL&&Build.VERSION.SDK_INT>=30?new Api30(view):null;}
    void begin(){if(control!=null)control.begin();}
    void committed(){cancel();}
    void cancel(){if(control!=null)control.cancel();}
    private static final class Api30 {
        final View view;CancellationSignal cancellation;
        int sequence;
        Api30(View view){this.view=view;}
        void begin(){
            if(cancellation!=null)return;
            WindowInsetsController host=view.getWindowInsetsController();WindowInsets insets=view.getRootWindowInsets();
            if(host==null||insets==null||!insets.isVisible(WindowInsets.Type.ime()))return;
            if(insets.getInsets(WindowInsets.Type.ime()).bottom<160*view.getResources().getDisplayMetrics().density)return;
            int request=++sequence;cancellation=new CancellationSignal();
            try{host.controlWindowInsetsAnimation(WindowInsets.Type.ime(),0,null,cancellation,new WindowInsetsAnimationControlListener(){
                @Override public void onReady(WindowInsetsAnimationController value,int types){
                    if(request!=sequence){reveal(value);return;}
                    // Alpha only: no hideSoftInput/finish(false), so composing,
                    // accents and the original physical event remain in the IME.
                    value.setInsetsAndAlpha(null,0f,0f);
                }
                @Override public void onFinished(WindowInsetsAnimationController value){clear(request);}
                @Override public void onCancelled(WindowInsetsAnimationController value){clear(request);}
            });}catch(RuntimeException unavailable){clear(request);}
        }
        void clear(int request){if(request==sequence)cancellation=null;}
        void reveal(WindowInsetsAnimationController value){
            if(!value.isReady())return;
            // Android 12 finish(true) preserves the last pending alpha. Restore
            // opacity explicitly so later candidate and key windows stay visible.
            value.setInsetsAndAlpha(null,1f,1f);value.finish(true);
        }
        void cancel(){
            // Cancellation restores the surface alpha and position. It must
            // run while the old IME frame still owns its surface, before the
            // physical policy reconfigures it into a candidates-only window.
            CancellationSignal old=cancellation;++sequence;cancellation=null;
            if(old!=null)old.cancel();
        }
    }
}
