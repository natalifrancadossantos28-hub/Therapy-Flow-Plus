package br.com.nfsgestao.minhaagenda;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/** A cada 15 minutos (com internet) busca a agenda no servidor e atualiza os alarmes do celular. */
public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    static void agendar(Context ctx) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES).setConstraints(net).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("agx-sync", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void agoraUmaVez(Context ctx) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager.getInstance(ctx).enqueue(new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(net).build());
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = Alarmes.prefs(ctx);
        String url = sp.getString("url", null), key = sp.getString("key", null), token = sp.getString("token", null);
        if (url == null || key == null || token == null) return Result.success();
        try {
            LocalDate hoje = LocalDate.now(Alarmes.ZONA);
            JSONObject corpo = new JSONObject().put("p_token", token).put("p_de", hoje.minusDays(1).toString()).put("p_ate", hoje.plusDays(Alarmes.DIAS).toString());
            HttpURLConnection c = (HttpURLConnection) new URL(url.replaceAll("/+$", "") + "/rest/v1/rpc/agenda_exec_listar").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setDoOutput(true);
            c.setRequestProperty("apikey", key);
            c.setRequestProperty("Authorization", "Bearer " + key);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(corpo.toString().getBytes(StandardCharsets.UTF_8)); }
            int st = c.getResponseCode();
            if (st != 200) return st >= 500 ? Result.retry() : Result.success();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) { byte[] b = new byte[8192]; int n; while ((n = in.read(b)) > 0) buf.write(b, 0, n); }
            Alarmes.sincronizar(ctx, new JSONArray(buf.toString("UTF-8")));
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }
}
