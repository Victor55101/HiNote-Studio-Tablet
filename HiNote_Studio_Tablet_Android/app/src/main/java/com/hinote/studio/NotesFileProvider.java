package com.hinote.studio;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.UUID;

/** Read-only native notebooks shared with Huawei Notes through temporary URI grants. */
public final class NotesFileProvider extends ContentProvider {
    static File directory(Context context) { return new File(context.getCacheDir(), "notes-export-sharing"); }
    static File create(Context context, String extension) throws IOException {
        if (!"hinote".equals(extension)) throw new IOException("Formato inválido");
        File dir = directory(context);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No se pudo preparar el cuaderno");
        File[] old = dir.listFiles();
        if (old != null) for (File file : old)
            if (System.currentTimeMillis() - file.lastModified() > 7L * 86400000) file.delete();
        return new File(dir, UUID.randomUUID().toString().replace("-", "") + "." + extension);
    }
    static Uri uri(Context context, File file) throws IOException {
        Uri uri = new Uri.Builder().scheme("content").authority(context.getPackageName() + ".notes-files")
                .appendPath(file.getName()).build();
        resolve(context, uri); return uri;
    }
    static File resolve(Context context, Uri uri) throws IOException {
        if (!"content".equals(uri.getScheme()) || !(context.getPackageName() + ".notes-files").equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1 || uri.getQuery() != null || uri.getFragment() != null
                || !uri.getLastPathSegment().matches("[a-f0-9]{32}\\.hinote"))
            throw new FileNotFoundException("Cuaderno inválido");
        File directory = directory(context).getCanonicalFile();
        File file = new File(directory, uri.getLastPathSegment()).getCanonicalFile();
        if (!directory.equals(file.getParentFile()) || !file.isFile()) throw new FileNotFoundException("Cuaderno no disponible");
        return file;
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) {
        try { return resolve(getContext(), uri).getName().endsWith(".png") ? "image/png" : "application/octet-stream"; }
        catch (IOException error) { throw new IllegalArgumentException(error); }
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        try {
            File file = resolve(getContext(), uri);
            String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor result = new MatrixCursor(columns); Object[] row = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = "HiNote-cuaderno." + (file.getName().endsWith(".png") ? "png" : "hinote");
                if (OpenableColumns.SIZE.equals(columns[i])) row[i] = file.length();
            }
            result.addRow(row); return result;
        } catch (IOException error) { throw new IllegalArgumentException(error); }
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Solo lectura");
        try { return ParcelFileDescriptor.open(resolve(getContext(), uri), ParcelFileDescriptor.MODE_READ_ONLY); }
        catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
