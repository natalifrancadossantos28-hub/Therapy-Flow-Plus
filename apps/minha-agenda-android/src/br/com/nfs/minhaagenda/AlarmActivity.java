package br.com.nfs.minhaagenda;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import android.graphics.Color;
import org.json.*;

/** Tela grande, sem sumir por tempo; só encerra pelo botão explícito de confirmação. */
public class AlarmActivity extends Activity {
  final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){render();}};
  @Override public void onCreate(Bundle b){super.onCreate(b);setShowWhenLocked(true);setTurnScreenOn(true);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();}
  @Override protected void onStart(){super.onStart();if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,new IntentFilter(AlarmService.UPDATED),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,new IntentFilter(AlarmService.UPDATED));render();}
  @Override protected void onStop(){unregisterReceiver(receiver);super.onStop();}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);render();}
  private void render(){
    JSONArray alarms=AlarmService.active(this);if(alarms.length()==0){finish();return;}
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(11,21,48));
    LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(30,45,30,35);box.setGravity(Gravity.CENTER_VERTICAL);scroll.addView(box);
    TextView icon=new TextView(this);icon.setText("⏰");icon.setTextSize(66);box.addView(icon);
    TextView heading=new TextView(this);heading.setText("Hora do compromisso!");heading.setTextSize(38);heading.setTextColor(Color.WHITE);heading.setTypeface(null,1);box.addView(heading);
    TextView content=new TextView(this);content.setText(AlarmService.summary(alarms));content.setTextSize(32);content.setTextColor(Color.WHITE);content.setPadding(0,30,0,35);box.addView(content);
    Button stop=new Button(this);stop.setText("PARAR AVISO\nJÁ VI");stop.setTextSize(28);stop.setTextColor(Color.rgb(11,21,48));stop.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(252,211,77)));stop.setMinHeight(120);
    stop.setOnClickListener(v->{startService(new Intent(this,AlarmService.class).setAction(AlarmService.STOP));finish();});
    box.addView(stop,new LinearLayout.LayoutParams(-1,-2));setContentView(scroll);stop.requestFocus();
  }
  @Override public void onBackPressed(){new AlertDialog.Builder(this).setMessage("Para encerrar a música e o aviso, toque em PARAR AVISO · JÁ VI.").setPositiveButton("Entendi",null).show();}
}
