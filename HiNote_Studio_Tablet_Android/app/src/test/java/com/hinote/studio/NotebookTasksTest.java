package com.hinote.studio;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowContentResolver;
import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class NotebookTasksTest {
    private static final String AUTHORITY="com.hinote.test.notebook.documents";
    private static final int FLAGS=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    private Activity activity;
    private NotebookTasks tasks;
    private WritableDocuments provider;
    private File directory;
    private String result;
    private final AtomicBoolean cancelled=new AtomicBoolean();
    private MainActivity.TaskToken token;
    private Uri tree;
    @Before public void setup()throws Exception{
        activity=Robolectric.buildActivity(Activity.class).setup().get();
        activity.getSharedPreferences("export-folder",0).edit().clear().commit();
        directory=Files.createTempDirectory("notebooks-").toFile();
        provider=new WritableDocuments();provider.directory=directory;provider.cancelled=cancelled;
        ProviderInfo info=new ProviderInfo();info.authority=AUTHORITY;info.exported=true;info.grantUriPermissions=true;
        info.readPermission=info.writePermission="android.permission.MANAGE_DOCUMENTS";
        provider.attachInfo(activity,info);ShadowContentResolver.registerProviderInternal(AUTHORITY,provider);
        tree=DocumentsContract.buildTreeDocumentUri(AUTHORITY,"root");
        token=Robolectric.buildActivity(MainActivity.class).get().new TaskToken("notebook",1,cancelled);
        tasks=new NotebookTasks(activity,directory,new NotebookTasks.Host(){
            public void result(int ticket,String data,String error){result=data;}
            public void status(int ticket,String text){}
            public void ui(Runnable action){action.run();}
            public void current(JSONObject args,File file,MainActivity.TaskToken token){throw new AssertionError("Already prepared for saving");}
        });
    }
    private void prepared()throws Exception{
        File work=new File(directory,"work-"+System.nanoTime());assertTrue(work.mkdir());
        File output=new File(work,"merged.hinote");Files.write(output.toPath(),new byte[]{7,4,9,2});
        for(String name:new String[]{"work","output"}){java.lang.reflect.Field field=NotebookTasks.class.getDeclaredField(name);field.setAccessible(true);field.set(tasks,name.equals("work")?work:output);}
    }
    @Test public void rememberedFolderSavesCombinedNotebookWithoutOverwrite()throws Exception{
        new ExportFolder(activity).remember(tree,FLAGS);
        for(int i=0;i<2;i++){prepared();tasks.savePrepared("Materia",token);assertTrue(new JSONObject(result).getBoolean("fileSaved"));}
        assertEquals(2,provider.files.size());assertTrue(provider.files.containsValue("Materia.hinote"));assertTrue(provider.files.containsValue("Materia (1).hinote"));
        for(String id:provider.files.keySet())assertArrayEquals(new byte[]{7,4,9,2},Files.readAllBytes(new File(directory,id).toPath()));
        assertNull(shadowOf(activity).getNextStartedActivityForResult());
    }
    @Test public void missingFolderUsesDocumentPickerAndCancelRemovesPreparedFiles()throws Exception{
        prepared();tasks.savePrepared("Materia",token);
        org.robolectric.shadows.ShadowActivity.IntentForResult launched=shadowOf(activity).getNextStartedActivityForResult();
        assertEquals(Intent.ACTION_CREATE_DOCUMENT,launched.intent.getAction());assertEquals(NotebookTasks.SAVE,launched.requestCode);
        assertEquals("Materia.hinote",launched.intent.getStringExtra(Intent.EXTRA_TITLE));
        tasks.cancelled();assertTrue(new JSONObject(result).getBoolean("cancelled"));assertEquals(0,directory.listFiles().length);
    }
    @Test public void revokedFolderAndCancelledWriteLeaveNoPartialDestination()throws Exception{
        ExportFolder folder=new ExportFolder(activity);folder.remember(tree,FLAGS);
        activity.getContentResolver().releasePersistableUriPermission(tree,FLAGS);prepared();
        assertThrows(java.io.IOException.class,()->tasks.savePrepared("Materia",token));tasks.failed(new java.io.IOException("revoked"));assertTrue(provider.files.isEmpty());
        folder.remember(tree,FLAGS);prepared();provider.cancelOnOpen=true;
        assertThrows(java.util.concurrent.CancellationException.class,()->tasks.savePrepared("Materia",token));
        assertTrue(provider.files.isEmpty());assertEquals(0,directory.listFiles().length);
    }
    public static class WritableDocuments extends ExportFolderTest.TestDocuments {
        File directory;AtomicBoolean cancelled;boolean cancelOnOpen;
        @Override public ParcelFileDescriptor openDocument(String id,String mode,CancellationSignal signal)throws FileNotFoundException{
            if(cancelOnOpen)cancelled.set(true);
            return ParcelFileDescriptor.open(new File(directory,id),ParcelFileDescriptor.MODE_CREATE|ParcelFileDescriptor.MODE_TRUNCATE|ParcelFileDescriptor.MODE_WRITE_ONLY);
        }
        @Override public void deleteDocument(String id){files.remove(id);new File(directory,id).delete();}
    }
}
