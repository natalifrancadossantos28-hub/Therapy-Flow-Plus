package br.com.nfs.minhaagenda;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import org.json.*;

/** Aplicativo nativo: usa a mesma agenda e PIN; não depende de deixar o site aberto. */
public class MainActivity extends Activity {
  LinearLayout root;boolean busy;String message="";
  @Override public void onCreate(Bundle b){super.onCreate(b);setVolumeControlStream(AudioManager.STREAM_ALARM);AlarmService.channel(this);}
  @Override public void onResume(){super.onResume();render();try{Alarms.schedule(this);if(Api.session(this)!=null){SyncJob.register(this);refresh();}}catch(Exception e){message="Entre novamente com seu PIN.";render();}}
  boolean notified(){return ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled();}
  boolean fullscreen(){return Build.VERSION.SDK_INT<34||((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).canUseFullScreenIntent();}
  int alarmVolume(){return ((AudioManager)getSystemService(AUDIO_SERVICE)).getStreamVolume(AudioManager.STREAM_ALARM);}
  LinearLayout column(){LinearLayout x=new LinearLayout(this);x.setOrientation(1);x.setPadding(20,12,20,12);return x;}
  TextView text(LinearLayout parent,String value,int size){TextView t=new TextView(this);t.setText(value);t.setTextColor(Color.WHITE);t.setTextSize(size);t.setPadding(0,8,0,10);parent.addView(t);return t;}
  Button button(LinearLayout parent,String label,Runnable click){Button b=new Button(this);b.setText(label);b.setTextSize(20);b.setAllCaps(false);b.setMinHeight(64);b.setTextColor(Color.rgb(11,21,48));b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(252,211,77)));b.setOnClickListener(v->click.run());parent.addView(b,new LinearLayout.LayoutParams(-1,-2));return b;}
  void render(){
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(11,21,48));root=column();root.setPadding(24,36,24,35);scroll.addView(root);setContentView(scroll);
    text(root,"Minha Agenda",36).setTypeface(null,1);text(root,"Versão Android de teste · 0.1",16);
    if(!message.isEmpty())text(root,message,19);
    try{JSONObject session=Api.session(this);if(session==null){loginList();return;}
      String name=session.getJSONObject("dona").getString("nome");boolean owner=session.getJSONObject("usuario").getString("papel").equals("dona");
      text(root,"Agenda de "+name,24);
      if(owner){setup();button(root,"⏰ Testar alarme em 30 segundos",this::test);}
      else text(root,"Perfil autorizado: os alarmes são configurados no aparelho da pessoa titular.",19);
      button(root,"＋ Novo compromisso",()->edit(null));button(root,busy?"Atualizando…":"↻ Atualizar agenda",this::refresh).setEnabled(!busy);
      long last=Store.prefs(this).getLong("lastSync",0);
      if(last>0)text(root,"Última atualização: "+java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.SHORT).format(new java.util.Date(last)),16);
      text(root,"Alarmes salvos tocam sem internet. Alterações feitas no site precisam chegar a este aparelho: abra Atualizar ou aguarde a sincronização em segundo plano, que pode demorar 15 minutos ou mais.",17);
      String data=Store.get(this,"events");JSONArray events=data==null?new JSONArray():new JSONArray(data);int count=0;
      for(int i=0;i<events.length();i++){
        JSONObject e=events.getJSONObject(i);if(e.optBoolean("concluido"))continue;count++;
        LinearLayout card=column();card.setBackgroundColor(Color.rgb(26,43,72));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,14,0,4);root.addView(card,lp);
        String date=LocalDate.parse(e.getString("data")).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        text(card,date+" · "+(e.isNull("hora")?"Dia todo":e.getString("hora")),24).setTypeface(null,1);
        text(card,e.getString("titulo"),26);if(!e.isNull("local"))text(card,e.optString("local"),20);
        text(card,e.isNull("antecedenciaMin")?"Sem alarme":e.optInt("antecedenciaMin")==0?"Alarme na hora":"Alarme na hora e "+e.optInt("antecedenciaMin")+" min antes",17);
        button(card,"Editar compromisso",()->edit(e));button(card,"Concluir",()->new AlertDialog.Builder(this).setMessage("Marcar este compromisso como concluído e retirar os próximos alarmes?").setNegativeButton("Voltar",null).setPositiveButton("Concluir",(d,w)->complete(e)).show());
      }
      if(count==0)text(root,"Nenhum compromisso pendente nos próximos 90 dias.",22);
      button(root,"Sair deste aparelho",()->new AlertDialog.Builder(this).setMessage("Sair também retira os alarmes desta instalação. Os compromissos continuam na sua agenda.").setNegativeButton("Voltar",null).setPositiveButton("Sair",(d,w)->logout()).show());
    }catch(Exception e){text(root,"Não foi possível ler a sessão. Entre novamente.",20);button(root,"Limpar sessão neste aparelho",this::logout);}
  }
  void setup(){
    text(root,"Preparar o despertador",25).setTypeface(null,1);
    text(root,(notified()?"✓":"⚠")+" Notificações  ·  "+(Alarms.exact(this)?"✓":"⚠")+" Horário exato  ·  "+(fullscreen()?"✓":"⚠")+" Tela de alarme",18);
    if(!notified())button(root,"1. Permitir notificações",()->{
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},51);
      else settings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));
    });
    if(!Alarms.exact(this))button(root,"2. Permitir alarmes e lembretes",()->{if(Build.VERSION.SDK_INT>=31)settings(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));});
    if(!fullscreen())button(root,"3. Permitir aviso em tela cheia",()->{if(Build.VERSION.SDK_INT>=34)settings(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,Uri.parse("package:"+getPackageName())));});
    text(root,alarmVolume()==0?"⚠ O volume de ALARME está zerado. Aumente para ouvir a melodia.":"Volume de alarme: "+alarmVolume(),18);
    button(root,"Volume e sons do aparelho",()->settings(new Intent(Settings.ACTION_SOUND_SETTINGS)));
    if(notified()&&Alarms.exact(this)&&fullscreen()&&alarmVolume()>0)text(root,"✓ Permissões liberadas. Faça o teste com a tela bloqueada antes de confiar nos alarmes.",20);
    text(root,"A tela grande depende da permissão do Android. Com o aparelho em uso, ele pode exibir um aviso sobre a tela. Não perturbe, volume, desligamento e Forçar parada interferem nos alarmes.",17);
  }
  void settings(Intent i){try{startActivity(i);}catch(Exception e){message="Abra Configurações → Aplicativos → Minha Agenda e confira as permissões.";render();}}
  @Override public void onRequestPermissionsResult(int r,String[] p,int[] g){super.onRequestPermissionsResult(r,p,g);render();}
  void loginList(){
    text(root,"Escolha seu nome e use o mesmo PIN da agenda.",22);
    if(busy){text(root,"Carregando…",20);return;}busy=true;
    SyncJob.IO.execute(()->{try{
      JSONArray users=(JSONArray)Api.rpc("agenda_exec_usuarios_listar",Api.obj("p_slug",Config.SLUG));
      runOnUiThread(()->{busy=false;if(isFinishing())return;if(users.length()==0)text(root,"Nenhum perfil disponível. Confira a clínica no sistema.",20);
        for(int i=0;i<users.length();i++){JSONObject user=users.optJSONObject(i);if(user!=null)button(root,user.optString("nome"),()->pin(user));}});
    }catch(Exception e){runOnUiThread(()->{busy=false;message="Sem conexão para entrar. Confira a internet.";text(root,message,20);button(root,"Tentar novamente",this::render);});}});
  }
  void pin(JSONObject user){
    EditText pin=new EditText(this);pin.setTextSize(26);pin.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);pin.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("PIN de "+user.optString("nome")).setView(pin).setNegativeButton("Voltar",null).setPositiveButton("Entrar",null).create();
    dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{String code=pin.getText().toString();if(!code.matches("[0-9]{4,6}")){pin.setError("Use de 4 a 6 números.");return;}dialog.getButton(-1).setEnabled(false);
      SyncJob.IO.execute(()->{try{
        JSONObject s=(JSONObject)Api.rpc("agenda_exec_entrar",Api.obj("p_slug",Config.SLUG,"p_usuario_id",user.getLong("id"),"p_pin",code));
        if(s.has("erro"))throw new Exception(s.optString("erro").equals("bloqueado")?"Muitas tentativas. Aguarde 15 minutos.":"PIN incorreto.");
        Store.put(this,"session",s.toString());SyncJob.register(this);
        runOnUiThread(()->{dialog.dismiss();message="";render();refresh();});
      }catch(Exception e){runOnUiThread(()->{pin.setText("");pin.setError(e.getMessage());dialog.getButton(-1).setEnabled(true);});}});
    }));dialog.show();
  }
  void refresh(){
    if(busy)return;busy=true;
    SyncJob.IO.execute(()->{String result="";try{SyncJob.sync(this);}catch(Exception e){result="Não foi possível atualizar. Alarmes já salvos continuam no aparelho. Confira sua internet ou entre novamente.";}
      final String m=result;runOnUiThread(()->{busy=false;message=m;if(!isFinishing())render();});});
  }
  void test(){
    if(!notified()||!Alarms.exact(this)||!fullscreen()){message="Libere as permissões acima antes de testar.";render();return;}
    if(alarmVolume()==0){message="Aumente o volume de alarme antes de testar.";render();return;}
    try{
      long at=System.currentTimeMillis()+30000;
      JSONObject a=Api.obj("key","teste:"+at,"title","Este é o seu despertador de teste","clock","Teste","place","Toque em PARAR AVISO · JÁ VI para encerrar.","at",at);
      String previous=Store.get(this,"test");if(previous!=null)Alarms.manager(this).cancel(Alarms.pending(this,new JSONObject(previous)));
      Store.put(this,"test",a.toString());PendingIntent show=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      Alarms.manager(this).setAlarmClock(new AlarmManager.AlarmClockInfo(at,show),Alarms.pending(this,a));
      message="Teste marcado para daqui a 30 segundos. Volte à tela inicial e bloqueie o aparelho. Não precisa deixar a agenda aberta.";render();
    }catch(Exception e){message="Não foi possível agendar o teste. Confira as permissões.";render();}
  }
  void logout(){
    try{
      final String token=Api.token(this);Alarms.cancel(this);String test=Store.get(this,"test");if(test!=null)Alarms.manager(this).cancel(Alarms.pending(this,new JSONObject(test)));
      startService(new Intent(this,AlarmService.class).setAction(AlarmService.STOP));
      ((android.app.job.JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE)).cancel(41);Store.clear(this);message="";
      SyncJob.IO.execute(()->{try{Api.rpc("agenda_exec_sair",Api.obj("p_token",token));}catch(Exception ignored){}});
    }catch(Exception ignored){Alarms.cancel(this);Store.clear(this);}render();
  }
  EditText input(LinearLayout box,String label,String value){text(box,label,18);EditText e=new EditText(this);e.setText(value);e.setTextColor(Color.WHITE);e.setTextSize(22);e.setSingleLine(true);box.addView(e);return e;}
  void edit(JSONObject previous){
    LinearLayout box=column();box.setBackgroundColor(Color.rgb(11,21,48));ScrollView scroll=new ScrollView(this);scroll.addView(box);
    EditText title=input(box,"Compromisso",previous==null?"":previous.optString("titulo"));
    EditText date=input(box,"Data",previous==null?LocalDate.now(Planner.ZONE).toString():previous.optString("data"));date.setFocusable(false);
    date.setOnClickListener(v->{LocalDate d=LocalDate.parse(date.getText().toString());new DatePickerDialog(this,(view,y,m,day)->date.setText(LocalDate.of(y,m+1,day).toString()),d.getYear(),d.getMonthValue()-1,d.getDayOfMonth()).show();});
    EditText hour=input(box,"Horário",previous==null||previous.isNull("hora")?"09:00":previous.optString("hora"));hour.setFocusable(false);
    hour.setOnClickListener(v->{LocalTime h=LocalTime.parse(hour.getText().toString());new TimePickerDialog(this,(view,hh,mm)->hour.setText(String.format(java.util.Locale.ROOT,"%02d:%02d",hh,mm)),h.getHour(),h.getMinute(),true).show();});
    EditText place=input(box,"Local (opcional)",previous==null||previous.isNull("local")?"":previous.optString("local"));
    CheckBox allDay=new CheckBox(this);allDay.setText("Dia todo, sem horário de alarme");allDay.setTextColor(Color.WHITE);allDay.setChecked(previous!=null&&previous.isNull("hora"));box.addView(allDay);
    text(box,"Quando despertar",18);Spinner notice=new Spinner(this);String[] labels={"Na hora","15 min antes e na hora","30 min antes e na hora","1 hora antes e na hora","2 horas antes e na hora","Não despertar"};Integer[] values={0,15,30,60,120,null};
    ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels);notice.setAdapter(adapter);box.addView(notice);
    if(previous!=null){Integer old=previous.isNull("antecedenciaMin")?null:previous.optInt("antecedenciaMin");for(int i=0;i<values.length;i++)if(java.util.Objects.equals(old,values[i]))notice.setSelection(i);}
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle(previous==null?"Novo compromisso":"Editar compromisso").setView(scroll).setNegativeButton("Voltar",null).setPositiveButton("Salvar",null).create();
    dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{
      if(title.getText().toString().trim().isEmpty()){title.setError("Digite o compromisso.");return;}
      if(!allDay.isChecked()&&LocalDateTime.of(LocalDate.parse(date.getText().toString()),LocalTime.parse(hour.getText().toString())).atZone(Planner.ZONE).toInstant().toEpochMilli()<=System.currentTimeMillis()){hour.setError("Escolha um horário futuro.");return;}
      dialog.getButton(-1).setEnabled(false);
      final String t=title.getText().toString(),dt=date.getText().toString(),h=hour.getText().toString(),loc=place.getText().toString();final Integer before=values[notice.getSelectedItemPosition()];final boolean day=allDay.isChecked();
      SyncJob.IO.execute(()->{try{
        Api.rpc("agenda_exec_salvar",Api.obj("p_token",Api.token(this),"p_id",previous==null?null:previous.getLong("id"),"p_titulo",t,"p_data",dt,"p_hora",day?null:h,"p_local",loc,
          "p_observacao",previous==null?null:previous.opt("observacao"),"p_categoria",previous==null?"reuniao":previous.optString("categoria","reuniao"),"p_avisar_vespera",previous==null||previous.optBoolean("avisarVespera"),"p_avisar_dia",previous==null||previous.optBoolean("avisarDia"),"p_antecedencia_min",before));
        SyncJob.sync(this);runOnUiThread(()->{dialog.dismiss();message="Compromisso salvo e sincronizado neste aparelho.";render();});
      }catch(Exception e){runOnUiThread(()->{dialog.getButton(-1).setEnabled(true);new AlertDialog.Builder(this).setMessage("Não foi possível concluir a atualização. Atualize a agenda antes de tentar salvar novamente, para evitar duplicar o compromisso.").setPositiveButton("Entendi",null).show();});}});
    }));dialog.show();
  }
  void complete(JSONObject e){SyncJob.IO.execute(()->{try{Api.rpc("agenda_exec_concluir",Api.obj("p_token",Api.token(this),"p_id",e.getLong("id"),"p_concluido",true));SyncJob.sync(this);runOnUiThread(()->{message="Compromisso concluído.";render();});}catch(Exception error){runOnUiThread(()->{message="Não foi possível concluir. Confira a internet e atualize.";render();});}});}
}
