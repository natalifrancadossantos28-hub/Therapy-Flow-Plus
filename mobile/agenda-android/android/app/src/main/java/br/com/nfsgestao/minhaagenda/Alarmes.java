package br.com.nfsgestao.minhaagenda;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Calcula, guarda e programa os alarmes da agenda no próprio celular (funcionam sem internet). */
public final class Alarmes {
    static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
    static final int DIAS = 35;
    static final String CANAL = "agx_alarme_v1";
    static final String CANAL_LEMBRETE = "agx_lembrete_v1";
    private static final int ADIADO = 1_000_000_000;
    private static final Map<String, String> CATEGORIAS = new HashMap<>();
    static {
        CATEGORIAS.put("reuniao", "Reunião"); CATEGORIAS.put("evento", "Evento"); CATEGORIAS.put("visita", "Visita externa");
        CATEGORIAS.put("palestra", "Palestra"); CATEGORIAS.put("urgente", "Urgente"); CATEGORIAS.put("pessoal", "Pessoal"); CATEGORIAS.put("outro", "Outro");
    }

    private Alarmes() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("agx_alarmes", Context.MODE_PRIVATE); }

    static synchronized void sincronizar(Context ctx, JSONArray compromissos) {
        prefs(ctx).edit().putString("comp", compromissos.toString()).putLong("sincronizadoEm", System.currentTimeMillis()).apply();
        reprogramar(ctx);
    }

    static synchronized void limpar(Context ctx) {
        cancelarTodos(ctx);
        prefs(ctx).edit().clear().apply();
    }

    /** Lista de avisos futuros, um por compromisso e tipo (sem duplicar). */
    static List<JSONObject> calcular(JSONArray comps, long agora) {
        List<JSONObject> out = new ArrayList<>();
        long limite = agora + DIAS * 86_400_000L;
        DateTimeFormatter dia = DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", new Locale("pt", "BR"));
        for (int i = 0; i < comps.length(); i++) {
            JSONObject c = comps.optJSONObject(i);
            if (c == null || c.optBoolean("concluido")) continue;
            try {
                long id = c.getLong("id");
                LocalDate data = LocalDate.parse(c.getString("data"));
                String hora = c.isNull("hora") ? null : c.optString("hora", null);
                String titulo = c.optString("titulo", "Compromisso");
                String local = c.isNull("local") ? "" : c.optString("local", "");
                String cat = CATEGORIAS.containsKey(c.optString("categoria")) ? CATEGORIAS.get(c.optString("categoria")) : "Outro";
                String detalhe = local.isEmpty() ? cat : local + " · " + cat;
                String quandoHora = hora == null ? "dia todo" : "às " + hora;
                String diaTxt = data.format(dia);
                if (c.optBoolean("avisarVespera"))
                    add(out, id, 0, data.minusDays(1).atTime(18, 0), "Amanhã", titulo, "Amanhã, " + quandoHora, detalhe, false, agora, limite);
                if (c.optBoolean("avisarDia"))
                    add(out, id, 1, data.atTime(7, 0), "Hoje", titulo, "Hoje, " + quandoHora, detalhe, false, agora, limite);
                if (hora != null && !c.isNull("antecedenciaMin")) {
                    int ant = c.getInt("antecedenciaMin");
                    ZonedDateTime ini = data.atTime(LocalTime.parse(hora.substring(0, 5))).atZone(ZONA);
                    if (ant > 0) {
                        String falta = ant >= 60 ? (ant / 60) + (ant >= 120 ? " horas" : " hora") : ant + " min";
                        add(out, id, 2, ini.minusMinutes(ant).toLocalDateTime(), "Daqui a " + falta, titulo, cap(diaTxt) + ", " + quandoHora, detalhe, true, agora, limite);
                    }
                    add(out, id, 3, ini.toLocalDateTime(), "Agora", titulo, cap(diaTxt) + ", " + quandoHora, detalhe, true, agora, limite);
                }
            } catch (Exception ignored) { }
        }
        return out;
    }

    private static String cap(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }

    private static void add(List<JSONObject> out, long id, int tipo, java.time.LocalDateTime quando, String rotulo, String titulo,
                            String quandoTxt, String detalhe, boolean alarme, long agora, long limite) throws Exception {
        long em = quando.atZone(ZONA).toInstant().toEpochMilli();
        if (em <= agora || em > limite) return;
        out.add(new JSONObject().put("codigo", (int) ((id * 4 + tipo) % ADIADO)).put("compromisso", id).put("tipo", tipo).put("em", em)
                .put("rotulo", rotulo).put("titulo", titulo).put("quando", quandoTxt).put("detalhe", detalhe).put("alarme", alarme));
    }

    static synchronized void reprogramar(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        cancelarTodos(ctx);
        long agora = System.currentTimeMillis();
        List<JSONObject> avisos;
        try { avisos = calcular(new JSONArray(sp.getString("comp", "[]")), agora); } catch (Exception e) { avisos = new ArrayList<>(); }
        JSONArray guardados = new JSONArray();
        Set<String> dispensados = sp.getStringSet("dispensados", new HashSet<>());
        Set<String> aindaValidos = new HashSet<>();
        for (JSONObject a : avisos) {
            String k = a.optInt("codigo") + "@" + a.optLong("em");
            if (dispensados.contains(k)) { aindaValidos.add(k); continue; }
            programar(ctx, a);
            guardados.put(a);
        }
        try {
            JSONArray adiados = new JSONArray(sp.getString("adiados", "[]")), vivos = new JSONArray();
            for (int i = 0; i < adiados.length(); i++) {
                JSONObject a = adiados.getJSONObject(i);
                if (a.optLong("em") > agora) { programar(ctx, a); guardados.put(a); vivos.put(a); }
            }
            sp.edit().putString("adiados", vivos.toString()).apply();
        } catch (Exception ignored) { }
        sp.edit().putString("programados", guardados.toString()).putStringSet("dispensados", aindaValidos).apply();
    }

    private static PendingIntent disparo(Context ctx, JSONObject a, String acao, int flags) {
        Intent i = new Intent(ctx, AlarmeReceiver.class).setAction(acao).putExtra("aviso", a.toString());
        int codigo = a.optInt("codigo") * 3 + (AlarmeReceiver.DISPARAR.equals(acao) ? 0 : AlarmeReceiver.ADIAR.equals(acao) ? 1 : 2);
        return PendingIntent.getBroadcast(ctx, codigo, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean podeExato(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    private static void programar(Context ctx, JSONObject a) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        PendingIntent pi = disparo(ctx, a, AlarmeReceiver.DISPARAR, PendingIntent.FLAG_UPDATE_CURRENT);
        long em = a.optLong("em");
        if (podeExato(ctx)) {
            PendingIntent abrir = PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(em, abrir), pi);
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, em, pi);
        }
    }

    private static void cancelarTodos(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        try {
            JSONArray p = new JSONArray(prefs(ctx).getString("programados", "[]"));
            for (int i = 0; i < p.length(); i++) {
                PendingIntent pi = disparo(ctx, p.getJSONObject(i), AlarmeReceiver.DISPARAR, PendingIntent.FLAG_NO_CREATE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            }
        } catch (Exception ignored) { }
    }

    static void criarCanais(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        Uri som = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.agenda_melodia);
        AudioAttributes alarme = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel c = new NotificationChannel(CANAL, "Alarmes dos compromissos", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Toca na hora e antes dos compromissos");
        c.setSound(som, alarme);
        c.enableVibration(true);
        c.setVibrationPattern(new long[]{0, 600, 400, 600, 400, 600});
        c.setBypassDnd(true);
        c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(c);
        NotificationChannel l = new NotificationChannel(CANAL_LEMBRETE, "Lembretes (véspera e manhã do dia)", NotificationManager.IMPORTANCE_HIGH);
        l.setSound(som, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        l.enableVibration(true);
        l.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(l);
    }

    static void mostrar(Context ctx, JSONObject a) {
        criarCanais(ctx);
        boolean alarme = a.optBoolean("alarme");
        int id = a.optInt("codigo");
        Intent tela = new Intent(ctx, AlarmeActivity.class).putExtra("aviso", a.toString())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent cheia = PendingIntent.getActivity(ctx, id, tela, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent abrir = PendingIntent.getActivity(ctx, 1, new Intent(ctx, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, alarme ? CANAL : CANAL_LEMBRETE)
                .setSmallIcon(R.drawable.ic_stat_agenda)
                .setColor(0xFF7C3AED)
                .setContentTitle(a.optString("rotulo") + ": " + a.optString("titulo"))
                .setContentText(a.optString("quando") + " · " + a.optString("detalhe"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(a.optString("quando") + "\n" + a.optString("detalhe")))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(alarme ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(alarme ? cheia : abrir)
                .setDeleteIntent(disparo(ctx, a, AlarmeReceiver.DISPENSAR, PendingIntent.FLAG_UPDATE_CURRENT))
                .addAction(0, "Adiar 10 min", disparo(ctx, a, AlarmeReceiver.ADIAR, PendingIntent.FLAG_UPDATE_CURRENT))
                .addAction(0, "Dispensar", disparo(ctx, a, AlarmeReceiver.DISPENSAR, PendingIntent.FLAG_UPDATE_CURRENT))
                .setAutoCancel(true);
        if (alarme) b.setFullScreenIntent(cheia, true).setOngoing(true);
        Notification n = b.build();
        if (alarme) n.flags |= Notification.FLAG_INSISTENT;
        try { ctx.getSystemService(NotificationManager.class).notify(id, n); } catch (SecurityException ignored) { }
    }

    static synchronized void adiar(Context ctx, JSONObject a, int minutos) {
        ctx.getSystemService(NotificationManager.class).cancel(a.optInt("codigo"));
        try {
            int base = a.optInt("codigo") % ADIADO;
            JSONObject n = new JSONObject(a.toString()).put("codigo", ADIADO + base).put("em", System.currentTimeMillis() + minutos * 60_000L).put("rotulo", "Adiado");
            SharedPreferences sp = prefs(ctx);
            JSONArray adiados = new JSONArray(sp.getString("adiados", "[]")), vivos = new JSONArray();
            for (int i = 0; i < adiados.length(); i++) if (adiados.getJSONObject(i).optInt("codigo") != n.optInt("codigo")) vivos.put(adiados.get(i));
            vivos.put(n);
            JSONArray prog = new JSONArray(sp.getString("programados", "[]"));
            prog.put(n);
            sp.edit().putString("adiados", vivos.toString()).putString("programados", prog.toString()).apply();
            programar(ctx, n);
        } catch (Exception ignored) { }
    }

    static synchronized void dispensar(Context ctx, JSONObject a) {
        ctx.getSystemService(NotificationManager.class).cancel(a.optInt("codigo"));
        SharedPreferences sp = prefs(ctx);
        Set<String> d = new HashSet<>(sp.getStringSet("dispensados", new HashSet<>()));
        d.add(a.optInt("codigo") + "@" + a.optLong("em"));
        sp.edit().putStringSet("dispensados", d).apply();
    }

    static JSONObject resumo(Context ctx) throws Exception {
        JSONArray p = new JSONArray(prefs(ctx).getString("programados", "[]"));
        long agora = System.currentTimeMillis(), prox = 0;
        int n = 0;
        for (int i = 0; i < p.length(); i++) { long em = p.getJSONObject(i).optLong("em"); if (em > agora) { n++; if (prox == 0 || em < prox) prox = em; } }
        return new JSONObject().put("agendados", n).put("proximo", prox == 0 ? JSONObject.NULL : Instant.ofEpochMilli(prox).toString())
                .put("sincronizadoEm", prefs(ctx).getLong("sincronizadoEm", 0));
    }
}
