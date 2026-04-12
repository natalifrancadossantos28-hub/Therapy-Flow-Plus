import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const STATUS_FILE = "/tmp/whatsapp_bot_status.json";

function lerStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    }
  } catch {}
  return { status: "offline", qrCode: null, numero: null, sessoes: 0, horario: null };
}

// GET /api/whatsapp/status — retorna JSON com status e QR code
router.get("/status", (req, res) => {
  res.json(lerStatus());
});

// GET /api/whatsapp/panel — painel HTML completo com QR code
router.get("/panel", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Assistente NFS — WhatsApp</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 36px 32px; max-width: 440px; width: 100%; text-align: center; }
    .logo { font-size: 48px; margin-bottom: 8px; }
    h1 { font-size: 20px; font-weight: 700; color: #e6edf3; margin-bottom: 2px; }
    .sub { color: #8b949e; font-size: 13px; margin-bottom: 28px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 7px 18px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .badge.online  { background: #1a3a2a; color: #3fb950; border: 1px solid #238636; }
    .badge.waiting { background: #2a2a1a; color: #e3b341; border: 1px solid #9e6a03; }
    .badge.offline { background: #3a1a1a; color: #f85149; border: 1px solid #da3633; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.3} }
    .qr-wrap { background: #fff; border-radius: 12px; padding: 10px; display: inline-block; margin: 8px 0 16px; }
    .qr-wrap img { display: block; width: 210px; height: 210px; }
    .instructions { background: #1c2128; border-radius: 10px; padding: 14px 16px; text-align: left; font-size: 12.5px; color: #8b949e; line-height: 1.9; margin-top: 4px; }
    .instructions b { color: #e6edf3; }
    .warn { color: #e3b341; margin-top: 6px; font-size: 12px; }
    .number { font-size: 22px; font-weight: 700; color: #3fb950; letter-spacing: 1px; margin: 6px 0 18px; }
    .big-icon { font-size: 72px; margin: 8px 0 16px; }
    .info { display: flex; justify-content: space-between; background: #0d1117; border-radius: 8px; padding: 9px 14px; margin-top: 10px; font-size: 12.5px; }
    .info span:first-child { color: #8b949e; }
    .info span:last-child  { color: #e6edf3; font-weight: 600; }
    #loader { color: #8b949e; font-size: 13px; margin-top: 16px; }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🌈</div>
  <h1>Assistente NFS</h1>
  <p class="sub">Clínica Arco-Íris — WhatsApp Bot</p>
  <div id="content">
    <div class="badge offline"><span class="dot"></span> Carregando...</div>
  </div>
  <p id="loader">Conectando ao bot... atualizando automaticamente.</p>
</div>

<script>
  async function atualizar() {
    try {
      const r = await fetch('/api/whatsapp/status');
      const d = await r.json();
      const el = document.getElementById('content');
      const loader = document.getElementById('loader');

      if (d.status === 'conectado') {
        el.innerHTML = \`
          <div class="badge online"><span class="dot"></span> WhatsApp Conectado ✅</div>
          <div class="big-icon">📱</div>
          <div class="number">+\${d.numero || '...'}</div>
          <div class="info"><span>Sessões ativas</span><span>\${d.sessoes}</span></div>
          <div class="info"><span>Última atualização</span><span>\${d.horario || '—'}</span></div>\`;
        loader.textContent = 'Bot ativo. Página atualiza a cada 30s.';
        setTimeout(atualizar, 30000);

      } else if (d.qrCode) {
        el.innerHTML = \`
          <div class="badge waiting"><span class="dot"></span> Escaneie o QR Code</div>
          <div class="qr-wrap"><img src="\${d.qrCode}" alt="QR Code WhatsApp"></div>
          <div class="instructions">
            <b>Como conectar:</b><br>
            1. Abra o WhatsApp da clínica<br>
            2. Toque em ⋮ → <b>Dispositivos Vinculados</b><br>
            3. Toque em <b>Vincular um dispositivo</b><br>
            4. Aponte a câmera para o QR Code acima<br>
            <p class="warn">⚠️ O QR Code expira em ~60 segundos</p>
          </div>\`;
        loader.textContent = 'Atualizando automaticamente a cada 5s...';
        setTimeout(atualizar, 5000);

      } else {
        el.innerHTML = \`
          <div class="badge offline"><span class="dot"></span> Bot Aguardando...</div>
          <div class="big-icon">⏳</div>
          <p style="color:#8b949e;font-size:14px">O bot está iniciando.<br>O QR Code aparecerá em instantes.</p>\`;
        loader.textContent = 'Atualizando a cada 4s...';
        setTimeout(atualizar, 4000);
      }
    } catch(e) {
      document.getElementById('loader').textContent = 'Erro ao conectar ao bot. Tentando novamente...';
      setTimeout(atualizar, 5000);
    }
  }
  atualizar();
</script>
</body>
</html>`);
});

export default router;
