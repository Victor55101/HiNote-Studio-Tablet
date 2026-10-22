package com.hinote.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.widget.Toast;

/** Instructions and explicit settings entry points for the independent trial. */
final class KeyboardTrialSetup {
    static String statusText(String status){
        switch(status){
            case "ready":return "Control preparado";
            case "active":return "Teclas virtuales permitidas";
            case "physical":return "Entrada física activa";
            case "needs_control":return "El ajuste del sistema está activado; falta preparar el control ampliado";
            case "refused":return "El sistema no permitió el control; revisa Accesibilidad y el ajuste del teclado físico";
            case "busy":return "Otro servicio de Accesibilidad está controlando el teclado";
            case "unsupported":return "Esta prueba requiere Android 10 o posterior";
            case "unknown":return "Servicio conectado; comprueba el ajuste del teclado físico";
            default:return "Activa «HiNote · Control del teclado V60» en Accesibilidad";
        }
    }
    static void firstOpen(Activity activity){
        if(!BuildConfig.KEYBOARD_TRIAL||activity.isFinishing()||activity.isDestroyed()
            ||activity.getPreferences(Activity.MODE_PRIVATE).getBoolean("keyboard-trial-help-seen",false))return;
        activity.getPreferences(Activity.MODE_PRIVATE).edit().putBoolean("keyboard-trial-help-seen",true).apply();show(activity);
    }
    static void show(Activity activity){
        if(!BuildConfig.KEYBOARD_TRIAL||activity.isFinishing()||activity.isDestroyed())return;
        new AlertDialog.Builder(activity).setTitle("Prueba del teclado · V60")
            .setMessage(statusText(KeyboardAccessService.status())+"\n\n"
                +"En Accesibilidad, activa «HiNote · Control del teclado V60». El control estándar funciona con «Mostrar teclado virtual» desactivado. Para usar también el ajuste activado, abre «Control ampliado».\n\n"
                +"Solo físico conserva las sugerencias y herramientas que ofrezca tu teclado. Mostrar virtual solicita las teclas completas. Automático solicita las teclas al tocar un campo y vuelve al teclado físico cuando escribes con él o usas su panel táctil.\n\n"
                +"El control es temporal y se libera al salir de HiNote. El servicio no lee la pantalla, no registra pulsaciones y no realiza gestos. La compatibilidad con HarmonyOS y cada teclado sigue en prueba.\n\n"
                +"Puedes volver aquí desde Archivo → Control del teclado.")
            .setPositiveButton("Accesibilidad",(dialog,which)->open(activity,
                new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").putExtra(Intent.EXTRA_COMPONENT_NAME,new ComponentName(activity,KeyboardAccessService.class)),
                new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
            .setNeutralButton("Control ampliado",(dialog,which)->advanced(activity))
            .setNegativeButton("Cerrar",null).show();
    }
    private static void advanced(Activity activity){
        String command="adb shell pm grant "+activity.getPackageName()+" android.permission.WRITE_SECURE_SETTINGS";
        boolean granted=KeyboardPreferenceLease.authorizedFor(activity);
        new AlertDialog.Builder(activity).setTitle("Control ampliado del teclado")
            .setMessage("Android necesita una autorización especial para adaptar la preferencia del teclado cuando «Mostrar teclado virtual» está activado.\n\n"
                +"El permiso permite escribir ajustes seguros del sistema; HiNote lo usa únicamente para la preferencia de mostrar teclas con un teclado físico. Conserva el valor original y lo restaura al salir o perder el foco. Si el sistema fuerza el cierre, recupera el valor al volver a abrir la app.\n\n"
                +(granted?"El permiso ya está disponible. Puedes activar el control ampliado.":"Se habilita una vez desde una computadora con ADB y depuración USB autorizada:\n\n"+command+"\n\nCopiar el comando prepara HiNote, pero no concede el permiso. Después de ejecutarlo, vuelve a la app.")
                +"\n\nLas sugerencias y herramientas siguen siendo las de tu teclado.")
            .setPositiveButton(granted?"Activar":"Copiar comando y preparar",(dialog,which)->{
                activity.getSharedPreferences(KeyboardPreferenceLease.PREFERENCES,Activity.MODE_PRIVATE).edit().putBoolean(KeyboardPreferenceLease.ENABLED,true).apply();
                if(!granted){android.content.ClipboardManager clipboard=(android.content.ClipboardManager)activity.getSystemService(Activity.CLIPBOARD_SERVICE);if(clipboard!=null)clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Permiso de control del teclado",command));}
                Toast.makeText(activity,granted?"Control ampliado activado":"Comando copiado; falta conceder el permiso desde la computadora",Toast.LENGTH_LONG).show();
            })
            .setNeutralButton("Desactivar",(dialog,which)->activity.getSharedPreferences(KeyboardPreferenceLease.PREFERENCES,Activity.MODE_PRIVATE).edit().putBoolean(KeyboardPreferenceLease.ENABLED,false).apply())
            .setNegativeButton("Cerrar",null).show();
    }
    private static void open(Activity activity,Intent primary,Intent fallback){
        try{activity.startActivity(primary);}
        catch(android.content.ActivityNotFoundException|SecurityException error){
            try{activity.startActivity(fallback);}
            catch(android.content.ActivityNotFoundException|SecurityException ignored){Toast.makeText(activity,"Abre los ajustes del sistema para activar este control.",Toast.LENGTH_LONG).show();}
        }
    }
}
