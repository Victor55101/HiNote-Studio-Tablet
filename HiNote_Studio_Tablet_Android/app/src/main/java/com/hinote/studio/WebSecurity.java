package com.hinote.studio;

import android.net.Uri;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** The editor's native bridge is exposed only to the packaged entry page. */
final class WebSecurity {
    static final String EDITOR_URL="file:///android_asset/index.html";
    static void configure(WebView web, boolean script) {
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(script);
        settings.setDomStorageEnabled(script);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
    static boolean editorNavigation(String url) { return EDITOR_URL.equals(url); }
    static boolean packagedAsset(Uri uri) {
        String path=uri.getPath();
        return "file".equals(uri.getScheme()) && (uri.getAuthority()==null||uri.getAuthority().isEmpty())
            && uri.getQuery()==null && uri.getFragment()==null && path!=null
            && path.startsWith("/android_asset/") && !path.contains("..") && !path.contains("\\");
    }
    private WebSecurity() {}
}
