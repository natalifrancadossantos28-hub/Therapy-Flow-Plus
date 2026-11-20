package br.com.nfs.minhaagenda;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.os.*;
import org.json.*;

/** A música toca no canal de ALARME do Android, sem navegador e sem WebView. */
public class AlarmService extends Service {
  static final String CHANNEL="alarmes.v1", UPDATED="br.com.nfs.minhaagenda.ALARM_UPDATED", STOP="parar";
  static final int ID=701;
  private MediaPlayer player;private Vibrator vibrator;private AudioManager audio;private AudioFocusRequest focus;
  static void channel(Context c){
    NotificationChannel ch=new NotificationChannel(CHANNEL,"Despertador da agenda",NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Aviso de compromisso com tela grande; a música usa o volume de alarme.");
    ch.setSound(null,null);ch.enableVibration(true);ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
    ((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
  }
  static JSONArray active(Context c){try{String s=Store.get(c,"ringing");return s==null?new JSONArray():new JSONArray(s);}catch(Exception e){return new JSONArray();}}
  static String summary(JSONArray a){StringBuilder b=new StringBuilder();for(int i=0;i<a.length();i++){JSONObject j=a.optJSONObject(i);if(j!=null){if(b.length()>0)b.append("\n\n");b.append(j.optString("clock")).append(" · ").append(j.optString("title"));if(!j.optString("place").isEmpty())b.append("\n").append(j.optString("place"));}}return b.toString();}
  private Notification notification(JSONArray alarms){
    PendingIntent open=PendingIntent.getActivity(this,ID,new Intent(this,AlarmActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    PendingIntent stop=PendingIntent.getService(this,ID,new Intent(this,AlarmService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.icon).setContentTitle("Hora do compromisso!")
      .setContentText(summary(alarms)).setStyle(new Notification.BigTextStyle().bigText(summary(alarms)))
      .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PRIVATE)
      .setOngoing(true).setAutoCancel(false).setContentIntent(open).setFullScreenIntent(open,true)
      .addAction(new Notification.Action.Builder(null,"Parar · Já vi",stop).build()).build();
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    channel(this);
    if(intent!=null&&STOP.equals(intent.getAction())){
      try{Store.put(this,"ringing","[]");}catch(Exception ignored){}
      stopSound();stopForeground(STOP_FOREGROUND_REMOVE);sendBroadcast(new Intent(UPDATED).setPackage(getPackageName()));stopSelf();return START_NOT_STICKY;
    }
    JSONArray alarms=active(this);
    try {
      if(intent!=null&&intent.hasExtra("alarm")){
        JSONObject a=new JSONObject(intent.getStringExtra("alarm"));boolean exists=false;
        for(int i=0;i<alarms.length();i++)if(alarms.getJSONObject(i).optString("key").equals(a.optString("key")))exists=true;
        if(!exists)alarms.put(a);Store.put(this,"ringing",alarms.toString());
      }
      if(alarms.length()==0){stopSelf();return START_NOT_STICKY;}
      if(Build.VERSION.SDK_INT>=29)startForeground(ID,notification(alarms),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
      else startForeground(ID,notification(alarms));
      if(player==null){
        audio=(AudioManager)getSystemService(AUDIO_SERVICE);
        focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
          .setOnAudioFocusChangeListener(change->{if(player!=null){try{if(change==AudioManager.AUDIOFOCUS_GAIN)player.start();else if(change<0)player.pause();}catch(Exception ignored){}}}).build();
        audio.requestAudioFocus(focus);
        player=new MediaPlayer();player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        android.content.res.AssetFileDescriptor fd=getResources().openRawResourceFd(R.raw.melody);
        player.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());fd.close();player.setLooping(true);
        player.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);player.prepare();player.start();
        vibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE);
        if(vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0,500,300,500,1700},0),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
      }
      sendBroadcast(new Intent(UPDATED).setPackage(getPackageName()));return START_STICKY;
    }catch(Exception e){stopSound();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
  }
  private void stopSound(){if(player!=null){try{player.stop();}catch(Exception ignored){}player.release();player=null;}if(vibrator!=null)vibrator.cancel();if(audio!=null&&focus!=null)audio.abandonAudioFocusRequest(focus);focus=null;}
  @Override public void onDestroy(){stopSound();super.onDestroy();}
  @Override public IBinder onBind(Intent i){return null;}
}
