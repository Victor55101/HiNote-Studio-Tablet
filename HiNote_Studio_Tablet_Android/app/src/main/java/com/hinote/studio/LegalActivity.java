package com.hinote.studio;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Read-only legal information: no JavaScript, bridge, forms or network access. */
public final class LegalActivity extends Activity {
    private WebView web;
    private ThemeController theme;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        theme=new ThemeController(this);theme.apply(null);
        boolean light="light".equals(theme.get());
        int ink=light?Color.rgb(32,39,46):Color.rgb(221,228,233);
        int surface=light?Color.rgb(232,237,238):Color.rgb(35,43,52);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout actions=new LinearLayout(this);
        for(String label:new String[]{"Volver","Privacidad","Licencias"}) {
            Button button=new Button(this);button.setText(label);
            button.setAllCaps(false);button.setTextColor(ink);button.setBackgroundTintList(ColorStateList.valueOf(surface));
            button.setOnClickListener(v->{if("Volver".equals(label))finish();else showPage("Licencias".equals(label)?"licenses.html":"privacy.html");});
            actions.addView(button,new LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1));
        }
        root.addView(actions);
        web=new WebView(this);WebSecurity.configure(web,false);
        if(Build.VERSION.SDK_INT>=29)web.getSettings().setForceDark(android.webkit.WebSettings.FORCE_DARK_OFF);
        if(Build.VERSION.SDK_INT>=33)web.getSettings().setAlgorithmicDarkeningAllowed(false);
        web.getSettings().setBlockNetworkLoads(true);theme.apply(web);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){
                Uri uri=Uri.parse(url);
                if("file".equals(uri.getScheme())&&"/android_asset/legal/privacy.html".equals(uri.getPath()))showPage("privacy.html");
                else if("file".equals(uri.getScheme())&&"/android_asset/legal/licenses.html".equals(uri.getPath()))showPage("licenses.html");
                else if("mailto".equals(uri.getScheme())){
                    try {startActivity(new Intent(Intent.ACTION_SENDTO,uri));}catch(RuntimeException unavailable){Toast.makeText(LegalActivity.this,"No hay una app de correo disponible",Toast.LENGTH_SHORT).show();}
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
            }
        });
        root.addView(web,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,0,1));
        Button clear=new Button(this);clear.setText("Borrar datos locales de HiNote Studio");
        clear.setAllCaps(false);clear.setBackgroundTintList(ColorStateList.valueOf(surface));
        clear.setTextColor(light?Color.rgb(178,51,67):Color.rgb(232,113,135));clear.setOnClickListener(v->confirmClear());root.addView(clear);
        setContentView(root);showPage("privacy.html");
    }
    private void showPage(String name) {
        if(!"privacy.html".equals(name)&&!"licenses.html".equals(name))return;
        try(InputStream input=getAssets().open("legal/"+name);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            byte[] block=new byte[8192];int count;while((count=input.read(block))!=-1)bytes.write(block,0,count);
            String html=bytes.toString(StandardCharsets.UTF_8.name()).replace("data-theme=\"light\"","data-theme=\""+theme.get()+"\"");
            web.loadDataWithBaseURL("file:///android_asset/legal/",html,"text/html","UTF-8",null);
        }catch(Exception error){Toast.makeText(this,"No se pudo abrir la información",Toast.LENGTH_SHORT).show();}
    }
    void confirmClear() {
        new AlertDialog.Builder(this).setTitle("¿Borrar los datos locales?")
            .setMessage("Se eliminarán el borrador, tus calibraciones importadas, imágenes y PDF copiados dentro de la app, ajustes y archivos temporales. La app se cerrará y las operaciones en curso se interrumpirán. Los archivos que guardaste fuera de la app y las notas importadas en Huawei Notes se conservan. Haz un respaldo de tus perfiles y guarda tu trabajo antes de continuar.")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Borrar datos",(dialog,which)->{
                ActivityManager manager=(ActivityManager)getSystemService(Context.ACTIVITY_SERVICE);
                if(manager==null||!manager.clearApplicationUserData())Toast.makeText(this,"No se pudo borrar. Usa Almacenamiento en los ajustes de Android.",Toast.LENGTH_LONG).show();
            }).show();
    }
    @Override protected void onDestroy(){if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}
