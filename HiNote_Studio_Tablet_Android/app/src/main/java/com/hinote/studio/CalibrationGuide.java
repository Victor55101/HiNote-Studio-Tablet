package com.hinote.studio;

import android.graphics.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;

/** Version 1 guide geometry is shared with calibration.py. The small visual
 * label survives Notes dropping custom metadata or re-encoding the guide JPEG.
 * Its checksum detects corruption, not authenticity: Python validates all data.
 */
final class CalibrationGuide {
    static final int WIDTH=1000, HEIGHT=1600, COLS=160, ROWS=16, CELL=6, CODE_X=20, CODE_Y=1460;
    static final int LEFT=152, TOP=120, CW=104, CH=108, BASE=72;
    private static final int MAGIC=0x484e4331;

    static void render(JSONObject guide, File image, File thumbnail) throws Exception {
        Bitmap bitmap=Bitmap.createBitmap(WIDTH,HEIGHT,Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);
            Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.rgb(25,40,62));
            paint.setTextSize(27);paint.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));
            canvas.drawText("HiNote · Calibración v1",20,36,paint);
            paint.setTextAlign(Paint.Align.RIGHT);paint.setTextSize(18);
            canvas.drawText("Hoja "+(guide.getInt("page")+1)+" / "+guide.getInt("pages"),980,36,paint);
            paint.setTextAlign(Paint.Align.LEFT);paint.setTypeface(Typeface.DEFAULT);paint.setTextSize(16);
            canvas.drawText("Rotulador · 8 variantes por carácter · Apoya la letra en la línea azul",20,66,paint);
            canvas.drawText("No muevas ni recortes esta guía. Escribe dentro de cada celda, sin repasar la etiqueta.",20,90,paint);
            String[] characters=guide.getString("chars").codePoints().mapToObj(c->new String(Character.toChars(c))).toArray(String[]::new);
            for(int row=0;row<characters.length;row++){
                int y=TOP+row*CH;
                paint.setColor(Color.rgb(246,248,253));canvas.drawRect(12,y,140,y+CH,paint);
                paint.setColor(Color.rgb(33,48,68));paint.setTextSize(34);canvas.drawText(characters[row],25,y+48,paint);
                paint.setTextSize(12);canvas.drawText(String.format("U+%04X",characters[row].codePointAt(0)),25,y+70,paint);
                for(int col=0;col<8;col++){
                    int x=LEFT+col*CW;
                    paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(Color.rgb(199,210,224));
                    canvas.drawRect(x,y,x+CW,y+CH,paint);
                    paint.setColor(Color.rgb(130,159,199));canvas.drawLine(x+5,y+BASE,x+CW-5,y+BASE,paint);
                    paint.setStyle(Paint.Style.FILL);paint.setTextSize(11);paint.setColor(Color.rgb(151,163,180));
                    canvas.drawText(String.valueOf(col+1),x+5,y+15,paint);
                }
            }
            paint.setColor(Color.rgb(68,82,104));paint.setTextSize(14);
            canvas.drawText("Código de plantilla · No escribas en esta zona · "+guide.getString("id").substring(0,8),20,1440,paint);
            byte[] payload=guide.toString().getBytes(StandardCharsets.UTF_8);
            if(payload.length>310)throw new IOException("La guía contiene demasiados datos");
            CRC32 crc=new CRC32();crc.update(payload);
            ByteBuffer packet=ByteBuffer.allocate(320);packet.putInt(MAGIC).putShort((short)payload.length).put(payload).putInt((int)crc.getValue());
            byte[] bytes=packet.array();paint.setAntiAlias(false);paint.setColor(Color.BLACK);
            for(int bit=0;bit<2560;bit++)if((bytes[bit/8]&(1<<(7-bit%8)))!=0){
                int x=CODE_X+(bit%COLS)*CELL,y=CODE_Y+(bit/COLS)*CELL;
                canvas.drawRect(x,y,x+CELL,y+CELL,paint);
            }
            try(FileOutputStream out=new FileOutputStream(image)){if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,out))throw new IOException("No se pudo crear la guía");}
            Bitmap small=Bitmap.createScaledBitmap(bitmap,675,1080,true);
            try(FileOutputStream out=new FileOutputStream(thumbnail)){if(!small.compress(Bitmap.CompressFormat.JPEG,90,out))throw new IOException("No se pudo crear la miniatura");}
            finally{small.recycle();}
        } finally { bitmap.recycle(); }
    }

    static JSONObject read(File file) throws Exception {
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getPath(),bounds);
        if(bounds.outWidth<500||bounds.outHeight<800||(long)bounds.outWidth*bounds.outHeight>8_000_000
                ||Math.abs((double)bounds.outWidth/bounds.outHeight-.625)>.001)
            throw new IOException("Guía recortada o de tamaño no reconocido");
        Bitmap bitmap=ImageStore.decode(file,1600);
        if(bitmap==null)throw new IOException("No se pudo leer la guía");
        try{
            byte[] bytes=new byte[320];
            float sx=bitmap.getWidth()/1000f,sy=bitmap.getHeight()/1600f;
            for(int bit=0;bit<2560;bit++){
                int x=Math.round((CODE_X+(bit%COLS)*CELL+3)*sx),y=Math.round((CODE_Y+(bit/COLS)*CELL+3)*sy);
                int color=bitmap.getPixel(Math.min(x,bitmap.getWidth()-1),Math.min(y,bitmap.getHeight()-1));
                if(Color.alpha(color)<200)throw new IOException("Guía no reconocida");
                if(Color.red(color)+Color.green(color)+Color.blue(color)<384)bytes[bit/8]|=1<<(7-bit%8);
            }
            ByteBuffer packet=ByteBuffer.wrap(bytes);
            if(packet.getInt()!=MAGIC)throw new IOException("No es una plantilla de HiNote Studio. Usa Crear plantilla.");
            int n=packet.getShort()&65535;
            if(n<2||n>310)throw new IOException("Código de plantilla dañado");
            byte[] payload=new byte[n];packet.get(payload);long expected=packet.getInt()&0xffffffffL;
            CRC32 crc=new CRC32();crc.update(payload);
            if(crc.getValue()!=expected)throw new IOException("Código de plantilla dañado; no recortes ni escribas sobre él");
            return new JSONObject(new String(payload,StandardCharsets.UTF_8));
        } finally {bitmap.recycle();}
    }
}
