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
            case "physical":return "Solo físico preparado";
            case "refused":return "El sistema no permitió el control; revisa Accesibilidad y el ajuste del teclado físico";
            case "busy":return "Otro servicio de Accesibilidad está controlando el teclado";
            case "unsupported":return "Esta prueba requiere Android 10 o posterior";
            case "unknown":return "Servicio conectado; comprueba el ajuste del teclado físico";
            default:return "Activa «HiNote · Control del teclado V59» en Accesibilidad";
        }
    }
    static void firstOpen(Activity activity){
        if(!BuildConfig.KEYBOARD_TRIAL||activity.isFinishing()||activity.isDestroyed()
            ||activity.getPreferences(Activity.MODE_PRIVATE).getBoolean("keyboard-trial-help-seen",false))return;
        activity.getPreferences(Activity.MODE_PRIVATE).edit().putBoolean("keyboard-trial-help-seen",true).apply();show(activity);
    }
    static void show(Activity activity){
        if(!BuildConfig.KEYBOARD_TRIAL||activity.isFinishing()||activity.isDestroyed())return;
        new AlertDialog.Builder(activity).setTitle("Prueba del teclado · V59")
            .setMessage(statusText(KeyboardAccessService.status())+"\n\n"
                +"En Accesibilidad, activa «HiNote · Control del teclado V59». Puedes dejar «Mostrar teclado virtual» activado o desactivado en el sistema.\n\n"
                +"Solo físico conserva las sugerencias y herramientas que ofrezca tu teclado. Mostrar virtual solicita las teclas completas. Automático solicita las teclas al tocar un campo y vuelve al teclado físico cuando escribes con él o usas su panel táctil.\n\n"
                +"El control es temporal y se libera al salir de HiNote. El servicio no lee la pantalla, no registra pulsaciones y no realiza gestos. La compatibilidad con HarmonyOS y cada teclado sigue en prueba.\n\n"
                +"Puedes volver aquí desde Archivo → Control del teclado.")
            .setPositiveButton("Accesibilidad",(dialog,which)->open(activity,
                new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").putExtra(Intent.EXTRA_COMPONENT_NAME,new ComponentName(activity,KeyboardAccessService.class)),
                new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
            .setNeutralButton("Ajustes del teclado",(dialog,which)->open(activity,
                new Intent("android.settings.HARD_KEYBOARD_SETTINGS"),new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)))
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
