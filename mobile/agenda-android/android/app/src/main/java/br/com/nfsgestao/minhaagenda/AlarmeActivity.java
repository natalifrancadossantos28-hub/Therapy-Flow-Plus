package br.com.nfsgestao.minhaagenda;

import android.app.Activity;
import android.app.KeyguardManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Tela cheia do alarme (aparece por cima da tela bloqueada quando o Android permite). */
public class AlarmeActivity extends Activity {
    private JSONObject aviso;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try { aviso = new JSONObject(getIntent().getStringExtra("aviso")); } catch (Exception e) { finish(); return; }

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        int p = dp(28);
        raiz.setPadding(p, p, p, p);
        GradientDrawable fundo = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFF0B1A4A, 0xFF050B24, 0xFF3B1677});
        raiz.setBackground(fundo);

        raiz.addView(texto(aviso.optString("rotulo", "Compromisso"), 16, 0xFFC4B5FD, false));
        raiz.addView(texto(aviso.optString("titulo"), 30, Color.WHITE, true));
        raiz.addView(texto(aviso.optString("quando"), 20, 0xFFBAE6FD, false));
        String extra = aviso.optString("detalhe");
        if (!extra.isEmpty()) raiz.addView(texto(extra, 17, 0xCCFFFFFF, false));

        Button adiar = botao("Adiar 10 min", 0x33FFFFFF);
        adiar.setOnClickListener(v -> { Alarmes.adiar(this, aviso, 10); finish(); });
        Button dispensar = botao("Dispensar", 0xFF7C3AED);
        dispensar.setOnClickListener(v -> { Alarmes.dispensar(this, aviso); finish(); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60));
        lp.topMargin = dp(16);
        raiz.addView(adiar, lp);
        raiz.addView(dispensar, lp);
        setContentView(raiz);
    }

    private TextView texto(String s, int sp, int cor, boolean negrito) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(cor);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(6), 0, dp(6));
        if (negrito) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button botao(String s, int cor) {
        Button bt = new Button(this);
        bt.setText(s);
        bt.setAllCaps(false);
        bt.setTextColor(Color.WHITE);
        bt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        GradientDrawable g = new GradientDrawable();
        g.setColor(cor);
        g.setCornerRadius(dp(18));
        bt.setBackground(g);
        return bt;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    public void onBackPressed() { Alarmes.dispensar(this, aviso); super.onBackPressed(); }
}
