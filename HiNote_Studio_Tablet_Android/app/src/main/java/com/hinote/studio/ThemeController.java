package com.hinote.studio;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;

/** App-local appearance. Never changes keyboard/window-focus flags or device settings. */
final class ThemeController {
    private final Activity activity;
    private final SharedPreferences preferences;
    ThemeController(Activity activity){
        this.activity=activity;
        preferences=activity.getSharedPreferences("hinote-appearance",Activity.MODE_PRIVATE);
    }
    static boolean valid(String theme){return "light".equals(theme)||"dark".equals(theme);}
    String get(){String saved=preferences.getString("theme","light");return valid(saved)?saved:"light";}
    void set(String theme,WebView web){
        if(!valid(theme))return;
        preferences.edit().putString("theme",theme).apply();
        apply(web);
    }
    void apply(WebView web){
        boolean light="light".equals(get());
        int background=light?Color.rgb(244,245,243):Color.rgb(22,27,32);
        activity.getWindow().setStatusBarColor(background);
        activity.getWindow().setNavigationBarColor(background);
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(background));
        if(web!=null)web.setBackgroundColor(background);
        View decor=activity.getWindow().getDecorView();
        int flags=decor.getSystemUiVisibility();
        flags=light?flags|View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR:flags&~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if(Build.VERSION.SDK_INT>=26)flags=light?flags|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:flags&~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        decor.setSystemUiVisibility(flags);
    }
}
