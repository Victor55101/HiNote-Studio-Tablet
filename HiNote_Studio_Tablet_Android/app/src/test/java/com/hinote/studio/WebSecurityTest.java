package com.hinote.studio;

import android.app.Activity;
import android.net.Uri;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class WebSecurityTest {
    @Test public void navigationCannotExposeTheBridgeToOtherDocuments(){
        assertTrue(WebSecurity.editorNavigation("file:///android_asset/index.html"));
        for(String url:new String[]{"https://hinote.local/","https://example.org","file:///android_asset/legal/privacy.html","file:///android_asset/index.html?next=1","file:///data/data/app/files/draft-v23.json","javascript:alert(1)",null})assertFalse(WebSecurity.editorNavigation(url));
    }
    @Test public void packagedResourcesRejectTraversalAuthoritiesAndQueries(){
        assertTrue(WebSecurity.packagedAsset(Uri.parse("file:///android_asset/fonts/Manrope.ttf")));
        for(String url:new String[]{"file:///android_asset/../private","file:///android_asset/%2e%2e/private","file://host/android_asset/index.html","file:///data/data/private","file:///android_asset/index.html?x=1","https://example.org/index.html"})assertFalse(url,WebSecurity.packagedAsset(Uri.parse(url)));
    }
    @Test public void scriptAndFileCapabilitiesAreExplicitlyRestricted(){
        var host=Robolectric.buildActivity(Activity.class).setup();WebView web=new WebView(host.get());
        try{
            WebSecurity.configure(web,true);WebSettings settings=web.getSettings();
            assertTrue(settings.getJavaScriptEnabled());assertFalse(settings.getAllowFileAccess());assertFalse(settings.getAllowContentAccess());
            assertFalse(settings.getAllowFileAccessFromFileURLs());assertFalse(settings.getAllowUniversalAccessFromFileURLs());
            assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,settings.getMixedContentMode());
            WebSecurity.configure(web,false);assertFalse(settings.getJavaScriptEnabled());assertFalse(settings.getDomStorageEnabled());
        }finally{web.destroy();host.pause().stop().destroy();}
    }
}
