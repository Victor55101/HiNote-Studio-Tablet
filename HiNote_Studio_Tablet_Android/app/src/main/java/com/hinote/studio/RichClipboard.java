package com.hinote.studio;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.text.Html;
import android.text.Spanned;
import org.json.JSONObject;

/** Read only during an explicit editor paste; never resolve clipboard URIs. */
final class RichClipboard {
    static String read(Context context){
        try{
            ClipboardManager manager=(ClipboardManager)context.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip=manager==null?null:manager.getPrimaryClip();
            if(clip==null||clip.getItemCount()!=1)return "";
            ClipData.Item item=clip.getItemAt(0);CharSequence text=item.getText();String html=item.getHtmlText();
            if(text==null||text.length()>200000||html!=null&&html.length()>8*1024*1024)return "";
            if((html==null||html.isEmpty())&&text instanceof Spanned)html=Html.toHtml((Spanned)text,Html.TO_HTML_PARAGRAPH_LINES_CONSECUTIVE);
            if(html==null||html.isEmpty())return "";
            return new JSONObject().put("plain",text.toString()).put("html",html).toString();
        }catch(RuntimeException|org.json.JSONException unavailable){return "";}
    }
}
