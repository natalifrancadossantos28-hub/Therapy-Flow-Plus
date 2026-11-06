package br.com.nfsgestao.minhaagenda;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

public class AlarmeReceiver extends BroadcastReceiver {
    static final String DISPARAR = "br.com.nfsgestao.minhaagenda.DISPARAR";
    static final String ADIAR = "br.com.nfsgestao.minhaagenda.ADIAR";
    static final String DISPENSAR = "br.com.nfsgestao.minhaagenda.DISPENSAR";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String acao = intent.getAction();
        String json = intent.getStringExtra("aviso");
        if (json == null) return;
        try {
            JSONObject a = new JSONObject(json);
            if (DISPARAR.equals(acao)) Alarmes.mostrar(ctx, a);
            else if (ADIAR.equals(acao)) Alarmes.adiar(ctx, a, 10);
            else if (DISPENSAR.equals(acao)) Alarmes.dispensar(ctx, a);
        } catch (Exception ignored) { }
    }
}
