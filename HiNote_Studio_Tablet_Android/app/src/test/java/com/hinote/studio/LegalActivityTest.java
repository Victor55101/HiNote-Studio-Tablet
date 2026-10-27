package com.hinote.studio;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.TextView;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import static org.robolectric.Shadows.shadowOf;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class LegalActivityTest {
    private View tagged(LegalActivity activity,String tag){View result=activity.getWindow().getDecorView().findViewWithTag(tag);assertNotNull(tag,result);return result;}
    private void click(LegalActivity activity,String tag){assertTrue(tagged(activity,tag).performClick());}
    private String value(LegalActivity activity,String tag){return ((TextView)tagged(activity,tag)).getText().toString();}
    private boolean contains(View root,Class<?> type){
        if(type.isInstance(root))return true;
        if(root instanceof ViewGroup){ViewGroup parent=(ViewGroup)root;for(int i=0;i<parent.getChildCount();i++)if(contains(parent.getChildAt(i),type))return true;}
        return false;
    }
    private void close(ActivityController<LegalActivity> host){host.pause().stop().destroy();}
    @Before public void clearWelcomePreference(){
        org.robolectric.RuntimeEnvironment.getApplication().getSharedPreferences("hinote-legal",0).edit().clear().commit();
    }
    @Test public void aboutShowsInstalledVersionWithoutWebOrEditableFields(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();View root=activity.getWindow().getDecorView();
            assertEquals("Acerca de HiNote Studio",value(activity,"legal-heading"));
            assertEquals("Versión "+BuildConfig.VERSION_NAME,value(activity,"legal-version"));
            assertFalse(contains(root,WebView.class));assertFalse(contains(root,EditText.class));
            assertTrue((activity.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM)!=0);
            assertNull(root.findViewWithTag("legal-clear-data"));
        }finally{close(host);}
    }
    @Test public void privacyActuallyContainsThePackagedNoticeAndCanReturnWithBothBackActions(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();click(activity,"legal-privacy");String body=value(activity,"legal-document");
            assertTrue(body.length()>3000);assertTrue(body.contains("Hugo Zoé Islas Vázquez"));
            assertTrue(body.contains("soporte.hinotestudio@gmail.com"));assertTrue(body.contains("PDF original completo"));
            activity.onBackPressed();assertEquals("Acerca de HiNote Studio",value(activity,"legal-heading"));assertFalse(activity.isFinishing());
            click(activity,"legal-privacy");click(activity,"legal-back");assertEquals("Acerca de HiNote Studio",value(activity,"legal-heading"));
            click(activity,"legal-back");assertTrue(activity.isFinishing());
        }finally{close(host);}
    }
    @Test public void licenseListOpensOriginalTextAndBackKeepsTheParent(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();click(activity,"legal-licenses");click(activity,"legal-license-2");
            assertEquals("Python 3.11.17",value(activity,"legal-heading"));
            String license=value(activity,"legal-license-text");assertTrue(license.length()>1000);assertTrue(license.contains("PYTHON SOFTWARE FOUNDATION"));
            activity.onBackPressed();assertEquals("Licencias de componentes",value(activity,"legal-heading"));
            activity.onBackPressed();assertEquals("Acerca de HiNote Studio",value(activity,"legal-heading"));
        }finally{close(host);}
    }
    @Test public void termsAreAvailableOfflinePreserveTheBackStackAndOpenDirectPagesUrls(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();click(activity,"legal-terms");
            assertEquals("Condiciones de uso",value(activity,"legal-heading"));
            String body=value(activity,"legal-document");
            assertTrue(body.contains("Las funciones ofrecidas gratuitamente se mantienen gratuitas"));
            assertTrue(body.contains("no reclama la propiedad de tus notas"));
            activity.openLink("privacy.html");assertEquals("Privacidad",value(activity,"legal-heading"));
            click(activity,"legal-policy-web");Intent web=shadowOf(activity).getNextStartedActivity();
            assertEquals(Intent.ACTION_VIEW,web.getAction());
            assertEquals("https://victor55101.github.io/HiNote-Studio-Tablet/",web.getDataString());
            activity.onBackPressed();assertEquals("Condiciones de uso",value(activity,"legal-heading"));
            click(activity,"legal-terms-web");web=shadowOf(activity).getNextStartedActivity();
            assertEquals("https://victor55101.github.io/HiNote-Studio-Tablet/terms.html",web.getDataString());
            activity.openLink("https://hinote-studio-privacidad.fond-clock-3967.chatgpt.site");
            assertNull(shadowOf(activity).getNextStartedActivity());
            host.recreate();assertEquals("Condiciones de uso",value(host.get(),"legal-heading"));
            host.get().onBackPressed();assertEquals("Acerca de HiNote Studio",value(host.get(),"legal-heading"));
        }finally{close(host);}
    }
    @Test public void welcomeIsInformationalAndIsRememberedOnlyWhenDismissed(){
        Intent intent=new Intent(org.robolectric.RuntimeEnvironment.getApplication(),LegalActivity.class).putExtra(LegalActivity.EXTRA_WELCOME,true);
        var host=Robolectric.buildActivity(LegalActivity.class,intent).setup();
        try{
            LegalActivity activity=host.get();assertTrue(LegalActivity.needsWelcome(activity));assertEquals("Continuar",value(activity,"legal-back"));
            click(activity,"legal-privacy");activity.onBackPressed();assertTrue(LegalActivity.needsWelcome(activity));
            click(activity,"legal-terms");assertEquals("Condiciones de uso",value(activity,"legal-heading"));
            activity.onBackPressed();assertTrue(LegalActivity.needsWelcome(activity));
            assertEquals("Bienvenido a HiNote Studio",value(activity,"legal-heading"));click(activity,"legal-back");
            assertTrue(activity.isFinishing());assertFalse(LegalActivity.needsWelcome(activity));
        }finally{close(host);}
    }
    @Test public void recreationPreservesTheOpenPageAndBackStack(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            click(host.get(),"legal-privacy");host.recreate();
            assertEquals("Privacidad",value(host.get(),"legal-heading"));assertTrue(value(host.get(),"legal-document").contains("soporte.hinotestudio@gmail.com"));
            host.get().onBackPressed();assertEquals("Acerca de HiNote Studio",value(host.get(),"legal-heading"));
        }finally{close(host);}
    }
    @Test public void contactUsesOnlyTheConfirmedSupportAddressAndUnsafeLinksAreInert(){
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();activity.openLink("javascript:alert(1)");activity.openLink("file:///data/data/private");
            assertNull(shadowOf(activity).getNextStartedActivity());
            click(activity,"legal-contact");assertEquals("soporte.hinotestudio@gmail.com",value(activity,"legal-contact-email"));
            click(activity,"legal-email");Intent intent=shadowOf(activity).getNextStartedActivity();
            assertEquals(Intent.ACTION_SENDTO,intent.getAction());assertEquals("mailto",intent.getData().getScheme());
            assertEquals("soporte.hinotestudio@gmail.com",intent.getData().getSchemeSpecificPart());
        }finally{close(host);}
    }
    @Test public void cancellingDataDeletionLeavesTheDraftIntact()throws Exception{
        var host=Robolectric.buildActivity(LegalActivity.class).setup();
        try{
            LegalActivity activity=host.get();File draft=new File(activity.getFilesDir(),"draft-v23.json");Files.write(draft.toPath(),"private draft".getBytes(StandardCharsets.UTF_8));
            click(activity,"legal-data");click(activity,"legal-clear-data");AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertNotNull(dialog);assertTrue(dialog.isShowing());
            dialog.getButton(DialogInterface.BUTTON_NEGATIVE).performClick();assertEquals("private draft",new String(Files.readAllBytes(draft.toPath()),StandardCharsets.UTF_8));
        }finally{close(host);}
    }
}
