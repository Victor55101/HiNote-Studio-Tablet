package com.hinote.studio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

/** The same public open-file route verified on the tablet, without accessibility. */
final class NotesExport {
    static final String NOTES="com.huawei.hinote";
    static Intent intent(Uri uri,boolean share){
        Intent intent=new Intent(share?Intent.ACTION_SEND:Intent.ACTION_VIEW).setPackage(NOTES);
        if(share){intent.setType("application/octet-stream");intent.putExtra(Intent.EXTRA_STREAM,uri);}
        else intent.setDataAndType(uri,"application/octet-stream");
        intent.setClipData(ClipData.newRawUri("Cuaderno HiNote",uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);return intent;
    }
    static void open(Activity activity,Uri uri){
        try{activity.startActivity(intent(uri,false));}
        catch(ActivityNotFoundException unavailable){activity.startActivity(intent(uri,true));}
    }
}
