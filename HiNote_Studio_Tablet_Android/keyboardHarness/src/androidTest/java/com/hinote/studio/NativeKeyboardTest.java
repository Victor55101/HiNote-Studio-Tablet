package com.hinote.studio;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.graphics.Bitmap;
import org.json.JSONArray;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TestName;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs the Android input channel, an IME process and the production WebView keyboard code. */
@RunWith(AndroidJUnit4.class)
public class NativeKeyboardTest {
    Instrumentation test;Context context;UiAutomation automation;HarnessActivity activity;
    String oldIme,oldEnabledImes,oldServices,oldAccessibility,oldShow;
    int deviceId;String eventPath;
    @Rule public TestName testName=new TestName();
    interface Condition { boolean satisfied()throws Exception; }
    private void await(String message,Condition condition)throws Exception{
        long end=SystemClock.uptimeMillis()+10000;
        while(SystemClock.uptimeMillis()<end){if(condition.satisfied())return;SystemClock.sleep(40);}
        saveScreen();
        fail(message+"; native="+ime("state")+"; frame="+frame()+"; editor="+js("JSON.stringify({active:document.activeElement?.id,canShow:hinoteKeyboardCanShow(),state:JSON.parse(AndroidBridge.getKeyboardState()),text:document.getElementById('editor').textContent})"));
    }
    private boolean[] visibleIme(){
        // Inspect rendered pixels, not just the IME's internal 'shown' flag:
        // WindowManager can keep an internally shown IME surface hidden.
        Bitmap captured=automation.takeScreenshot();assertNotNull("Emulator screenshot",captured);
        Bitmap bitmap=captured.getConfig()==Bitmap.Config.HARDWARE?captured.copy(Bitmap.Config.ARGB_8888,false):captured;
        int[] pixels=new int[bitmap.getWidth()*bitmap.getHeight()];bitmap.getPixels(pixels,0,bitmap.getWidth(),0,0,bitmap.getWidth(),bitmap.getHeight());
        int keys=0,candidates=0;for(int i=0;i<pixels.length;i+=16){if(pixels[i]==HarnessIme.KEYS_COLOR)keys++;if(pixels[i]==HarnessIme.CANDIDATES_COLOR)candidates++;}
        if(bitmap!=captured)bitmap.recycle();captured.recycle();return new boolean[]{keys>300,candidates>100};
    }
    private void saveScreen()throws Exception{
        shell("su 0 screencap -p /data/local/tmp/hinote-keyboard-shots/"+testName.getMethodName()+".png");
    }
    private String frame(){
        AtomicReference<String> value=new AtomicReference<>();test.runOnMainSync(()->{
            android.graphics.Rect visible=new android.graphics.Rect();activity.web.getWindowVisibleDisplayFrame(visible);
            android.view.WindowInsets insets=activity.web.getRootWindowInsets();
            value.set("ime="+(insets==null?"null":insets.getInsets(android.view.WindowInsets.Type.ime()).bottom)
                +",visible="+(insets!=null&&insets.isVisible(android.view.WindowInsets.Type.ime()))
                +",frameBottom="+visible.bottom+",windowBottom="+activity.getWindowManager().getCurrentWindowMetrics().getBounds().bottom);
        });return value.get();
    }
    private String js(String code)throws Exception{
        AtomicReference<String> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        test.runOnMainSync(()->activity.web.evaluateJavascript(code,value->{result.set(value);done.countDown();}));
        assertTrue("Javascript callback",done.await(3,TimeUnit.SECONDS));return result.get();
    }
    private Bundle ime(String command)throws Exception{
        AtomicReference<Bundle> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        // Keep test IPC off the emulator's congested boot-time background
        // broadcast queue. This does not change native key delivery or the IME.
        Intent intent=new Intent(context,HarnessIme.CommandReceiver.class)
            .addFlags(Intent.FLAG_RECEIVER_FOREGROUND).putExtra("command",command);
        context.sendOrderedBroadcast(intent,null,new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){result.set(getResultExtras(true));done.countDown();}},new Handler(Looper.getMainLooper()),0,null,null);
        assertTrue("IME process callback",done.await(10,TimeUnit.SECONDS));result.get().size();return result.get();
    }
    private String shell(String command)throws Exception{
        try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand(command))){
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[2048];int count;
            while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
            return new String(output.toByteArray(),StandardCharsets.UTF_8);
        }
    }
    @Before public void start()throws Exception{
        test=InstrumentationRegistry.getInstrumentation();context=test.getTargetContext();
        automation=test.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
        automation.adoptShellPermissionIdentity("android.permission.WRITE_SECURE_SETTINGS");
        oldIme=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.DEFAULT_INPUT_METHOD);
        oldEnabledImes=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.ENABLED_INPUT_METHODS);
        oldServices=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        oldAccessibility=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.ACCESSIBILITY_ENABLED);
        oldShow=Settings.Secure.getString(context.getContentResolver(),"show_ime_with_hard_keyboard");
        boolean advanced=!testName.getMethodName().startsWith("standard");
        if(advanced){
            assertTrue("Explicit development grant for the opt-in control",shell("pm grant "+context.getPackageName()+" android.permission.WRITE_SECURE_SETTINGS").trim().isEmpty());
            assertEquals("Package has the actual grant, independent of instrumentation identity",android.content.pm.PackageManager.PERMISSION_GRANTED,context.getPackageManager().checkPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS,context.getPackageName()));
        }
        context.getSharedPreferences(KeyboardPreferenceLease.PREFERENCES,Context.MODE_PRIVATE).edit().putBoolean(KeyboardPreferenceLease.ENABLED,advanced).commit();
        String targetIme=new ComponentName(context,HarnessIme.class).flattenToShortString();
        Settings.Secure.putInt(context.getContentResolver(),"show_ime_with_hard_keyboard",testName.getMethodName().endsWith("SettingOn")?1:0);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_INPUT_METHODS,targetIme);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.DEFAULT_INPUT_METHOD,targetIme);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,new ComponentName(context,KeyboardAccessService.class).flattenToString());
        Settings.Secure.putInt(context.getContentResolver(),Settings.Secure.ACCESSIBILITY_ENABLED,1);
        activity=(HarnessActivity)test.startActivitySync(new Intent(context,HarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        await("Accessibility override connected",KeyboardAccessService::available);
        await("Real keyboard Javascript loaded",()->"function".equals(js("typeof window.onKeyboardState").replace("\"","")));
        // A real tap establishes both Android view focus and the Chromium
        // editing connection, just as the user's first edit does.
        await("Activity window focused",()->activity.hasWindowFocus());
        int[] location=new int[2];test.runOnMainSync(()->activity.web.getLocationOnScreen(location));
        String raw=js("(()=>{const r=document.getElementById('editor').getBoundingClientRect();return [r.left+20,r.top+20,devicePixelRatio]})()");
        JSONArray point=new JSONArray(raw);float x=location[0]+(float)(point.getDouble(0)*point.getDouble(2)),y=location[1]+(float)(point.getDouble(1)*point.getDouble(2));
        long when=SystemClock.uptimeMillis();
        for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){
            MotionEvent tap=MotionEvent.obtain(when,SystemClock.uptimeMillis(),action,x,y,0);tap.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            assertTrue("Tap original editor surface",automation.injectInputEvent(tap,true));tap.recycle();
        }
        await("Android WebView focused",()->activity.web.hasFocus());
        await("DOM editor focused",()->"\"editor\"".equals(js("document.activeElement.id")));
        await("InputConnection established in IME process",()->ime("state").getBoolean("input"));
        deviceId=-1;
        for(int id:InputDevice.getDeviceIds()){
            InputDevice device=InputDevice.getDevice(id);
            if(device!=null&&!device.isVirtual()&&device.supportsSource(InputDevice.SOURCE_KEYBOARD)&&device.getKeyboardType()==InputDevice.KEYBOARD_TYPE_ALPHABETIC){deviceId=id;break;}
        }
        assertTrue("Emulator requires an enabled hardware keyboard",deviceId!=-1);
        String name=InputDevice.getDevice(deviceId).getName();
        // UiAutomation uses Runtime.exec, not a shell parser: issue direct
        // commands rather than relying on quoting, loops or semicolons.
        String inventory=shell("ls /sys/class/input");
        for(String entry:inventory.split("\\s+"))if(entry.matches("event[0-9]+")){
            if(name.equals(shell("cat /sys/class/input/"+entry+"/device/name").trim())){
                eventPath="/dev/input/"+entry;break;
            }
        }
        assertNotNull("Kernel keyboard device: "+name+" / "+inventory,eventPath);
        assertTrue("CI emulator root for real kernel input",shell("su 0 id").contains("uid=0"));
    }
    @After public void stop()throws Exception{
        if(activity!=null)test.runOnMainSync(()->{activity.keyboard.stop();activity.finish();});
        if(context!=null&&automation!=null){
            context.getSharedPreferences(KeyboardPreferenceLease.PREFERENCES,Context.MODE_PRIVATE).edit().putBoolean(KeyboardPreferenceLease.ENABLED,false).commit();
            Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,oldServices);
            Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ACCESSIBILITY_ENABLED,oldAccessibility);
            await("Optional service released",()->!KeyboardAccessService.available());
            Settings.Secure.putString(context.getContentResolver(),Settings.Secure.DEFAULT_INPUT_METHOD,oldIme);
            Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_INPUT_METHODS,oldEnabledImes);
            Settings.Secure.putString(context.getContentResolver(),"show_ime_with_hard_keyboard",oldShow);
            automation.dropShellPermissionIdentity();
        }
    }
    private void mode(String value){test.runOnMainSync(()->activity.keyboard.setMode(value));}
    private void event(int action,int code,int modifiers)throws Exception{
        // Android normalizes UiAutomation-injected keys to device -1. Feed
        // the emulator's kernel keyboard instead, so the production hardware
        // classifier and pre-IME path receive an actual device key pair.
        int scan=code==KeyEvent.KEYCODE_H?35:code==KeyEvent.KEYCODE_CTRL_LEFT?29:code-KeyEvent.KEYCODE_1+2;
        String result=shell("su 0 sendevent "+eventPath+" 1 "+scan+" "+(action==KeyEvent.ACTION_DOWN?1:0));
        result+=shell("su 0 sendevent "+eventPath+" 0 0 0");
        assertTrue("Kernel input accepted: "+result,result.trim().isEmpty());
    }
    private void press(int code)throws Exception{event(KeyEvent.ACTION_DOWN,code,0);event(KeyEvent.ACTION_UP,code,0);}
    private void candidateEvent(int action,int code,int modifiers){
        // The emulator's legacy qwerty.kl has no CTRL mapping. Native modifier
        // protocol is tested through Android injection; physical pre-IME chord
        // routing is covered separately by EditorWebViewTest on API 28 and 31.
        long now=SystemClock.uptimeMillis();
        assertTrue(automation.injectInputEvent(new KeyEvent(now,now,action,code,0,modifiers,deviceId,0,0,InputDevice.SOURCE_KEYBOARD),true));
    }
    private void firstLetter()throws Exception{
        mode("virtual");await("Virtual keys shown",()->visibleIme()[0]);
        mode("auto");Bundle before=ime("state");press(KeyEvent.KEYCODE_H);
        await("First h delivered to DOM without another key",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
        await("Keys closed by that same physical press",()->!visibleIme()[0]);
        await("Candidates visible from that first press",()->visibleIme()[1]);
        Bundle after=ime("state");assertEquals(before.getInt("typed")+1,after.getInt("typed"));assertEquals(before.getInt("dropped"),after.getInt("dropped"));
        int inputType=after.getInt("inputType");
        assertEquals("Native text InputConnection retained",android.text.InputType.TYPE_CLASS_TEXT,inputType&android.text.InputType.TYPE_MASK_CLASS);
        assertTrue("Native autocorrection remains enabled",(inputType&android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT)!=0);
        assertEquals("Suggestions not disabled",0,inputType&android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
    }
    private void lateShow()throws Exception{
        mode("virtual");await("Virtual keys shown",()->visibleIme()[0]);
        ime("late");mode("physical");SystemClock.sleep(900);
        boolean keys=visibleIme()[0];if(keys)saveScreen();
        assertFalse("Late provider keys closed: "+ime("state")+" frame="+frame()+" state="+js("AndroidBridge.getKeyboardState()"),keys);
        press(KeyEvent.KEYCODE_H);await("Typing still reaches physical editor",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
    }
    private void candidates()throws Exception{
        mode("physical");int before=ime("state").getInt("selections");
        press(KeyEvent.KEYCODE_H);
        await("Solo físico accepts its first letter",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
        await("Solo físico retains visible native candidates",()->visibleIme()[1]&&!visibleIme()[0]);
        String[] words={"uno","dos","tres"};
        for(int n=0;n<3;n++){
            js("document.getElementById('editor').textContent='';document.getElementById('editor').focus()");
            candidateEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_CTRL_LEFT,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            candidateEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_1+n,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            candidateEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_1+n,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            candidateEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_CTRL_LEFT,0);
            String expected="\""+words[n]+"\"";await("Candidate "+(n+1)+" selected natively",()->expected.equals(js("document.getElementById('editor').textContent")));
        }
        assertEquals(before+3,ime("state").getInt("selections"));
    }
    @Test public void firstLetterSettingOff()throws Exception{firstLetter();}
    @Test public void firstLetterSettingOn()throws Exception{firstLetter();}
    @Test public void lateShowSettingOff()throws Exception{lateShow();}
    @Test public void lateShowSettingOn()throws Exception{lateShow();}
    @Test public void candidatesSettingOff()throws Exception{candidates();}
    @Test public void candidatesSettingOn()throws Exception{candidates();}
    private void visualClose()throws Exception{
        mode("virtual");await("Virtual keys shown before visual handoff",()->visibleIme()[0]);mode("auto");
        event(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_H,0);
        await("Keys disappear while the first physical key is still held",()->!visibleIme()[0]);
        assertTrue("Native session remains unchanged until text/UP",KeyboardAccessService.ownsVirtualOverride(activity.keyboard));
        event(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_H,0);
        await("The original first letter is retained",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
        await("Native candidates return without another key",()->visibleIme()[1]&&!visibleIme()[0]);
        assertEquals(0,ime("state").getInt("dropped"));
    }
    @Test public void visualCloseSettingOff()throws Exception{visualClose();}
    @Test public void visualCloseSettingOn()throws Exception{visualClose();}
    @Test public void originalPreferenceRestoredOnPauseSettingOn()throws Exception{
        mode("physical");await("Physical preference applied only for this session",()->Settings.Secure.getInt(context.getContentResolver(),KeyboardPreferenceLease.SETTING,1)==0);
        test.runOnMainSync(()->activity.keyboard.stop());
        assertEquals(1,Settings.Secure.getInt(context.getContentResolver(),KeyboardPreferenceLease.SETTING,0));
        test.runOnMainSync(()->activity.keyboard.start());mode("physical");
        await("Advanced control resumes",()->Settings.Secure.getInt(context.getContentResolver(),KeyboardPreferenceLease.SETTING,1)==0);
    }
    @Test public void standardControlSettingOff()throws Exception{firstLetter();}
    @Test public void standardControlLeavesOnPreferenceUnchangedSettingOn()throws Exception{
        mode("virtual");await("Standard virtual keys shown",()->visibleIme()[0]);mode("auto");press(KeyEvent.KEYCODE_H);
        await("Standard control keeps the original letter",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
        assertEquals("No normalization without the user's opt-in",1,Settings.Secure.getInt(context.getContentResolver(),KeyboardPreferenceLease.SETTING,0));
        assertTrue(js("AndroidBridge.getKeyboardState()").contains("needs_control"));
    }
}
