package br.com.nfs.minhaagenda;
import android.content.*;
public class RestoreReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent intent){
    final PendingResult result=goAsync();SyncJob.IO.execute(()->{
      try{Alarms.schedule(c);if(Api.session(c)!=null)SyncJob.register(c);}catch(Exception ignored){}finally{result.finish();}
    });
  }
}
