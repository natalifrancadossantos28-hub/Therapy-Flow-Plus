package br.com.nfsgestao.minhaagenda;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "AlarmeNativo", permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notificacoes") })
public class AlarmeNativoPlugin extends Plugin {

    @Override
    public void load() { Alarmes.criarCanais(getContext()); }

    @PluginMethod
    public void configurar(PluginCall call) {
        Alarmes.prefs(getContext()).edit().putString("url", call.getString("url")).putString("key", call.getString("key")).putString("token", call.getString("token")).apply();
        SyncWorker.agendar(getContext());
        call.resolve();
    }

    @PluginMethod
    public void sincronizar(PluginCall call) {
        try {
            JSArray lista = call.getArray("compromissos", new JSArray());
            Alarmes.sincronizar(getContext(), new JSONArray(lista.toString()));
            call.resolve(JSObject.fromJSONObject(Alarmes.resumo(getContext())));
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void sair(PluginCall call) { Alarmes.limpar(getContext()); call.resolve(); }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        try {
            JSObject r = JSObject.fromJSONObject(Alarmes.resumo(c));
            r.put("notificacoes", NotificationManagerCompat.from(c).areNotificationsEnabled());
            r.put("exatos", Alarmes.podeExato(c));
            r.put("telaCheia", Build.VERSION.SDK_INT < 34 || c.getSystemService(NotificationManager.class).canUseFullScreenIntent());
            r.put("bateria", c.getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(c.getPackageName()));
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void pedirNotificacoes(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notificacoes") == PermissionState.GRANTED) { status(call); return; }
        requestPermissionForAlias("notificacoes", call, "depoisDaPermissao");
    }

    @PermissionCallback
    private void depoisDaPermissao(PluginCall call) { status(call); }

    @PluginMethod
    public void abrirAjuste(PluginCall call) {
        Context c = getContext();
        String tipo = call.getString("tipo", "app");
        Uri pkg = Uri.parse("package:" + c.getPackageName());
        Intent i;
        if ("exatos".equals(tipo) && Build.VERSION.SDK_INT >= 31) i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg);
        else if ("telaCheia".equals(tipo) && Build.VERSION.SDK_INT >= 34) i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg);
        else if ("bateria".equals(tipo)) i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg);
        else if ("notificacoes".equals(tipo) && Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        try { getActivity().startActivity(i); } catch (Exception e) { getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); }
        call.resolve();
    }

    @PluginMethod
    public void testar(PluginCall call) {
        try {
            JSONObject a = new JSONObject().put("codigo", 999_999_999).put("em", System.currentTimeMillis() + 5000).put("rotulo", "Teste")
                    .put("titulo", "Alarme da Minha Agenda").put("quando", "Agora").put("detalhe", "Se você está vendo isto, o alarme funciona.").put("alarme", true);
            Alarmes.adiar(getContext(), a, 0);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
}
