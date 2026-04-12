require("dotenv").config();
const express        = require("express");
const bodyParser     = require("body-parser");
const cron           = require("node-cron");
const QRCode         = require("qrcode");
const pino           = require("pino");
const fs             = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const app  = express();
const PORT = process.env.PORT || 3001;

// Arquivo de status compartilhado com o servidor API
const STATUS_FILE = "/tmp/whatsapp_bot_status.json";

function salvarStatus(dados) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({
      ...dados,
      horario: new Date().toLocaleString("pt-BR"),
    }));
  } catch (e) { /* silencioso */ }
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÕES DA CLÍNICA
// ─────────────────────────────────────────────────────────────────────────────
const CLINICA_NOME     = "Clínica Arco-Íris";
const CLINICA_ENDERECO = "R. Antônieta Corrêa dos Santos, 46 - Parque Bela Vista, Ibiúna - SP";
const CLINICA_TELEFONE = "(15) 99999-0000";
const CLINICA_MAPS     = "https://maps.google.com/?q=R.+Antônieta+Corrêa+dos+Santos,+46+Ibiúna+SP";

const NUMEROS_RECEPCAO   = (process.env.NUMEROS_RECEPCAO   || "").split(",").map(n => n.trim()).filter(Boolean);
const NUMEROS_MOTORISTAS = (process.env.NUMEROS_MOTORISTAS || "").split(",").map(n => n.trim()).filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO DO BOT
// ─────────────────────────────────────────────────────────────────────────────
let sock            = null;
let qrCodeBase64    = null;   // imagem base64 do QR atual
let statusConexao   = "aguardando";  // "aguardando" | "conectando" | "conectado" | "desconectado"
let numeroConectado = null;

// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS EM MEMÓRIA
// Substitua por banco real quando estiver em produção.
// ─────────────────────────────────────────────────────────────────────────────
const pacientes = [
  { id: 1, nome: "Lucas Oliveira",  responsavel: "Ana Oliveira",    telefoneResponsavel: "5511991110001" },
  { id: 2, nome: "Maria Santos",    responsavel: "Carlos Santos",   telefoneResponsavel: "5511991110002" },
  { id: 3, nome: "Pedro Costa",     responsavel: "Fernanda Costa",  telefoneResponsavel: "5511991110003" },
  { id: 4, nome: "Beatriz Almeida", responsavel: "Roberto Almeida", telefoneResponsavel: "5511991110004" },
];

const consultasHoje = () => {
  const hoje = new Date().toLocaleDateString("pt-BR");
  return [
    { id: 1, pacienteId: 1, horario: "08:00", terapeuta: "Dra. Márcia", terapia: "Fonoaudiologia", data: hoje, confirmada: null },
    { id: 2, pacienteId: 2, horario: "09:00", terapeuta: "Dr. Paulo",   terapia: "Fisioterapia",   data: hoje, confirmada: null },
    { id: 3, pacienteId: 3, horario: "10:00", terapeuta: "Dra. Luana",  terapia: "Psicologia",     data: hoje, confirmada: null },
    { id: 4, pacienteId: 4, horario: "11:00", terapeuta: "Dra. Márcia", terapia: "Fonoaudiologia", data: hoje, confirmada: null },
  ];
};

const rotasVan = [
  { id: 1, pacienteId: 1, enderecoEmbarque: "Rua das Flores, 10 - Ibiúna", horarioEmbarque: "07:30", confirmadoMotorista: false },
  { id: 2, pacienteId: 2, enderecoEmbarque: "Av. Brasil, 250 - Ibiúna",    horarioEmbarque: "07:45", confirmadoMotorista: false },
  { id: 3, pacienteId: 3, enderecoEmbarque: "R. XV de Novembro, 80",        horarioEmbarque: "08:00", confirmadoMotorista: false },
];

const confirmacoes = new Map();
const sessoes      = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function limparNumero(jid) {
  // Converte "5511999@s.whatsapp.net" → "5511999"
  return (jid || "").replace(/@.+$/, "").replace(/\D/g, "");
}

function jidParaNumero(jid) { return limparNumero(jid); }
function numeroParaJid(num)  { return `${limparNumero(num)}@s.whatsapp.net`; }

function ehRecepcao(jid)  { return NUMEROS_RECEPCAO.includes(jidParaNumero(jid)); }
function ehMotorista(jid) { return NUMEROS_MOTORISTAS.includes(jidParaNumero(jid)); }

function getSessao(jid) {
  if (!sessoes.has(jid)) sessoes.set(jid, { estado: "menu_principal", dados: {} });
  return sessoes.get(jid);
}
function setSessao(jid, estado, dados = {}) {
  sessoes.set(jid, { estado, dados });
}

function buscarPacientePorTelefone(jid) {
  const clean = jidParaNumero(jid);
  return pacientes.find(p => limparNumero(p.telefoneResponsavel) === clean);
}
function buscarConsultaPorPaciente(pacienteId) {
  return consultasHoje().find(c => c.pacienteId === pacienteId);
}

async function enviar(jid, texto) {
  if (!sock || statusConexao !== "conectado") {
    console.warn(`⚠️  [OFFLINE] Não enviado para ${jid}: ${texto.substring(0, 50)}...`);
    return;
  }
  try {
    await sock.sendMessage(jid, { text: texto });
  } catch (err) {
    console.error(`❌ Erro ao enviar para ${jid}:`, err.message);
  }
}

function formatarConsulta(consulta, paciente) {
  return `📋 *Consulta de ${paciente.nome}*\n` +
    `📅 Data: ${consulta.data}\n` +
    `⏰ Horário: ${consulta.horario}\n` +
    `👩‍⚕️ Terapeuta: ${consulta.terapeuta}\n` +
    `🩺 Terapia: ${consulta.terapia}`;
}

async function notificarRecepcao(mensagem) {
  for (const num of NUMEROS_RECEPCAO) {
    await enviar(numeroParaJid(num), `🔔 *AVISO — Assistente NFS*\n\n${mensagem}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENUS
// ─────────────────────────────────────────────────────────────────────────────
const MENU_PRINCIPAL = `🌈 *Assistente ${CLINICA_NOME}*

Olá! Como posso ajudar você hoje?

1️⃣ - Sou Responsável por um Paciente
2️⃣ - Sou Motorista da Van
3️⃣ - Equipe Interna / Recepção

_Digite o número da sua opção._`;

const MENU_RESPONSAVEL = `👨‍👩‍👧 *Menu do Responsável*

1️⃣ - Confirmar consulta de hoje
2️⃣ - Cancelar consulta de hoje
3️⃣ - Ver próxima consulta
4️⃣ - Endereço e localização da clínica
5️⃣ - Falar com a recepção
0️⃣ - Voltar ao menu principal`;

const MENU_MOTORISTA = `🚐 *Menu do Motorista*

1️⃣ - Ver rota completa de hoje
2️⃣ - Confirmar embarque de paciente
3️⃣ - Reportar problema na rota
0️⃣ - Voltar ao menu principal`;

const MENU_RECEPCAO = `🏥 *Painel da Recepção — ${CLINICA_NOME}*

1️⃣ - Confirmações de hoje
2️⃣ - Pacientes do dia (agenda)
3️⃣ - Ausências / não confirmados
4️⃣ - Enviar mensagem a um responsável
5️⃣ - Status da van
0️⃣ - Sair`;

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSADORES DE ESTADO
// ─────────────────────────────────────────────────────────────────────────────
async function processarMenuPrincipal(jid, msg) {
  switch (msg.trim()) {
    case "1": setSessao(jid, "menu_responsavel"); return MENU_RESPONSAVEL;
    case "2": setSessao(jid, "menu_motorista");   return MENU_MOTORISTA;
    case "3":
      if (!ehRecepcao(jid)) return "🔒 Acesso restrito à equipe interna.\n\nSe você é da equipe, peça ao administrador para cadastrar seu número.\n\n0️⃣ - Voltar";
      setSessao(jid, "menu_recepcao");
      return MENU_RECEPCAO;
    default: return `❓ Opção inválida. Por favor, escolha:\n\n${MENU_PRINCIPAL}`;
  }
}

async function processarMenuResponsavel(jid, msg) {
  const paciente = buscarPacientePorTelefone(jid);
  switch (msg.trim()) {
    case "1": {
      if (!paciente) return `⚠️ Não encontrei seu cadastro.\nEntre em contato: 📞 ${CLINICA_TELEFONE}`;
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) return `ℹ️ *${paciente.responsavel}*, não há consulta hoje para *${paciente.nome}*.\n\n0️⃣ - Voltar`;
      setSessao(jid, "confirmar_consulta", { consultaId: consulta.id, paciente, consulta });
      return formatarConsulta(consulta, paciente) + "\n\n✅ Confirmar presença?\n\n*SIM* - Confirmar\n*NÃO* - Cancelar\n0️⃣ - Voltar";
    }
    case "2": {
      if (!paciente) return `⚠️ Não encontrei seu cadastro.\n📞 ${CLINICA_TELEFONE}`;
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) return "ℹ️ Nenhuma consulta para hoje.\n\n0️⃣ - Voltar";
      setSessao(jid, "cancelar_consulta", { consultaId: consulta.id, paciente, consulta });
      return formatarConsulta(consulta, paciente) + "\n\n⚠️ Deseja realmente *cancelar* esta consulta?\n\n*SIM* - Cancelar\n*NÃO* - Manter\n0️⃣ - Voltar";
    }
    case "3": {
      if (!paciente) return `⚠️ Não encontrei seu cadastro.\n📞 ${CLINICA_TELEFONE}`;
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) return "ℹ️ Nenhuma consulta agendada hoje.\n\n0️⃣ - Voltar";
      const status = !confirmacoes.has(consulta.id) ? "⏳ Aguardando confirmação"
        : confirmacoes.get(consulta.id) ? "✅ Confirmada" : "❌ Cancelada";
      return formatarConsulta(consulta, paciente) + `\n\n📌 Status: ${status}\n\n0️⃣ - Voltar`;
    }
    case "4":
      return `📍 *${CLINICA_NOME}*\n\n${CLINICA_ENDERECO}\n\n📞 Tel: ${CLINICA_TELEFONE}\n\n🗺️ ${CLINICA_MAPS}\n\n0️⃣ - Voltar`;
    case "5":
      return `📞 *Recepção ${CLINICA_NOME}*\n\nTelefone: ${CLINICA_TELEFONE}\n\nEnvie sua dúvida aqui que repassaremos à equipe.\n\n0️⃣ - Voltar`;
    case "0":
      setSessao(jid, "menu_principal");
      return MENU_PRINCIPAL;
    default:
      return `❓ Opção inválida.\n\n${MENU_RESPONSAVEL}`;
  }
}

async function processarConfirmarConsulta(jid, msg) {
  const { consultaId, paciente, consulta } = getSessao(jid).dados;
  const resp = msg.trim().toUpperCase();
  if (resp === "SIM" || resp === "S") {
    confirmacoes.set(consultaId, true);
    setSessao(jid, "menu_responsavel");
    notificarRecepcao(`✅ CONFIRMAÇÃO\n👤 ${paciente.responsavel} confirmou a consulta de *${paciente.nome}*\n⏰ ${consulta.horario} — ${consulta.terapia}`);
    return `✅ *Presença confirmada!*\n\nAté logo, *${paciente.responsavel}*! 🌈\nEsperamos *${paciente.nome}* às ${consulta.horario}.\n\n📍 ${CLINICA_ENDERECO}\n\n0️⃣ - Menu principal`;
  } else if (resp === "NÃO" || resp === "NAO" || resp === "N") {
    setSessao(jid, "cancelar_consulta", { consultaId, paciente, consulta });
    return "⚠️ Confirma o *cancelamento* da consulta?\n\n*SIM* - Cancelar\n*NÃO* - Manter";
  } else if (resp === "0") {
    setSessao(jid, "menu_responsavel");
    return MENU_RESPONSAVEL;
  }
  return "Por favor, responda *SIM* ou *NÃO*.";
}

async function processarCancelarConsulta(jid, msg) {
  const { consultaId, paciente, consulta } = getSessao(jid).dados;
  const resp = msg.trim().toUpperCase();
  if (resp === "SIM" || resp === "S") {
    confirmacoes.set(consultaId, false);
    setSessao(jid, "menu_principal");
    notificarRecepcao(`❌ CANCELAMENTO\n👤 ${paciente.responsavel} *cancelou* a consulta de *${paciente.nome}*\n⏰ ${consulta.horario} — ${consulta.terapia}`);
    return `❌ *Consulta cancelada.*\n\nEntendemos, *${paciente.responsavel}*. A equipe foi notificada.\n\nPara reagendar: 📞 ${CLINICA_TELEFONE}\n\n0️⃣ - Menu principal`;
  } else if (resp === "NÃO" || resp === "NAO" || resp === "N") {
    setSessao(jid, "menu_responsavel");
    return "👍 Consulta mantida!\n\n" + MENU_RESPONSAVEL;
  } else if (resp === "0") {
    setSessao(jid, "menu_responsavel");
    return MENU_RESPONSAVEL;
  }
  return "Por favor, responda *SIM* ou *NÃO*.";
}

async function processarMenuMotorista(jid, msg) {
  switch (msg.trim()) {
    case "1": {
      if (rotasVan.length === 0) return "🚐 Nenhuma rota cadastrada para hoje.\n\n0️⃣ - Voltar";
      let texto = `🚐 *Rota da Van — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const rota of rotasVan) {
        const pac      = pacientes.find(p => p.id === rota.pacienteId);
        const consulta = consultasHoje().find(c => c.pacienteId === rota.pacienteId);
        const st       = rota.confirmadoMotorista ? "✅ Embarcado" : "⏳ Aguardando";
        texto += `📍 ${rota.horarioEmbarque} — *${pac?.nome}*\n   ${rota.enderecoEmbarque}\n   🕐 Consulta: ${consulta?.horario || "–"} (${consulta?.terapia || "–"})\n   ${st}\n\n`;
      }
      texto += `🏁 Destino: ${CLINICA_ENDERECO}\n\n0️⃣ - Voltar`;
      return texto;
    }
    case "2": {
      const pendentes = rotasVan.filter(r => !r.confirmadoMotorista);
      if (pendentes.length === 0) return "✅ Todos os embarques já confirmados!\n\n0️⃣ - Voltar";
      setSessao(jid, "confirmar_embarque", {});
      let texto = "👥 *Confirmar embarque de qual paciente?*\n\n";
      pendentes.forEach((r, i) => {
        const pac = pacientes.find(p => p.id === r.pacienteId);
        texto += `${i + 1}️⃣ - ${pac?.nome} (${r.horarioEmbarque})\n`;
      });
      return texto + "\n0️⃣ - Cancelar";
    }
    case "3":
      setSessao(jid, "reportar_problema");
      return "⚠️ *Descreva o problema* (acidente, atraso, ausência do passageiro, etc.):\n\nDigite a mensagem e envie.";
    case "0":
      setSessao(jid, "menu_principal");
      return MENU_PRINCIPAL;
    default:
      return `❓ Opção inválida.\n\n${MENU_MOTORISTA}`;
  }
}

async function processarConfirmarEmbarque(jid, msg) {
  if (msg.trim() === "0") { setSessao(jid, "menu_motorista"); return MENU_MOTORISTA; }
  const idx      = parseInt(msg.trim()) - 1;
  const pendentes = rotasVan.filter(r => !r.confirmadoMotorista);
  if (isNaN(idx) || idx < 0 || idx >= pendentes.length) return "❓ Opção inválida.";
  const rota = pendentes[idx];
  rota.confirmadoMotorista = true;
  const pac = pacientes.find(p => p.id === rota.pacienteId);
  setSessao(jid, "menu_motorista");
  notificarRecepcao(`🚐 EMBARQUE CONFIRMADO\n👤 *${pac?.nome}* embarcou na van\n⏰ ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  return `✅ *Embarque confirmado!*\n\n👤 ${pac?.nome} registrado.\nRecepção notificada.\n\n0️⃣ - Voltar`;
}

async function processarReportarProblema(jid, msg) {
  if (msg.trim() === "0") { setSessao(jid, "menu_motorista"); return MENU_MOTORISTA; }
  notificarRecepcao(`⚠️ PROBLEMA NA VAN\n📱 Motorista: ${jidParaNumero(jid)}\n📝 "${msg.trim()}"`);
  setSessao(jid, "menu_motorista");
  return "✅ *Problema reportado!* A recepção foi notificada.\n\n0️⃣ - Voltar";
}

async function processarMenuRecepcao(jid, msg) {
  const consultas = consultasHoje();
  switch (msg.trim()) {
    case "1": {
      let texto = `📊 *Confirmações — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const c of consultas) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        const st  = !confirmacoes.has(c.id) ? "⏳" : confirmacoes.get(c.id) ? "✅" : "❌";
        texto += `${st} *${pac?.nome}* ${c.horario} (${c.terapia})\n`;
      }
      const conf = [...confirmacoes.values()].filter(v => v === true).length;
      const canc = [...confirmacoes.values()].filter(v => v === false).length;
      texto += `\n📈 Total: ${consultas.length} | ✅ ${conf} | ❌ ${canc} | ⏳ ${consultas.length - conf - canc}\n\n0️⃣ - Voltar`;
      return texto;
    }
    case "2": {
      let texto = `📅 *Agenda — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const c of consultas) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        texto += `⏰ ${c.horario} — *${pac?.nome}*\n   👩‍⚕️ ${c.terapeuta} · ${c.terapia}\n\n`;
      }
      return texto + "0️⃣ - Voltar";
    }
    case "3": {
      const naoConf = consultas.filter(c => !confirmacoes.has(c.id) || confirmacoes.get(c.id) !== true);
      if (naoConf.length === 0) return "✅ Todos confirmaram presença!\n\n0️⃣ - Voltar";
      let texto = `⚠️ *Sem confirmação (${naoConf.length}):*\n\n`;
      for (const c of naoConf) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        const st  = confirmacoes.get(c.id) === false ? "❌ Cancelou" : "⏳ Não respondeu";
        texto += `${st} — *${pac?.nome}* ${c.horario}\n📞 ${pac?.responsavel}: ${pac?.telefoneResponsavel}\n\n`;
      }
      return texto + "0️⃣ - Voltar";
    }
    case "4": {
      setSessao(jid, "enviar_msg_numero");
      let texto = "📨 *Enviar mensagem para qual responsável?*\n\n";
      pacientes.forEach((p, i) => { texto += `${i + 1}️⃣ - ${p.responsavel} (${p.nome})\n`; });
      return texto + "\n0️⃣ - Cancelar";
    }
    case "5": {
      const conf  = rotasVan.filter(r => r.confirmadoMotorista).length;
      let texto   = `🚐 *Van — ${new Date().toLocaleDateString("pt-BR")}*\n📊 Embarques: ${conf}/${rotasVan.length}\n\n`;
      for (const r of rotasVan) {
        const pac = pacientes.find(p => p.id === r.pacienteId);
        texto += `${r.confirmadoMotorista ? "✅" : "⏳"} ${r.horarioEmbarque} — *${pac?.nome}*\n   📍 ${r.enderecoEmbarque}\n\n`;
      }
      return texto + "0️⃣ - Voltar";
    }
    case "0":
      setSessao(jid, "menu_principal");
      return MENU_PRINCIPAL;
    default:
      return `❓ Opção inválida.\n\n${MENU_RECEPCAO}`;
  }
}

async function processarEnviarMsgNumero(jid, msg) {
  if (msg.trim() === "0") { setSessao(jid, "menu_recepcao"); return MENU_RECEPCAO; }
  const idx = parseInt(msg.trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= pacientes.length) return "❓ Número inválido.";
  setSessao(jid, "enviar_msg_texto", { destino: pacientes[idx] });
  return `📝 *Digite a mensagem* para *${pacientes[idx].responsavel}* (responsável de ${pacientes[idx].nome}):\n\n0️⃣ - Cancelar`;
}

async function processarEnviarMsgTexto(jid, msg) {
  if (msg.trim() === "0") { setSessao(jid, "menu_recepcao"); return MENU_RECEPCAO; }
  const { destino } = getSessao(jid).dados;
  await enviar(numeroParaJid(destino.telefoneResponsavel), `🌈 *${CLINICA_NOME}*\n\n${msg.trim()}`);
  setSessao(jid, "menu_recepcao");
  return `✅ Mensagem enviada para *${destino.responsavel}*!\n\n0️⃣ - Voltar`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTEADOR DE MENSAGENS
// ─────────────────────────────────────────────────────────────────────────────
async function processarMensagem(jid, texto) {
  const msg    = texto.trim();
  const sessao = getSessao(jid);

  console.log(`📩 [${new Date().toLocaleTimeString("pt-BR")}] ${jidParaNumero(jid)}: "${msg}" [${sessao.estado}]`);

  // Comandos globais
  if (msg === "0" && sessao.estado !== "menu_principal") {
    setSessao(jid, "menu_principal");
    return MENU_PRINCIPAL;
  }
  if (/^(menu|oi|olá|ola|início|inicio|start|ajuda|help|👋)$/i.test(msg)) {
    setSessao(jid, "menu_principal");
    return MENU_PRINCIPAL;
  }

  switch (sessao.estado) {
    case "menu_principal":    return processarMenuPrincipal(jid, msg);
    case "menu_responsavel":  return processarMenuResponsavel(jid, msg);
    case "menu_motorista":    return processarMenuMotorista(jid, msg);
    case "menu_recepcao":     return processarMenuRecepcao(jid, msg);
    case "confirmar_consulta": return processarConfirmarConsulta(jid, msg);
    case "cancelar_consulta":  return processarCancelarConsulta(jid, msg);
    case "confirmar_embarque": return processarConfirmarEmbarque(jid, msg);
    case "reportar_problema":  return processarReportarProblema(jid, msg);
    case "enviar_msg_numero":  return processarEnviarMsgNumero(jid, msg);
    case "enviar_msg_texto":   return processarEnviarMsgTexto(jid, msg);
    default:
      setSessao(jid, "menu_principal");
      return MENU_PRINCIPAL;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONEXÃO BAILEYS (WhatsApp direto via QR Code)
// ─────────────────────────────────────────────────────────────────────────────
async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessao_whatsapp");
  const { version }          = await fetchLatestBaileysVersion();
  const logger               = pino({ level: "silent" });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ["Assistente NFS", "Chrome", "1.0.0"],
  });

  // QR Code gerado
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      statusConexao = "conectando";
      qrCodeBase64  = await QRCode.toDataURL(qr);
      salvarStatus({ status: "conectando", qrCode: qrCodeBase64, numero: null, sessoes: sessoes.size });
      console.log("📱 Novo QR Code gerado — acesse: /api/whatsapp/panel");
    }

    if (connection === "open") {
      statusConexao   = "conectado";
      qrCodeBase64    = null;
      numeroConectado = sock.user?.id?.split(":")[0] || sock.user?.id;
      salvarStatus({ status: "conectado", qrCode: null, numero: numeroConectado, sessoes: sessoes.size });
      console.log(`✅ WhatsApp conectado! Número: +${numeroConectado}`);
    }

    if (connection === "close") {
      const codigo    = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason.loggedOut;
      statusConexao   = deslogado ? "desconectado" : "aguardando";
      salvarStatus({ status: deslogado ? "desconectado" : "aguardando", qrCode: null, numero: null, sessoes: 0 });
      console.log(`🔴 Desconectado. Código: ${codigo}. Reconectando: ${!deslogado}`);
      if (!deslogado) setTimeout(conectarWhatsApp, 3000);
    }
  });

  // Salvar credenciais quando atualizar
  sock.ev.on("creds.update", saveCreds);

  // Receber mensagens
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;                   // ignorar mensagens enviadas por nós
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // ignorar grupos

      const jid   = msg.key.remoteJid;
      const texto = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || "";

      if (!texto.trim()) continue;

      try {
        const resposta = await processarMensagem(jid, texto);
        if (resposta) await enviar(jid, resposta);
      } catch (err) {
        console.error("❌ Erro ao processar mensagem:", err);
        await enviar(jid, "⚠️ Ocorreu um erro. Por favor, tente novamente ou digite *menu*.");
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDAMENTOS AUTOMÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

// 18h (seg–sab): lembrete D-1 para responsáveis
cron.schedule("0 18 * * 1-6", async () => {
  if (statusConexao !== "conectado") return;
  console.log("⏰ [CRON] Enviando lembretes para responsáveis...");
  for (const consulta of consultasHoje()) {
    const pac = pacientes.find(p => p.id === consulta.pacienteId);
    if (!pac) continue;
    const mensagem =
      `🌈 *${CLINICA_NOME}*\n\n` +
      `Olá, *${pac.responsavel}*! 😊\n\n` +
      `Lembramos que *${pac.nome}* tem consulta *amanhã*:\n\n` +
      `⏰ Horário: ${consulta.horario}\n` +
      `🩺 Terapia: ${consulta.terapia}\n` +
      `👩‍⚕️ Terapeuta: ${consulta.terapeuta}\n\n` +
      `📍 ${CLINICA_ENDERECO}\n\n` +
      `Por favor, *confirme a presença* respondendo:\n` +
      `✅ *SIM* — Confirmar\n❌ *NÃO* — Cancelar\n\n` +
      `Ou acesse o menu digitando: *oi*`;
    setSessao(numeroParaJid(pac.telefoneResponsavel), "confirmar_consulta", { consultaId: consulta.id, paciente: pac, consulta });
    await enviar(numeroParaJid(pac.telefoneResponsavel), mensagem);
    console.log(`  → Lembrete enviado para ${pac.responsavel}`);
  }
});

// 07h: rota do dia para motoristas
cron.schedule("0 7 * * 1-6", async () => {
  if (statusConexao !== "conectado" || rotasVan.length === 0) return;
  let texto = `🚐 *Rota do Dia — ${new Date().toLocaleDateString("pt-BR")}*\n\n🏥 Destino: ${CLINICA_NOME}\n📍 ${CLINICA_ENDERECO}\n\n`;
  for (const rota of rotasVan) {
    const pac      = pacientes.find(p => p.id === rota.pacienteId);
    const consulta = consultasHoje().find(c => c.pacienteId === rota.pacienteId);
    texto += `⏰ ${rota.horarioEmbarque}\n👤 *${pac?.nome}*\n📍 ${rota.enderecoEmbarque}\n🕐 Consulta: ${consulta?.horario}\n\n`;
  }
  texto += `Para confirmar embarques: Menu → *Sou Motorista*`;
  for (const tel of NUMEROS_MOTORISTAS) await enviar(numeroParaJid(tel), texto);
});

// 09h30: alerta de não confirmados para recepção
cron.schedule("30 9 * * 1-6", async () => {
  if (statusConexao !== "conectado" || NUMEROS_RECEPCAO.length === 0) return;
  const consultas = consultasHoje();
  const naoConf   = consultas.filter(c => !confirmacoes.has(c.id));
  if (naoConf.length === 0) return;
  let texto = `⚠️ *Alerta — ${naoConf.length} paciente(s) sem confirmação:*\n\n`;
  for (const c of naoConf) {
    const pac = pacientes.find(p => p.id === c.pacienteId);
    texto += `❓ *${pac?.nome}* — ${c.horario}\n📞 ${pac?.responsavel}: ${pac?.telefoneResponsavel}\n\n`;
  }
  for (const tel of NUMEROS_RECEPCAO) await enviar(numeroParaJid(tel), texto);
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE WEB — PAINEL DE CONEXÃO
// ─────────────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const conectado = statusConexao === "conectado";
  const refreshSeg = conectado ? 30 : 5;
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Assistente NFS — ${CLINICA_NOME}</title>
  <script>setTimeout(() => location.reload(), ${refreshSeg * 1000});</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 40px; max-width: 480px; width: 90%; text-align: center; }
    .logo { font-size: 48px; margin-bottom: 8px; }
    h1 { font-size: 22px; color: #e6edf3; margin-bottom: 4px; }
    .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 32px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
    .badge.online  { background: #1a3a2a; color: #3fb950; border: 1px solid #238636; }
    .badge.offline { background: #3a1a1a; color: #f85149; border: 1px solid #da3633; }
    .badge.waiting { background: #2a2a1a; color: #e3b341; border: 1px solid #9e6a03; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .qr-box { background: #fff; border-radius: 12px; padding: 12px; display: inline-block; margin: 16px 0; }
    .qr-box img { display: block; width: 220px; height: 220px; }
    .instructions { background: #1f2937; border-radius: 10px; padding: 16px; margin-top: 20px; text-align: left; font-size: 13px; color: #8b949e; line-height: 1.8; }
    .instructions strong { color: #e6edf3; }
    .info-row { display: flex; justify-content: space-between; align-items: center; background: #0d1117; border-radius: 8px; padding: 10px 14px; margin-top: 12px; font-size: 13px; }
    .info-row span:first-child { color: #8b949e; }
    .info-row span:last-child  { color: #e6edf3; font-weight: 600; }
    .connected-icon { font-size: 80px; margin: 8px 0; }
    .number { font-size: 20px; font-weight: 700; color: #3fb950; margin: 4px 0 20px; letter-spacing: 1px; }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🌈</div>
  <h1>Assistente NFS</h1>
  <p class="subtitle">${CLINICA_NOME}</p>

  ${conectado ? `
    <div class="badge online"><span class="dot"></span> WhatsApp Conectado</div>
    <div class="connected-icon">✅</div>
    <div class="number">+${numeroConectado}</div>
    <p style="color:#8b949e;font-size:14px">O bot está ativo e respondendo mensagens.<br>Esta página atualiza automaticamente.</p>
    <div class="info-row"><span>Sessões ativas</span><span>${sessoes.size}</span></div>
    <div class="info-row"><span>Horário</span><span>${new Date().toLocaleString("pt-BR")}</span></div>
  ` : qrCodeBase64 ? `
    <div class="badge waiting"><span class="dot"></span> Aguardando Scan do QR Code</div>
    <div class="qr-box"><img src="${qrCodeBase64}" alt="QR Code WhatsApp"></div>
    <div class="instructions">
      <strong>Como conectar:</strong><br>
      1. Abra o WhatsApp da clínica no celular<br>
      2. Toque em ⋮ → <strong>Dispositivos Vinculados</strong><br>
      3. Toque em <strong>Vincular um dispositivo</strong><br>
      4. Aponte a câmera para o QR Code acima<br><br>
      <span style="color:#e3b341">⚠️ O QR Code expira em 60 segundos. A página atualiza automaticamente.</span>
    </div>
  ` : `
    <div class="badge offline"><span class="dot"></span> Desconectado</div>
    <div style="font-size:64px;margin:20px 0">📵</div>
    <p style="color:#8b949e;font-size:14px">Aguardando inicialização do WhatsApp...<br>Esta página atualiza automaticamente.</p>
  `}
</div>
</body>
</html>`);
});

// Alias com prefixo (para roteamento do proxy Replit)
app.get("/assistente-nfs", (req, res) => res.redirect("/assistente-nfs/"));
app.get("/assistente-nfs/", (req, res, next) => { req.url = "/"; next(); });

// API de status (para monitoramento)
app.get(["/status", "/assistente-nfs/status"], (req, res) => {
  res.json({
    status:         statusConexao,
    numeroConectado,
    sessoesAtivas:  sessoes.size,
    horario:        new Date().toLocaleString("pt-BR"),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌈 Assistente NFS — ${CLINICA_NOME}`);
  console.log(`✅ Painel web na porta ${PORT}`);
  console.log(`📱 Acesse o painel para escanear o QR Code\n`);
});

conectarWhatsApp().catch(err => console.error("❌ Erro ao conectar WhatsApp:", err));
