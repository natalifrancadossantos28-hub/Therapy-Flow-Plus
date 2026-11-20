package br.com.nfs.minhaagenda;

import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import android.content.Context;

final class Api {
  static JSONObject obj(Object... pairs) throws JSONException {
    JSONObject j=new JSONObject();for(int i=0;i<pairs.length;i+=2)j.put((String)pairs[i],pairs[i+1]==null?JSONObject.NULL:pairs[i+1]);return j;
  }
  static Object rpc(String fn,JSONObject data) throws Exception {
    HttpURLConnection c=(HttpURLConnection)new URL(Config.API+fn).openConnection();
    c.setRequestMethod("POST");c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setDoOutput(true);
    c.setRequestProperty("apikey",Config.KEY);c.setRequestProperty("Content-Type","application/json; charset=utf-8");
    try {
      try(OutputStream out=c.getOutputStream()){out.write(data.toString().getBytes(StandardCharsets.UTF_8));}
      int status=c.getResponseCode();InputStream in=status>=200&&status<300?c.getInputStream():c.getErrorStream();
      ByteArrayOutputStream buffer=new ByteArrayOutputStream();
      if(in!=null)try(InputStream stream=in){byte[] bytes=new byte[4096];int n;while((n=stream.read(bytes))!=-1){buffer.write(bytes,0,n);if(buffer.size()>4_000_000)throw new IOException("Resposta muito grande.");}}
      String text=new String(buffer.toByteArray(),StandardCharsets.UTF_8);
      if(status<200||status>=300){String message="Não foi possível conectar. Tente novamente.";try{message=new JSONObject(text).optString("message",message);}catch(JSONException ignored){}throw new IOException(message);}
      if(text.isEmpty()||text.equals("null"))return JSONObject.NULL;
      return new JSONTokener(text).nextValue();
    } finally {c.disconnect();}
  }
  static JSONObject session(Context c) throws Exception {String s=Store.get(c,"session");return s==null?null:new JSONObject(s);}
  static String token(Context c) throws Exception {JSONObject s=session(c);if(s==null)throw new IOException("Entre com seu PIN.");return s.getString("token");}
}
