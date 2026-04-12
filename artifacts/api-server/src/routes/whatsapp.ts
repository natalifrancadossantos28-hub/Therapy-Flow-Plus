import { Router } from "express";
import fs from "fs";

const router = Router();

const STATUS_FILE   = "/tmp/whatsapp_bot_status.json";
const ACTIVITY_FILE = "/tmp/bot_activity.json";
const BOT_URL       = "http://localhost:3001";

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

// Proxy: voice-chat → bot:3001/voice-chat
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

// GET /api/whatsapp/panel — painel de controle com voz + log neon
router.get("/panel", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Assistente NFS — Painel de Controle</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#050a0e;
  --surface:#0d1520;
  --border:#1a2a3a;
  --green:#00ff88;
  --cyan:#00d4ff;
  --yellow:#ffcc00;
  --red:#ff4455;
  --text:#c8e0f0;
  --dim:#4a6278;
}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px 12px 40px}
.wrap{width:100%;max-width:480px;display:flex;flex-direction:column;gap:14px}

/* ── header ── */
.header{text-align:center;padding:20px 0 6px}
.header .logo{font-size:44px;filter:drop-shadow(0 0 12px #00d4ff88)}
.header h1{font-size:20px;font-weight:700;letter-spacing:1px;color:var(--cyan);text-shadow:0 0 12px #00d4ff66}
.header p{font-size:12px;color:var(--dim);margin-top:3px}

/* ── card ── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px}

/* ── status badge ── */
.badge{display:inline-flex;align-items:center;gap:8px;padding:5px 15px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:14px}
.badge.on {background:#001a0f;color:var(--green);border:1px solid #00884455;text-shadow:0 0 6px #00ff8877}
.badge.qr {background:#1a1500;color:var(--yellow);border:1px solid #88660044}
.badge.off{background:#1a0008;color:var(--red);border:1px solid #88002244}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

/* ── connection info ── */
.num{font-size:22px;font-weight:700;color:var(--green);letter-spacing:2px;text-shadow:0 0 10px #00ff8866;margin:6px 0 14px}
.info-row{display:flex;justify-content:space-between;padding:7px 12px;background:var(--bg);border-radius:8px;margin-top:6px;font-size:12px}
.info-row span:first-child{color:var(--dim)}
.info-row span:last-child{color:var(--text);font-weight:600}

/* ── qr ── */
.qr-box{background:#fff;border-radius:10px;padding:8px;display:inline-block;margin:4px 0 12px}
.qr-box img{display:block;width:200px;height:200px}
.qr-steps{background:var(--bg);border-radius:10px;padding:12px 14px;text-align:left;font-size:12px;color:var(--dim);line-height:2}
.qr-steps b{color:var(--text)}
.qr-warn{color:var(--yellow);margin-top:6px;font-size:11px;display:block}

/* ── voice assistant ── */
.va-wrap{text-align:center}
.va-circle{
  width:80px;height:80px;border-radius:50%;border:none;cursor:pointer;
  background:linear-gradient(135deg,#003322,#00552e);
  color:var(--green);font-size:32px;
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 12px;
  transition:all .2s;
  box-shadow:0 0 0 0 rgba(0,255,136,.4),inset 0 1px 0 rgba(255,255,255,.05);
}
.va-circle:hover{background:linear-gradient(135deg,#004433,#006635);transform:scale(1.04)}
.va-circle.listen{
  background:linear-gradient(135deg,#330011,#660022);
  color:var(--red);
  animation:ring-red 1.2s ease-in-out infinite;
}
.va-circle.thinking{
  background:linear-gradient(135deg,#001833,#003366);
  color:var(--cyan);
  animation:ring-cyan 1.4s ease-in-out infinite;
}
.va-circle.speaking{
  background:linear-gradient(135deg,#002233,#004455);
  color:var(--cyan);
  animation:ring-cyan .8s ease-in-out infinite;
}
@keyframes ring-red{0%{box-shadow:0 0 0 0 rgba(255,68,85,.5)}70%{box-shadow:0 0 0 16px rgba(255,68,85,0)}100%{box-shadow:0 0 0 0 rgba(255,68,85,0)}}
@keyframes ring-cyan{0%{box-shadow:0 0 0 0 rgba(0,212,255,.5)}70%{box-shadow:0 0 0 16px rgba(0,212,255,0)}100%{box-shadow:0 0 0 0 rgba(0,212,255,0)}}

.va-status{font-size:13px;color:var(--dim);min-height:18px;margin-bottom:10px;transition:color .3s}
.va-status.active{color:var(--cyan);text-shadow:0 0 8px #00d4ff66}

.va-bubble{
  background:var(--bg);border:1px solid var(--border);border-radius:12px;
  padding:14px 16px;font-size:13.5px;color:var(--text);
  min-height:50px;text-align:left;line-height:1.6;display:none;
  margin-top:6px;border-left:3px solid var(--cyan);
}
.va-bubble.user{border-left-color:var(--dim);color:var(--dim);font-size:12px;margin-top:8px}

.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;justify-content:center}
.chip{
  background:var(--bg);border:1px solid var(--border);border-radius:999px;
  padding:5px 13px;font-size:11.5px;color:var(--dim);cursor:pointer;transition:all .15s
}
.chip:hover{background:var(--surface);color:var(--cyan);border-color:var(--cyan);text-shadow:0 0 6px #00d4ff44}

/* ── neon log ── */
.log-terminal{
  background:#020508;border:1px solid #0a1e2e;border-radius:12px;
  font-family:'Courier New',monospace;font-size:11.5px;
  overflow:hidden;
}
.log-header{
  background:#050d14;padding:8px 14px;display:flex;align-items:center;gap:8px;
  border-bottom:1px solid #0a1e2e;
}
.log-dot{width:8px;height:8px;border-radius:50%}
.log-dot.r{background:#ff4455}
.log-dot.y{background:#ffcc00}
.log-dot.g{background:#00ff88}
.log-title{color:#3a5a6e;font-size:11px;margin-left:4px;letter-spacing:.5px}
.log-live{width:6px;height:6px;border-radius:50%;background:var(--green);margin-left:auto;animation:pulse 1s ease-in-out infinite}
.log-body{padding:10px 14px;max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.log-body::-webkit-scrollbar{width:4px}
.log-body::-webkit-scrollbar-track{background:transparent}
.log-body::-webkit-scrollbar-thumb{background:#1a3a4a;border-radius:2px}
.log-entry{display:flex;gap:8px;opacity:.9}
.log-time{color:#1a5a6e;min-width:54px;flex-shrink:0}
.log-msg{color:#00ff88;word-break:break-word}
.log-msg.erro{color:var(--red)}
.log-msg.aviso{color:var(--yellow)}
.log-msg.voz{color:var(--cyan)}
.log-empty{color:#1a3a4e;font-size:11px;padding:10px 0;text-align:center}

/* ── iframe warn ── */
.warn-box{text-align:center;padding:6px 0}
.warn-box a{
  display:inline-block;background:linear-gradient(135deg,#003322,#00552e);
  color:var(--green);padding:10px 22px;border-radius:8px;
  text-decoration:none;font-weight:600;font-size:13px;
  border:1px solid #00884455;
  box-shadow:0 0 12px #00ff8822;
}
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div class="logo">🤖</div>
    <h1>ASSISTENTE NFS</h1>
    <p>Painel de Controle — Recepção Virtual</p>
  </div>

  <!-- STATUS -->
  <div class="card" id="status-card" style="text-align:center">
    <div id="status-badge" class="badge off"><span class="dot"></span> Carregando...</div>
    <div id="status-body"></div>
    <p id="status-loader" style="font-size:11px;color:var(--dim);margin-top:8px">Conectando...</p>
  </div>

  <!-- ASSISTENTE DE VOZ -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--cyan)">🎙️ Assistente de Voz</div>
        <div style="font-size:11px;color:var(--dim);margin-top:2px">Fale e a IA responde em voz alta</div>
      </div>
      <div id="tts-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="toggleTTS()">
        <span style="font-size:11px;color:var(--dim)" id="tts-label">🔊 Voz ON</span>
      </div>
    </div>

    <div id="iframe-warn" class="warn-box" style="display:none;margin-bottom:14px">
      <a id="open-link" href="#">🔗 Abrir em Nova Aba para usar o Microfone</a>
      <p style="font-size:10px;color:var(--dim);margin-top:8px">Os atalhos abaixo funcionam normalmente</p>
    </div>

    <div class="va-wrap">
      <button class="va-circle" id="mic-btn" title="Falar com a IA">🎤</button>
      <p class="va-status" id="va-status">Pressione para falar</p>
      <div class="va-bubble" id="va-user"></div>
      <div class="va-bubble" id="va-response"></div>
    </div>

    <div class="chips">
      <span class="chip" onclick="perguntarIA('Quem faltou hoje?')">Quem faltou?</span>
      <span class="chip" onclick="perguntarIA('Quantas consultas temos hoje?')">Agenda de hoje</span>
      <span class="chip" onclick="perguntarIA('Qual é o próximo paciente da van?')">Próximo da van</span>
      <span class="chip" onclick="perguntarIA('Quantas confirmações recebemos?')">Confirmações</span>
      <span class="chip" onclick="perguntarIA('Algum paciente ainda não confirmou?')">Pendentes</span>
    </div>
  </div>

  <!-- LOG NEON -->
  <div class="log-terminal">
    <div class="log-header">
      <div class="log-dot r"></div>
      <div class="log-dot y"></div>
      <div class="log-dot g"></div>
      <span class="log-title">ASSISTENTE NFS — LOG DE ATIVIDADES</span>
      <div class="log-live" title="Atualizando ao vivo"></div>
    </div>
    <div class="log-body" id="log-body">
      <div class="log-empty">Aguardando atividades...</div>
    </div>
  </div>

</div>

<script>
/* ─── iframe detection ─── */
(function(){
  var inIframe=false;
  try{inIframe=window.self!==window.top}catch(e){inIframe=true}
  if(inIframe){
    document.getElementById('iframe-warn').style.display='block';
    var link=window.location.protocol+'//'+window.location.hostname+'/api/whatsapp/panel';
    document.getElementById('open-link').href=link;
  }
})();

/* ─── TTS ─── */
var ttsAtivo = true;
function toggleTTS(){
  ttsAtivo=!ttsAtivo;
  document.getElementById('tts-label').textContent=ttsAtivo?'🔊 Voz ON':'🔇 Voz OFF';
  if(!ttsAtivo) speechSynthesis.cancel();
}
function falar(texto){
  if(!ttsAtivo||!window.speechSynthesis)return;
  speechSynthesis.cancel();
  var utter=new SpeechSynthesisUtterance(texto);
  utter.lang='pt-BR';
  utter.rate=1.05;
  utter.pitch=1.0;
  utter.volume=1;
  // Priorizar voz feminina em português
  var vozes=speechSynthesis.getVoices();
  var ptVoz=vozes.find(v=>(v.lang==='pt-BR'||v.lang==='pt_BR')&&v.name.toLowerCase().includes('female'));
  if(!ptVoz) ptVoz=vozes.find(v=>v.lang==='pt-BR'||v.lang==='pt_BR');
  if(ptVoz) utter.voice=ptVoz;
  setEstado('speaking','🔊 Falando...');
  utter.onend=function(){setEstado('idle','Pressione para falar')};
  speechSynthesis.speak(utter);
}
// Carregar vozes (async no Chrome)
if(window.speechSynthesis){
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged=function(){speechSynthesis.getVoices()};
}

/* ─── STT ─── */
var recognition=null;
var SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
var estado='idle'; // idle | listen | thinking | speaking

function setEstado(s, msg){
  estado=s;
  var btn=document.getElementById('mic-btn');
  var st=document.getElementById('va-status');
  btn.className='va-circle';
  if(s==='listen')  {btn.classList.add('listen');  btn.textContent='⏹'; st.className='va-status active'; st.textContent=msg||'🎙️ Ouvindo...';}
  else if(s==='thinking'){btn.classList.add('thinking');btn.textContent='⏳'; st.className='va-status active'; st.textContent=msg||'🤔 Processando...';}
  else if(s==='speaking'){btn.classList.add('speaking');btn.textContent='🔊'; st.className='va-status active'; st.textContent=msg||'🔊 Falando...';}
  else {btn.textContent='🎤'; st.className='va-status'; st.textContent=msg||'Pressione para falar';}
}

function mostrarBolha(tipo, texto){
  var id=tipo==='user'?'va-user':'va-response';
  var el=document.getElementById(id);
  el.style.display='block';
  el.textContent=texto;
}

async function perguntarIA(pergunta){
  if(estado!=='idle'){speechSynthesis.cancel(); setEstado('idle'); return;}
  mostrarBolha('user','🗣️ "'+pergunta+'"');
  document.getElementById('va-response').style.display='none';
  setEstado('thinking','🤔 Consultando a IA...');
  try{
    var r=await fetch('/api/whatsapp/voice-chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pergunta})
    });
    var d=await r.json();
    var resp=d.resposta||'Não consegui obter uma resposta.';
    mostrarBolha('ai',resp);
    falar(resp);
  }catch(e){
    var errMsg='Desculpe, ocorreu um erro ao consultar a IA.';
    mostrarBolha('ai',errMsg);
    falar(errMsg);
    setEstado('idle');
  }
}

document.getElementById('mic-btn').addEventListener('click',async function(){
  if(estado==='speaking'){speechSynthesis.cancel();setEstado('idle');return;}
  if(estado==='listen'){if(recognition)recognition.stop();return;}
  if(estado==='thinking') return;

  if(!SpeechRec){
    alert('Use Google Chrome para comandos de voz.');
    return;
  }

  // Pedir permissão explícita
  try{
    var s=await navigator.mediaDevices.getUserMedia({audio:true});
    s.getTracks().forEach(t=>t.stop());
  }catch(e){
    setEstado('idle','🚫 Permissão de microfone negada — clique no 🔒 e permita');
    return;
  }

  recognition=new SpeechRec();
  recognition.lang='pt-BR';
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;

  var finalText='';
  var autoStop=null;

  recognition.onstart=function(){setEstado('listen')};

  recognition.onresult=function(e){
    clearTimeout(autoStop);
    finalText='';
    var interim='';
    for(var i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) finalText+=e.results[i][0].transcript;
      else interim+=e.results[i][0].transcript;
    }
    if(finalText){
      setEstado('thinking');
    } else if(interim){
      document.getElementById('va-status').textContent='⌛ '+interim;
      autoStop=setTimeout(function(){if(recognition)recognition.stop()},3000);
    }
  };

  recognition.onerror=function(e){
    if(e.error==='no-speech') setEstado('idle','🔇 Nenhuma fala — tente novamente');
    else if(e.error==='not-allowed') setEstado('idle','🚫 Microfone bloqueado');
    else setEstado('idle','❌ Erro: '+e.error);
  };

  recognition.onend=function(){
    clearTimeout(autoStop);
    if(finalText.trim()) perguntarIA(finalText.trim());
    else if(estado==='listen') setEstado('idle','Pressione para falar');
  };

  recognition.start();
});

/* ─── Status polling ─── */
async function atualizarStatus(){
  try{
    var d=await fetch('/api/whatsapp/status').then(r=>r.json());
    var badge=document.getElementById('status-badge');
    var body=document.getElementById('status-body');
    var loader=document.getElementById('status-loader');

    if(d.status==='conectado'){
      badge.className='badge on';
      badge.innerHTML='<span class="dot"></span> WhatsApp Conectado ✅';
      body.innerHTML=
        '<div class="num">+'+( d.numero||'...')+'</div>'+
        '<div class="info-row"><span>Sessões ativas</span><span>'+(d.sessoes||0)+'</span></div>'+
        '<div class="info-row"><span>Última sync</span><span>'+(d.horario||'—')+'</span></div>';
      loader.textContent='Bot ativo — atualizando a cada 30s';
      setTimeout(atualizarStatus,30000);
    } else if(d.qrCode){
      badge.className='badge qr';
      badge.innerHTML='<span class="dot"></span> Escanear QR Code';
      body.innerHTML=
        '<div class="qr-box"><img src="'+d.qrCode+'" alt="QR Code"></div>'+
        '<div class="qr-steps"><b>Como conectar:</b><br>'+
        '1. Abra o WhatsApp da clínica<br>'+
        '2. Toque em ⋮ → <b>Dispositivos Vinculados</b><br>'+
        '3. Toque em <b>Vincular um dispositivo</b><br>'+
        '4. Aponte a câmera para o QR Code<br>'+
        '<span class="qr-warn">⚠️ Expira em ~60 segundos — o painel atualiza automaticamente</span></div>';
      loader.textContent='Aguardando leitura do QR Code...';
      setTimeout(atualizarStatus,5000);
    } else {
      badge.className='badge off';
      badge.innerHTML='<span class="dot"></span> Aguardando bot...';
      body.innerHTML='<div style="color:var(--dim);font-size:13px;padding:10px 0">O bot está iniciando.<br>O QR Code aparecerá em instantes.</div>';
      loader.textContent='Verificando a cada 4s...';
      setTimeout(atualizarStatus,4000);
    }
  }catch(e){
    document.getElementById('status-loader').textContent='Erro ao conectar — tentando novamente...';
    setTimeout(atualizarStatus,5000);
  }
}
atualizarStatus();

/* ─── Log neon polling ─── */
var logVisto=0;
async function atualizarLog(){
  try{
    var lista=await fetch('/api/whatsapp/activity').then(r=>r.json());
    var body=document.getElementById('log-body');
    if(!lista||lista.length===0){
      body.innerHTML='<div class="log-empty">Aguardando atividades...</div>';
    } else {
      var html='';
      lista.forEach(function(e){
        var cls='log-msg';
        if(e.tipo==='erro') cls+=' erro';
        else if(e.tipo==='aviso') cls+=' aviso';
        else if(e.tipo==='voz'||e.m&&e.m.includes('🎙️')) cls+=' voz';
        html+='<div class="log-entry"><span class="log-time">['+e.t+']</span><span class="'+cls+'">'+escHtml(e.m)+'</span></div>';
      });
      body.innerHTML=html;
      body.scrollTop=0;
    }
  }catch(e){}
  setTimeout(atualizarLog,3000);
}
atualizarLog();

function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>`);
});

export default router;
