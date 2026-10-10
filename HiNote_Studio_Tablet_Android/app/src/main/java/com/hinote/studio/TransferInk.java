package com.hinote.studio;

import android.graphics.Path;
import android.graphics.RectF;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Geometry only: accessibility cannot reproduce source pressure, colour or pen width. */
final class TransferInk {
    static final int MAX_STROKES=600, MAX_POINTS=120000;
    // The same preview is used to draw the sample and build its native notebook.
    static final String SAMPLE="{\"strokes\":[[\"#000000\",100,[[220,620,1],[440,400,1]],2],[\"#d32f2f\",100,[[280,690,1],[500,470,1]],2],[\"#1565c0\",100,[[340,760,1],[560,540,1]],2]]}";
    final List<float[]> strokes=new ArrayList<>();
    final RectF bounds=new RectF();
    static TransferInk parse(String json) throws Exception {
        JSONArray records=new JSONObject(json).getJSONArray("strokes");
        if(records.length()==0)throw new IllegalArgumentException("Esta página no tiene trazos. Las imágenes no se redibujan.");
        if(records.length()>MAX_STROKES)throw new IllegalArgumentException("La prueba admite hasta 600 trazos. Usa una página con menos contenido.");
        TransferInk ink=new TransferInk();int total=0;boolean first=true;
        for(int i=0;i<records.length();i++){
            JSONArray points=records.getJSONArray(i).getJSONArray(2);int n=points.length();
            total+=n;if(n<1||total>MAX_POINTS)throw new IllegalArgumentException("La geometría supera el límite de la prueba o contiene un trazo vacío.");
            float[] line=new float[n*2];
            for(int j=0;j<n;j++){
                JSONArray p=points.getJSONArray(j);double x=p.getDouble(0),y=p.getDouble(1);
                if(!Double.isFinite(x)||!Double.isFinite(y)||x<0||y<0||x>1000||y>1600)throw new IllegalArgumentException("Hay coordenadas fuera de la página.");
                line[j*2]=(float)x;line[j*2+1]=(float)y;
                if(first){ink.bounds.set((float)x,(float)y,(float)x,(float)y);first=false;}
                else{ink.bounds.left=Math.min(ink.bounds.left,(float)x);ink.bounds.top=Math.min(ink.bounds.top,(float)y);ink.bounds.right=Math.max(ink.bounds.right,(float)x);ink.bounds.bottom=Math.max(ink.bounds.bottom,(float)y);}
            }
            ink.strokes.add(line);
        }
        return ink;
    }
    float[] fit(float[] line,RectF target){
        if(target.width()<1||target.height()<1||target.left<0||target.top<0)throw new IllegalArgumentException("Zona de dibujo inválida");
        float scale=Math.min(target.width()/Math.max(1,bounds.width()),target.height()/Math.max(1,bounds.height()));
        float ox=target.centerX()-bounds.width()*scale/2,oy=target.centerY()-bounds.height()*scale/2;
        float[] out=new float[line.length];
        // Float rounding at the far edge must never place a gesture outside the chosen area.
        for(int i=0;i<line.length;i+=2){out[i]=Math.max(target.left,Math.min(target.right,ox+(line[i]-bounds.left)*scale));out[i+1]=Math.max(target.top,Math.min(target.bottom,oy+(line[i+1]-bounds.top)*scale));}
        return out;
    }
    Path path(int index,RectF target){return path(fit(strokes.get(index),target));}
    static Path path(float[] points){Path path=new Path();path.moveTo(points[0],points[1]);for(int i=2;i<points.length;i+=2)path.lineTo(points[i],points[i+1]);return path;}
    static long duration(float[] points){double length=0;for(int i=2;i<points.length;i+=2)length+=Math.hypot(points[i]-points[i-2],points[i+1]-points[i-1]);return Math.max(80,Math.min(600,Math.round(length*1.4)));}
}
