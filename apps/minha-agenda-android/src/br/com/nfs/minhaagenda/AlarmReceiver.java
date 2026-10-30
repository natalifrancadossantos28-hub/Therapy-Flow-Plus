package br.com.nfs.minhaagenda;
import android.content.*;
import org.json.*;
public class AlarmReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent intent){
    try{
      JSONObject a=new JSONObject(intent.getStringExtra("alarm"));
      if(!Alarms.markFired(c,a.getString("key")))return;
      c.startForegroundService(new Intent(c,AlarmService.class).putExtra("alarm",a.toString()));
    }catch(Exception ignored){/* broadcast incompleto não deve disparar alarme desconhecido */}
  }
}
