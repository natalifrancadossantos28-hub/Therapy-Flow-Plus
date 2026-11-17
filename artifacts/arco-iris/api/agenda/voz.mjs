// Minha Agenda: entende o que a pessoa falou (áudio do microfone ou texto) e devolve a ação pronta para confirmar.
// Não grava nada: o app mostra o resultado e só salva quando a pessoa confirma.
import { createClient } from "@supabase/supabase-js";

const CATEGORIAS = ["reuniao", "evento", "visita", "palestra", "urgente", "pessoal", "outro",
  "aniversario", "saude", "viagem", "familia", "contas", "escola", "lazer"];
// "gemini-2.0-flash" foi desligado pelo Google (404); os apelidos "-latest" acompanham a versão atual.
// O "lite" responde bem mais rápido; o "flash" entra em paralelo se ele demorar.
const MODELOS = [...new Set([process.env.GEMINI_MODEL, "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean))];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function hojeSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const iso = `${p.year}-${p.month}-${p.day}`;
  return { iso, hora: `${p.hour}:${p.minute}`, semana: SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()] };
}

function instrucoes(lista, temAudio, texto) {
  const h = hojeSP();
  return `Você organiza a agenda pessoal de uma pessoa brasileira (trabalho e vida pessoal). Ela pode pedir qualquer coisa: reunião, consulta, remédio, ligar para alguém, pagar conta, buscar filho, aniversário, viagem, lembrete simples. Hoje é ${h.semana}, ${h.iso}, agora são ${h.hora} (horário de Brasília).
${temAudio ? "Transcreva o áudio em português do Brasil e entenda o pedido." : `Pedido: "${texto}"`}

Compromissos já marcados (id | data | hora | título):
${lista.length ? lista.map((c) => `${c.id} | ${c.data} | ${c.hora ?? "dia todo"} | ${c.titulo}`).join("\n") : "(nenhum)"}

Responda SÓ com JSON neste formato:
{"transcricao": "texto exato que a pessoa falou",
 "acao": "criar" | "desmarcar" | "remarcar" | "concluir" | "comando" | "nada",
 "comando": "salvar" | "cancelar" | "corrigir" | null,
 "titulo": "título curto e claro, com inicial maiúscula (ex.: Reunião com a Secretaria de Saúde, Aniversário da Maria)" | null,
 "data": "AAAA-MM-DD" | null, "hora": "HH:MM" | null, "diaTodo": true | false,
 "local": "local, se foi dito" | null, "observacao": "detalhes extras ditos (ex.: levar presente)" | null,
 "categoria": um de ${JSON.stringify(CATEGORIAS)},
 "antecedenciaMin": minutos antes para avisar, se a pessoa pediu (ex.: "me avisa meia hora antes" = 30) | null,
 "alvoId": id do compromisso já marcado a que a pessoa se refere (para desmarcar, remarcar ou concluir) | null,
 "novaData": "AAAA-MM-DD" | null, "novaHora": "HH:MM" | null}

Regras:
- "criar": marcar/agendar/anotar/lembrar algo novo. Datas relativas ("amanhã", "sexta que vem", "dia 15", "daqui a 2 semanas") viram data real a partir de hoje. "3 da tarde" = 15:00, "meio-dia" = 12:00, "meia-noite" = 00:00.
- Se não falar o horário, deixe "hora" null; se for o dia todo (aniversário, feriado, viagem sem hora), "diaTodo": true. Nunca invente data ou horário que não foi dito.
- "desmarcar": cancelar/desmarcar/apagar/tirar um compromisso marcado. "remarcar": mudar/adiar/passar para outro dia ou horário (preencha novaData e/ou novaHora; o que não mudar fica null). "concluir": já fiz/terminei. Para esses três, escolha alvoId na lista acima pelo título e data mais parecidos. Se não achar, alvoId null.
- "cancelar a reunião", "cancela o dentista de amanhã", "desmarca a palestra", "apaga o compromisso de sexta" = SEMPRE "desmarcar" de um compromisso já marcado, NUNCA "criar". Nunca crie compromisso com título começando por cancelar/desmarcar/remarcar.
- "comando": só quando a frase inteira for apenas "salvar"/"confirmar"/"pode salvar", "cancelar" ou "corrigir" (sem dizer qual compromisso).
- Categoria: reuniao (reunião, encontro, alinhamento), evento (evento, inauguração, cerimônia, audiência, congresso), visita (visita externa), palestra (palestra, curso, treinamento), urgente (se disser urgente/importantíssimo), pessoal, aniversario (aniversário, festa, chá de bebê, casamento, comemoração), saude (médico, dentista, exame, consulta, academia, remédio), viagem (viagem, voo, aeroporto, hotel), familia (filhos, marido, mãe, família), contas (pagar, boleto, conta, banco, imposto), escola (escola, reunião de pais, faculdade), lazer (cinema, almoço com amigas, show, passeio), outro.
- Hora sem "da manhã/tarde/noite": "às 3", "às 4 e meia" de 1 a 6 = tarde (15:00, 16:30); 7 a 11 = manhã, salvo se o contexto indicar noite (jantar, festa, show). "e meia" = :30, "e quinze" = :15, "quinze para as 5" = 16:45, "meio-dia e meia" = 12:30.
- "me lembra de…", "não posso esquecer de…", "anota aí…" = "criar". O título é a coisa a fazer, sem "me lembra de" (ex.: "me lembra de tomar o remédio às 8" → "Tomar o remédio"). "daqui a 20 minutos"/"daqui a 2 horas" = hoje com a hora somada a agora.
- Fala com erro de reconhecimento ou palavras repetidas: entenda pela intenção, corrija o português do título e ignore "é…", "tipo", "né".
- Se não entender nada, "acao": "nada".`;
}

// Uma chamada ao Gemini, sem "pensar" (bem mais rápida); se o modelo não aceitar a opção (400), repete sem ela.
async function chamar(modelo, chave, partes, ate) {
  for (const rapido of [true, false]) {
    const espera = Math.min(9_000, ate - Date.now());
    if (espera < 1_500) throw new Error(`${modelo}: demorou demais`);
    const generationConfig = { temperature: 0, responseMimeType: "application/json", ...(rapido ? { thinkingConfig: { thinkingBudget: 0 } } : {}) };
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
        signal: AbortSignal.timeout(espera), method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: partes }], generationConfig }),
      });
    } catch (e) { throw new Error(`${modelo}: ${e?.name === "TimeoutError" ? "demorou demais" : String(e?.message ?? e)}`); }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(txt.replace(/^```(?:json)?|```$/g, "").trim());
    }
    if (!(rapido && r.status === 400)) throw new Error(`${modelo}: ${j?.error?.message ?? `HTTP ${r.status}`}`);
  }
  throw new Error(`${modelo}: sem resposta`);
}

// Para não deixar a pessoa esperando: começa no modelo principal e, se ele não responder em 1,5 s
// (ou der erro), já dispara o próximo em paralelo. Vale a primeira resposta boa.
function perguntar(chave, partes, modelos = MODELOS) {
  const ate = Date.now() + 25_000;
  return new Promise((ok, falha) => {
    let i = 0, rodando = 0, acabou = false, ultimo = "", timer = null;
    const proximo = () => {
      if (acabou) return;
      clearTimeout(timer);
      if (i >= modelos.length || Date.now() > ate - 2_000) { if (!rodando) { acabou = true; falha(new Error(ultimo || "IA indisponível")); } return; }
      const modelo = modelos[i++]; rodando++;
      chamar(modelo, chave, partes, ate).then((r) => { if (!acabou) { acabou = true; clearTimeout(timer); ok(r); } })
        .catch((e) => { ultimo = String(e?.message ?? e); rodando--; proximo(); });
      timer = setTimeout(proximo, 1_500);
    };
    proximo();
  });
}

const dataOk = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const horaOk = (s) => (typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null);
const txtOk = (s, n) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  const { token, audio, mime, texto, compromissos, confirmando } = req.body ?? {};
  if (typeof token !== "string" || token.length < 20) return res.status(401).json({ error: "sessão inválida" });
  if (!audio && !txtOk(texto, 600)) return res.status(400).json({ error: "nada para entender" });
  if (audio && (typeof audio !== "string" || audio.length > 4_000_000)) return res.status(413).json({ error: "áudio grande demais" });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  const chave = process.env.GEMINI_API_KEY ?? "";
  if (!chave) return res.status(503).json({ error: "sem-ia" });
  // Confere o PIN ao mesmo tempo que a IA trabalha (não espera um pelo outro).
  const sessaoOk = url && key
    ? createClient(url, key, { auth: { persistSession: false } }).rpc("agenda_exec_eu", { p_token: token }).then(({ error }) => !error, () => false)
    : Promise.resolve(true);

  const lista = (Array.isArray(compromissos) ? compromissos : []).slice(0, 150).map((c) => ({
    id: Number(c?.id), data: dataOk(c?.data), hora: horaOk(c?.hora?.slice?.(0, 5)), titulo: txtOk(c?.titulo, 80) ?? "",
  })).filter((c) => Number.isFinite(c.id) && c.data);
  const aviso = confirmando === true
    ? "\nATENÇÃO: já existe um compromisso na tela esperando confirmação. Se a pessoa só disser algo como \"salvar\", \"sim\", \"pode\", \"confirma\", \"isso\", \"tá certo\", responda acao \"comando\" com comando \"salvar\" (\"cancelar\"/\"não\" → \"cancelar\"; \"corrigir\"/\"errado\" → \"corrigir\"). Se falar um compromisso novo, interprete normalmente.\n"
    : "";
  const partes = [{ text: instrucoes(lista, Boolean(audio), txtOk(texto, 600)) + aviso }];
  if (audio) partes.push({ inline_data: { mime_type: (typeof mime === "string" && mime.split(";")[0]) || "audio/mp4", data: audio } });

  // Na confirmação a frase é curta ("salvar"): começa pelo modelo mais leve, que responde bem mais rápido.
  const ia = perguntar(chave, partes, confirmando === true ? [...new Set(["gemini-2.5-flash-lite", ...MODELOS])] : MODELOS);
  ia.catch(() => {});
  if (!(await sessaoOk)) return res.status(401).json({ error: "sessão inválida" });
  try {
    const r = await ia;
    const acoes = ["criar", "desmarcar", "remarcar", "concluir", "comando", "nada"];
    const ids = new Set(lista.map((c) => c.id));
    return res.status(200).json({
      transcricao: txtOk(r.transcricao, 600) ?? txtOk(texto, 600) ?? "",
      acao: acoes.includes(r.acao) ? r.acao : "nada",
      comando: ["salvar", "cancelar", "corrigir"].includes(r.comando) ? r.comando : null,
      titulo: txtOk(r.titulo, 120), data: dataOk(r.data), hora: horaOk(r.hora), diaTodo: r.diaTodo === true,
      local: txtOk(r.local, 120), observacao: txtOk(r.observacao, 300),
      categoria: CATEGORIAS.includes(r.categoria) ? r.categoria : "outro",
      antecedenciaMin: Number.isInteger(r.antecedenciaMin) && r.antecedenciaMin > 0 && r.antecedenciaMin <= 10080 ? r.antecedenciaMin : null,
      alvoId: ids.has(Number(r.alvoId)) ? Number(r.alvoId) : null,
      novaData: dataOk(r.novaData), novaHora: horaOk(r.novaHora),
    });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
}
