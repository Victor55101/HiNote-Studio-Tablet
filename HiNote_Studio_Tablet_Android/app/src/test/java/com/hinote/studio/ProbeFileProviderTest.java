package com.hinote.studio;

import android.content.Context;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import org.junit.Before;
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
public class ProbeFileProviderTest {
    private Context context;private ProbeFileProvider provider;
    @Before public void setup() {
        context=RuntimeEnvironment.getApplication();provider=new ProbeFileProvider();ProviderInfo info=new ProviderInfo();
        info.authority=context.getPackageName()+".probe-files";info.exported=false;info.grantUriPermissions=true;provider.attachInfo(context,info);
    }
    @Test public void generatedPageIsReadableWithCorrectMimeAndPublicName() throws Exception {
        File file=ProbeFileProvider.create(context,"png");Files.write(file.toPath(),new byte[]{1,2,3});Uri uri=ProbeFileProvider.uri(context,file);
        assertEquals("image/png",provider.getType(uri));
        try(Cursor cursor=provider.query(uri,null,null,null,null)) {assertTrue(cursor.moveToFirst());assertEquals("HiNote-pagina-prueba.png",cursor.getString(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)));assertEquals(3,cursor.getLong(cursor.getColumnIndex(OpenableColumns.SIZE)));}
        try(ParcelFileDescriptor descriptor=provider.openFile(uri,"r")) {assertNotNull(descriptor);}
        assertThrows(FileNotFoundException.class,()->provider.openFile(uri,"rw"));
        assertThrows(UnsupportedOperationException.class,()->provider.delete(uri,null,null));
    }
    @Test public void traversalsAndForeignAuthoritiesCannotExposeOtherFiles() throws Exception {
        String base="content://"+context.getPackageName()+".probe-files/";
        for(String path:new String[]{"../draft-v23.json","%2e%2e%2fdraft-v23.json","draft-v23.json","00000000000000000000000000000000.png?other=1"})
            assertThrows(FileNotFoundException.class,()->ProbeFileProvider.resolve(context,Uri.parse(base+path)));
        assertThrows(FileNotFoundException.class,()->ProbeFileProvider.resolve(context,Uri.parse("content://other/00000000000000000000000000000000.png")));
        assertThrows(FileNotFoundException.class,()->ProbeFileProvider.resolve(context,Uri.parse("file:///cache/00000000000000000000000000000000.png")));
    }
    @Test public void symlinksCannotEscapeTheSharingDirectory() throws Exception {
        File name=ProbeFileProvider.create(context,"hinote"),outside=new File(context.getCacheDir(),"private-test.bin");Files.write(outside.toPath(),new byte[]{7});
        Files.createSymbolicLink(name.toPath(),outside.toPath());
        Uri uri=Uri.parse("content://"+context.getPackageName()+".probe-files/"+name.getName());
        assertThrows(FileNotFoundException.class,()->ProbeFileProvider.resolve(context,uri));
    }
}
