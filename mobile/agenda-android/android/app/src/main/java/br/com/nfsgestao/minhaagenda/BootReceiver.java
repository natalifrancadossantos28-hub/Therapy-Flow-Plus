package br.com.nfsgestao.minhaagenda;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reprograma os alarmes depois de reiniciar o celular, atualizar o app ou mudar a hora. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Alarmes.reprogramar(ctx);
        SyncWorker.agendar(ctx);
    }
}
