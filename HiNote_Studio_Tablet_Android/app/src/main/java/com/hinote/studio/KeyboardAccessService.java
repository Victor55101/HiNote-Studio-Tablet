package com.hinote.studio;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import java.lang.ref.WeakReference;

/** Registered only in the independent keyboard trial. Receives no accessibility events. */
public class KeyboardAccessService extends AccessibilityService {
    interface Client { void keyboardAccessChanged(); }
    private static volatile KeyboardAccessService connected;
    private static WeakReference<Client> client=new WeakReference<>(null);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private SoftKeyboardOverride override;
    private final SoftKeyboardController.OnShowModeChangedListener listener=(controller,mode)->{
        // Notifications can arrive after another mode change. Inspect the
        // current policy rather than treating an old notification as a revocation.
        if(override!=null)override.changed(controller.getShowMode());
        notifyClient();
    };
    static void watch(Client value){
        if(!BuildConfig.KEYBOARD_TRIAL)return;
        Client old=client.get();
        if(old!=null&&old!=value&&connected!=null)connected.release();
        client=new WeakReference<>(value);
    }
    static void unwatch(Client value){
        if(client.get()!=value)return;
        if(connected!=null)connected.release();
        client.clear();
    }
    static boolean available(){return BuildConfig.KEYBOARD_TRIAL&&Build.VERSION.SDK_INT>=29&&connected!=null;}
    static boolean allowKeys(Client value){
        if(!available()||client.get()!=value||connected.override==null)return false;
        return connected.override.allowKeys();
    }
    static void releaseKeys(Client value){if(client.get()==value&&connected!=null)connected.release();}
    static String status(){
        if(Build.VERSION.SDK_INT<29)return "unsupported";
        if(!available())return "permission";
        if(connected.override!=null&&connected.override.wasRefused())return "refused";
        if(connected.override!=null&&connected.override.ownsMode())return "active";
        if(connected.override!=null&&connected.override.anotherPolicy())return "busy";
        try{
            // Read only. Android itself saves/restores this preference through
            // SoftKeyboardController; this application never writes secure settings.
            if(Settings.Secure.getInt(connected.getContentResolver(),"show_ime_with_hard_keyboard",0)!=0)return "setting";
        }catch(SecurityException ignored){return "unknown";}
        return "ready";
    }
    protected SoftKeyboardOverride.Backend createBackend(){
        SoftKeyboardController control=getSoftKeyboardController();
        return new SoftKeyboardOverride.Backend(){
            public int getMode(){try{return control.getShowMode();}catch(RuntimeException error){return SHOW_MODE_HIDDEN;}}
            public boolean setMode(int mode){try{return control.setShowMode(mode);}catch(RuntimeException error){return false;}}
        };
    }
    @Override protected void onServiceConnected(){
        super.onServiceConnected();
        if(!BuildConfig.KEYBOARD_TRIAL||Build.VERSION.SDK_INT<29){disableSelf();return;}
        override=new SoftKeyboardOverride(createBackend());connected=this;
        getSoftKeyboardController().addOnShowModeChangedListener(listener,handler);
        // Enabling the service alone never opens keys or changes a setting.
        notifyClient();
    }
    private void notifyClient(){handler.post(()->{Client value=client.get();if(value!=null)value.keyboardAccessChanged();});}
    private void release(){
        // If Android cannot release our lease, disconnect this optional service
        // so the system can perform its own owner cleanup and restore the preference.
        if(override!=null&&!override.release())requestSystemCleanup();
    }
    protected void requestSystemCleanup(){disableSelf();}
    private void disconnect(){
        release();getSoftKeyboardController().removeOnShowModeChangedListener(listener);
        if(connected==this)connected=null;
        notifyClient();
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event){/* No events requested. */}
    @Override public void onInterrupt(){release();notifyClient();}
    @Override public boolean onUnbind(Intent intent){disconnect();return super.onUnbind(intent);}
    @Override public void onDestroy(){disconnect();super.onDestroy();}
}
