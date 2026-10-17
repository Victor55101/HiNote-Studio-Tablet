package com.hinote.studio;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class NotesExportTest {
    @Test public void notesReceivesOnlyReadAccessToTheGeneratedNotebook() throws Exception {
        Context context=RuntimeEnvironment.getApplication();NotesFileProvider provider=new NotesFileProvider();ProviderInfo info=new ProviderInfo();
        info.authority=context.getPackageName()+".notes-files";info.exported=false;info.grantUriPermissions=true;provider.attachInfo(context,info);
        File file=NotesFileProvider.create(context,"hinote");Files.write(file.toPath(),new byte[]{1,2,3});Uri uri=NotesFileProvider.uri(context,file);
        assertEquals("application/octet-stream",provider.getType(uri));
        try(Cursor cursor=provider.query(uri,null,null,null,null)){assertTrue(cursor.moveToFirst());assertEquals("HiNote-cuaderno.hinote",cursor.getString(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)));assertEquals(3,cursor.getLong(cursor.getColumnIndex(OpenableColumns.SIZE)));}
        try(var fd=provider.openFile(uri,"r")){assertNotNull(fd);}
        assertThrows(FileNotFoundException.class,()->provider.openFile(uri,"rw"));
        assertThrows(FileNotFoundException.class,()->NotesFileProvider.resolve(context,Uri.parse("content://"+info.authority+"/../draft-v23.json")));
        File outside=new File(context.getCacheDir(),"not-for-sharing");Files.write(outside.toPath(),new byte[]{4});File link=NotesFileProvider.create(context,"hinote");Files.createSymbolicLink(link.toPath(),outside.toPath());
        assertThrows(FileNotFoundException.class,()->NotesFileProvider.uri(context,link));
        for(boolean share:new boolean[]{false,true}){Intent intent=NotesExport.intent(uri,share);assertEquals("com.huawei.hinote",intent.getPackage());assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION,intent.getFlags());assertEquals(uri,intent.getClipData().getItemAt(0).getUri());assertEquals("application/octet-stream",intent.getType());assertEquals(share?Intent.ACTION_SEND:Intent.ACTION_VIEW,intent.getAction());assertEquals(uri,share?intent.getParcelableExtra(Intent.EXTRA_STREAM):intent.getData());}
    }
}
