package com.hinote.studio;
import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={24,28,33},manifest=Config.NONE)
public class ThemeControllerTest {
    @Test public void appearancePersistsAndNeverChangesKeyboardGate(){
        Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
        ThemeController theme=new ThemeController(activity);WebView web=new WebView(activity);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM|WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        activity.getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        int flags=activity.getWindow().getAttributes().flags;
        theme.set("dark",web);
        assertEquals("dark",new ThemeController(activity).get());
        assertEquals(Color.rgb(22,27,32),activity.getWindow().getStatusBarColor());
        assertEquals(0,activity.getWindow().getDecorView().getSystemUiVisibility()&View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        assertEquals(flags,activity.getWindow().getAttributes().flags);
        theme.set("light",web);
        assertEquals(Color.rgb(244,245,243),activity.getWindow().getNavigationBarColor());
        assertNotEquals(0,activity.getWindow().getDecorView().getSystemUiVisibility()&View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        assertNotEquals(0,activity.getWindow().getDecorView().getSystemUiVisibility()&View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        assertEquals(flags,activity.getWindow().getAttributes().flags);
        theme.set("invalid",web);assertEquals("light",theme.get());
        web.destroy();activity.finish();
    }
}
