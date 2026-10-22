package com.hinote.studio;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.SubscriptSpan;
import android.text.style.SuperscriptSpan;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=31)
public class RichClipboardTest {
    private final Context app=RuntimeEnvironment.getApplication();
    private final ClipboardManager clipboard=(ClipboardManager)app.getSystemService(Context.CLIPBOARD_SERVICE);
    @Test public void nativeHtmlIsReturnedAlongWithItsMatchingPlainText()throws Exception{
        clipboard.setPrimaryClip(ClipData.newHtmlText("formula","H2O x2","H<sub>2</sub>O x<sup>2</sup>"));
        JSONObject data=new JSONObject(RichClipboard.read(app));assertEquals("H2O x2",data.getString("plain"));assertTrue(data.getString("html").contains("<sub>"));assertTrue(data.getString("html").contains("<sup>"));
    }
    @Test public void androidScriptSpansAreConvertedToStandardHtml()throws Exception{
        SpannableString text=new SpannableString("H2O x2");text.setSpan(new SubscriptSpan(),1,2,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);text.setSpan(new SuperscriptSpan(),5,6,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        clipboard.setPrimaryClip(ClipData.newPlainText("formula",text));JSONObject data=new JSONObject(RichClipboard.read(app));assertEquals(text.toString(),data.getString("plain"));assertTrue(data.getString("html").contains("<sub>"));assertTrue(data.getString("html").contains("<sup>"));
    }
    @Test public void ordinaryPlainTextIsNotInterpretedAsHtml(){clipboard.setPrimaryClip(ClipData.newPlainText("literal","<sup>2</sup>"));assertEquals("",RichClipboard.read(app));}
    @Test public void clipboardUrisAreNeverOpened(){clipboard.setPrimaryClip(ClipData.newRawUri("file",Uri.parse("content://unused.example/private")));assertEquals("",RichClipboard.read(app));}
    @Test public void oversizedTextFallsBackWithoutReturningClipboardContents(){clipboard.setPrimaryClip(ClipData.newHtmlText("large","x".repeat(200001),"<b>x</b>"));assertEquals("",RichClipboard.read(app));}
}
