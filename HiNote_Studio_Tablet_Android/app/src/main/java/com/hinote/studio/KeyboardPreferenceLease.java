package com.hinote.studio;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Settings;

/** Opt-in development control, scoped to one keyboard setting and foreground session. */
final class KeyboardPreferenceLease {
    static final String PREFERENCES="keyboard-preference-control",ENABLED="enabled";
    static final String SETTING="show_ime_with_hard_keyboard";
    interface Backend {
        boolean enabled();boolean authorized();int policy();String read();boolean write(String value);
        boolean pending();String original();boolean save(String value);void clear();
    }
    private final Backend backend;private boolean prepared;
    KeyboardPreferenceLease(Backend backend){this.backend=backend;}
    KeyboardPreferenceLease(Context context){
        Context app=context.getApplicationContext();SharedPreferences prefs=app.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE);
        backend=new Backend(){
            public boolean enabled(){return BuildConfig.KEYBOARD_TRIAL&&prefs.getBoolean(ENABLED,false);}
            public boolean authorized(){return BuildConfig.KEYBOARD_TRIAL&&authorizedFor(app);}
            public int policy(){return Settings.Secure.getInt(app.getContentResolver(),"accessibility_soft_keyboard_mode",0)&3;}
            public String read(){return Settings.Secure.getString(app.getContentResolver(),SETTING);}
            public boolean write(String value){try{return Settings.Secure.putString(app.getContentResolver(),SETTING,value);}catch(SecurityException denied){return false;}}
            public boolean pending(){return prefs.getBoolean("restore-pending",false);}
            public String original(){return prefs.getString("original",null);}
            public boolean save(String value){return prefs.edit().putString("original",value).putBoolean("restore-pending",true).commit();}
            public void clear(){prefs.edit().remove("original").remove("restore-pending").commit();}
        };
    }
    static boolean authorizedFor(Context context){return context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS)==PackageManager.PERMISSION_GRANTED;}
    static boolean enabledFor(Context context){return context.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE).getBoolean(ENABLED,false);}
    boolean start(){
        if(prepared)return true;
        if(!backend.authorized()||backend.policy()!=0)return false;
        // Recover a prior interrupted session before capturing a new baseline.
        if(!restore())return false;
        if(!backend.enabled())return false;
        String original=backend.read();
        if(isOff(original)){prepared=true;return true;}
        if(!backend.save(original))return false;
        if(!backend.write("0")){restore();return false;}
        prepared=true;return true;
    }
    boolean stop(){prepared=false;return restore();}
    void abandon(){prepared=false;backend.clear();}
    private boolean restore(){
        if(!backend.pending())return true;
        if(!backend.authorized()||backend.policy()!=0)return false;
        // Do not replace a later setting value written by the user or another owner.
        if(isOff(backend.read())&&!backend.write(backend.original()))return false;
        backend.clear();return true;
    }
    private static boolean isOff(String value){return value==null||"0".equals(value);}
}
