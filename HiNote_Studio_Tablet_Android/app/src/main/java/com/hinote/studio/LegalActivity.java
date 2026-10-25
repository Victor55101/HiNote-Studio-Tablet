package com.hinote.studio;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Html;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.text.style.URLSpan;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

/** Offline, native legal information. No WebView, JavaScript or native bridge. */
public final class LegalActivity extends Activity {
    static final String EXTRA_WELCOME="welcome";
    private static final String PREFERENCES="hinote-legal", WELCOME_SEEN="welcome_seen_v1";
    private JSONObject notice;
    private JSONArray licenses;
    private LinearLayout content;
    private ScrollView scroll;
    private TextView heading;
    private Button back;
    private String page;
    private boolean welcome;
    private ArrayList<String> history=new ArrayList<>();
    private Bundle positions=new Bundle();
    private int ink, muted, panel, surface, accent, line, danger;

    static boolean needsWelcome(Context context){
        return !context.getSharedPreferences(PREFERENCES,MODE_PRIVATE).getBoolean(WELCOME_SEEN,false);
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN|WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        ThemeController theme=new ThemeController(this);theme.apply(null);
        boolean light="light".equals(theme.get());
        ink=Color.parseColor(light?"#20272e":"#dde4e9");muted=Color.parseColor(light?"#5a6872":"#a6b4bf");
        panel=Color.parseColor(light?"#ffffff":"#1c232a");surface=Color.parseColor(light?"#eef2f3":"#232b34");
        accent=Color.parseColor(light?"#126681":"#a8cdd8");line=Color.parseColor(light?"#cbd3d6":"#3e4b55");
        danger=Color.parseColor(light?"#b23343":"#e87187");
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        setFinishOnTouchOutside(true);
        welcome=getIntent().getBooleanExtra(EXTRA_WELCOME,false);
        page=welcome?"welcome":"about";
        if(state!=null){
            welcome=state.getBoolean("welcome",welcome);page=state.getString("page",page);
            ArrayList<String> saved=state.getStringArrayList("history");if(saved!=null)history=saved;
            Bundle savedPositions=state.getBundle("positions");if(savedPositions!=null)positions=savedPositions;
        }
        try{notice=readJson("legal/notice.json");}
        catch(Exception unavailable){notice=null;}
        LinearLayout root=new LinearLayout(this);root.setTag("legal-root");root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(rounded(panel,24,true));
        heading=text("",22,true);heading.setTag("legal-heading");heading.setPadding(dp(24),dp(20),dp(24),dp(16));root.addView(heading);
        root.addView(separator());
        scroll=new ScrollView(this);scroll.setTag("legal-scroll");scroll.setFillViewport(false);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(16),dp(24),dp(20));
        scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        root.addView(separator());
        LinearLayout footer=new LinearLayout(this);footer.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);footer.setPadding(dp(16),dp(10),dp(16),dp(10));
        back=button("Volver",false);back.setTag("legal-back");back.setOnClickListener(v->goBack());
        footer.addView(back,new LinearLayout.LayoutParams(-2,-2));root.addView(footer);
        setContentView(root);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::goBack);
        render();
    }

    @Override protected void onStart(){
        super.onStart();android.util.DisplayMetrics display=getResources().getDisplayMetrics();
        getWindow().setLayout(Math.min(dp(760),display.widthPixels-dp(32)),Math.min(dp(720),display.heightPixels-dp(64)));
    }
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private GradientDrawable rounded(int color,int radius,boolean border){
        GradientDrawable result=new GradientDrawable();result.setColor(color);result.setCornerRadius(dp(radius));
        if(border)result.setStroke(dp(1),line);return result;
    }
    private View separator(){View view=new View(this);view.setBackgroundColor(line);view.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(1)));return view;}
    private TextView text(CharSequence value,int size,boolean bold){
        TextView view=new TextView(this);view.setText(value);view.setTextColor(ink);view.setTextSize(size);
        if(bold)view.setTypeface(Typeface.DEFAULT,Typeface.BOLD);view.setLineSpacing(dp(4),1);return view;
    }
    private Button button(CharSequence value,boolean primary){
        Button result=new Button(this);result.setText(value);result.setAllCaps(false);result.setTextSize(16);
        result.setTextColor(primary?(Color.luminance(accent)>.5?Color.rgb(20,33,61):Color.WHITE):ink);
        result.setMinHeight(dp(48));result.setPadding(dp(20),dp(12),dp(20),dp(12));
        result.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22608090),rounded(primary?accent:surface,14,false),null));
        return result;
    }
    private void paragraph(String value){TextView view=text(value,16,false);view.setPadding(0,0,0,dp(16));content.addView(view);}
    private void row(String title,String subtitle,String tag,Runnable action){
        SpannableString label=new SpannableString(title+"\n"+subtitle);
        label.setSpan(new StyleSpan(Typeface.BOLD),0,title.length(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        label.setSpan(new RelativeSizeSpan(.84f),title.length()+1,label.length(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        label.setSpan(new ForegroundColorSpan(muted),title.length()+1,label.length(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        Button item=button(label,false);item.setTag(tag);item.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        item.setOnClickListener(v->action.run());LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.bottomMargin=dp(10);content.addView(item,params);
    }
    private void brand(){
        ImageView logo=new ImageView(this);logo.setImageDrawable(getApplicationInfo().loadIcon(getPackageManager()));logo.setContentDescription("Logo de HiNote Studio");
        LinearLayout.LayoutParams icon=new LinearLayout.LayoutParams(dp(72),dp(72));icon.gravity=Gravity.CENTER_HORIZONTAL;icon.bottomMargin=dp(10);content.addView(logo,icon);
        TextView name=text("HiNote Studio",25,true);name.setGravity(Gravity.CENTER);content.addView(name);
        TextView version=text("Versión "+BuildConfig.VERSION_NAME,14,false);version.setTag("legal-version");version.setTextColor(muted);version.setGravity(Gravity.CENTER);version.setPadding(0,dp(4),0,dp(18));content.addView(version);
    }
    private JSONObject readJson(String name)throws Exception{
        try(InputStream input=getAssets().open(name);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);
            return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
    }
    private JSONArray licenses()throws Exception{
        if(licenses==null)licenses=readJson("legal/licenses.json").getJSONArray("components");return licenses;
    }
    private void document(String source){
        // Native Html supports paragraphs, headings and lists. Convert definition
        // lists explicitly; no stylesheet or web navigation is involved.
        String html=source.replace("<dl>","").replace("</dl>","").replace("<dt>","<b>").replace("</dt>","</b><br>").replace("<dd>","<p>").replace("</dd>","</p>");
        SpannableString formatted=new SpannableString(Html.fromHtml(html,Html.FROM_HTML_MODE_COMPACT));
        for(URLSpan link:formatted.getSpans(0,formatted.length(),URLSpan.class)){
            int start=formatted.getSpanStart(link),end=formatted.getSpanEnd(link);String url=link.getURL();formatted.removeSpan(link);
            formatted.setSpan(new ClickableSpan(){@Override public void onClick(View view){openLink(url);}},start,end,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        TextView article=text(formatted,16,false);article.setTag("legal-document");article.setLinksClickable(true);article.setLinkTextColor(accent);
        article.setTextIsSelectable(true);article.setMovementMethod(LinkMovementMethod.getInstance());content.addView(article);
    }
    void openLink(String url){
        if("licenses.html".equals(url)){navigate("licenses");return;}
        if("privacy.html".equals(url)){navigate("privacy");return;}
        if(notice==null)return;
        String email=notice.optString("contact_email");
        if(("mailto:"+email).equals(url)){contact();return;}
        if(url.equals(notice.optString("policy_url"))&&"https".equals(Uri.parse(url).getScheme())){
            try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}
            catch(RuntimeException unavailable){Toast.makeText(this,"No hay un navegador disponible",Toast.LENGTH_SHORT).show();}
        }
    }
    private void contact(){
        if(notice==null||notice.optString("contact_email").isEmpty())return;
        Intent intent=new Intent(Intent.ACTION_SENDTO,Uri.fromParts("mailto",notice.optString("contact_email"),null));
        intent.putExtra(Intent.EXTRA_SUBJECT,"HiNote Studio · Soporte · "+BuildConfig.VERSION_NAME);
        try{startActivity(intent);}catch(RuntimeException unavailable){Toast.makeText(this,"No hay una app de correo disponible",Toast.LENGTH_SHORT).show();}
    }
    private void render(){
        content.removeAllViews();heading.setText("about".equals(page)?"Acerca de HiNote Studio":"welcome".equals(page)?"Bienvenido a HiNote Studio":"privacy".equals(page)?"Privacidad":"licenses".equals(page)?"Licencias de componentes":"contact".equals(page)?"Contacto":"data".equals(page)?"Datos locales":"Licencia del componente");
        back.setText("welcome".equals(page)?"Continuar":"Volver");
        try{
            if(notice==null)throw new IllegalStateException("Información no disponible");
            if("welcome".equals(page)){
                brand();paragraph(notice.getString("welcome_summary"));
                row("Privacidad","Consulta cómo se utiliza la información","legal-privacy",()->navigate("privacy"));
                row("Licencias","Componentes que hacen posible la aplicación","legal-licenses",()->navigate("licenses"));
                paragraph("Puedes consultar esta información después tocando el logo de la app. Continuar cierra esta bienvenida.");
            }else if("about".equals(page)){
                brand();
                row("Privacidad","Información, almacenamiento y derechos","legal-privacy",()->navigate("privacy"));
                row("Licencias","Avisos de los componentes utilizados","legal-licenses",()->navigate("licenses"));
                row("Contacto",notice.getString("contact_email"),"legal-contact",()->navigate("contact"));
                row("Datos locales","Guardado y eliminación en este dispositivo","legal-data",()->navigate("data"));
            }else if("privacy".equals(page)){
                document(notice.getString("privacy_html"));
                if(notice.optBoolean("policy_url_verified"))row("Consultar versión web","Abrir el aviso público en tu navegador","legal-policy-web",()->openLink(notice.optString("policy_url")));
            }else if("licenses".equals(page)){
                paragraph("HiNote Studio utiliza estos componentes. Aquí puedes consultar sus autores, permisos y condiciones originales.");
                JSONArray components=licenses();
                for(int i=0;i<components.length();i++){
                    JSONObject component=components.getJSONObject(i);final int index=i;
                    row(component.getString("name"),component.getString("license"),"legal-license-"+i,()->navigate("license:"+index));
                }
            }else if(page.startsWith("license:")){
                JSONObject component=licenses().getJSONObject(Integer.parseInt(page.substring(8)));heading.setText(component.getString("name"));
                paragraph(component.getString("license"));TextView license=text(component.getString("text"),14,false);
                license.setTag("legal-license-text");license.setTypeface(Typeface.MONOSPACE);license.setTextIsSelectable(true);content.addView(license);
            }else if("contact".equals(page)){
                paragraph("Para consultas sobre HiNote Studio, soporte o solicitudes de privacidad:");
                TextView email=text(notice.getString("contact_email"),18,true);email.setTag("legal-contact-email");email.setPadding(0,0,0,dp(20));content.addView(email);
                row("Escribir a soporte","Se abrirá tu aplicación de correo","legal-email",this::contact);
                paragraph("Incluye la versión de la app y una descripción de la consulta. Comparte solo la información necesaria; no envíes documentos completos ni identificaciones si no hacen falta.");
                row("Consultar privacidad","Tratamiento de consultas y derechos sobre tus datos","legal-privacy",()->navigate("privacy"));
            }else if("data".equals(page)){
                paragraph("Tus borradores, perfiles de escritura, archivos importados y ajustes se conservan en el almacenamiento de HiNote Studio en este dispositivo.");
                paragraph("Borrar los datos elimina todo el almacenamiento propio de la app y la cierra. Los archivos guardados fuera de HiNote y las notas importadas en Huawei Notes se conservan. Guarda tu trabajo y respalda tus perfiles antes de continuar.");
                Button clear=button("Borrar datos locales",false);clear.setTag("legal-clear-data");clear.setTextColor(danger);clear.setOnClickListener(v->confirmClear());content.addView(clear,new LinearLayout.LayoutParams(-1,-2));
            }else throw new IllegalArgumentException("Apartado desconocido");
        }catch(Exception unavailable){paragraph("No se pudo mostrar esta información. Vuelve al apartado anterior o reinstala la actualización conservando tus datos.");}
        int y=positions.getInt(page,0);scroll.post(()->scroll.scrollTo(0,y));
    }
    private void navigate(String target){
        if(target.equals(page))return;positions.putInt(page,scroll.getScrollY());history.add(page);page=target;render();
    }
    void goBack(){
        if(history.isEmpty()){finish();return;}
        positions.putInt(page,scroll.getScrollY());page=history.remove(history.size()-1);render();
    }
    @Override public void onBackPressed(){goBack();}
    @Override public void finish(){
        if(welcome)getSharedPreferences(PREFERENCES,MODE_PRIVATE).edit().putBoolean(WELCOME_SEEN,true).apply();
        super.finish();
    }
    @Override protected void onSaveInstanceState(Bundle state){
        positions.putInt(page,scroll.getScrollY());state.putBoolean("welcome",welcome);state.putString("page",page);
        state.putStringArrayList("history",history);state.putBundle("positions",positions);super.onSaveInstanceState(state);
    }
    void confirmClear(){
        new AlertDialog.Builder(this).setTitle("¿Borrar los datos locales?")
            .setMessage("Se eliminarán el borrador, tus calibraciones importadas, imágenes y PDF copiados dentro de la app, ajustes y archivos temporales. La app se cerrará y las operaciones en curso se interrumpirán. Los archivos que guardaste fuera de la app y las notas importadas en Huawei Notes se conservan. Haz un respaldo de tus perfiles y guarda tu trabajo antes de continuar.")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Borrar datos",(dialog,which)->{
                ActivityManager manager=(ActivityManager)getSystemService(Context.ACTIVITY_SERVICE);
                if(manager==null||!manager.clearApplicationUserData())Toast.makeText(this,"No se pudo borrar. Usa Almacenamiento en los ajustes de Android.",Toast.LENGTH_LONG).show();
            }).show();
    }
}
