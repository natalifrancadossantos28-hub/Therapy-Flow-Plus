package br.com.nfs.minhaagenda;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import java.util.*;
import org.json.*;

final class Alarms {
  static AlarmManager manager(Context c){return (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);}
  static boolean exact(Context c){return Build.VERSION.SDK_INT<31||manager(c).canScheduleExactAlarms();}
  static PendingIntent pending(Context c,JSONObject a) throws JSONException {
    Intent i=new Intent(c,AlarmReceiver.class).setData(Uri.parse("nfs-agenda:alarm/"+Uri.encode(a.getString("key"))));
    i.putExtra("alarm",a.toString());return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  }
  static synchronized void cancel(Context c) {
    try{String data=Store.get(c,"alarms");if(data!=null){JSONArray arr=new JSONArray(data);for(int i=0;i<arr.length();i++)manager(c).cancel(pending(c,arr.getJSONObject(i)));}}catch(Exception ignored){}
  }
  static synchronized void replace(Context c,JSONArray events) throws Exception {
    JSONArray alarms=new JSONArray();long now=System.currentTimeMillis();
    for(int i=0;i<events.length();i++){
      JSONObject e=events.getJSONObject(i);
      for(Planner.Alarm a:Planner.event(e.getLong("id"),e.getString("titulo"),e.getString("data"),e.isNull("hora")?null:e.optString("hora"),
          e.isNull("local")?"":e.getString("local"),e.isNull("antecedenciaMin")?null:e.getInt("antecedenciaMin"),e.optBoolean("concluido"),now))
        alarms.put(Api.obj("key",a.key,"title",a.title,"clock",a.clock,"place",a.place,"at",a.at));
    }
    cancel(c);Store.put(c,"events",events.toString());Store.put(c,"alarms",alarms.toString());schedule(c);
  }
  static synchronized void schedule(Context c) throws Exception {
    if(!exact(c))return;
    String data=Store.get(c,"alarms");if(data==null)return;JSONArray arr=new JSONArray(data);
    Set<String> fired=Store.prefs(c).getStringSet("fired",Collections.emptySet());
    for(int i=0;i<arr.length();i++){
      JSONObject a=arr.getJSONObject(i);long at=a.getLong("at");
      if(at<=System.currentTimeMillis()||fired.contains(a.getString("key")))continue;
      PendingIntent show=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      manager(c).setAlarmClock(new AlarmManager.AlarmClockInfo(at,show),pending(c,a));
    }
  }
  static synchronized boolean markFired(Context c,String key){
    Set<String> keys=new LinkedHashSet<>(Store.prefs(c).getStringSet("fired",Collections.emptySet()));
    if(keys.contains(key))return false;keys.add(key);
    // Prefs não preserva ordem: IDs antigos só evitam repetição, nunca mudam horários novos.
    if(keys.size()>1000){keys.clear();keys.add(key);}
    return Store.prefs(c).edit().putStringSet("fired",keys).commit();
  }
}
