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
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs the Android input channel, an IME process and the production WebView keyboard code. */
@RunWith(AndroidJUnit4.class)
public class NativeKeyboardTest {
    Instrumentation test;Context context;UiAutomation automation;HarnessActivity activity;
    String oldIme,oldEnabledImes,oldServices,oldAccessibility,oldShow;
    int deviceId;
    interface Condition { boolean satisfied()throws Exception; }
    private void await(String message,Condition condition)throws Exception{
        long end=SystemClock.uptimeMillis()+10000;
        while(SystemClock.uptimeMillis()<end){if(condition.satisfied())return;SystemClock.sleep(40);}
        fail(message);
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
        assertTrue("IME process callback",done.await(10,TimeUnit.SECONDS));return result.get();
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
        String targetIme=new ComponentName(context,HarnessIme.class).flattenToShortString();
        Settings.Secure.putInt(context.getContentResolver(),"show_ime_with_hard_keyboard",0);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_INPUT_METHODS,targetIme);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.DEFAULT_INPUT_METHOD,targetIme);
        Settings.Secure.putString(context.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,new ComponentName(context,KeyboardAccessService.class).flattenToString());
        Settings.Secure.putInt(context.getContentResolver(),Settings.Secure.ACCESSIBILITY_ENABLED,1);
        activity=(HarnessActivity)test.startActivitySync(new Intent(context,HarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        await("Accessibility override connected",KeyboardAccessService::available);
        await("Real keyboard Javascript loaded",()->"function".equals(js("typeof window.onKeyboardState").replace("\"","")));
        js("document.getElementById('editor').focus()");
        await("InputConnection established in IME process",()->ime("state").getBoolean("input"));
        deviceId=-1;
        for(int id:InputDevice.getDeviceIds()){
            InputDevice device=InputDevice.getDevice(id);
            if(device!=null&&!device.isVirtual()&&device.supportsSource(InputDevice.SOURCE_KEYBOARD)&&device.getKeyboardType()==InputDevice.KEYBOARD_TYPE_ALPHABETIC){deviceId=id;break;}
        }
        assertTrue("Emulator requires an enabled hardware keyboard",deviceId!=-1);
    }
    @After public void stop()throws Exception{
        if(activity!=null)test.runOnMainSync(()->{activity.keyboard.stop();activity.finish();});
        if(context!=null&&automation!=null){
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
    private void event(int action,int code,int modifiers){
        long now=SystemClock.uptimeMillis();
        assertTrue("Inject original hardware event",automation.injectInputEvent(new KeyEvent(now,now,action,code,0,modifiers,deviceId,0,0,InputDevice.SOURCE_KEYBOARD),true));
    }
    private void press(int code){event(KeyEvent.ACTION_DOWN,code,0);event(KeyEvent.ACTION_UP,code,0);}
    @Test public void firstPhysicalLetterAppearsOnceAndClosesKeysOnTheSamePress()throws Exception{
        mode("virtual");await("Virtual keys shown",()->ime("state").getBoolean("keys"));
        mode("auto");Bundle before=ime("state");press(KeyEvent.KEYCODE_H);
        await("First h delivered to DOM without another key",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
        await("Keys closed by that same physical press",()->!ime("state").getBoolean("keys"));
        Bundle after=ime("state");assertEquals(before.getInt("typed")+1,after.getInt("typed"));assertEquals(before.getInt("dropped"),after.getInt("dropped"));
    }
    @Test public void soloFisicoClosesAProviderShowThatArrivesAfterModeSelection()throws Exception{
        mode("virtual");await("Virtual keys shown",()->ime("state").getBoolean("keys"));
        ime("late");mode("physical");SystemClock.sleep(900);
        assertFalse("Late provider keys closed",ime("state").getBoolean("keys"));
        press(KeyEvent.KEYCODE_H);await("Typing still reaches physical editor",()->"\"h\"".equals(js("document.getElementById('editor').textContent")));
    }
    @Test public void ctrlOneTwoThreeAreConsumedByNativeCandidateSelection()throws Exception{
        mode("physical");int before=ime("state").getInt("selections");
        String[] words={"uno","dos","tres"};
        for(int n=0;n<3;n++){
            js("document.getElementById('editor').textContent='';document.getElementById('editor').focus()");
            event(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_CTRL_LEFT,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            event(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_1+n,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            event(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_1+n,KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON);
            event(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_CTRL_LEFT,0);
            String expected="\""+words[n]+"\"";await("Candidate "+(n+1)+" selected natively",()->expected.equals(js("document.getElementById('editor').textContent")));
        }
        assertEquals(before+3,ime("state").getInt("selections"));
    }
}
