package br.com.nfsgestao.minhaagenda;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmeNativoPlugin.class);
        super.onCreate(savedInstanceState);
        SyncWorker.agendar(this);
    }
}
