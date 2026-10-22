package com.hinote.studio;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;

/** Disk-backed images. The WebView only sees bounded previews and opaque IDs. */
final class ImageStore {
    private static final long MAX_SOURCE = 32L * 1024 * 1024;
    private static final long MAX_STORE = 256L * 1024 * 1024;
    private final File directory;

    ImageStore(File files) throws IOException {
        directory = new File(files, "images-v23");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("No se pudo preparar el almacén de imágenes");
    }

    static boolean validAsset(String id) { return id != null && id.matches("[a-f0-9]{64}"); }
    File asset(String id, boolean preview) throws IOException {
        if (!validAsset(id)) throw new IOException("Imagen no válida");
        String prefix = id + (preview ? "-preview" : "");
        for (String extension : new String[]{".png", ".jpg"}) {
            File f = new File(directory, prefix + extension);
            if (f.isFile()) return f;
        }
        throw new IOException("Falta una imagen del borrador. Vuelve a insertarla.");
    }
    private static String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) != -1) digest.update(buf, 0, n);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    private long usedBytes() {
        long used = 0; File[] files = directory.listFiles();
        if (files != null) for (File file : files) used += file.length();
        return used;
    }
    static Bitmap decode(File path, int maxSide) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path.getPath(), bounds);
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || (long) bounds.outWidth * bounds.outHeight > 100_000_000L)
            throw new IOException("Imagen inválida o mayor de 100 megapíxeles");
        if (!"image/jpeg".equals(bounds.outMimeType) && !"image/png".equals(bounds.outMimeType) && !"image/webp".equals(bounds.outMimeType))
            throw new IOException("Usa una imagen JPG, PNG o WebP estática");
        BitmapFactory.Options opts = new BitmapFactory.Options(); opts.inScaled = false; opts.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / opts.inSampleSize > maxSide) opts.inSampleSize *= 2;
        Bitmap result = BitmapFactory.decodeFile(path.getPath(), opts);
        if (result == null) throw new IOException("No se pudo leer la imagen");
        return result;
    }
    private static void saveBitmap(Bitmap bitmap, File file, boolean alpha) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            if (!bitmap.compress(alpha ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 92, out))
                throw new IOException("No se pudo guardar la imagen");
            out.getFD().sync();
        }
    }
    private static Bitmap orient(Bitmap bitmap, File source) {
        int orientation;
        try { orientation = new ExifInterface(source.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1); }
        catch (IOException | RuntimeException ignored) { return bitmap; }
        Matrix m = new Matrix();
        switch (orientation) {
            case 2: m.setScale(-1, 1); break;
            case 3: m.setRotate(180); break;
            case 4: m.setScale(1, -1); break;
            case 5: m.setRotate(90); m.postScale(-1, 1); break;
            case 6: m.setRotate(90); break;
            case 7: m.setRotate(-90); m.postScale(-1, 1); break;
            case 8: m.setRotate(-90); break;
            default: return bitmap;
        }
        Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), m, true);
        if (rotated != bitmap) bitmap.recycle();
        return rotated;
    }
    JSONObject importImage(ContentResolver resolver, Uri uri) throws Exception {
        if (usedBytes() >= MAX_STORE || directory.getUsableSpace() < 48L * 1024 * 1024)
            throw new IOException("No hay espacio suficiente para más imágenes (máximo 256 MB)");
        File input = File.createTempFile("import-", ".part", directory);
        File encoded = File.createTempFile("encode-", ".part", directory);
        File small = File.createTempFile("preview-", ".part", directory);
        Bitmap bitmap = null, preview = null;
        try {
            try (InputStream in = resolver.openInputStream(uri); FileOutputStream out = new FileOutputStream(input)) {
                if (in == null) throw new IOException("No se pudo abrir la imagen");
                byte[] buf = new byte[65536]; int n; long size = 0;
                while ((n = in.read(buf)) != -1) {
                    size += n; if (size > MAX_SOURCE) throw new IOException("Cada imagen admite hasta 32 MB");
                    if (Thread.currentThread().isInterrupted()) throw new IOException("Importación cancelada");
                    out.write(buf, 0, n);
                }
            }
            bitmap = orient(decode(input, 2560), input);
            boolean alpha = bitmap.hasAlpha(); String extension = alpha ? ".png" : ".jpg";
            saveBitmap(bitmap, encoded, alpha);
            String id = hash(encoded);
            File target = new File(directory, id + extension);
            File previewTarget = new File(directory, id + "-preview" + extension);
            float ratio = Math.min(1f, 512f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            preview = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * ratio)), Math.max(1, Math.round(bitmap.getHeight() * ratio)), true);
            saveBitmap(preview, small, alpha);
            if (!target.isFile() && usedBytes() + encoded.length() + small.length() > MAX_STORE)
                throw new IOException("El almacén de imágenes supera 256 MB");
            if (!target.isFile() && !encoded.renameTo(target)) throw new IOException("No se pudo conservar la imagen");
            if (!previewTarget.isFile() && !small.renameTo(previewTarget)) throw new IOException("No se pudo conservar la vista de la imagen");
            return new JSONObject().put("asset", id).put("pixelWidth", bitmap.getWidth()).put("pixelHeight", bitmap.getHeight())
                .put("bytes", target.length()).put("alpha", alpha);
        } finally {
            if (preview != null && preview != bitmap) preview.recycle();
            if (bitmap != null) bitmap.recycle();
            input.delete(); encoded.delete(); small.delete();
        }
    }
    static double number(JSONObject obj, String key, double min, double max) throws Exception {
        double n = obj.getDouble(key);
        if (Double.isNaN(n) || Double.isInfinite(n) || n < min || n > max) throw new IOException("Valor de imagen inválido: " + key);
        return n;
    }
    /** Crops are materialized one image at a time. Rotation remains editable in Huawei Notes. */
    JSONArray prepareExport(String raw, File work, int pageCount, Runnable check) throws Exception {
        if (raw.length() > 300000) throw new IOException("Demasiados datos de imagen");
        JSONArray images = new JSONArray(raw), prepared = new JSONArray();
        if (images.length() > 200) throw new IOException("La nota admite hasta 200 imágenes");
        HashMap<String, File> crops = new HashMap<>(); HashSet<String> ids = new HashSet<>();
        int[] perPage = new int[pageCount];
        for (int i = 0; i < images.length(); i++) {
            check.run(); JSONObject src = images.getJSONObject(i);
            String id = src.getString("id");
            if (!id.matches("[a-zA-Z0-9_-]{1,80}") || !ids.add(id)) throw new IOException("Identificador de imagen inválido");
            double page = number(src, "page", 0, pageCount - 1);
            if (page != Math.floor(page)) throw new IOException("Página de imagen inválida");
            if (++perPage[(int)page] > 20) throw new IOException("Cada página admite hasta 20 imágenes");
            JSONObject dst = new JSONObject().put("id", id).put("page", (int) page);
            for (String key : new String[]{"x", "y", "width", "height", "angle"}) {
                double low = key.equals("width") || key.equals("height") ? 1 : -3200;
                dst.put(key, number(src, key, key.equals("angle") ? -360 : low, key.equals("angle") ? 360 : 3200));
            }
            JSONObject crop = src.getJSONObject("crop");
            double left = number(crop, "left", 0, .99), top = number(crop, "top", 0, .99);
            double right = number(crop, "right", .01, 1), bottom = number(crop, "bottom", .01, 1);
            if (right - left < .01 || bottom - top < .01) throw new IOException("Recorte demasiado pequeño");
            String assetId = src.getString("asset"); File source = asset(assetId, false);
            String key = assetId + ":" + left + ":" + top + ":" + right + ":" + bottom;
            File target = crops.get(key);
            if (target == null) {
                boolean alpha = source.getName().endsWith(".png");
                target = new File(work, "image-" + crops.size() + (alpha ? ".png" : ".jpg"));
                if (left == 0 && top == 0 && right == 1 && bottom == 1) {
                    try (InputStream in = new FileInputStream(source); FileOutputStream out = new FileOutputStream(target)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) != -1) { check.run(); out.write(buf, 0, n); }
                    }
                } else {
                    Bitmap bitmap = decode(source, 2560), cut = null;
                    try {
                        int x = Math.min(bitmap.getWidth() - 1, (int)Math.floor(left * bitmap.getWidth()));
                        int y = Math.min(bitmap.getHeight() - 1, (int)Math.floor(top * bitmap.getHeight()));
                        int w = Math.max(1, Math.min(bitmap.getWidth() - x, (int)Math.round((right - left) * bitmap.getWidth())));
                        int h = Math.max(1, Math.min(bitmap.getHeight() - y, (int)Math.round((bottom - top) * bitmap.getHeight())));
                        cut = Bitmap.createBitmap(bitmap, x, y, w, h); saveBitmap(cut, target, alpha);
                    } finally { if (cut != null && cut != bitmap) cut.recycle(); bitmap.recycle(); }
                }
                crops.put(key, target);
            }
            dst.put("path", target.getPath()); prepared.put(dst);
        }
        return prepared;
    }
}
