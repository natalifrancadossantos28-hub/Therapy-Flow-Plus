package br.com.nfs.minhaagenda;

import android.app.job.*;
import android.content.*;
import java.time.LocalDate;
import java.util.concurrent.*;
import org.json.*;

public class SyncJob extends JobService {
  static final ExecutorService IO=Executors.newSingleThreadExecutor();
  static synchronized JSONArray sync(Context c) throws Exception {
    JSONObject session=Api.session(c);if(session==null)return new JSONArray();String token=session.getString("token");
    LocalDate today=LocalDate.now(Planner.ZONE);
    JSONArray events=(JSONArray)Api.rpc("agenda_exec_listar",Api.obj("p_token",token,"p_de",today.toString(),"p_ate",today.plusDays(90).toString()));
    JSONObject current=Api.session(c);if(current==null||!current.optString("token").equals(token))return new JSONArray();
    if(session.getJSONObject("usuario").getString("papel").equals("dona"))Alarms.replace(c,events);
    else {Alarms.cancel(c);Store.put(c,"alarms","[]");Store.put(c,"events",events.toString());}
    Store.prefs(c).edit().putLong("lastSync",System.currentTimeMillis()).remove("syncError").commit();
    return events;
  }
  static void register(Context c){
    JobScheduler jobs=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    jobs.schedule(new JobInfo.Builder(41,new ComponentName(c,SyncJob.class)).setPersisted(true)
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).build());
  }
  @Override public boolean onStartJob(JobParameters params){IO.execute(()->{
    boolean retry=false;
    try{sync(this);}catch(Exception e){Store.prefs(this).edit().putString("syncError","Não foi possível atualizar. Abra a agenda com internet.").apply();retry=true;}
    jobFinished(params,retry);
  });return true;}
  @Override public boolean onStopJob(JobParameters params){return true;}
}
