import { Router } from "express";
import fs from "fs";

const router = Router();

const STATUS_FILE    = "/tmp/whatsapp_bot_status.json";
const ACTIVITY_FILE  = "/tmp/bot_activity.json";
const ATESTADOS_FILE = "/tmp/atestados.json";
const BOT_URL        = "http://localhost:3001";

function lerStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {}
  return { status: "offline", qrCode: null, numero: null, sessoes: 0, horario: null };
}

function lerAtividade() {
  try {
    if (fs.existsSync(ACTIVITY_FILE)) return JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8"));
  } catch {}
  return [];
}

router.get("/status", (req, res) => res.json(lerStatus()));
router.get("/activity", (req, res) => res.json(lerAtividade()));

router.post("/logout", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/logout`, { method: "POST" });
    const d = await r.json();
    res.json(d);
  } catch (err: any) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post("/voice-chat", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/voice-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: "Bot indisponível", detail: err.message });
  }
});

router.post("/cancel-notify", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/cancel-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get("/atestados", (req, res) => {
  try {
    if (!fs.existsSync(ATESTADOS_FILE)) return res.json([]);
    const lista = JSON.parse(fs.readFileSync(ATESTADOS_FILE, "utf8"));
    res.json(lista.filter((a: any) => !a.processado));
  } catch { res.json([]); }
});

const CONTATOS_FILE = "/tmp/contatos_nfs.json";

router.get("/contatos", (req, res) => {
  try {
    if (!fs.existsSync(CONTATOS_FILE)) return res.json([]);
    const dados: Record<string, any> = JSON.parse(fs.readFileSync(CONTATOS_FILE, "utf8"));
    const lista = Object.entries(dados).map(([telefone, info]) => ({ telefone, ...(info as object) }));
    lista.sort((a: any, b: any) => {
      const aK = !!a.paciente, bK = !!b.paciente;
      if (aK !== bK) return bK ? 1 : -1;
      return (a.label || "").localeCompare(b.label || "");
    });
    res.json(lista);
  } catch { res.json([]); }
});

router.post("/identificar-contato", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/identificar-contato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.post("/migrar-contatos", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/migrar-contatos`, { method: "POST" });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.post("/dispensar-contato", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/dispensar-contato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    // fallback: update file directly if bot offline
    try {
      if (fs.existsSync(CONTATOS_FILE)) {
        const dados = JSON.parse(fs.readFileSync(CONTATOS_FILE, "utf8"));
        const num = (req.body.telefone || "").replace(/\D/g, "");
        if (dados[num]) { dados[num].dispensado = true; fs.writeFileSync(CONTATOS_FILE, JSON.stringify(dados, null, 2)); }
      }
      res.json({ ok: true });
    } catch { res.status(502).json({ ok: false, error: err.message }); }
  }
});

router.post("/abonar-notify", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL}/abonar-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get("/panel", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Bot — NFs gestão</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ── AURORA BG ── */
body{
  font-family:'Segoe UI',system-ui,sans-serif;
  background:#070a12;
  color:#e2eaf8;
  min-height:100vh;
  overflow-x:hidden;
  position:relative;
}
.aurora{
  position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;
}
.blob{
  position:absolute;border-radius:50%;filter:blur(80px);opacity:.18;
  animation:drift 18s ease-in-out infinite alternate;
}
.blob1{width:600px;height:600px;background:radial-gradient(circle,#7c3aed,transparent 70%);top:-20%;left:-15%;animation-delay:0s}
.blob2{width:500px;height:500px;background:radial-gradient(circle,#06b6d4,transparent 70%);top:30%;right:-10%;animation-delay:-6s}
.blob3{width:400px;height:400px;background:radial-gradient(circle,#10b981,transparent 70%);bottom:-10%;left:20%;animation-delay:-12s}
.blob4{width:350px;height:350px;background:radial-gradient(circle,#f59e0b,transparent 70%);top:60%;right:30%;animation-delay:-4s;opacity:.09}
@keyframes drift{
  0%{transform:translate(0,0) scale(1)}
  100%{transform:translate(40px,60px) scale(1.12)}
}

/* ── LAYOUT ── */
.page{
  position:relative;z-index:1;
  display:flex;flex-direction:column;align-items:center;
  padding:28px 14px 60px;gap:18px;
  max-width:480px;margin:0 auto;
}

/* ── GLASS CARD ── */
.glass{
  width:100%;
  background:rgba(255,255,255,.04);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  border:1px solid rgba(255,255,255,.09);
  border-radius:24px;
  box-shadow:
    0 4px 24px rgba(0,0,0,.4),
    0 1px 0 rgba(255,255,255,.06) inset,
    0 -1px 0 rgba(0,0,0,.3) inset;
  position:relative;
  overflow:hidden;
  padding:24px;
}
.glass::before{
  content:'';position:absolute;inset:0;border-radius:24px;
  background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 60%);
  pointer-events:none;
}

/* ── HERO ── */
.hero{text-align:center;padding:32px 20px 28px}

/* Avatar orbital ring */
.avatar-wrap{
  position:relative;width:120px;height:120px;margin:0 auto 20px;
}
.avatar-ring{
  position:absolute;inset:-8px;border-radius:50%;
  background:conic-gradient(from 0deg,#7c3aed,#06b6d4,#10b981,#f59e0b,#7c3aed);
  animation:spin-ring 4s linear infinite;
  filter:blur(2px);
}
@keyframes spin-ring{to{transform:rotate(360deg)}}
.avatar-ring-inner{
  position:absolute;inset:3px;border-radius:50%;
  background:#070a12;
}
.avatar-emoji{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:58px;
  filter:drop-shadow(0 0 16px rgba(124,58,237,.6));
}

.hero-name{
  font-size:26px;font-weight:800;letter-spacing:.5px;
  background:linear-gradient(135deg,#a78bfa,#67e8f9,#6ee7b7);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  margin-bottom:4px;
}
.hero-sub{font-size:13px;color:rgba(255,255,255,.35);letter-spacing:.3px}

/* Status pill */
.status-pill{
  display:inline-flex;align-items:center;gap:8px;
  padding:7px 18px;border-radius:999px;
  font-size:12.5px;font-weight:600;margin-top:16px;
  transition:all .4s;
}
.status-pill.on {background:rgba(16,185,129,.12);color:#6ee7b7;border:1px solid rgba(16,185,129,.25);box-shadow:0 0 20px rgba(16,185,129,.15)}
.status-pill.qr {background:rgba(245,158,11,.1);color:#fcd34d;border:1px solid rgba(245,158,11,.2);box-shadow:0 0 20px rgba(245,158,11,.12)}
.status-pill.off{background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
.pulse-dot{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse-anim 1.6s ease-in-out infinite}
@keyframes pulse-anim{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}

/* QR section */
.qr-container{text-align:center;padding:10px 0}
.qr-frame{
  display:inline-block;padding:10px;border-radius:16px;
  background:white;
  box-shadow:0 0 40px rgba(124,58,237,.3),0 0 80px rgba(6,182,212,.15);
  margin:8px 0 16px;
}
.qr-frame img{display:block;width:190px;height:190px;border-radius:6px}
.qr-steps{
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
  border-radius:14px;padding:14px 16px;text-align:left;
  font-size:12.5px;color:rgba(255,255,255,.4);line-height:2.1;
}
.qr-steps b{color:rgba(255,255,255,.75)}
.qr-warn{
  color:#fcd34d;font-size:11.5px;margin-top:8px;display:block;
  text-shadow:0 0 8px rgba(252,211,77,.4);
}

/* Connected card body */
.conn-number{
  font-size:22px;font-weight:700;letter-spacing:3px;
  background:linear-gradient(90deg,#6ee7b7,#34d399);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  margin:6px 0 16px;text-shadow:none;
}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.info-box{
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
  border-radius:12px;padding:10px 14px;
}
.info-box .label{font-size:10.5px;color:rgba(255,255,255,.3);margin-bottom:3px}
.info-box .value{font-size:15px;font-weight:700;color:rgba(255,255,255,.85)}

/* ── CHAT SECTION ── */
.chat-header{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:16px;
}
.chat-title{font-size:15px;font-weight:700;color:rgba(255,255,255,.85)}
.chat-sub{font-size:11px;color:rgba(255,255,255,.3);margin-top:2px}
.tts-btn{
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
  border-radius:999px;padding:4px 12px;cursor:pointer;
  font-size:11px;color:rgba(255,255,255,.4);transition:all .2s;
}
.tts-btn:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7)}

/* Response bubbles */
.bubble{
  border-radius:16px;padding:14px 16px;font-size:13.5px;line-height:1.6;
  display:none;margin-bottom:12px;
  animation:fadeSlide .3s ease;
}
@keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.bubble.user{
  background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.2);
  color:rgba(255,255,255,.5);font-size:12px;
  border-bottom-left-radius:4px;
}
.bubble.carla{
  background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.15);
  color:rgba(255,255,255,.9);
  border-bottom-left-radius:4px;
  box-shadow:0 0 30px rgba(6,182,212,.08);
}
.loading-dots{
  display:none;padding:12px 0;text-align:center;
  color:rgba(6,182,212,.7);font-size:13px;
}
.dot-wave span{
  display:inline-block;width:6px;height:6px;border-radius:50%;
  background:currentColor;margin:0 2px;
  animation:wave .9s ease-in-out infinite;
}
.dot-wave span:nth-child(2){animation-delay:.15s}
.dot-wave span:nth-child(3){animation-delay:.3s}
@keyframes wave{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}

/* Input row */
.input-row{
  display:flex;gap:8px;margin-bottom:14px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.09);
  border-radius:14px;padding:6px 6px 6px 14px;
  transition:border-color .2s,box-shadow .2s;
}
.input-row:focus-within{
  border-color:rgba(124,58,237,.5);
  box-shadow:0 0 0 3px rgba(124,58,237,.1),0 0 20px rgba(124,58,237,.1);
}
.input-row input{
  flex:1;background:transparent;border:none;outline:none;
  color:rgba(255,255,255,.9);font-size:13.5px;padding:6px 0;
}
.input-row input::placeholder{color:rgba(255,255,255,.2)}
.send-btn{
  width:38px;height:38px;border-radius:10px;border:none;cursor:pointer;
  background:linear-gradient(135deg,#7c3aed,#6d28d9);
  color:white;font-size:16px;display:flex;align-items:center;justify-content:center;
  transition:all .2s;box-shadow:0 4px 12px rgba(124,58,237,.4);
  flex-shrink:0;
}
.send-btn:hover{background:linear-gradient(135deg,#8b5cf6,#7c3aed);transform:translateY(-1px);box-shadow:0 6px 16px rgba(124,58,237,.5)}
.send-btn:active{transform:translateY(0)}
.mic-btn{
  width:38px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.1);cursor:pointer;
  background:rgba(255,255,255,.05);
  color:rgba(255,255,255,.5);font-size:16px;display:flex;align-items:center;justify-content:center;
  transition:all .2s;flex-shrink:0;
}
.mic-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.8)}
.mic-btn.listening{
  background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);
  color:#fca5a5;animation:mic-pulse 1s ease-in-out infinite;
}
@keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}

/* Chips */
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}
.chip{
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);
  border-radius:999px;padding:6px 14px;
  font-size:11.5px;color:rgba(255,255,255,.4);
  cursor:pointer;transition:all .2s;white-space:nowrap;
}
.chip:hover{
  background:rgba(124,58,237,.15);
  border-color:rgba(124,58,237,.35);
  color:rgba(167,139,250,.9);
  box-shadow:0 0 12px rgba(124,58,237,.15);
  transform:translateY(-1px);
}
.va-status{font-size:11px;color:rgba(255,255,255,.25);text-align:center;min-height:16px;margin-top:4px}

.iframe-warn{
  background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);
  border-radius:12px;padding:12px 14px;text-align:center;display:none;margin-bottom:10px;
}
.iframe-warn a{
  color:#fcd34d;font-size:12.5px;font-weight:600;text-decoration:none;
}

/* ── LOG TERMINAL ── */
.terminal{
  width:100%;background:#030507;
  border:1px solid rgba(0,212,255,.12);border-radius:20px;overflow:hidden;
  box-shadow:0 0 40px rgba(0,212,255,.05),0 4px 24px rgba(0,0,0,.5);
}
.term-bar{
  background:rgba(255,255,255,.03);
  padding:10px 16px;display:flex;align-items:center;gap:7px;
  border-bottom:1px solid rgba(0,212,255,.08);
}
.tdot{width:9px;height:9px;border-radius:50%}
.tdot.r{background:#ff5f57}.tdot.y{background:#febc2e}.tdot.g{background:#28c840}
.term-title{
  font-family:'Courier New',monospace;font-size:10.5px;
  color:rgba(0,212,255,.35);letter-spacing:1px;margin-left:6px;
}
.live-dot{
  width:6px;height:6px;border-radius:50%;background:#28c840;margin-left:auto;
  box-shadow:0 0 6px #28c840;animation:pulse-anim 1.2s ease-in-out infinite;
}
.term-body{
  font-family:'Courier New',monospace;font-size:11.5px;
  padding:12px 16px;max-height:200px;overflow-y:auto;
  display:flex;flex-direction:column;gap:5px;
}
.term-body::-webkit-scrollbar{width:3px}
.term-body::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2);border-radius:2px}
.log-row{display:flex;gap:10px;animation:fadeSlide .25s ease}
.log-ts{color:rgba(0,212,255,.3);min-width:56px;flex-shrink:0}
.log-txt{color:#00ff88;word-break:break-word;text-shadow:0 0 8px rgba(0,255,136,.25)}
.log-txt.erro{color:#ff6b6b;text-shadow:0 0 8px rgba(255,107,107,.2)}
.log-txt.aviso{color:#fcd34d;text-shadow:0 0 8px rgba(252,211,77,.2)}
.log-txt.voz{color:#67e8f9;text-shadow:0 0 8px rgba(103,232,249,.2)}
.term-empty{color:rgba(0,212,255,.15);font-size:11px;padding:14px 0;text-align:center}
</style>
</head>
<body>

<!-- Aurora background -->
<div class="aurora">
  <div class="blob blob1"></div>
  <div class="blob blob2"></div>
  <div class="blob blob3"></div>
  <div class="blob blob4"></div>
</div>

<div class="page">

  <!-- ── HERO ── -->
  <div class="glass hero">
    <div class="avatar-wrap">
      <div class="avatar-ring"></div>
      <div class="avatar-ring-inner"></div>
      <div class="avatar-emoji">👩‍💼</div>
    </div>
    <div class="hero-name">WhatsApp Bot</div>
    <div class="hero-sub">NFs gestão · Assistente de Recepção</div>

    <!-- Status dinâmico -->
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap">
      <div id="status-pill" class="status-pill off"><span class="pulse-dot"></span> Carregando...</div>
      <button id="btn-logout" onclick="fazerLogout()" style="display:none;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#fca5a5;border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer;transition:all .2s" onmouseover="this.style.background='rgba(239,68,68,.3)'" onmouseout="this.style.background='rgba(239,68,68,.15)'">🔌 Desconectar</button>
    </div>
    <div id="status-body" style="margin-top:14px"></div>
    <p id="status-loader" style="font-size:11px;color:rgba(255,255,255,.2);margin-top:8px">Conectando...</p>
  </div>

  <!-- ── TERMINAL LOG ── -->
  <div class="terminal">
    <div class="term-bar">
      <div class="tdot r"></div><div class="tdot y"></div><div class="tdot g"></div>
      <span class="term-title">CARLA · LOG EM TEMPO REAL</span>
      <div class="live-dot" title="Ao vivo"></div>
    </div>
    <div class="term-body" id="log-body">
      <div class="term-empty">Aguardando atividades...</div>
    </div>
  </div>

</div>

<script>
/* ── Status polling ── */
async function pollStatus(){
  try{
    var d=await fetch('/api/whatsapp/status').then(function(r){return r.json()});
    var pill=document.getElementById('status-pill');
    var body=document.getElementById('status-body');
    var loader=document.getElementById('status-loader');
    var btnLogout=document.getElementById('btn-logout');
    if(d.status==='conectado'){
      pill.className='status-pill on';pill.innerHTML='<span class="pulse-dot"></span> WhatsApp Conectado ✅';
      body.innerHTML='<div class="conn-number">+'+( d.numero||'')+'</div><div class="info-grid"><div class="info-box"><div class="label">Sessões ativas</div><div class="value">'+(d.sessoes||0)+'</div></div><div class="info-box"><div class="label">Última sync</div><div class="value" style="font-size:12px">'+(d.horario||'—')+'</div></div></div>';
      loader.textContent='Bot ativo';
      if(btnLogout)btnLogout.style.display='inline-flex';
      setTimeout(pollStatus,30000);
    }else if(d.qrCode){
      pill.className='status-pill qr';pill.innerHTML='<span class="pulse-dot"></span> Escanear QR Code';
      body.innerHTML='<div class="qr-container"><div class="qr-frame"><img src="'+d.qrCode+'" alt="QR Code"></div><div class="qr-steps"><b>Como conectar:</b><br>1. Abra o WhatsApp da unidade<br>2. Toque em ⋮ → <b>Dispositivos Vinculados</b><br>3. Toque em <b>Vincular um dispositivo</b><br>4. Aponte a câmera para o QR Code<br><span class="qr-warn">⚠️ Expira em ~60s — atualizando automaticamente</span></div></div>';
      loader.textContent='Aguardando leitura...';
      if(btnLogout)btnLogout.style.display='none';
      setTimeout(pollStatus,5000);
    }else{
      pill.className='status-pill off';pill.innerHTML='<span class="pulse-dot"></span> Aguardando bot...';
      body.innerHTML='<p style="color:rgba(255,255,255,.25);font-size:13px;margin-top:8px">O QR Code aparecerá em instantes...</p>';
      loader.textContent='';
      if(btnLogout)btnLogout.style.display='none';
      setTimeout(pollStatus,4000);
    }
  }catch(e){document.getElementById('status-loader').textContent='Erro — tentando reconectar...';setTimeout(pollStatus,5000);}
}
pollStatus();

/* ── Logout ── */
async function fazerLogout(){
  var btn=document.getElementById('btn-logout');
  if(!confirm('Desconectar o telefone da Carla?\\n\\nO bot vai parar de responder e um novo QR Code será gerado para reconectar.'))return;
  if(btn)btn.textContent='⏳ Desconectando...';
  try{
    var r=await fetch('/api/whatsapp/logout',{method:'POST'});
    var d=await r.json();
    if(d.ok){
      if(btn){btn.style.display='none';}
      document.getElementById('status-pill').className='status-pill off';
      document.getElementById('status-pill').innerHTML='<span class="pulse-dot"></span> Desconectado';
      document.getElementById('status-body').innerHTML='<p style="color:rgba(255,255,255,.35);font-size:13px;margin-top:8px">Sessão encerrada — novo QR Code aparecerá em instantes...</p>';
      setTimeout(pollStatus,3000);
    }else{
      alert('Erro ao desconectar: '+(d.erro||'tente novamente'));
      if(btn)btn.textContent='🔌 Desconectar';
    }
  }catch(e){
    alert('Erro de comunicação. Tente novamente.');
    if(btn)btn.textContent='🔌 Desconectar';
  }
}

/* ── Log polling ── */
async function pollLog(){
  try{
    var lista=await fetch('/api/whatsapp/activity').then(function(r){return r.json()});
    var body=document.getElementById('log-body');
    if(!lista||!lista.length){body.innerHTML='<div class="term-empty">Aguardando atividades...</div>';return;}
    var html='';
    lista.forEach(function(e){
      var cls='log-txt';
      if(e.tipo==='erro')cls+=' erro';
      else if(e.tipo==='aviso')cls+=' aviso';
      html+='<div class="log-row"><span class="log-ts">['+esc(e.t)+']</span><span class="'+cls+'">'+esc(e.m)+'</span></div>';
    });
    body.innerHTML=html;body.scrollTop=0;
  }catch(e){}
  setTimeout(pollLog,3000);
}
pollLog();
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script>
</body>
</html>`);
});

export default router;
