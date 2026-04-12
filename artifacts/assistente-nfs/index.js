require("dotenv").config();
const express    = require("express");
const bodyParser = require("body-parser");
const cron       = require("node-cron");
const twilio     = require("twilio");

const app  = express();
const PORT = process.env.PORT || 3000;

// Inicialização preguiçosa — só instancia o client quando as credenciais estiverem disponíveis
let _twilioClient = null;
function getTwilioClient() {
  if (!_twilioClient) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
    _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _twilioClient;
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

const NUMEROS_RECEPCAO  = (process.env.NUMEROS_RECEPCAO  || "").split(",").map(n => n.trim()).filter(Boolean);
const NUMEROS_MOTORISTAS = (process.env.NUMEROS_MOTORISTAS || "").split(",").map(n => n.trim()).filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS EM MEMÓRIA
// Substitua por banco real quando estiver em produção.
// Estrutura isolada — nenhuma relação com o sistema de Ponto ou Triagem.
// ─────────────────────────────────────────────────────────────────────────────

// Pacientes cadastrados na clínica
const pacientes = [
  { id: 1, nome: "Lucas Oliveira",     responsavel: "Ana Oliveira",    telefoneResponsavel: "5511991110001" },
  { id: 2, nome: "Maria Santos",       responsavel: "Carlos Santos",   telefoneResponsavel: "5511991110002" },
  { id: 3, nome: "Pedro Costa",        responsavel: "Fernanda Costa",  telefoneResponsavel: "5511991110003" },
  { id: 4, nome: "Beatriz Almeida",    responsavel: "Roberto Almeida", telefoneResponsavel: "5511991110004" },
];

// Consultas do dia (em produção: puxar da agenda real)
// Dia da semana: 0=dom 1=seg 2=ter 3=qua 4=qui 5=sex 6=sab
const consultasHoje = () => {
  const hoje = new Date().toLocaleDateString("pt-BR");
  return [
    { id: 1, pacienteId: 1, horario: "08:00", terapeuta: "Dra. Márcia",  terapia: "Fonoaudiologia", data: hoje, confirmada: null },
    { id: 2, pacienteId: 2, horario: "09:00", terapeuta: "Dr. Paulo",    terapia: "Fisioterapia",   data: hoje, confirmada: null },
    { id: 3, pacienteId: 3, horario: "10:00", terapeuta: "Dra. Luana",   terapia: "Psicologia",     data: hoje, confirmada: null },
    { id: 4, pacienteId: 4, horario: "11:00", terapeuta: "Dra. Márcia",  terapia: "Fonoaudiologia", data: hoje, confirmada: null },
  ];
};

// Rotas de van do dia
const rotasVan = [
  { id: 1, pacienteId: 1, enderecoEmbarque: "Rua das Flores, 10 - Ibiúna", horarioEmbarque: "07:30", confirmadoMotorista: false },
  { id: 2, pacienteId: 2, enderecoEmbarque: "Av. Brasil, 250 - Ibiúna",    horarioEmbarque: "07:45", confirmadoMotorista: false },
  { id: 3, pacienteId: 3, enderecoEmbarque: "R. XV de Novembro, 80",        horarioEmbarque: "08:00", confirmadoMotorista: false },
];

// Estado das confirmações (por consulta)
const confirmacoes = new Map(); // consultaId → true|false|null

// Sessões de conversa por número de WhatsApp
// estado: "menu_principal" | "menu_responsavel" | "menu_motorista" | "menu_recepcao"
//       | "aguardando_cpf" | "confirmar_consulta" | "cancelar_consulta"
//       | "enviar_lembrete_numero" | "enviar_lembrete_mensagem"
const sessoes = new Map(); // numero → { estado, dados }

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function limparNumero(num) {
  return num.replace(/\D/g, "").replace(/^whatsapp:/, "");
}

function ehRecepcao(num)   { return NUMEROS_RECEPCAO.includes(limparNumero(num)); }
function ehMotorista(num)  { return NUMEROS_MOTORISTAS.includes(limparNumero(num)); }

function getSessao(num) {
  if (!sessoes.has(num)) sessoes.set(num, { estado: "menu_principal", dados: {} });
  return sessoes.get(num);
}

function setSessao(num, estado, dados = {}) {
  sessoes.set(num, { estado, dados });
}

function buscarPacientePorTelefone(tel) {
  const clean = limparNumero(tel);
  return pacientes.find(p => limparNumero(p.telefoneResponsavel) === clean);
}

function buscarConsultaPorPaciente(pacienteId) {
  return consultasHoje().find(c => c.pacienteId === pacienteId);
}

async function enviarWhatsApp(para, mensagem) {
  const client = getTwilioClient();
  if (!client) {
    console.warn(`⚠️  [SEM TWILIO] Mensagem para ${para}: ${mensagem.substring(0, 60)}...`);
    return;
  }
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to:   `whatsapp:${para}`,
      body: mensagem,
    });
  } catch (err) {
    console.error(`❌ Erro ao enviar para ${para}:`, err.message);
  }
}

function formatarConsulta(consulta, paciente) {
  return `📋 *Consulta de ${paciente.nome}*\n` +
    `📅 Data: ${consulta.data}\n` +
    `⏰ Horário: ${consulta.horario}\n` +
    `👩‍⚕️ Terapeuta: ${consulta.terapeuta}\n` +
    `🩺 Terapia: ${consulta.terapia}`;
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
5️⃣ - Rota da van — status
0️⃣ - Sair`;

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSADORES DE ESTADO
// ─────────────────────────────────────────────────────────────────────────────

async function processarMenuPrincipal(num, msg) {
  switch (msg.trim()) {
    case "1":
      setSessao(num, "menu_responsavel");
      return MENU_RESPONSAVEL;
    case "2":
      setSessao(num, "menu_motorista");
      return MENU_MOTORISTA;
    case "3":
      if (!ehRecepcao(num)) {
        return "🔒 Acesso restrito à equipe interna.\n\nSe você é da equipe, peça ao administrador para cadastrar seu número.\n\n0️⃣ - Voltar";
      }
      setSessao(num, "menu_recepcao");
      return MENU_RECEPCAO;
    default:
      return `❓ Opção inválida. Por favor, escolha:\n\n${MENU_PRINCIPAL}`;
  }
}

async function processarMenuResponsavel(num, msg) {
  const paciente = buscarPacientePorTelefone(num);

  switch (msg.trim()) {
    case "1": { // Confirmar consulta
      if (!paciente) {
        return "⚠️ Não encontrei seu cadastro.\nPor favor, entre em contato com a recepção:\n📞 " + CLINICA_TELEFONE;
      }
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) {
        return `ℹ️ *${paciente.responsavel}*, não há consulta agendada hoje para *${paciente.nome}*.\n\n0️⃣ - Voltar`;
      }
      setSessao(num, "confirmar_consulta", { consultaId: consulta.id, paciente, consulta });
      return formatarConsulta(consulta, paciente) +
        "\n\n✅ Confirmar presença?\n\n*SIM* - Confirmar\n*NÃO* - Cancelar\n0️⃣ - Voltar";
    }

    case "2": { // Cancelar consulta
      if (!paciente) return "⚠️ Não encontrei seu cadastro.\n📞 " + CLINICA_TELEFONE;
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) return "ℹ️ Nenhuma consulta para hoje.\n\n0️⃣ - Voltar";
      setSessao(num, "cancelar_consulta", { consultaId: consulta.id, paciente, consulta });
      return formatarConsulta(consulta, paciente) +
        "\n\n⚠️ Deseja realmente *cancelar* esta consulta?\n\n*SIM* - Cancelar consulta\n*NÃO* - Manter\n0️⃣ - Voltar";
    }

    case "3": { // Ver próxima consulta
      if (!paciente) return "⚠️ Não encontrei seu cadastro.\n📞 " + CLINICA_TELEFONE;
      const consulta = buscarConsultaPorPaciente(paciente.id);
      if (!consulta) return "ℹ️ Nenhuma consulta agendada hoje.\n\n0️⃣ - Voltar";
      const status = confirmacoes.has(consulta.id)
        ? (confirmacoes.get(consulta.id) ? "✅ Confirmada" : "❌ Cancelada")
        : "⏳ Aguardando confirmação";
      return formatarConsulta(consulta, paciente) + `\n\n📌 Status: ${status}\n\n0️⃣ - Voltar`;
    }

    case "4": // Endereço
      return `📍 *${CLINICA_NOME}*\n\n` +
        `${CLINICA_ENDERECO}\n\n` +
        `📞 Tel: ${CLINICA_TELEFONE}\n\n` +
        `🗺️ Google Maps:\n${CLINICA_MAPS}\n\n` +
        `0️⃣ - Voltar`;

    case "5": // Falar com recepção
      return `📞 *Recepção ${CLINICA_NOME}*\n\n` +
        `Telefone: ${CLINICA_TELEFONE}\n\n` +
        `Você também pode enviar sua dúvida por aqui que repassaremos à equipe.\n\n` +
        `0️⃣ - Voltar`;

    case "0": // Voltar
      setSessao(num, "menu_principal");
      return MENU_PRINCIPAL;

    default:
      return `❓ Opção inválida.\n\n${MENU_RESPONSAVEL}`;
  }
}

async function processarConfirmarConsulta(num, msg) {
  const { consultaId, paciente, consulta } = getSessao(num).dados;
  const resp = msg.trim().toUpperCase();
  if (resp === "SIM" || resp === "S") {
    confirmacoes.set(consultaId, true);
    setSessao(num, "menu_responsavel");
    notificarRecepcao(`✅ CONFIRMAÇÃO\n👤 ${paciente.responsavel} confirmou a consulta de *${paciente.nome}*\n⏰ ${consulta.horario} — ${consulta.terapia}`);
    return `✅ *Presença confirmada!*\n\nAté logo, *${paciente.responsavel}*! 🌈\nEsperamos o *${paciente.nome}* às ${consulta.horario}.\n\n📍 ${CLINICA_ENDERECO}\n\n0️⃣ - Menu principal`;
  } else if (resp === "NÃO" || resp === "NAO" || resp === "N") {
    setSessao(num, "cancelar_consulta", { consultaId, paciente, consulta });
    return "⚠️ Confirma o *cancelamento* da consulta?\n\n*SIM* - Cancelar\n*NÃO* - Manter confirmação";
  } else if (resp === "0") {
    setSessao(num, "menu_responsavel");
    return MENU_RESPONSAVEL;
  }
  return "Por favor, responda *SIM* ou *NÃO*.";
}

async function processarCancelarConsulta(num, msg) {
  const { consultaId, paciente, consulta } = getSessao(num).dados;
  const resp = msg.trim().toUpperCase();
  if (resp === "SIM" || resp === "S") {
    confirmacoes.set(consultaId, false);
    setSessao(num, "menu_principal");
    notificarRecepcao(`❌ CANCELAMENTO\n👤 ${paciente.responsavel} *cancelou* a consulta de *${paciente.nome}*\n⏰ ${consulta.horario} — ${consulta.terapia}\n📞 ${paciente.telefoneResponsavel}`);
    return `❌ *Consulta cancelada.*\n\nEntendemos, *${paciente.responsavel}*. A equipe foi notificada.\n\nPara reagendar, ligue: 📞 ${CLINICA_TELEFONE}\n\n0️⃣ - Menu principal`;
  } else if (resp === "NÃO" || resp === "NAO" || resp === "N") {
    setSessao(num, "menu_responsavel");
    return "👍 Consulta mantida!\n\n" + MENU_RESPONSAVEL;
  } else if (resp === "0") {
    setSessao(num, "menu_responsavel");
    return MENU_RESPONSAVEL;
  }
  return "Por favor, responda *SIM* ou *NÃO*.";
}

async function processarMenuMotorista(num, msg) {
  switch (msg.trim()) {
    case "1": { // Rota de hoje
      if (rotasVan.length === 0) return "🚐 Nenhuma rota cadastrada para hoje.\n\n0️⃣ - Voltar";
      let texto = `🚐 *Rota da Van — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const rota of rotasVan) {
        const pac = pacientes.find(p => p.id === rota.pacienteId);
        const consulta = consultasHoje().find(c => c.pacienteId === rota.pacienteId);
        const status = rota.confirmadoMotorista ? "✅ Embarcado" : "⏳ Aguardando";
        texto += `📍 ${rota.horarioEmbarque} — *${pac?.nome}*\n`;
        texto += `   ${rota.enderecoEmbarque}\n`;
        texto += `   🕐 Consulta: ${consulta?.horario || "–"} (${consulta?.terapia || "–"})\n`;
        texto += `   ${status}\n\n`;
      }
      texto += `🏁 Destino: ${CLINICA_ENDERECO}\n\n0️⃣ - Voltar`;
      return texto;
    }

    case "2": { // Confirmar embarque
      const pendentes = rotasVan.filter(r => !r.confirmadoMotorista);
      if (pendentes.length === 0) return "✅ Todos os embarques já confirmados!\n\n0️⃣ - Voltar";
      setSessao(num, "confirmar_embarque", {});
      let texto = "👥 *Confirmar embarque de qual paciente?*\n\n";
      pendentes.forEach((r, i) => {
        const pac = pacientes.find(p => p.id === r.pacienteId);
        texto += `${i + 1}️⃣ - ${pac?.nome} (${r.horarioEmbarque})\n`;
      });
      texto += "\n0️⃣ - Cancelar";
      return texto;
    }

    case "3": { // Reportar problema
      setSessao(num, "reportar_problema");
      return "⚠️ *Descreva o problema* (acidente, atraso, ausência do passageiro, etc.):\n\nDigite a mensagem e envie.";
    }

    case "0":
      setSessao(num, "menu_principal");
      return MENU_PRINCIPAL;

    default:
      return `❓ Opção inválida.\n\n${MENU_MOTORISTA}`;
  }
}

async function processarConfirmarEmbarque(num, msg) {
  if (msg.trim() === "0") { setSessao(num, "menu_motorista"); return MENU_MOTORISTA; }
  const idx = parseInt(msg.trim()) - 1;
  const pendentes = rotasVan.filter(r => !r.confirmadoMotorista);
  if (isNaN(idx) || idx < 0 || idx >= pendentes.length) return "❓ Opção inválida. Escolha um número da lista ou 0 para cancelar.";
  const rota = pendentes[idx];
  rota.confirmadoMotorista = true;
  const pac = pacientes.find(p => p.id === rota.pacienteId);
  setSessao(num, "menu_motorista");
  notificarRecepcao(`🚐 EMBARQUE CONFIRMADO\n👤 *${pac?.nome}* embarcou na van\n⏰ ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  return `✅ *Embarque confirmado!*\n\n👤 ${pac?.nome} registrado na van.\nRecepção notificada.\n\n0️⃣ - Voltar`;
}

async function processarReportarProblema(num, msg) {
  if (msg.trim() === "0") { setSessao(num, "menu_motorista"); return MENU_MOTORISTA; }
  notificarRecepcao(`⚠️ PROBLEMA NA VAN\n📱 Motorista: ${num}\n📝 "${msg.trim()}"`);
  setSessao(num, "menu_motorista");
  return "✅ *Problema reportado!* A recepção foi notificada imediatamente.\n\n0️⃣ - Voltar";
}

async function processarMenuRecepcao(num, msg) {
  const consultas = consultasHoje();

  switch (msg.trim()) {
    case "1": { // Confirmações
      let texto = `📊 *Confirmações de Hoje — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const c of consultas) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        const status = !confirmacoes.has(c.id) ? "⏳ Pendente" : confirmacoes.get(c.id) ? "✅ Confirmado" : "❌ Cancelado";
        texto += `${status} — *${pac?.nome}* ${c.horario} (${c.terapia})\n`;
      }
      const confirmadas = [...confirmacoes.values()].filter(v => v === true).length;
      const canceladas  = [...confirmacoes.values()].filter(v => v === false).length;
      const pendentes   = consultas.length - confirmadas - canceladas;
      texto += `\n📈 Total: ${consultas.length} | ✅ ${confirmadas} | ❌ ${canceladas} | ⏳ ${pendentes}\n\n0️⃣ - Voltar`;
      return texto;
    }

    case "2": { // Pacientes do dia
      let texto = `📅 *Agenda de Hoje — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      for (const c of consultas) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        texto += `⏰ ${c.horario} — *${pac?.nome}*\n   👩‍⚕️ ${c.terapeuta} · ${c.terapia}\n\n`;
      }
      texto += `0️⃣ - Voltar`;
      return texto;
    }

    case "3": { // Ausências
      const naoConfirmados = consultas.filter(c => !confirmacoes.has(c.id) || confirmacoes.get(c.id) !== true);
      if (naoConfirmados.length === 0) return "✅ Todos os pacientes confirmaram presença!\n\n0️⃣ - Voltar";
      let texto = `⚠️ *Sem confirmação (${naoConfirmados.length}):*\n\n`;
      for (const c of naoConfirmados) {
        const pac = pacientes.find(p => p.id === c.pacienteId);
        const status = confirmacoes.get(c.id) === false ? "❌ Cancelou" : "⏳ Não respondeu";
        texto += `${status} — *${pac?.nome}* ${c.horario}\n   📞 ${pac?.responsavel}: ${pac?.telefoneResponsavel}\n\n`;
      }
      texto += "0️⃣ - Voltar";
      return texto;
    }

    case "4": { // Enviar mensagem
      setSessao(num, "enviar_lembrete_numero");
      let texto = "📨 *Enviar mensagem para qual responsável?*\n\n";
      pacientes.forEach((p, i) => {
        texto += `${i + 1}️⃣ - ${p.responsavel} (${p.nome})\n`;
      });
      texto += "\n0️⃣ - Cancelar";
      return texto;
    }

    case "5": { // Rota van
      const confirmados = rotasVan.filter(r => r.confirmadoMotorista).length;
      let texto = `🚐 *Status da Van — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
      texto += `📊 Embarques: ${confirmados}/${rotasVan.length} confirmados\n\n`;
      for (const r of rotasVan) {
        const pac = pacientes.find(p => p.id === r.pacienteId);
        const st = r.confirmadoMotorista ? "✅" : "⏳";
        texto += `${st} ${r.horarioEmbarque} — *${pac?.nome}*\n   📍 ${r.enderecoEmbarque}\n\n`;
      }
      texto += "0️⃣ - Voltar";
      return texto;
    }

    case "0":
      setSessao(num, "menu_principal");
      return MENU_PRINCIPAL;

    default:
      return `❓ Opção inválida.\n\n${MENU_RECEPCAO}`;
  }
}

async function processarEnviarLembreteNumero(num, msg) {
  if (msg.trim() === "0") { setSessao(num, "menu_recepcao"); return MENU_RECEPCAO; }
  const idx = parseInt(msg.trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= pacientes.length) return "❓ Número inválido. Escolha da lista ou 0 para cancelar.";
  const pac = pacientes[idx];
  setSessao(num, "enviar_lembrete_mensagem", { destino: pac });
  return `📝 *Digite a mensagem* para *${pac.responsavel}* (responsável de ${pac.nome}):\n\nOu 0️⃣ para cancelar.`;
}

async function processarEnviarLembreteMensagem(num, msg) {
  if (msg.trim() === "0") { setSessao(num, "menu_recepcao"); return MENU_RECEPCAO; }
  const { destino } = getSessao(num).dados;
  const mensagem = `🌈 *${CLINICA_NOME}*\n\n${msg.trim()}`;
  await enviarWhatsApp(destino.telefoneResponsavel, mensagem);
  setSessao(num, "menu_recepcao");
  return `✅ Mensagem enviada para *${destino.responsavel}* com sucesso!\n\n0️⃣ - Voltar`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAR RECEPÇÃO
// ─────────────────────────────────────────────────────────────────────────────
async function notificarRecepcao(mensagem) {
  for (const num of NUMEROS_RECEPCAO) {
    await enviarWhatsApp(num, `🔔 *AVISO — Assistente NFS*\n\n${mensagem}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTEADOR DE MENSAGENS
// ─────────────────────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const { Body, From } = req.body;
  if (!Body || !From) return res.sendStatus(200);

  const num    = limparNumero(From);
  const msg    = Body.trim();
  const sessao = getSessao(num);

  console.log(`📩 [${new Date().toLocaleTimeString("pt-BR")}] ${num}: "${msg}" [${sessao.estado}]`);

  let resposta = "";

  try {
    // Comandos globais (funcionam em qualquer estado)
    if (msg === "0" && sessao.estado !== "menu_principal") {
      setSessao(num, "menu_principal");
      resposta = MENU_PRINCIPAL;
    } else if (/^(menu|oi|olá|ola|início|inicio|start|ajuda|help)$/i.test(msg)) {
      setSessao(num, "menu_principal");
      resposta = MENU_PRINCIPAL;
    } else {
      switch (sessao.estado) {
        case "menu_principal":        resposta = await processarMenuPrincipal(num, msg); break;
        case "menu_responsavel":      resposta = await processarMenuResponsavel(num, msg); break;
        case "menu_motorista":        resposta = await processarMenuMotorista(num, msg); break;
        case "menu_recepcao":         resposta = await processarMenuRecepcao(num, msg); break;
        case "confirmar_consulta":    resposta = await processarConfirmarConsulta(num, msg); break;
        case "cancelar_consulta":     resposta = await processarCancelarConsulta(num, msg); break;
        case "confirmar_embarque":    resposta = await processarConfirmarEmbarque(num, msg); break;
        case "reportar_problema":     resposta = await processarReportarProblema(num, msg); break;
        case "enviar_lembrete_numero":  resposta = await processarEnviarLembreteNumero(num, msg); break;
        case "enviar_lembrete_mensagem": resposta = await processarEnviarLembreteMensagem(num, msg); break;
        default:
          setSessao(num, "menu_principal");
          resposta = MENU_PRINCIPAL;
      }
    }
  } catch (err) {
    console.error("❌ Erro no processamento:", err);
    resposta = "⚠️ Ocorreu um erro. Tente novamente ou digitepara o menu principal.";
  }

  // Responder via Twilio TwiML
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${resposta.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENDAMENTOS AUTOMÁTICOS (CRON)
// ─────────────────────────────────────────────────────────────────────────────

// Às 18h do dia anterior: lembrete para responsáveis
cron.schedule("0 18 * * 1-6", async () => {
  console.log("⏰ [CRON] Enviando lembretes para responsáveis...");
  const consultas = consultasHoje();
  for (const consulta of consultas) {
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
    setSessao(pac.telefoneResponsavel, "confirmar_consulta", { consultaId: consulta.id, paciente: pac, consulta });
    await enviarWhatsApp(pac.telefoneResponsavel, mensagem);
    console.log(`  → Lembrete enviado para ${pac.responsavel} (${pac.telefoneResponsavel})`);
  }
});

// Às 07h: enviar rota do dia para motoristas
cron.schedule("0 7 * * 1-6", async () => {
  console.log("⏰ [CRON] Enviando rota do dia para motoristas...");
  if (rotasVan.length === 0) return;
  let texto = `🚐 *Rota do Dia — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
  texto += `🏥 Destino final: ${CLINICA_NOME}\n📍 ${CLINICA_ENDERECO}\n\n`;
  for (const rota of rotasVan) {
    const pac     = pacientes.find(p => p.id === rota.pacienteId);
    const consulta = consultasHoje().find(c => c.pacienteId === rota.pacienteId);
    texto += `⏰ ${rota.horarioEmbarque}\n👤 *${pac?.nome}*\n📍 ${rota.enderecoEmbarque}\n🕐 Consulta: ${consulta?.horario}\n\n`;
  }
  texto += `Confirme cada embarque pelo menu: *Sou Motorista da Van → Confirmar embarque*`;
  for (const tel of NUMEROS_MOTORISTAS) {
    await enviarWhatsApp(tel, texto);
    console.log(`  → Rota enviada para motorista ${tel}`);
  }
});

// Às 09h30: alerta de não confirmados para recepção
cron.schedule("30 9 * * 1-6", async () => {
  const consultas    = consultasHoje();
  const naoConf      = consultas.filter(c => !confirmacoes.has(c.id) || confirmacoes.get(c.id) === null);
  if (naoConf.length === 0 || NUMEROS_RECEPCAO.length === 0) return;
  let texto = `⚠️ *Alerta de Ausências — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
  texto += `${naoConf.length} paciente(s) ainda não confirmou presença:\n\n`;
  for (const c of naoConf) {
    const pac = pacientes.find(p => p.id === c.pacienteId);
    texto += `❓ *${pac?.nome}* — ${c.horario}\n📞 ${pac?.responsavel}: ${pac?.telefoneResponsavel}\n\n`;
  }
  texto += "Acesse o Painel da Recepção para ligar ou enviar mensagem.";
  for (const tel of NUMEROS_RECEPCAO) {
    await enviarWhatsApp(tel, texto);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA DE SAÚDE (para verificar se o servidor está online)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:   "online",
    sistema:  `Assistente NFS — ${CLINICA_NOME}`,
    versao:   "1.0.0",
    horario:  new Date().toLocaleString("pt-BR"),
    sessoes:  sessoes.size,
    twilio:   !!process.env.TWILIO_ACCOUNT_SID,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌈 Assistente NFS — ${CLINICA_NOME}`);
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📡 Webhook: POST /webhook`);
  console.log(`🔗 Saúde:   GET  /\n`);
  console.log(`👥 Recepção:  ${NUMEROS_RECEPCAO.length  || "⚠️ não configurado"} número(s)`);
  console.log(`🚐 Motoristas: ${NUMEROS_MOTORISTAS.length || "⚠️ não configurado"} número(s)`);
  if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID === "SEU_SID") {
    console.warn("\n⚠️  TWILIO não configurado! Preencha o arquivo .env com suas credenciais.");
    console.warn("   Copie .env.example → .env e preencha com os dados do seu painel Twilio.\n");
  }
});
