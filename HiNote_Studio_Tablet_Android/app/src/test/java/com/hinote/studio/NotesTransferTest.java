package com.hinote.studio;

import android.content.Context;
import android.content.Intent;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Looper;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import java.time.Duration;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
public class NotesTransferTest {
    @Test public void sampleFitsUserRectangleWithoutChangingAspectRatio() throws Exception {
        TransferInk ink=TransferInk.parse(TransferInk.SAMPLE);assertEquals(3,ink.strokes.size());
        RectF rect=new RectF(40,100,440,600);float[] first=ink.fit(ink.strokes.get(0),rect);
        assertEquals(Math.abs(first[0]-first[2]),Math.abs(first[1]-first[3]),.001);
        for(float[] stroke:ink.strokes){float[] placed=ink.fit(stroke,rect);for(int i=0;i<placed.length;i+=2){assertTrue(placed[i]>=rect.left&&placed[i]<=rect.right);assertTrue(placed[i+1]>=rect.top&&placed[i+1]<=rect.bottom);}}
        assertThrows(IllegalArgumentException.class,()->ink.fit(ink.strokes.get(0),new RectF(0,0,0,20)));
    }
    @Test public void invalidOrOversizedPagesFailInsteadOfSilentlyTruncating() throws Exception {
        assertThrows(IllegalArgumentException.class,()->TransferInk.parse("{\"strokes\":[]}"));
        assertThrows(IllegalArgumentException.class,()->TransferInk.parse("{\"strokes\":[[\"#000000\",100,[[-1,0,1]],2]]}"));
        assertThrows(IllegalArgumentException.class,()->TransferInk.parse("{\"strokes\":[[\"#000000\",100,[[0,1601,1]],2]]}"));
        JSONArray many=new JSONArray();JSONArray record=new JSONObject(TransferInk.SAMPLE).getJSONArray("strokes").getJSONArray(0);
        for(int i=0;i<601;i++)many.put(record);
        assertThrows(IllegalArgumentException.class,()->TransferInk.parse(new JSONObject().put("strokes",many).toString()));
    }
    @Test public void dotGeometryIsCenteredAndStopLatencyIsBounded() throws Exception {
        TransferInk ink=TransferInk.parse("{\"strokes\":[[\"#000000\",100,[[20,30,1]],2]]}");
        assertArrayEquals(new float[]{100,200},ink.fit(ink.strokes.get(0),new RectF(50,100,150,300)),.001f);
        assertEquals(80,TransferInk.duration(new float[]{1,1}));assertEquals(600,TransferInk.duration(new float[]{0,0,10000,10000}));
    }
    @Test public void copyMatchingDoesNotConfuseTextConversionOrCutWithNativeCopy(){
        for(String good:new String[]{"Copiar"," COPY ","复制","複製"})assertTrue(NotesTransferService.isCopyLabel(good));
        for(String bad:new String[]{"Copiar texto","Copiar enlace","Copy as image","Cortar","Recopiar",""})assertFalse(NotesTransferService.isCopyLabel(bad));
        AccessibilityNodeInfo other=AccessibilityNodeInfo.obtain();other.setPackageName("another.app");other.setText("Copiar");other.setEnabled(true);other.setClickable(true);other.setVisibleToUser(true);
        assertFalse(NotesTransferService.findCopy(other));other.recycle();assertFalse(NotesTransferService.findCopy(null));
    }
    @Test public void temporaryNotebookUsesPublicUriGrantAndOnlyTargetsNotes(){
        Uri uri=Uri.parse("content://com.hinote.studio.probe35.probe-files/00000000000000000000000000000000.hinote");
        for(boolean send:new boolean[]{false,true}){
            Intent intent=NotesProbe.temporaryIntent(uri,send);assertEquals(NotesTransferService.NOTES,intent.getPackage());
            assertEquals("application/octet-stream",intent.getType());assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION,intent.getFlags());
            assertNull(intent.getComponent());assertEquals(uri,intent.getClipData().getItemAt(0).getUri());
            if(send){assertEquals(Intent.ACTION_SEND,intent.getAction());assertEquals(uri,intent.getParcelableExtra(Intent.EXTRA_STREAM));}
            else{assertEquals(Intent.ACTION_VIEW,intent.getAction());assertEquals(uri,intent.getData());}
        }
    }
    @Test public void journalSurvivesReloadAndNeverClaimsEditableInkFromGestures() throws Exception {
        Context context=RuntimeEnvironment.getApplication();context.deleteFile("notes-transfer-report.json");
        for(int i=0;i<75;i++)TransferJournal.event(context,"redraw","gestures_finished",3,3,"manual verification needed");
        JSONObject report=TransferJournal.read(context);assertEquals(64,report.getJSONArray("events").length());assertFalse(report.getJSONObject("last").getBoolean("native_ink_verified"));
        assertEquals(3,report.getJSONObject("last").getInt("completed_gestures"));assertFalse(report.toString().contains("points"));
    }
    @Test public void enablingDoesNotArmAndStoppingRemovesPendingWork() throws Exception {
        assumeTrue(BuildConfig.NOTES_PROBE);
        Context context=RuntimeEnvironment.getApplication();context.deleteFile("notes-transfer-report.json");
        var controller=Robolectric.buildService(NotesTransferService.class).create();NotesTransferService service=controller.get();
        try{
            service.onServiceConnected();assertTrue(NotesTransferService.available());assertEquals(0,TransferJournal.read(context).length());
            NotesTransferService.arm("redraw",TransferInk.parse(TransferInk.SAMPLE));
            NotesTransferService.stopFromApp();shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(3));
            JSONObject last=TransferJournal.read(context).getJSONObject("last");assertEquals("stopped",last.getString("stage"));assertEquals(0,last.getInt("completed_gestures"));
        }finally{controller.destroy();}
        assertFalse(NotesTransferService.available());
    }
}
