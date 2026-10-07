package com.hinote.studio;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class NotesProbeTest {
    @Test public void unchangedControlAndLaterTextRemainDistinguishable() throws Exception {
        JSONObject a=NotesProbe.describeClip(ClipData.newPlainText("control","PRUEBA-A"));
        JSONObject again=NotesProbe.describeClip(ClipData.newPlainText("otro nombre","PRUEBA-A"));
        JSONObject b=NotesProbe.describeClip(ClipData.newPlainText("control","PRUEBA-B"));
        assertEquals(a.getString("fingerprint"),again.getString("fingerprint"));
        assertNotEquals(a.getString("fingerprint"),b.getString("fingerprint"));
        assertEquals("PRUEBA-A",a.getJSONArray("items").getJSONObject(0).getString("control_text"));
        assertFalse(NotesProbe.describeClip(null).getBoolean("present"));
    }
    @Test public void arbitraryTextAndUriPathsAreHashedWithoutBeingReported() throws Exception {
        String secret="mi texto privado 123";ClipData clip=ClipData.newPlainText("etiqueta privada",secret);
        clip.addItem(new ClipData.Item(Uri.parse("content://com.huawei.hinote/private/identifier")));
        JSONObject report=NotesProbe.describeClip(clip);
        assertFalse(report.toString().contains(secret));assertFalse(report.toString().contains("/private/identifier"));
        assertEquals("com.huawei.hinote",report.getJSONArray("items").getJSONObject(1).getString("uri_authority"));
        assertEquals(secret.length(),report.getJSONArray("items").getJSONObject(0).getInt("text_length"));
    }
    @Test public void descriptorsRecordIntentKeysWithoutExecutingOrDumpingValues() throws Exception {
        Intent intent=new Intent("test.ACTION").putExtra("example-key","private value");
        JSONObject description=NotesProbe.describeIntent(intent);
        assertEquals("test.ACTION",description.getString("action"));
        assertEquals("example-key",description.getJSONArray("extra_keys").getString(0));
        assertFalse(description.toString().contains("private value"));
        assertTrue(NotesProbe.shared(new Intent(Intent.ACTION_SEND)));
        assertTrue(NotesProbe.shared(new Intent(Intent.ACTION_SEND_MULTIPLE)));
        assertFalse(NotesProbe.shared(new Intent(Intent.ACTION_VIEW)));assertFalse(NotesProbe.shared(null));
    }
    @Test public void inspectionRejectsOversizeStreamsAndRecognizesImagesWithoutClaimingInk() throws Exception {
        assertArrayEquals(new byte[12],NotesProbe.readBounded(new ByteArrayInputStream(new byte[12]),12));
        assertThrows(IOException.class,()->NotesProbe.readBounded(new ByteArrayInputStream(new byte[13]),12));
        assertEquals("PNG (imagen)",NotesProbe.signature(new byte[]{(byte)137,80,78,71,13,10,26,10}));
        assertTrue(NotesProbe.signature(new byte[]{80,75,3,4}).contains("no demuestra tinta editable"));
        assertTrue(NotesProbe.signature("datos".getBytes(StandardCharsets.UTF_8)).contains("no se interpreta como trazos"));
    }
}
