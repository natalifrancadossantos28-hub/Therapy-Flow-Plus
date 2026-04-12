require("dotenv").config();
const express     = require("express");
const bodyParser  = require("body-parser");
const cron        = require("node-cron");
const QRCode      = require("qrcode");
const pino        = require("pino");
const fs          = require("fs");
const { Pool }    = require("pg");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const app        = express();
const PORT       = process.env.PORT || 3001;
const COMPANY_ID = parseInt(process.env.COMPANY_ID || "2");  // arco-iris-ibiuna

const CLINICA_NOME     = "NFs gestão";
const CLINICA_ENDERECO = "R. Antônieta Corrêa dos Santos, 46 - Parque Bela Vista, Votorantim";
const CLINICA_MAPS     = "https://maps.app.goo.gl/exemplo";   // substitua pelo link real
const ASSINATURA       = "\n\n_Assistente NFS - Recepção_";

const NUMEROS_RECEPCAO   = (process.env.NUMEROS_RECEPCAO   || "").split(",").map(n => n.trim()).filter(Boolean);
const NUMEROS_MOTORISTAS = (process.env.NUMEROS_MOTORISTAS || "").split(",").map(n => n.trim()).filter(Boolean);
const GRUPO_PROFISSIONAIS = process.env.GRUPO_PROFISSIONAIS || ""; // JID do grupo de WhatsApp dos profissionais

const AI_BASE = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const AI_KEY  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS
// ─────────────────────────────────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const client = await db.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function buscarPacientePorTelefone(telefone) {
  const num = limparNumero(telefone);
  const sufixo = num.slice(-8);
  const rows = await query(
    `SELECT p.*, prof.name AS professional_name, prof.specialty, prof.phone AS professional_phone
       FROM patients p
       LEFT JOIN professionals prof ON p.professional_id = prof.id
      WHERE p.company_id = $1
        AND REGEXP_REPLACE(COALESCE(p.guardian_phone,''), '[^0-9]', '', 'g') LIKE '%' || $2
      LIMIT 1`,
    [COMPANY_ID, sufixo]
  );
  return rows[0] || null;
}

async function buscarConsultasData(data) {
  return query(
    `SELECT a.*, p.name AS patient_name, p.guardian_name, p.guardian_phone,
            p.address AS patient_address, p.prontuario,
            prof.name AS professional_name, prof.specialty, prof.phone AS professional_phone
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN professionals prof ON a.professional_id = prof.id
      WHERE a.company_id = $1 AND a.date = $2
      ORDER BY a.time`,
    [COMPANY_ID, data]
  );
}

async function buscarConsultasPacienteHoje(patientId) {
  const hoje = dataHoje();
  const rows = await query(
    `SELECT a.*, prof.name AS professional_name, prof.specialty
       FROM appointments a
       JOIN professionals prof ON a.professional_id = prof.id
      WHERE a.patient_id = $1 AND a.date = $2
      ORDER BY a.time`,
    [patientId, hoje]
  );
  return rows;
}

async function atualizarStatusConsulta(appointmentId, status) {
  await query(`UPDATE appointments SET status=$1, updated_at=NOW() WHERE id=$2`, [status, appointmentId]);
}

async function incrementarFaltas(patientId) {
  const rows = await query(`SELECT absence_count FROM patients WHERE id=$1`, [patientId]);
  const atual = rows[0]?.absence_count || 0;
  await query(`UPDATE patients SET absence_count=$1, updated_at=NOW() WHERE id=$2`, [atual + 1, patientId]);
  return atual + 1;
}

async function zerarFaltas(patientId) {
  await query(`UPDATE patients SET absence_count=0, updated_at=NOW() WHERE id=$1`, [patientId]);
}

async function moverParaFilaEspera(patientId, professionalId) {
  const hoje = dataHoje();
  await query(
    `INSERT INTO waiting_list (company_id, patient_id, professional_id, priority, entry_date)
     VALUES ($1, $2, $3, 'alta', $4)
     ON CONFLICT DO NOTHING`,
    [COMPANY_ID, patientId, professionalId, hoje]
  );
  await query(`UPDATE patients SET status='Fila de Espera', updated_at=NOW() WHERE id=$1`, [patientId]);
  await query(`UPDATE appointments SET status='cancelado', updated_at=NOW() WHERE patient_id=$1 AND date >= $2 AND company_id=$3`,
    [patientId, hoje, COMPANY_ID]);
}

async function buscarPacientesAmanha() {
  const amanha = dataAmanha();
  return buscarConsultasData(amanha);
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO DO BOT
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_FILE   = "/tmp/whatsapp_bot_status.json";
const ACTIVITY_FILE = "/tmp/bot_activity.json";
let sock           = null;
let qrCodeBase64   = null;
let statusConexao  = "aguardando";
let numeroConectado = null;
const sessoes      = new Map();

function salvarStatus(dados) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...dados, horario: new Date().toLocaleString("pt-BR"), sessoes: sessoes.size }));
  } catch {}
}

function logAtividade(mensagem, tipo = "info") {
  try {
    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const entrada = { t: agora, m: mensagem, tipo };
    let lista = [];
    try { lista = JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8")); } catch {}
    lista.unshift(entrada);
    if (lista.length > 50) lista = lista.slice(0, 50); // manter últimas 50
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(lista));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function limparNumero(jid) { return (jid || "").replace(/@.+$/, "").replace(/\D/g, ""); }
function jidParaNumero(jid) { return limparNumero(jid); }
function numeroParaJid(num) { return `${limparNumero(num)}@s.whatsapp.net`; }
function ehRecepcao(jid)    { return NUMEROS_RECEPCAO.includes(jidParaNumero(jid)); }
function ehMotorista(jid)   { return NUMEROS_MOTORISTAS.includes(jidParaNumero(jid)); }

function dataHoje() { return new Date().toISOString().split("T")[0]; }
function dataAmanha() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function formatarData(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function getSessao(jid) {
  if (!sessoes.has(jid)) sessoes.set(jid, { historico: [], paciente: null, consultasHoje: [] });
  return sessoes.get(jid);
}

async function enviar(jid, texto) {
  if (!sock || statusConexao !== "conectado") {
    console.warn(`⚠️  [OFFLINE] Para ${jid}: ${texto.substring(0, 60)}...`);
    return;
  }
  try { await sock.sendMessage(jid, { text: texto }); }
  catch (err) { console.error(`❌ Erro envio para ${jid}:`, err.message); }
}

async function enviarGrupoProfissionais(texto) {
  if (!GRUPO_PROFISSIONAIS) return;
  await enviar(GRUPO_PROFISSIONAIS, texto);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELIGÊNCIA ARTIFICIAL — INTERPRETAÇÃO DE MENSAGENS
// ─────────────────────────────────────────────────────────────────────────────
async function interpretarMensagem(mensagem, contexto) {
  if (!AI_BASE || !AI_KEY) {
    return { intencao: "outro", resposta: "Olá! Como posso ajudar?" + ASSINATURA, acoes: [] };
  }

  const nomeResponsavel = contexto.paciente?.responsavel || "Responsável";
  const nomePaciente    = contexto.paciente?.nome || "Paciente";
  const consultaHoje    = contexto.consultasHoje?.[0];
  const profissional    = consultaHoje?.profissional || "";
  const horarioConsulta = consultaHoje?.horario || "";

  const prompt = `Você é o "Assistente NFS", a recepção virtual da Clínica ${CLINICA_NOME}.

═══ SUA PERSONALIDADE ═══
- Seu nome é Assistente NFS. Você é extremamente educada, organizada e empática.
- Especialmente calorosa com mães e responsáveis — eles confiam você com seus filhos.
- Tom de voz: profissional, acolhedor e "limpo". NUNCA seja seco ou robótico.
- Use emojis com moderação e elegância: 🏥 ❤️ ✨ 💙 😊 — nunca exagere.
- Sempre use o NOME do responsável quando souber (${nomeResponsavel}).
- Sempre cite o NOME do paciente quando souber (${nomePaciente}).
- Você NUNCA pede para o usuário "digitar 1 para X". Você é CONVERSACIONAL.
- Assine sempre: "_Assistente NFS_ 🏥"

═══ CONTEXTO DA CONVERSA ═══
Tipo de remetente: ${contexto.tipo}
${contexto.paciente ? `Responsável: ${nomeResponsavel}
Paciente: ${nomePaciente}
Faltas acumuladas: ${contexto.paciente.faltas}
Status: ${contexto.paciente.status}` : "Remetente não cadastrado no sistema."}
${consultaHoje ? `Consulta hoje: ${horarioConsulta} com ${profissional} (status: ${consultaHoje.status})` : "Sem consulta registrada para hoje."}
Horário atual: ${contexto.horarioAtual}
${contexto.temAnexo ? "⚠️ O usuário enviou um arquivo/imagem junto com a mensagem." : ""}

═══ MENSAGEM RECEBIDA ═══
"${mensagem}"

═══ INTENÇÕES QUE VOCÊ DEVE DETECTAR ═══
Interprete LIVREMENTE — não dependa de palavras exatas. Exemplos:
- "não vai dar pra ir" = ausencia  |  "meu filho tá doente" = ausencia_justificada
- "vou sim" = confirmacao  |  "onde vocês ficam?" = duvida_endereco
- "qual o horário?" = duvida_horario  |  "quem é o próximo?" (motorista) = motorista_rota
- Envio de foto/documento = atestado (se contexto for médico)

Intenções: saudacao | confirmacao | ausencia | ausencia_justificada | atestado | cancelamento | duvida_endereco | duvida_horario | duvida_geral | chegada | motorista_rota | motorista_embarque | outro

═══ REGRAS DE RESPOSTA ═══
1. ausência por doença → muito acolhedor, deseje melhoras, informe que avisou a equipe
   Exemplo: "Entendi perfeitamente, ${nomeResponsavel}. Vou registrar aqui que o(a) ${nomePaciente} está com [motivo] e já estou avisando a equipe interna. Melhoras! ❤️"
2. ausência sem motivo → registre, informe que a equipe foi notificada
3. falta recorrente (>1 falta) → mais firme, mencione a política de 3 faltas
4. 3ª falta → informe que a vaga foi devolvida à lista de espera
5. duvida_endereco → dê o endereço completo E o link do GPS
6. confirmacao → resposta calorosa e animada
7. motorista → resposta direta e prática com os dados da rota
8. Arquivo enviado sem texto → agradeça o envio e pergunte do que se trata

═══ ENDEREÇO DA CLÍNICA ═══
${CLINICA_ENDERECO}
Link GPS: ${CLINICA_MAPS}

═══ FORMATO DE RESPOSTA ═══
Retorne APENAS JSON válido (sem texto antes ou depois):
{
  "intencao": "...",
  "resposta": "mensagem completa e humanizada para enviar (inclua assinatura)",
  "acoes": [],
  "tom": "acolhedor|firme|explicativo|informativo"
}

AÇÕES DISPONÍVEIS (inclua na lista "acoes" quando aplicável):
- {"tipo": "registrar_ausencia", "consultaId": N}
- {"tipo": "registrar_ausencia_justificada", "consultaId": N}
- {"tipo": "registrar_atestado", "consultaId": N}
- {"tipo": "registrar_confirmacao", "consultaId": N}
- {"tipo": "registrar_cancelamento", "consultaId": N}
- {"tipo": "notificar_profissionais", "mensagem": "texto para o grupo interno"}
- {"tipo": "notificar_recepcao", "mensagem": "texto para a recepção"}`;

  try {
    const response = await fetch(`${AI_BASE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (!data.content || !data.content[0]) throw new Error("Resposta vazia da IA");

    const texto = data.content[0].text.trim();
    // Extrair JSON da resposta
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON não encontrado na resposta");

    return JSON.parse(match[0]);
  } catch (err) {
    console.error("❌ Erro IA:", err.message);
    // Fallback com palavras-chave
    return interpretarFallback(mensagem);
  }
}

function interpretarFallback(mensagem) {
  const m = mensagem.toLowerCase();
  if (/não (vou|poderei|consigo|irei)|falta|não (vamos|vou ir)/.test(m)) {
    if (/doente|febre|gripado|mal|hospital|médico|emergência/.test(m)) {
      return { intencao: "ausencia_justificada", resposta: "Entendemos, esperamos que o Paciente se recupere logo. Recebemos sua mensagem e registramos a justificativa." + ASSINATURA, acoes: [] };
    }
    return { intencao: "ausencia", resposta: "Recebemos seu aviso de ausência. A equipe foi notificada." + ASSINATURA, acoes: [] };
  }
  if (/atestado|laudo|documento/.test(m)) {
    return { intencao: "atestado", resposta: "Atestado recebido com sucesso! Registramos e encaminhamos à equipe." + ASSINATURA, acoes: [] };
  }
  if (/confirmo|confirmado|estarei|vamos|vou sim|confirmar/.test(m)) {
    return { intencao: "confirmacao", resposta: "Consulta confirmada! Esperamos pelo Paciente." + ASSINATURA, acoes: [] };
  }
  if (/olá|oi|bom dia|boa tarde|boa noite/.test(m)) {
    return { intencao: "saudacao", resposta: "Olá! Como posso ajudar?" + ASSINATURA, acoes: [] };
  }
  return { intencao: "outro", resposta: "Recebemos sua mensagem. Em breve a recepção entrará em contato." + ASSINATURA, acoes: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTAR AÇÕES DA IA
// ─────────────────────────────────────────────────────────────────────────────
async function executarAcoes(acoes, paciente, sessao) {
  for (const acao of (acoes || [])) {
    try {
      switch (acao.tipo) {
        case "registrar_ausencia": {
          if (!acao.consultaId) break;
          await atualizarStatusConsulta(acao.consultaId, "faltou");
          const totalFaltas = paciente ? await incrementarFaltas(paciente.id) : 0;

          // Regra SUS: 3 faltas → remove da agenda
          if (paciente && totalFaltas >= 3) {
            const consultas = await buscarConsultasPacienteHoje(paciente.id);
            const profId = consultas[0]?.professional_id || paciente.professional_id;
            await moverParaFilaEspera(paciente.id, profId);
            await enviar(numeroParaJid(paciente.guardian_phone),
              `⚠️ *Aviso Importante*\n\nPrezado(a) *${paciente.guardian_name}*,\n\nInformamos que o(a) Paciente *${paciente.name}* acumulou *3 faltas consecutivas* sem justificativa.\n\nConforme a política da clínica (padrão SUS), a vaga foi devolvida à fila de espera da prefeitura.\n\nEm caso de dúvidas, entre em contato com a recepção.${ASSINATURA}`
            );
            await enviarGrupoProfissionais(`🔴 *REMOÇÃO AUTOMÁTICA*\n👤 Paciente: *${paciente.name}* (Prontuário: ${paciente.prontuario || "–"})\n📋 3 faltas consecutivas — removido(a) da agenda e retornado(a) à fila de espera.`);
          } else if (paciente && totalFaltas === 2) {
            await enviar(numeroParaJid(paciente.guardian_phone),
              `⚠️ *Atenção — 2ª Falta*\n\nPrezado(a) *${paciente.guardian_name}*,\n\nRegistramos a *2ª falta consecutiva* do(a) Paciente *${paciente.name}*.\n\n⚠️ Informamos que na *3ª falta consecutiva sem justificativa*, a vaga será automaticamente devolvida à fila de espera.\n\nEm caso de impedimento, avise-nos com antecedência.${ASSINATURA}`
            );
          } else if (paciente && totalFaltas === 1) {
            // Primeira falta: mensagem acolhedora
            await enviar(numeroParaJid(paciente.guardian_phone),
              `💙 *Olá, ${paciente.guardian_name}!*\n\nNotamos a ausência do(a) Paciente *${paciente.name}* hoje. Esperamos que esteja tudo bem com a família.\n\nSe precisar reagendar ou tiver alguma dúvida, estamos à disposição.${ASSINATURA}`
            );
          }
          break;
        }

        case "registrar_ausencia_justificada":
        case "registrar_atestado": {
          if (!acao.consultaId) break;
          await atualizarStatusConsulta(acao.consultaId, "falta_justificada");
          // Falta justificada não conta — zerar seria errado, mas não incrementamos
          if (paciente) {
            const consultas = await buscarConsultasPacienteHoje(paciente.id);
            const profName  = consultas[0]?.professional_name || "profissional";
            await enviarGrupoProfissionais(
              `🔵 *AUSÊNCIA JUSTIFICADA*\n👤 Paciente: *${paciente.name}* (Prontuário: ${paciente.prontuario || "–"})\n👩‍⚕️ Profissional: @${consultas[0]?.professional_id || ""}\n📝 Justificativa recebida via WhatsApp\n📋 Status: Aguardando Validação de Abono`
            );
          }
          break;
        }

        case "registrar_confirmacao": {
          if (!acao.consultaId) break;
          await atualizarStatusConsulta(acao.consultaId, "confirmado");
          await zerarFaltas(paciente?.id);
          break;
        }

        case "registrar_cancelamento": {
          if (!acao.consultaId) break;
          await atualizarStatusConsulta(acao.consultaId, "cancelado");
          if (paciente) {
            await enviarGrupoProfissionais(
              `❌ *CANCELAMENTO*\n👤 Paciente: *${paciente.name}*\n👩‍⚕️ ${sessao.consultasHoje[0]?.professional_name || "–"}\n⏰ ${sessao.consultasHoje[0]?.time || "–"}`
            );
          }
          break;
        }

        case "notificar_profissionais":
          if (acao.mensagem) await enviarGrupoProfissionais(acao.mensagem);
          break;

        case "notificar_recepcao":
          for (const num of NUMEROS_RECEPCAO) {
            await enviar(numeroParaJid(num), `🔔 *Assistente NFS*\n\n${acao.mensagem || ""}`);
          }
          break;
      }
    } catch (err) {
      console.error(`❌ Erro executando ação ${acao.tipo}:`, err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENSAGEM DE BOAS-VINDAS (chamada pelo sistema quando novo agendamento)
// ─────────────────────────────────────────────────────────────────────────────
async function enviarBoasVindas(appointment) {
  if (!appointment.guardian_phone) return;
  const jid = numeroParaJid(appointment.guardian_phone);
  const msg = `🌟 *Bem-vindo(a) à ${CLINICA_NOME}!*\n\n` +
    `Olá, *${appointment.guardian_name || "Responsável"}*!\n\n` +
    `Temos o prazer de informar que o(a) Paciente *${appointment.patient_name}* foi agendado(a) com sucesso:\n\n` +
    `📅 *Data:* ${formatarData(appointment.date)}\n` +
    `⏰ *Horário:* ${appointment.time}\n` +
    `👩‍⚕️ *Profissional:* ${appointment.professional_name}\n` +
    `🩺 *Especialidade:* ${appointment.specialty}\n\n` +
    `📍 *Endereço:*\n${CLINICA_ENDERECO}\n\n` +
    `🗺️ *Como chegar:* ${CLINICA_MAPS}\n\n` +
    `Em caso de dúvidas, estamos à disposição.${ASSINATURA}`;
  await enviar(jid, msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENÇA NA CLÍNICA (chamado pela recepção ao registrar chegada)
// ─────────────────────────────────────────────────────────────────────────────
async function notificarChegadaPaciente(patientName, time, professionalId) {
  await enviarGrupoProfissionais(
    `✅ *PACIENTE CHEGOU*\n👤 *${patientName}*\n⏰ Consulta: ${time}\n📢 @${professionalId} — seu paciente está aguardando!`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL DE MENSAGENS
// ─────────────────────────────────────────────────────────────────────────────
async function processarMensagem(jid, mensagem, temAnexo) {
  const sessao  = getSessao(jid);
  const isRecepcao  = ehRecepcao(jid);
  const isMotorista = ehMotorista(jid);

  // Buscar contexto do remetente
  if (!sessao.paciente) {
    sessao.paciente = await buscarPacientePorTelefone(jid);
  }
  if (sessao.consultasHoje.length === 0 && sessao.paciente) {
    sessao.consultasHoje = await buscarConsultasPacienteHoje(sessao.paciente.id);
  }

  const paciente = sessao.paciente;

  // Contexto para a IA
  const contexto = {
    tipo: isRecepcao ? "recepcao" : isMotorista ? "motorista" : "responsavel",
    paciente: paciente ? {
      nome: paciente.name,
      responsavel: paciente.guardian_name,
      faltas: paciente.absence_count || 0,
      status: paciente.status,
      prontuario: paciente.prontuario,
    } : null,
    consultasHoje: sessao.consultasHoje.map(c => ({
      id: c.id,
      horario: c.time,
      profissional: c.professional_name,
      especialidade: c.specialty,
      status: c.status,
    })),
    temAnexo,
    horarioAtual: new Date().toLocaleString("pt-BR"),
  };

  // Motoristas: fluxo específico
  if (isMotorista) {
    if (/rota|endereço|pacientes/i.test(mensagem)) {
      return await gerarRotaVan();
    }
    if (/estou a caminho/i.test(mensagem)) {
      return await processarMotoristaACaminho();
    }
  }

  // IA interpreta a mensagem
  const resultado = await interpretarMensagem(mensagem, contexto);
  console.log(`🤖 [IA] ${jid} → ${resultado.intencao} | tom: ${resultado.tom}`);

  // Executar ações
  await executarAcoes(resultado.acoes, paciente, sessao);

  // Guardar no histórico (máximo 10 mensagens)
  sessao.historico.push({ role: "user", content: mensagem });
  sessao.historico.push({ role: "assistant", content: resultado.resposta });
  if (sessao.historico.length > 20) sessao.historico = sessao.historico.slice(-20);

  return resultado.resposta;
}

async function gerarRotaVan() {
  const consultas = await buscarConsultasData(dataHoje());
  if (consultas.length === 0) return "🚐 Nenhum paciente na rota de hoje." + ASSINATURA;
  let texto = `🚐 *Rota do Dia — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
  consultas.forEach((c, i) => {
    texto += `${i + 1}. *${c.patient_name}*\n   📍 ${c.patient_address || "Endereço não cadastrado"}\n   ⏰ Consulta: ${c.time} (${c.specialty})\n\n`;
  });
  texto += `🏁 *Destino final:*\n${CLINICA_ENDERECO}${ASSINATURA}`;
  return texto;
}

async function processarMotoristaACaminho() {
  // Notifica todos os responsáveis de quem tem consulta hoje
  const consultas = await buscarConsultasData(dataHoje());
  let count = 0;
  for (const c of consultas) {
    if (c.guardian_phone) {
      const jid = numeroParaJid(c.guardian_phone);
      await enviar(jid,
        `🚐 *Aviso da NFs — Transporte*\n\nOlá, *${c.guardian_name || "Responsável"}*!\n\nO transporte da clínica está a caminho para buscar o(a) Paciente *${c.patient_name}*.\n\nPor favor, deixe o(a) Paciente pronto(a) para embarcar em breve.${ASSINATURA}`
      );
      count++;
    }
  }
  return `✅ *${count} responsável(is) notificado(is)* que o transporte está a caminho.${ASSINATURA}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────

// 18h: Lembrete para consultas do dia seguinte
cron.schedule("0 18 * * *", async () => {
  console.log("⏰ [CRON 18h] Enviando lembretes de amanhã...");
  try {
    const consultas = await buscarPacientesAmanha();
    for (const c of consultas) {
      if (!c.guardian_phone) continue;
      const jid = numeroParaJid(c.guardian_phone);
      const msg = `🔔 *Lembrete de Consulta — ${CLINICA_NOME}*\n\n` +
        `Olá, *${c.guardian_name || "Responsável"}*!\n\n` +
        `Lembramos que o(a) Paciente *${c.patient_name}* tem consulta *amanhã*:\n\n` +
        `📅 *Data:* ${formatarData(c.date)}\n` +
        `⏰ *Horário:* ${c.time}\n` +
        `👩‍⚕️ *Profissional:* ${c.professional_name}\n` +
        `🩺 *Especialidade:* ${c.specialty}\n\n` +
        `Por favor, confirme a presença respondendo *SIM* ou *NÃO*.${ASSINATURA}`;
      await enviar(jid, msg);
      await new Promise(r => setTimeout(r, 1500)); // Evitar rate limit
    }
    console.log(`✅ ${consultas.length} lembretes enviados.`);
  } catch (err) {
    console.error("❌ Erro no cron 18h:", err.message);
  }
}, { timezone: "America/Sao_Paulo" });

// 7h: Bom dia para a recepção com resumo do dia
cron.schedule("0 7 * * 1-5", async () => {
  console.log("⏰ [CRON 7h] Enviando resumo matinal...");
  try {
    const consultas = await buscarConsultasData(dataHoje());
    if (consultas.length === 0) return;

    let texto = `☀️ *Bom dia! Agenda de hoje — ${new Date().toLocaleDateString("pt-BR")}*\n\n`;
    consultas.forEach((c, i) => {
      texto += `${i + 1}. ${c.time} — *${c.patient_name}*\n   👩‍⚕️ ${c.professional_name} · ${c.specialty}\n`;
    });
    texto += `\n📊 Total: *${consultas.length} atendimentos*${ASSINATURA}`;

    for (const num of NUMEROS_RECEPCAO) {
      await enviar(numeroParaJid(num), texto);
    }
    await enviarGrupoProfissionais(texto);
  } catch (err) {
    console.error("❌ Erro no cron 7h:", err.message);
  }
}, { timezone: "America/Sao_Paulo" });

// ─────────────────────────────────────────────────────────────────────────────
// BAILEYS — CONEXÃO WHATSAPP
// ─────────────────────────────────────────────────────────────────────────────
async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessao_whatsapp");
  const { version }          = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
    browser: ["Assistente NFS", "Chrome", "1.0"],
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      statusConexao  = "conectando";
      qrCodeBase64   = await QRCode.toDataURL(qr);
      salvarStatus({ status: "conectando", qrCode: qrCodeBase64 });
      console.log("📱 Novo QR Code gerado — acesse: /api/whatsapp/panel");
    }
    if (connection === "open") {
      statusConexao  = "conectado";
      qrCodeBase64   = null;
      numeroConectado = sock.user?.id?.split(":")[0] || "";
      salvarStatus({ status: "conectado", numero: numeroConectado });
      console.log(`✅ WhatsApp conectado! Número: +${numeroConectado}`);
      logAtividade(`✅ WhatsApp conectado — +${numeroConectado}`, "sucesso");
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconectar = code !== DisconnectReason.loggedOut;
      statusConexao = "desconectado";
      salvarStatus({ status: "desconectado", qrCode: null });
      console.log(`🔴 Desconectado. Código: ${code}. Reconectando: ${reconectar}`);
      logAtividade(`🔴 Desconectado (código ${code}) — reconectando...`, "erro");
      if (reconectar) setTimeout(conectarWhatsApp, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`🔔 [upsert] type=${type} count=${messages.length}`);
    for (const msg of messages) {
      if (msg.key.fromMe) { console.log("  ⏭️  fromMe, ignorando"); continue; }
      if (!msg.message)   { console.log("  ⏭️  sem .message, ignorando"); continue; }

      const jid = msg.key.remoteJid;
      console.log(`  🔍 jid=${jid} type=${type}`);
      if (!jid || jid.includes("status@")) { console.log(`  ⏭️  jid status, ignorando`); continue; }
      // Aceitar qualquer type (notify, append, etc)


      const texto = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.documentMessage?.caption ||
        ""
      ).trim();

      const temAnexo = !!(
        msg.message.imageMessage ||
        msg.message.documentMessage ||
        msg.message.audioMessage
      );

      console.log(`  📩 [${jid}] texto="${texto}" temAnexo=${temAnexo}`);

      if (!texto && !temAnexo) { console.log("  ⏭️  sem texto nem anexo, ignorando"); continue; }

      try {
        const resposta = await processarMensagem(jid, texto || "(arquivo enviado)", temAnexo);
        console.log(`  ✉️  resposta=${resposta?.substring(0, 60)}`);
        if (resposta) await enviar(jid, resposta);
      } catch (err) {
        console.error(`  ❌ Erro processarMensagem: ${err.message}`, err.stack?.split("\n")[1]);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API ENDPOINTS (para integração com NFs gestão)
// ─────────────────────────────────────────────────────────────────────────────
app.use(bodyParser.json());

// Endpoint: NFs gestão chama isso quando cria novo agendamento
app.post("/webhook/novo-agendamento", async (req, res) => {
  try {
    const { appointment } = req.body;
    if (!appointment) return res.status(400).json({ error: "appointment obrigatório" });
    await enviarBoasVindas(appointment);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Recepção registra chegada do paciente
app.post("/webhook/chegada-paciente", async (req, res) => {
  try {
    const { patientName, time, professionalId } = req.body;
    await notificarChegadaPaciente(patientName, time, professionalId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Enviar campanha/mensagem em massa
app.post("/webhook/campanha", async (req, res) => {
  try {
    const { mensagem, companyId } = req.body;
    if (!mensagem) return res.status(400).json({ error: "mensagem obrigatória" });

    const pacientes = await query(
      `SELECT guardian_name, guardian_phone, name FROM patients WHERE company_id=$1 AND guardian_phone IS NOT NULL AND status='Atendimento'`,
      [companyId || COMPANY_ID]
    );

    let enviados = 0;
    for (const p of pacientes) {
      const texto = mensagem
        .replace("{{responsavel}}", p.guardian_name || "Responsável")
        .replace("{{paciente}}", p.name || "Paciente")
        + ASSINATURA;
      await enviar(numeroParaJid(p.guardian_phone), texto);
      enviados++;
      await new Promise(r => setTimeout(r, 2000));
    }
    res.json({ ok: true, enviados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Endpoint de voz para o painel da recepção ──
app.post(["/voice-chat", "/assistente-nfs/voice-chat"], async (req, res) => {
  try {
    const { pergunta } = req.body;
    if (!pergunta) return res.status(400).json({ error: "pergunta obrigatória" });

    const hoje = dataHoje();
    const consultasHoje = await buscarConsultasData(hoje);

    const resumo = consultasHoje.length === 0
      ? "Nenhuma consulta agendada para hoje."
      : consultasHoje.map(c =>
          `- ${c.time}: ${c.patient_name} com ${c.professional_name} (${c.specialty}) — Status: ${c.status}`
        ).join("\n");

    const prompt = `Você é o Assistente NFS respondendo à EQUIPE INTERNA da Clínica NFs gestão.
Você é a "recepcionista virtual de luxo" — responsa de forma clara, rápida e elegante.
Use o nome "Assistente NFS" quando se apresentar.
A resposta deve ser CURTA e DIRETA (máximo 3 frases) pois será lida em voz alta.

DADOS DE HOJE (${new Date().toLocaleDateString("pt-BR")}):
${resumo}

PERGUNTA DA EQUIPE: "${pergunta}"

Responda em português brasileiro natural, como se estivesse falando ao vivo.
Não use markdown, asteriscos ou emojis — apenas texto limpo para voz.`;

    const response = await fetch(`${AI_BASE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const resposta = data.content?.[0]?.text?.trim() || "Desculpe, não consegui processar sua pergunta agora.";
    logAtividade(`🎙️ Voz: "${pergunta.substring(0, 40)}..." → IA respondeu`, "info");
    res.json({ resposta });
  } catch (err) {
    console.error("❌ voice-chat:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de atividade (leitura)
app.get(["/activity", "/assistente-nfs/activity"], (req, res) => {
  try {
    let lista = [];
    try { lista = JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8")); } catch {}
    res.json(lista);
  } catch (err) {
    res.json([]);
  }
});

// Teste: simular mensagem recebida
app.post(["/test-msg", "/assistente-nfs/test-msg"], async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    if (!numero || !mensagem) return res.status(400).json({ error: "numero e mensagem obrigatorios" });
    const jid = numeroParaJid(numero);
    console.log(`🧪 [TESTE] Simulando mensagem de ${jid}: "${mensagem}"`);
    const resposta = await processarMensagem(jid, mensagem, false);
    console.log(`🧪 [TESTE] Resposta: ${resposta?.substring(0, 100)}`);
    res.json({ ok: true, resposta });
  } catch (err) {
    console.error("🧪 [TESTE] Erro:", err.message, err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Status do bot
app.get(["/status", "/assistente-nfs/status"], (req, res) => {
  res.json({ status: statusConexao, numeroConectado, sessoesAtivas: sessoes.size, horario: new Date().toLocaleString("pt-BR") });
});

// Redirect para painel
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Assistente NFs</title>
  <style>body{font-family:sans-serif;background:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;min-height:100vh;gap:16px}.spin{width:36px;height:36px;border:4px solid #eee;border-top-color:#25D366;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}p{color:#555}a{color:#1a73e8}</style>
  <script>window.addEventListener('load',function(){var b=window.location.protocol+'//'+window.location.hostname;window.location.replace(b+'/api/whatsapp/panel');});</script>
  </head><body><div class="spin"></div><p>Abrindo painel...</p><a id="l" href="#">Clique aqui se não redirecionar</a>
  <script>document.getElementById('l').href=window.location.protocol+'//'+window.location.hostname+'/api/whatsapp/panel';</script>
  </body></html>`);
});

app.listen(PORT, () => {
  console.log(`\n💬 Assistente NFs — ${CLINICA_NOME}`);
  console.log(`✅ Servidor na porta ${PORT}`);
  console.log(`🤖 IA: ${AI_BASE ? "Anthropic Claude ativo" : "⚠️  IA não configurada"}`);
  console.log(`🗄️  DB: ${process.env.DATABASE_URL ? "PostgreSQL conectado" : "⚠️  DATABASE_URL ausente"}`);
  console.log(`📱 Acesse /api/whatsapp/panel para o QR Code\n`);
});

conectarWhatsApp().catch(err => console.error("❌ Erro ao conectar WhatsApp:", err));
