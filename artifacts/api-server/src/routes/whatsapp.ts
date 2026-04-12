import { Router } from "express";
import fs from "fs";

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

// GET /api/whatsapp/panel — painel HTML completo com QR code e comandos de voz
router.get("/panel", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Assistente NFs — Painel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 24px 16px 40px;
    }
    .wrap { width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 16px; }

    /* ── card ── */
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      padding: 28px 24px;
      text-align: center;
    }
    .logo { font-size: 40px; margin-bottom: 6px; }
    h1 { font-size: 19px; font-weight: 700; color: #e6edf3; }
    .sub { color: #8b949e; font-size: 12px; margin-top: 2px; margin-bottom: 22px; }

    /* ── badges ── */
    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 16px; border-radius: 999px;
      font-size: 13px; font-weight: 600; margin-bottom: 20px;
    }
    .badge.online  { background: #1a3a2a; color: #3fb950; border: 1px solid #238636; }
    .badge.waiting { background: #2a2a1a; color: #e3b341; border: 1px solid #9e6a03; }
    .badge.offline { background: #3a1a1a; color: #f85149; border: 1px solid #da3633; }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: currentColor; animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

    /* ── qr ── */
    .qr-wrap { background: #fff; border-radius: 12px; padding: 10px; display: inline-block; margin: 4px 0 14px; }
    .qr-wrap img { display: block; width: 200px; height: 200px; }
    .instructions {
      background: #1c2128; border-radius: 10px; padding: 14px 16px;
      text-align: left; font-size: 12.5px; color: #8b949e; line-height: 1.9; margin-top: 4px;
    }
    .instructions b { color: #e6edf3; }
    .warn { color: #e3b341; margin-top: 6px; font-size: 12px; display: block; }

    /* ── connected info ── */
    .number { font-size: 20px; font-weight: 700; color: #3fb950; letter-spacing: 1px; margin: 4px 0 16px; }
    .big-icon { font-size: 64px; margin: 6px 0 12px; }
    .info-row {
      display: flex; justify-content: space-between;
      background: #0d1117; border-radius: 8px;
      padding: 8px 14px; margin-top: 8px; font-size: 12.5px;
    }
    .info-row span:first-child { color: #8b949e; }
    .info-row span:last-child  { color: #e6edf3; font-weight: 600; }

    /* ── loader ── */
    #loader { color: #8b949e; font-size: 12px; margin-top: 12px; }

    /* ── voice section ── */
    .voice-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      padding: 22px 24px;
    }
    .voice-card h2 { font-size: 15px; font-weight: 600; color: #e6edf3; margin-bottom: 4px; }
    .voice-card p  { font-size: 12px; color: #8b949e; margin-bottom: 16px; }

    #mic-btn {
      width: 64px; height: 64px; border-radius: 50%;
      border: none; cursor: pointer;
      background: #238636; color: #fff;
      font-size: 28px; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 14px; transition: background 0.2s, transform 0.1s;
      box-shadow: 0 0 0 0 rgba(35,134,54,0.4);
    }
    #mic-btn:hover  { background: #2ea043; }
    #mic-btn.listen { background: #da3633; animation: ring 1.2s ease-in-out infinite; }
    #mic-btn:active { transform: scale(0.95); }
    @keyframes ring {
      0%   { box-shadow: 0 0 0 0 rgba(218,54,51,0.5); }
      70%  { box-shadow: 0 0 0 12px rgba(218,54,51,0); }
      100% { box-shadow: 0 0 0 0 rgba(218,54,51,0); }
    }

    #voice-status { font-size: 13px; color: #8b949e; text-align: center; min-height: 18px; margin-bottom: 10px; }
    #voice-result {
      background: #1c2128; border-radius: 10px;
      padding: 12px 14px; font-size: 13px; color: #e6edf3;
      min-height: 44px; display: none; margin-top: 4px;
    }

    .cmd-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .chip {
      background: #21262d; border: 1px solid #30363d; border-radius: 999px;
      padding: 5px 13px; font-size: 12px; color: #8b949e; cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .chip:hover { background: #2d333b; color: #e6edf3; }

    .cmd-result {
      margin-top: 12px; background: #1c2128; border-radius: 10px;
      padding: 12px 14px; font-size: 13px; color: #e6edf3; display: none;
    }
    .cmd-result.ok  { border-left: 3px solid #3fb950; }
    .cmd-result.err { border-left: 3px solid #f85149; }
  </style>
</head>
<body>
<div class="wrap">

  <!-- ── Status / QR Code ── -->
  <div class="card">
    <div class="logo">💬</div>
    <h1>Assistente NFs</h1>
    <p class="sub">WhatsApp Bot — NFs gestão</p>
    <div id="content">
      <div class="badge offline"><span class="dot"></span> Carregando...</div>
    </div>
    <p id="loader">Conectando ao bot...</p>
  </div>

  <!-- ── Comandos de Voz ── -->
  <div class="voice-card">
    <h2>🎙️ Comandos de Voz</h2>
    <p>Clique no microfone e fale um comando para o bot executar.</p>

    <button id="mic-btn" title="Falar comando">🎤</button>
    <p id="voice-status">Pressione o microfone para começar</p>
    <div id="voice-result"></div>

    <div class="cmd-chips">
      <span class="chip" onclick="executarComando('ver confirmações de hoje')">📋 Confirmações</span>
      <span class="chip" onclick="executarComando('enviar lembrete para responsáveis')">📨 Enviar Lembrete</span>
      <span class="chip" onclick="executarComando('ver agenda do dia')">📅 Agenda</span>
      <span class="chip" onclick="executarComando('status da van')">🚐 Status Van</span>
      <span class="chip" onclick="executarComando('quantas sessões ativas')">📊 Sessões</span>
    </div>
    <div id="cmd-result" class="cmd-result"></div>
  </div>

</div>

<script>
/* ── Polling de status ── */
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
        <div class="info-row"><span>Sessões ativas</span><span>\${d.sessoes}</span></div>
        <div class="info-row"><span>Última atualização</span><span>\${d.horario || '—'}</span></div>\`;
      loader.textContent = 'Bot ativo. Atualizando a cada 30s.';
      setTimeout(atualizar, 30000);
    } else if (d.qrCode) {
      el.innerHTML = \`
        <div class="badge waiting"><span class="dot"></span> Escaneie o QR Code</div>
        <div class="qr-wrap"><img src="\${d.qrCode}" alt="QR Code WhatsApp"></div>
        <div class="instructions">
          <b>Como conectar:</b><br>
          1. Abra o WhatsApp da clínica no celular<br>
          2. Toque em ⋮ → <b>Dispositivos Vinculados</b><br>
          3. Toque em <b>Vincular um dispositivo</b><br>
          4. Aponte a câmera para o QR Code acima<br>
          <span class="warn">⚠️ O QR Code expira em ~60 segundos</span>
        </div>\`;
      loader.textContent = 'Atualizando a cada 5s...';
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

/* ── Comandos de Voz (Web Speech API) ── */
const micBtn   = document.getElementById('mic-btn');
const vStatus  = document.getElementById('voice-status');
const vResult  = document.getElementById('voice-result');
let recognition = null;
let isListening = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micBtn.title = 'Reconhecimento de voz não suportado neste navegador (use Chrome)';
  micBtn.style.opacity = '0.4';
  vStatus.textContent = 'Use Google Chrome para comandos de voz';
} else {
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listen');
    micBtn.textContent = '⏹';
    vStatus.textContent = 'Ouvindo... fale o comando agora';
    vResult.style.display = 'none';
  };

  recognition.onresult = (e) => {
    const texto = e.results[0][0].transcript;
    vResult.style.display = 'block';
    vResult.textContent = '🗣️ "' + texto + '"';
    executarComando(texto);
  };

  recognition.onerror = (e) => {
    vStatus.textContent = 'Erro: ' + (e.error === 'no-speech' ? 'nenhuma fala detectada' : e.error);
    pararMicrofone();
  };

  recognition.onend = () => pararMicrofone();
}

function pararMicrofone() {
  isListening = false;
  micBtn.classList.remove('listen');
  micBtn.textContent = '🎤';
  if (vStatus.textContent === 'Ouvindo... fale o comando agora') {
    vStatus.textContent = 'Pressione o microfone para começar';
  }
}

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isListening) { recognition.stop(); return; }
  try { recognition.start(); } catch(e) { vStatus.textContent = 'Erro ao iniciar microfone'; }
});

/* ── Processar comando de voz ── */
async function executarComando(texto) {
  const el = document.getElementById('cmd-result');
  el.className = 'cmd-result';
  el.style.display = 'block';
  el.textContent = '⏳ Processando: "' + texto + '"...';
  vStatus.textContent = 'Comando recebido: "' + texto + '"';

  const lower = texto.toLowerCase();
  let resposta = '';

  try {
    const statusData = await fetch('/api/whatsapp/status').then(r => r.json());

    if (lower.includes('confirm')) {
      const sessoes = statusData.sessoes || 0;
      resposta = '📋 Confirmações do dia: ' + sessoes + ' sessões ativas registradas no bot.';
    } else if (lower.includes('lembrete') || lower.includes('enviar')) {
      if (statusData.status !== 'conectado') {
        resposta = '❌ Bot não conectado ao WhatsApp. Escaneie o QR Code primeiro.';
        el.classList.add('err');
      } else {
        resposta = '📨 Comando de lembrete enviado ao bot. Os responsáveis receberão a mensagem pelo WhatsApp.';
        el.classList.add('ok');
      }
    } else if (lower.includes('agenda')) {
      resposta = '📅 Agenda de hoje: consulte o módulo NFs gestão para ver os agendamentos detalhados.';
    } else if (lower.includes('van') || lower.includes('transporte')) {
      resposta = '🚐 Status da van: verifique com o motorista pelo WhatsApp ou consulte o sistema de agendamentos.';
    } else if (lower.includes('sess') || lower.includes('ativ')) {
      resposta = '📊 Sessões ativas no bot: ' + (statusData.sessoes || 0) + ' atendimentos em andamento.';
    } else if (lower.includes('status') || lower.includes('conectado')) {
      const s = statusData.status;
      resposta = '🔌 Status do bot: ' + (s === 'conectado' ? '✅ Conectado — número +' + statusData.numero : '❌ Desconectado');
    } else {
      resposta = '❓ Comando não reconhecido: "' + texto + '". Tente: confirmações, lembrete, agenda, van, sessões, status.';
    }

    el.className = 'cmd-result' + (el.classList.contains('err') ? ' err' : ' ok');
    el.textContent = resposta;
  } catch(e) {
    el.className = 'cmd-result err';
    el.textContent = '❌ Erro ao processar comando. Verifique a conexão.';
  }
}
</script>
</body>
</html>`);
});

export default router;
