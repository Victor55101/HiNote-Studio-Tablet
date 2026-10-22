package com.hinote.studio;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.DocumentsProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowContentResolver;
import java.io.FileNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CancellationException;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class ExportFolderTest {
    private static final String AUTHORITY="com.hinote.test.documents";
    private static final int FLAGS=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    private Context context;
    private ExportFolder folder;
    private TestDocuments provider;
    private final Uri root=DocumentsContract.buildTreeDocumentUri(AUTHORITY,"root");
    @Before public void setup(){
        context=RuntimeEnvironment.getApplication();context.getSharedPreferences("export-folder",0).edit().clear().commit();
        provider=new TestDocuments();ProviderInfo info=new ProviderInfo();info.authority=AUTHORITY;
        info.exported=true;info.grantUriPermissions=true;info.readPermission=info.writePermission="android.permission.MANAGE_DOCUMENTS";
        provider.attachInfo(context,info);ShadowContentResolver.registerProviderInternal(AUTHORITY,provider);
        folder=new ExportFolder(context);
    }
    @Test public void folderSurvivesRestartAndRepeatedSavesCreateSeparateDocuments() throws Exception {
        folder.remember(root,FLAGS);ExportFolder reopened=new ExportFolder(context);
        assertEquals(root,reopened.selected());assertTrue(reopened.describe().contains("Mis notas"));
        Uri first=reopened.create(root,"Redes",()->{}),second=reopened.create(root,"Redes",()->{});
        assertNotEquals(first,second);assertEquals("Redes.hinote",reopened.displayName(first,""));
        assertEquals("Redes (1).hinote",reopened.displayName(second,""));
        assertEquals("Redes.hinote",reopened.displayName(first,""));
        assertEquals(2,provider.files.size());
    }
    @Test public void revokedPermissionDoesNotCreateAFile() throws Exception {
        folder.remember(root,FLAGS);context.getContentResolver().releasePersistableUriPermission(root,FLAGS);
        assertThrows(java.io.IOException.class,()->folder.create(root,"Redes",()->{}));assertTrue(provider.files.isEmpty());
    }
    @Test public void unavailableFolderKeepsSettingAndReportsError() throws Exception {
        folder.remember(root,FLAGS);provider.writable=false;
        assertThrows(java.io.IOException.class,()->folder.create(root,"Redes",()->{}));
        assertEquals(root,folder.selected());assertTrue(provider.files.isEmpty());
    }
    @Test public void clearingFolderRestoresManualSavingAndReleasesGrant() throws Exception {
        folder.remember(root,FLAGS);folder.clear();assertNull(new ExportFolder(context).selected());
        assertTrue(context.getContentResolver().getPersistedUriPermissions().isEmpty());
    }
    @Test public void rejectedSelectionAndCancelledExportDoNotCreateDocuments() throws Exception {
        assertThrows(java.io.IOException.class,()->folder.remember(root,Intent.FLAG_GRANT_READ_URI_PERMISSION));
        assertNull(folder.selected());folder.remember(root,FLAGS);
        assertThrows(CancellationException.class,()->folder.create(root,"Redes",()->{throw new CancellationException();}));
        assertTrue(provider.files.isEmpty());
    }
    @Test public void suffixSkipsExistingCopiesAndSanitizesTitle() throws Exception {
        folder.remember(root,FLAGS);provider.files.put("old1","Redes.hinote");provider.files.put("old2","Redes (2).hinote");
        Uri third=folder.create(root,"Redes.hinote",()->{});assertEquals("Redes (3).hinote",folder.displayName(third,""));
        assertEquals("Prueba_ Física.hinote",ExportFolder.fileName(" Prueba/ Física.hinote "));
        assertEquals("Nueva nota.hinote",ExportFolder.fileName(""));
    }
    public static class TestDocuments extends DocumentsProvider {
        final Map<String,String> files=new LinkedHashMap<>();boolean writable=true;
        @Override public boolean onCreate(){return true;}
        @Override public Cursor queryRoots(String[] projection){return new MatrixCursor(projection==null?new String[]{"root_id"}:projection);}
        private Object value(String column,String id,String name,boolean dir){
            if(DocumentsContract.Document.COLUMN_DOCUMENT_ID.equals(column))return id;
            if(DocumentsContract.Document.COLUMN_DISPLAY_NAME.equals(column))return name;
            if(DocumentsContract.Document.COLUMN_MIME_TYPE.equals(column))return dir?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream";
            if(DocumentsContract.Document.COLUMN_FLAGS.equals(column))return dir&&writable?DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE:0;
            return null;
        }
        private void row(MatrixCursor cursor,String id,String name,boolean dir){Object[] values=new Object[cursor.getColumnCount()];for(int i=0;i<values.length;i++)values[i]=value(cursor.getColumnName(i),id,name,dir);cursor.addRow(values);}
        private String[] columns(String[] projection){return projection==null?new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_FLAGS}:projection;}
        @Override public Cursor queryDocument(String id,String[] projection)throws FileNotFoundException {
            MatrixCursor cursor=new MatrixCursor(columns(projection));
            if("root".equals(id))row(cursor,id,"Mis notas",true);
            else if(files.containsKey(id))row(cursor,id,files.get(id),false);else throw new FileNotFoundException(id);
            return cursor;
        }
        @Override public Cursor queryChildDocuments(String parent,String[] projection,String order){
            MatrixCursor cursor=new MatrixCursor(columns(projection));for(Map.Entry<String,String> file:files.entrySet())row(cursor,file.getKey(),file.getValue(),false);return cursor;
        }
        @Override public boolean isChildDocument(String parent,String child){return "root".equals(parent)&&files.containsKey(child);}
        @Override public String createDocument(String parent,String mime,String name)throws FileNotFoundException {
            if(!writable||files.containsValue(name))throw new FileNotFoundException("Would overwrite an existing document");
            String id="file-"+files.size();files.put(id,name);return id;
        }
        @Override public ParcelFileDescriptor openDocument(String id,String mode,CancellationSignal signal)throws FileNotFoundException {throw new FileNotFoundException("Not needed by this test");}
    }
}
