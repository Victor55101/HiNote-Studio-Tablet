package com.hinote.studio;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.os.Build;
import android.content.res.Configuration;
import android.graphics.*;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Opt-in, foreground-only experiments. No clipboard injection or private Notes endpoints. */
public final class NotesTransferService extends AccessibilityService {
    static final String NOTES="com.huawei.hinote";
    private static volatile NotesTransferService connected;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private LinearLayout panel;
    private TextView status;
    private AreaPicker picker;
    private TransferInk ink;
    private RectF area;
    private String mode="",message="";
    private boolean running,copyPending,overlaysSuspended,awaitingInkObservation;
    private int generation,index,screenWidth,screenHeight;
    private long expires,panelHiddenUntil;
    static boolean available(){return BuildConfig.NOTES_PROBE&&connected!=null;}
    static void arm(String mode,TransferInk ink){
        if(!available())throw new IllegalStateException("Activa primero «HiNote · Pruebas de trazos» en Accesibilidad y vuelve a pulsar la prueba.");
        connected.begin(mode,ink);
    }
    static void stopFromApp(){if(connected!=null)connected.stop("Detenido desde HiNote",true);}
    @Override protected void onServiceConnected(){
        super.onServiceConnected();if(!BuildConfig.NOTES_PROBE){disableSelf();return;}
        connected=this;windows=(WindowManager)getSystemService(WINDOW_SERVICE);
        // Enabling the service never arms or starts a test.
    }
    private void begin(String selected,TransferInk paths){
        if(!"redraw".equals(selected)&&!"bridge".equals(selected))throw new IllegalArgumentException("Modo desconocido");
        if("redraw".equals(selected)&&paths==null)throw new IllegalArgumentException("Faltan los trazos");
        stop("Prueba anterior cerrada",true);mode=selected;ink=paths;area=null;copyPending=false;index=0;panelHiddenUntil=0;awaitingInkObservation=false;
        expires=System.currentTimeMillis()+20*60*1000;
        message="redraw".equals(mode)?"Abre una página vacía. Activa lápiz y escritura con dedo. Marca una zona; después pulsa Dibujar.":
            "Completa la importación y abre el temporal. Activa el LAZO de Notes. Marca una zona que rodee los trazos; después pulsa Trazar lazo.";
        log("armed", "Esperando una acción explícita dentro de Notes");handler.post(watch);
    }
    private AccessibilityNodeInfo notesRoot(){
        AccessibilityNodeInfo root=getRootInActiveWindow();
        if(root!=null){
            CharSequence pkg=root.getPackageName();if(NOTES.contentEquals(pkg==null?"":pkg))return root;
            boolean own=pkg!=null&&getPackageName().contentEquals(pkg);root.recycle();if(!own)return null;
        }
        // Touching our non-focusable overlay must not hide the focused Notes window.
        List<AccessibilityWindowInfo> list=getWindows();AccessibilityNodeInfo result=null;
        for(AccessibilityWindowInfo window:list){
            if(result==null&&window.getType()==AccessibilityWindowInfo.TYPE_APPLICATION&&window.isFocused()){
                AccessibilityNodeInfo candidate=window.getRoot();if(candidate!=null){if(NOTES.contentEquals(candidate.getPackageName()==null?"":candidate.getPackageName()))result=candidate;else candidate.recycle();}
            }
            window.recycle();
        }
        return result;
    }
    private boolean notesVisible(){
        AccessibilityNodeInfo root=notesRoot();if(root==null)return false;root.recycle();return true;
    }
    private final Runnable watch=new Runnable(){public void run(){
        if(mode.isEmpty())return;
        if(System.currentTimeMillis()>expires){stop("La prueba caducó. Prepárala de nuevo en HiNote.",true);return;}
        if(notesVisible()){
            if(!overlaysSuspended&&panel==null&&picker==null&&System.currentTimeMillis()>=panelHiddenUntil)showPanel();
        }else{
            if(running||overlaysSuspended){stop("Detenido al salir de Huawei Notes; vuelve a preparar la prueba.",true);return;}
            removePicker();removePanel();area=null;copyPending=false;
        }
        handler.postDelayed(this,500);
    }};
    @Override public void onAccessibilityEvent(AccessibilityEvent event){
        if(running&&event.getEventType()==AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED&&!notesVisible())stop("Se cambió de ventana. Prueba detenida.",true);
    }
    @Override public void onInterrupt(){stop("Accesibilidad interrumpida",true);}
    @Override public boolean onUnbind(Intent intent){stop("Servicio desconectado",true);if(connected==this)connected=null;return super.onUnbind(intent);}
    @Override public void onDestroy(){stop("Servicio cerrado",true);if(connected==this)connected=null;super.onDestroy();}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);if(!mode.isEmpty())stop("La orientación o el tamaño cambió. Prepara otra vez la prueba.",true);}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private void measureScreen(){android.util.DisplayMetrics metrics=new android.util.DisplayMetrics();windows.getDefaultDisplay().getRealMetrics(metrics);screenWidth=metrics.widthPixels;screenHeight=metrics.heightPixels;}
    private WindowManager.LayoutParams params(int width,int height,boolean touch){
        WindowManager.LayoutParams p=new WindowManager.LayoutParams(width,height,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|(touch?0:WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),PixelFormat.TRANSLUCENT);
        p.gravity=Gravity.TOP|Gravity.LEFT;return p;
    }
    private Button button(String label,Runnable action){Button b=new Button(this);b.setText(label);b.setTextSize(12);b.setAllCaps(false);b.setPadding(dp(7),0,dp(7),0);b.setMinWidth(0);b.setMinimumWidth(0);b.setOnClickListener(v->action.run());return b;}
    private void showPanel(){
        if(windows==null||mode.isEmpty()||overlaysSuspended)return;measureScreen();
        panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(10),dp(5),dp(10),dp(5));panel.setBackgroundColor(0xf5253449);
        status=new TextView(this);status.setTextColor(Color.WHITE);status.setTextSize(13);status.setText(message);panel.addView(status);
        LinearLayout row=new LinearLayout(this);
        Button zone=button("Marcar zona",()->pick(false));zone.setEnabled(!running);row.addView(zone);
        Button start=button("redraw".equals(mode)?"Dibujar":"Trazar lazo",this::start);start.setEnabled(!running&&area!=null);row.addView(start);
        if("bridge".equals(mode)){
            Button manual=button("Ya seleccioné con el lazo",()->{copyPending=true;log("manual_selection_reported","El usuario indica que seleccionó los trazos en Notes");refresh("Pulsa Copiar, o Ubicar Copiar para marcar el botón visible de Notes.");rebuild();});manual.setEnabled(!running);row.addView(manual);
            Button copy=button("Copiar",this::copyMenu);copy.setEnabled(!running&&copyPending);row.addView(copy);
            Button calibrate=button("Ubicar Copiar",()->pick(true));calibrate.setEnabled(!running&&copyPending);row.addView(calibrate);
        }
        if(awaitingInkObservation&&!running){
            row.addView(button("Sí veo tinta",()->inkObservation(true)));
            row.addView(button("No apareció tinta",()->inkObservation(false)));
        }
        row.addView(button("Detener / cerrar",()->stop("Detenido por el usuario. El gesto en curso puede terminar.",true)));
        if(!running)row.addView(button("Ocultar 10 s",()->{panelHiddenUntil=System.currentTimeMillis()+10000;removePanel();}));
        HorizontalScrollView scroll=new HorizontalScrollView(this);scroll.setHorizontalScrollBarEnabled(true);scroll.addView(row);panel.addView(scroll);
        WindowManager.LayoutParams p=params(Math.min(screenWidth-dp(24),dp(640)),WindowManager.LayoutParams.WRAP_CONTENT,true);p.x=dp(12);p.y=dp(8);
        try{windows.addView(panel,p);}catch(RuntimeException e){panel=null;stop("No se pudo mostrar el control flotante",true);}
    }
    private void refresh(String value){message=value;if(status!=null)status.setText(value);}
    private void rebuild(){removePanel();if(!overlaysSuspended&&notesVisible()&&picker==null)showPanel();}
    private void inkObservation(boolean visible){awaitingInkObservation=false;log(visible?"user_saw_ink":"user_saw_no_ink","Observación del usuario; la edición con el lazo aún debe comprobarse");refresh(visible?"Resultado registrado. Comprueba con el lazo si puedes mover una raya por separado.":"Registrado: no apareció tinta aunque Android completó los gestos.");rebuild();}
    public static final class StopReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context context,Intent intent){stopFromApp();}
    }
    private void stopNotification(boolean show){
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(manager==null)return;
        try{
            if(!show){manager.cancel(3701);return;}
            if(!manager.areNotificationsEnabled())return;
            if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("transfer-control","Pruebas de trazos",NotificationManager.IMPORTANCE_LOW));
            PendingIntent stop=PendingIntent.getBroadcast(this,3701,new Intent(this,StopReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"transfer-control"):new Notification.Builder(this);
            manager.notify(3701,builder.setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("HiNote: enviando gestos a Notes")
                .setContentText("Pulsa Detener o sal de Notes para cancelar.").setOngoing(true).setOnlyAlertOnce(true)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Detener",stop).build()).build());
        }catch(RuntimeException ignored){/* Leaving Notes always remains a stop mechanism. */}
    }
    private void suspendControls(){overlaysSuspended=true;removePicker();removePanel();stopNotification(true);}
    private void resumeControls(){overlaysSuspended=false;panelHiddenUntil=0;stopNotification(false);rebuild();}
    private void removePanel(){if(panel!=null){try{windows.removeView(panel);}catch(Exception ignored){}panel=null;status=null;}}
    private void removePicker(){if(picker!=null){try{windows.removeView(picker);}catch(Exception ignored){}picker=null;}}
    private void pick(boolean point){
        if(running||!notesVisible())return;
        if(point&&!copyPending)return;
        removePanel();picker=new AreaPicker(point);try{windows.addView(picker,params(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT,true));}catch(RuntimeException error){picker=null;stop("No se pudo abrir el selector de zona",true);}
    }
    /** Full-screen picker consumes all touches: marking never writes on the notebook. */
    final class AreaPicker extends android.view.View {
        private final boolean point;
        private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        private float sx,sy,ex,ey;private boolean selected,dragging;private int footerPressed=-1;
        AreaPicker(boolean point){super(NotesTransferService.this);this.point=point;setContentDescription(point?"Marca el botón Copiar y confirma abajo":"Arrastra un rectángulo dentro del papel y confirma abajo");}
        private RectF selection(){return new RectF(Math.min(sx,ex),Math.min(sy,ey),Math.max(sx,ex),Math.max(sy,ey));}
        @Override protected void onDraw(Canvas canvas){
            canvas.drawColor(0x22465870);paint.setStyle(Paint.Style.FILL);paint.setColor(0xf0253449);canvas.drawRect(0,0,getWidth(),dp(85),paint);canvas.drawRect(0,getHeight()-dp(56),getWidth(),getHeight(),paint);
            paint.setColor(Color.WHITE);paint.setTextSize(dp(14));canvas.drawText(point?"Toca el centro de Copiar en el menú de Notes.":"Arrastra una zona dentro de la página de Notes.",dp(12),dp(27),paint);
            canvas.drawText("Tu marca no escribe. Confirma abajo o cancela.",dp(12),dp(52),paint);
            canvas.drawText("Cancelar",dp(20),getHeight()-dp(20),paint);canvas.drawText("Usar esta zona",getWidth()/2f+dp(10),getHeight()-dp(20),paint);
            if(!selected)return;
            paint.setColor(0xff24d5b4);paint.setStrokeWidth(dp(2));paint.setStyle(Paint.Style.STROKE);
            if(point){canvas.drawCircle(ex,ey,dp(15),paint);return;}
            RectF rect=selection();canvas.drawRect(rect,paint);
            if(ink!=null&&"redraw".equals(mode)&&rect.width()>1&&rect.height()>1){paint.setColor(0xff007866);paint.setStrokeWidth(dp(1));for(int i=0;i<ink.strokes.size();i++)canvas.drawPath(ink.path(i,rect),paint);}
        }
        @Override public boolean onTouchEvent(MotionEvent event){
            if(event.getPointerCount()!=1||event.getActionMasked()==MotionEvent.ACTION_CANCEL){footerPressed=-1;dragging=false;return true;}
            float x=event.getX(),y=event.getY();
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN){
                footerPressed=-1;dragging=false;
                if(y>getHeight()-dp(56)){
                    footerPressed=x<getWidth()/2f?0:1;
                    return true;
                }
                if(y<dp(90))return true;
                sx=ex=x;sy=ey=y;selected=true;dragging=true;
            }else if(event.getActionMasked()==MotionEvent.ACTION_MOVE&&dragging){ex=Math.max(dp(4),Math.min(getWidth()-dp(4),x));ey=Math.max(dp(90),Math.min(getHeight()-dp(60),y));}
            else if(event.getActionMasked()==MotionEvent.ACTION_UP){
                dragging=false;int pressed=footerPressed;footerPressed=-1;
                if(y<=getHeight()-dp(56)||pressed<0||pressed!=(x<getWidth()/2f?0:1))return true;
                performClick();
                if(pressed==0){removePicker();rebuild();return true;}
                if(!selected||(!point&&(selection().width()<dp(50)||selection().height()<dp(50))))return true;
                int[] origin=new int[2];getLocationOnScreen(origin);
                if(point){final float px=ex+origin[0],py=ey+origin[1];removePicker();tapCopy(px,py);}
                else{RectF rect=selection();rect.offset(origin[0],origin[1]);area=rect;removePicker();refresh("Zona preparada. "+("redraw".equals(mode)?"Confirma lápiz y escritura con dedo; pulsa Dibujar.":"Activa tú el LAZO de Notes; pulsa Trazar lazo."));rebuild();}
                return true;
            }
            invalidate();return true;
        }
    }
    private boolean canRun(int token){return token==generation&&running&&!mode.isEmpty()&&notesVisible();}
    private void start(){
        if(running||area==null||!notesVisible())return;
        // Never draw through the floating controls or outside the current display.
        if(area.left<0||area.top<0||area.right>=screenWidth||area.bottom>=screenHeight)return;
        if(panel!=null){int[] origin=new int[2];panel.getLocationOnScreen(origin);RectF box=new RectF(origin[0],origin[1],origin[0]+panel.getWidth(),origin[1]+panel.getHeight());if(RectF.intersects(box,area)){refresh("Marca una zona debajo del panel flotante.");return;}}
        running=true;index=0;copyPending=false;awaitingInkObservation=false;final int token=++generation;refresh("Empieza en 2 segundos. El panel se ocultará durante el envío. No toques la hoja. Sal de Notes para detener.");rebuild();log("countdown","");
        handler.postDelayed(()->{if(!canRun(token)){if(token==generation)stop("Notes dejó de estar activo",true);return;}suspendControls();handler.postDelayed(()->{if(!canRun(token)){if(token==generation)stop("Notes dejó de estar activo",true);return;}if("redraw".equals(mode))next(token);else lasso(token);},350);},2000);
    }
    private void next(int token){
        if(!canRun(token)){if(token==generation)stop("No se puede continuar en la ventana actual",true);return;}
        if(index>=ink.strokes.size()){running=false;awaitingInkObservation=true;log("gestures_finished","Android terminó el envío sin controles flotantes; esto no confirma dibujo en Notes");refresh("Android terminó de enviar los gestos. ¿Ves tinta en Notes? Indica el resultado con los botones.");resumeControls();return;}
        float[] points=ink.fit(ink.strokes.get(index),area);refresh("Dibujando "+(index+1)+" / "+ink.strokes.size()+". No toques la página.");
        dispatch(TransferInk.path(points),TransferInk.duration(points),token,()->{index++;handler.postDelayed(()->next(token),100);});
    }
    private void lasso(int token){
        Path path=new Path();path.moveTo(area.left,area.top);path.lineTo(area.right,area.top);path.lineTo(area.right,area.bottom);path.lineTo(area.left,area.bottom);path.close();
        dispatch(path,650,token,()->{index=1;running=false;copyPending=true;log("lasso_dispatched","El usuario debe haber activado el lazo de Notes");refresh("Buscando Copiar en el menú de Notes…");handler.postDelayed(()->{if(token==generation&&copyPending){if(notesVisible())copyMenu();else stop("Notes dejó de estar activo",true);}},500);});
    }
    private void dispatch(Path path,long duration,int token,Runnable after){
        if(!canRun(token)){if(token==generation)stop("Notes no está activo",true);return;}
        try{
            boolean accepted=dispatchGesture(new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path,0,duration)).build(),new GestureResultCallback(){
                @Override public void onCompleted(GestureDescription gesture){if(canRun(token))after.run();else if(token==generation)stop("La ventana cambió durante el gesto",true);}
                @Override public void onCancelled(GestureDescription gesture){if(token==generation)stop("Android canceló el gesto. Comprueba el modo de dedo/lazo y vuelve a preparar la prueba.",true);}
            },handler);
            if(!accepted)stop("Android no aceptó el gesto de accesibilidad",true);
        }catch(RuntimeException error){stop("No se pudo enviar el gesto: "+error.getClass().getSimpleName(),true);}
    }
    static boolean isCopyLabel(CharSequence value){if(value==null)return false;String text=value.toString().trim().toLowerCase(Locale.ROOT);return text.equals("copiar")||text.equals("copy")||text.equals("复制")||text.equals("複製");}
    static boolean findCopy(AccessibilityNodeInfo root){
        if(root==null||!NOTES.contentEquals(root.getPackageName()==null?"":root.getPackageName()))return false;
        List<AccessibilityNodeInfo> matches=new ArrayList<>();collect(root,matches,new int[]{0});
        boolean clicked=false;try{if(matches.size()==1)clicked=matches.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK);}finally{for(AccessibilityNodeInfo node:matches)node.recycle();}return clicked;
    }
    private static void collect(AccessibilityNodeInfo node,List<AccessibilityNodeInfo> matches,int[] seen){
        if(node==null||seen[0]++>500||matches.size()>1)return;
        if(node.isVisibleToUser()&&node.isEnabled()&&(isCopyLabel(node.getText())||isCopyLabel(node.getContentDescription()))){
            AccessibilityNodeInfo current=AccessibilityNodeInfo.obtain(node);
            for(int depth=0;depth<3&&current!=null;depth++){
                if(current.isClickable()&&current.isEnabled()&&current.isVisibleToUser()){if(!matches.contains(current))matches.add(current);else current.recycle();current=null;break;}
                AccessibilityNodeInfo parent=current.getParent();current.recycle();current=parent;
            }
            if(current!=null)current.recycle();return;
        }
        for(int i=0;i<node.getChildCount()&&matches.size()<2;i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null){collect(child,matches,seen);child.recycle();}}
    }
    private void copyMenu(){
        if(running||!copyPending||!notesVisible())return;
        running=true;int token=++generation;suspendControls();
        handler.postDelayed(()->{
            if(!canRun(token)){if(token==generation)stop("Notes dejó de estar activo",true);return;}
            List<AccessibilityNodeInfo> matches=new ArrayList<>();int[] seen={0};AccessibilityNodeInfo root=notesRoot();
            if(root!=null){collect(root,matches,seen);root.recycle();}
            for(AccessibilityWindowInfo window:getWindows()){
                AccessibilityNodeInfo other=window.getRoot();
                if(other!=null){if(NOTES.contentEquals(other.getPackageName()==null?"":other.getPackageName()))collect(other,matches,seen);other.recycle();}
                window.recycle();
            }
            boolean clicked=false;int count=matches.size();try{if(count==1)clicked=matches.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK);}finally{for(AccessibilityNodeInfo match:matches)match.recycle();}
            running=false;
            if(clicked){copyPending=false;log("copy_menu_clicked","Botón exacto de Notes; contenido no verificado");refresh("Notes aceptó la acción del botón Copiar. Abre el destino y comprueba qué pega. La copia aún no está verificada.");}
            else{log("copy_menu_unavailable","Coincidencias únicas: "+count+"; se revisaron las ventanas de Notes sin panel flotante");refresh("No pude activar Copiar. Puedes pulsarlo tú, o usar Ubicar Copiar y confirmar soltando el dedo.");}
            resumeControls();
        },350);
    }
    private void tapCopy(float x,float y){
        if(!copyPending||!notesVisible())return;running=true;int token=++generation;Path path=new Path();path.moveTo(x,y);
        // Wait for the user's ACTION_UP and for the overlay window to disappear.
        suspendControls();log("copy_position_scheduled","Confirmación al soltar el dedo; espera de 500 ms sin controles");
        handler.postDelayed(()->{if(!canRun(token)){if(token==generation)stop("Notes dejó de estar activo",true);return;}
            dispatch(path,100,token,()->{running=false;copyPending=false;log("copy_position_tapped","Android terminó el toque; copia aún no verificada");refresh("Android envió el toque. Abre el cuaderno destino y comprueba qué pega Notes.");resumeControls();});
        },500);
    }
    private void log(String stage,String detail){TransferJournal.event(this,mode,stage,index,ink==null?1:ink.strokes.size(),detail);}
    private void stop(String reason,boolean close){
        if(!mode.isEmpty()){log("stopped",reason);Toast.makeText(this,reason,Toast.LENGTH_LONG).show();}generation++;running=false;copyPending=false;overlaysSuspended=false;awaitingInkObservation=false;handler.removeCallbacksAndMessages(null);removePicker();removePanel();stopNotification(false);
        if(close){mode="";ink=null;area=null;}
    }
}
