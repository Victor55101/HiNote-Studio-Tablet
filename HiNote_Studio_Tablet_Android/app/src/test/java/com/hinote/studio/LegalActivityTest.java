package com.hinote.studio;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class LegalActivityTest {
    private WebView web(View root){if(root instanceof WebView)return (WebView)root;if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){WebView result=web(group.getChildAt(i));if(result!=null)return result;}}return null;}
    @Test public void legalInformationCannotExecuteScriptOrRequestTheKeyboard(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{WebView page=web(host.get().getWindow().getDecorView());assertNotNull(page);assertFalse(page.getSettings().getJavaScriptEnabled());assertTrue(page.getSettings().getBlockNetworkLoads());assertFalse(page.getSettings().getAllowFileAccess());}
        finally{host.pause().stop().destroy();}
    }
    @Test public void cancellingDataDeletionLeavesTheDraftIntact() throws Exception {
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            File draft=new File(host.get().getFilesDir(),"draft-v23.json");Files.write(draft.toPath(),"private draft".getBytes(StandardCharsets.UTF_8));
            host.get().confirmClear();AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertNotNull(dialog);assertTrue(dialog.isShowing());
            dialog.getButton(DialogInterface.BUTTON_NEGATIVE).performClick();assertEquals("private draft",new String(Files.readAllBytes(draft.toPath()),StandardCharsets.UTF_8));
        }finally{host.pause().stop().destroy();}
    }
}
