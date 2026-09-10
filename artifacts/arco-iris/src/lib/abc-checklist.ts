/**
 * ABC — Autism Behavior Checklist, versão brasileira. Mesmo protocolo do app
 * NFs – Triagem (artifacts/triagem): 57 itens com peso 1–4 e explicação
 * simplificada, em 5 áreas:
 *   ES  Estímulo Sensorial            (máx. 26)
 *   RE  Relacionamento                (máx. 38)
 *   CO  Uso do Corpo e Objetos        (máx. 40)
 *   LG  Linguagem                     (máx. 29)
 *   PS  Desenv. Pessoal e Social      (máx. 25)
 * Total máximo: 158.
 *
 * Grau de impacto:
 *   Nível 1 — Alto impacto     total >= 68  (vermelho)
 *   Nível 2 — Impacto moderado 55..67       (amarelo)
 *   Nível 3 — Baixo impacto    total <  55  (verde)
 */

export type AbcAreaKey = "sensorial" | "relacionamento" | "corpo" | "linguagem" | "pessoalSocial";

export type AbcItem = {
  /** Número do item no protocolo (1..57) — é o que fica gravado em `respostas`. */
  id: number;
  area: AbcAreaKey;
  peso: 1 | 2 | 3 | 4;
  texto: string;
  /** Explicação simplificada para a família/aplicador. */
  hint: string;
};

export type AbcArea = { key: AbcAreaKey; code: string; label: string; short: string; color: string; bg: string; printColor: string };

export const ABC_AREAS: AbcArea[] = [
  { key: "sensorial",      code: "ES", label: "Estímulo Sensorial",       short: "Sensorial",    color: "#a855f7", bg: "rgba(168,85,247,0.12)", printColor: "#7c3aed" },
  { key: "relacionamento", code: "RE", label: "Relacionamento",           short: "Relacion.",    color: "#3b82f6", bg: "rgba(59,130,246,0.12)", printColor: "#2563eb" },
  { key: "corpo",          code: "CO", label: "Uso do Corpo e Objetos",   short: "Corpo/Obj.",   color: "#f97316", bg: "rgba(249,115,22,0.12)", printColor: "#ea580c" },
  { key: "linguagem",      code: "LG", label: "Linguagem",                short: "Linguagem",    color: "#22c55e", bg: "rgba(34,197,94,0.12)",  printColor: "#16a34a" },
  { key: "pessoalSocial",  code: "PS", label: "Desenv. Pessoal e Social", short: "Pessoal-Soc.", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  printColor: "#dc2626" },
];

export const ABC_AREA_BY_KEY: Record<AbcAreaKey, AbcArea> = Object.fromEntries(ABC_AREAS.map(a => [a.key, a])) as Record<AbcAreaKey, AbcArea>;

export const ABC_ITEMS: AbcItem[] = [
  { id:  1, area: "corpo",          peso: 4, texto: "Gira em torno de si por longo período de tempo", hint: "Ele fica rodando o próprio corpo várias vezes, como se fosse um peão?" },
  { id:  2, area: "pessoalSocial",  peso: 2, texto: "Aprende uma tarefa, mas esquece rapidamente", hint: "Você ensina algo hoje e amanhã ele já não lembra mais como fazer?" },
  { id:  3, area: "relacionamento", peso: 4, texto: "É raro atender estímulo não verbal social/ambiente (expressões, gestos, situações)", hint: "Ele costuma ignorar quando você faz gestos, aponta para algo ou faz expressões faciais?" },
  { id:  4, area: "linguagem",      peso: 1, texto: "Ausência de resposta para solicitações verbais — venha cá; sente-se", hint: "Quando você pede 'vem cá' ou 'senta aqui', ele não responde ou ignora?" },
  { id:  5, area: "corpo",          peso: 2, texto: "Usa brinquedos inapropriadamente", hint: "Em vez de brincar do jeito esperado (ex: empurrar o carrinho), ele faz outra coisa (ex: só gira a rodinha)?" },
  { id:  6, area: "sensorial",      peso: 2, texto: "Pobre uso da discriminação visual (fixa uma característica do objeto)", hint: "Ele fica olhando só para uma parte do brinquedo (ex: só a roda, só a cor) em vez de ver o todo?" },
  { id:  7, area: "relacionamento", peso: 2, texto: "Ausência do sorriso social", hint: "Ele não sorri de volta quando alguém sorri para ele?" },
  { id:  8, area: "linguagem",      peso: 3, texto: "Uso inadequado de pronomes (eu por ele)", hint: "Ele fala de si mesmo na terceira pessoa? (Ex: 'Ele quer água' em vez de 'Eu quero água')" },
  { id:  9, area: "corpo",          peso: 3, texto: "Insiste em manter certos objetos consigo", hint: "Ele anda para todo lado segurando sempre o mesmo objeto e não quer largar de jeito nenhum?" },
  { id: 10, area: "sensorial",      peso: 3, texto: "Parece não escutar (suspeita-se de perda de audição)", hint: "Às vezes parece que ele não ouve quando você chama, mesmo estando perto?" },
  { id: 11, area: "linguagem",      peso: 4, texto: "Fala monótona e sem ritmo", hint: "A fala dele é sempre no mesmo tom, sem variação, quase como um robô?" },
  { id: 12, area: "corpo",          peso: 4, texto: "Balança-se por longos períodos de tempo", hint: "Ele fica se balançando para frente e para trás por muito tempo, sentado ou em pé?" },
  { id: 13, area: "relacionamento", peso: 2, texto: "Não estende o braço para ser pego (nem o fez quando bebê)", hint: "Quando você vai pegá-lo no colo, ele não levanta os bracinhos para você?" },
  { id: 14, area: "pessoalSocial",  peso: 3, texto: "Fortes reações frente a mudanças no ambiente", hint: "Ele fica muito irritado ou nervoso quando algo muda na rotina ou no ambiente (ex: trocar de caminho, mudar os móveis)?" },
  { id: 15, area: "corpo",          peso: 2, texto: "Ausência de atenção ao seu nome quando entre 2 outras crianças", hint: "Quando está perto de outras crianças e você chama o nome dele, ele não olha?" },
  { id: 16, area: "corpo",          peso: 4, texto: "Corre interrompendo com giros em torno de si, balanceio de mãos", hint: "Ele sai correndo e no meio da corrida para, gira o corpo ou sacode as mãos?" },
  { id: 17, area: "relacionamento", peso: 3, texto: "Ausência de resposta para expressão facial/sentimento de outros", hint: "Se alguém está chorando ou triste perto dele, ele não reage nem parece perceber?" },
  { id: 18, area: "linguagem",      peso: 2, texto: "Raramente usa 'sim' ou 'eu'", hint: "Ele quase nunca diz 'sim' ou 'eu' quando fala?" },
  { id: 19, area: "pessoalSocial",  peso: 4, texto: "Possui habilidade numa área do desenvolvimento", hint: "Ele é muito bom em uma coisa específica (ex: decorar números, montar puzzles), mas tem dificuldade em outras?" },
  { id: 20, area: "linguagem",      peso: 1, texto: "Ausência de respostas a solicitações verbal envolvendo o uso de referenciais de espaço", hint: "Quando você diz 'coloca em cima da mesa' ou 'pega embaixo da cadeira', ele não entende?" },
  { id: 21, area: "sensorial",      peso: 3, texto: "Reação de sobressalto a som intenso (suspeita de surdez)", hint: "Ele não se assusta com barulhos fortes (fogos, porta batendo) como outras crianças?" },
  { id: 22, area: "corpo",          peso: 4, texto: "Balança as mãos", hint: "Ele fica sacudindo ou abanando as mãos repetidamente, como se estivesse 'batendo asas'?" },
  { id: 23, area: "pessoalSocial",  peso: 3, texto: "Intensos acessos de raiva e/ou frequentes 'chiliques'", hint: "Ele tem crises de raiva muito fortes ou faz birra intensa com frequência?" },
  { id: 24, area: "relacionamento", peso: 4, texto: "Evita ativamente o contato visual", hint: "Ele desvia o olhar de propósito quando você tenta olhar nos olhos dele?" },
  { id: 25, area: "relacionamento", peso: 4, texto: "Resiste ao toque / ao ser pego / ao carinho", hint: "Ele não gosta de ser abraçado, tocado ou pegado no colo? Fica incomodado?" },
  { id: 26, area: "sensorial",      peso: 3, texto: "Não reage a estímulos dolorosos", hint: "Quando se machuca (cai, bate), ele não chora nem parece sentir dor?" },
  { id: 27, area: "relacionamento", peso: 3, texto: "Difícil e rígido no colo (ou foi quando bebê)", hint: "Quando você pega ele no colo, o corpo fica duro, esticado, difícil de acomodar?" },
  { id: 28, area: "relacionamento", peso: 2, texto: "Flácido quando no colo", hint: "Quando está no colo, ele fica 'mole demais', sem firmeza, como se não segurasse o corpo?" },
  { id: 29, area: "linguagem",      peso: 2, texto: "Aponta para indicar objeto desejado", hint: "Ele aponta com o dedo para mostrar o que quer? (Se SIM, marque este item)" },
  { id: 30, area: "corpo",          peso: 2, texto: "Anda nas pontas dos pés", hint: "Ele caminha na ponta dos pés em vez de pisar com o pé inteiro no chão?" },
  { id: 31, area: "pessoalSocial",  peso: 2, texto: "Machuca outros mordendo, batendo, etc", hint: "Ele morde, bate ou arranha outras crianças ou adultos?" },
  { id: 32, area: "linguagem",      peso: 3, texto: "Repete a mesma frase muitas vezes", hint: "Ele fica repetindo a mesma frase várias vezes, mesmo fora de contexto?" },
  { id: 33, area: "relacionamento", peso: 3, texto: "Ausência de imitação de brincadeiras de outras crianças", hint: "Ele não copia o que as outras crianças estão fazendo na brincadeira?" },
  { id: 34, area: "sensorial",      peso: 1, texto: "Ausência de reação do piscar quando luz forte incide em seus olhos", hint: "Quando uma luz forte bate nos olhos dele, ele não pisca nem fecha os olhos?" },
  { id: 35, area: "corpo",          peso: 2, texto: "Machuca-se mordendo, batendo a cabeça, etc", hint: "Ele se morde, bate a cabeça na parede ou se machuca de propósito?" },
  { id: 36, area: "pessoalSocial",  peso: 2, texto: "Não espera para ser atendido (quer as coisas imediatamente)", hint: "Ele não consegue esperar sua vez? Quer tudo na hora, sem paciência?" },
  { id: 37, area: "linguagem",      peso: 1, texto: "Não aponta para mais que cinco objetos", hint: "Ele quase não usa o dedo para apontar e mostrar coisas para você?" },
  { id: 38, area: "relacionamento", peso: 4, texto: "Dificuldade de fazer amigos", hint: "Ele tem dificuldade de brincar junto com outras crianças ou de fazer amizades?" },
  { id: 39, area: "sensorial",      peso: 4, texto: "Tapa as orelhas para vários sons", hint: "Ele cobre ou tapa as orelhas quando ouve certos sons (aspirador, liquidificador, música alta)?" },
  { id: 40, area: "corpo",          peso: 4, texto: "Gira, bate objetos muitas vezes", hint: "Ele fica girando ou batendo objetos de forma repetitiva por muito tempo?" },
  { id: 41, area: "pessoalSocial",  peso: 1, texto: "Dificuldade para o treino de toalete", hint: "Ele tem muita dificuldade para aprender a usar o banheiro sozinho?" },
  { id: 42, area: "linguagem",      peso: 2, texto: "Usa de 0 a 5 palavras/dia para indicar necessidades e o que quer", hint: "No dia a dia, ele fala muito pouco (menos de 5 palavras) para pedir o que precisa?" },
  { id: 43, area: "relacionamento", peso: 3, texto: "Frequentemente muito ansioso ou medroso", hint: "Ele demonstra medo ou ansiedade excessiva em situações do dia a dia?" },
  { id: 44, area: "sensorial",      peso: 3, texto: "Franze, cobre ou virar os olhos quando em presença de luz natural", hint: "Ele fecha os olhos, faz careta ou vira o rosto quando está em ambientes com luz do sol?" },
  { id: 45, area: "pessoalSocial",  peso: 1, texto: "Não se veste sem ajuda", hint: "Ele não consegue colocar a roupa sozinho, mesmo peças simples?" },
  { id: 46, area: "linguagem",      peso: 3, texto: "Repete constantemente as mesmas palavras e/ou sons", hint: "Ele fica repetindo as mesmas palavras ou sons o tempo todo, como um 'eco'?" },
  { id: 47, area: "relacionamento", peso: 4, texto: "'Olha através' das pessoas", hint: "Quando alguém está na frente dele, ele olha como se a pessoa fosse transparente, sem enxergar de verdade?" },
  { id: 48, area: "linguagem",      peso: 4, texto: "Repete perguntas e frases ditas por outras pessoas", hint: "Se você pergunta 'quer água?', ele repete 'quer água?' em vez de responder sim ou não?" },
  { id: 49, area: "pessoalSocial",  peso: 2, texto: "Frequentemente inconsciente dos perigos de situações e do ambiente", hint: "Ele não percebe perigos (rua movimentada, altura, objetos quentes) como outras crianças?" },
  { id: 50, area: "pessoalSocial",  peso: 4, texto: "Prefere manipular e ocupar-se com objetos inanimados", hint: "Ele prefere ficar mexendo em objetos (chaves, tampas, fios) em vez de brincar com pessoas?" },
  { id: 51, area: "corpo",          peso: 3, texto: "Toca, cheira ou lambe objetos do ambiente", hint: "Ele tem o hábito de cheirar, lamber ou passar a mão em objetos ou superfícies?" },
  { id: 52, area: "sensorial",      peso: 3, texto: "Frequentemente não reage visualmente à presença de novas pessoas", hint: "Quando alguém novo chega perto, ele não olha nem demonstra curiosidade?" },
  { id: 53, area: "corpo",          peso: 4, texto: "Repete sequências de comportamentos complicados (cobrir coisas, por ex.)", hint: "Ele faz rituais repetitivos (ex: cobrir e descobrir objetos, abrir e fechar portas várias vezes)?" },
  { id: 54, area: "corpo",          peso: 2, texto: "Destrutivo com seus brinquedos e coisas da família", hint: "Ele quebra ou destrói brinquedos e objetos da casa com frequência?" },
  { id: 55, area: "pessoalSocial",  peso: 1, texto: "O atraso no desenvolvimento identificado antes dos 30 meses", hint: "Algum atraso no desenvolvimento (fala, andar, socializar) foi percebido antes dos 2 anos e meio?" },
  { id: 56, area: "linguagem",      peso: 3, texto: "Usa mais que 15 e menos que 30 frases diárias para comunicar-se", hint: "No dia a dia, ele fala entre 15 e 30 frases para se comunicar (vocabulário limitado)?" },
  { id: 57, area: "sensorial",      peso: 4, texto: "Olha fixamente o ambiente por longos períodos de tempo", hint: "Ele fica parado olhando para o nada ou para um ponto fixo por muito tempo?" },
];

export const ABC_AREA_MAX: Record<AbcAreaKey, number> = ABC_ITEMS.reduce(
  (acc, it) => { acc[it.area] += it.peso; return acc; },
  { sensorial: 0, relacionamento: 0, corpo: 0, linguagem: 0, pessoalSocial: 0 } as Record<AbcAreaKey, number>,
);

export const ABC_TOTAL_MAX = ABC_ITEMS.reduce((s, it) => s + it.peso, 0);

export type AbcNivel = 1 | 2 | 3;

export const ABC_NIVEL_ALTO_MIN = 68;
export const ABC_NIVEL_MODERADO_MIN = 55;

export function abcNivel(total: number): AbcNivel {
  if (total >= ABC_NIVEL_ALTO_MIN) return 1;
  if (total >= ABC_NIVEL_MODERADO_MIN) return 2;
  return 3;
}

export const ABC_NIVEL_INFO: Record<AbcNivel, { nivel: string; nome: string; label: string; short: string; desc: string; color: string; bg: string; border: string }> = {
  1: { nivel: "Nível 1", nome: "Alto Impacto",     label: "Nível 1 — Alto Impacto",     short: "Alto",     desc: "Comportamentos com prejuízo significativo na interação, autorregulação e participação", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.5)" },
  2: { nivel: "Nível 2", nome: "Impacto Moderado", label: "Nível 2 — Impacto Moderado", short: "Moderado", desc: "Comportamentos que interferem parcialmente no engajamento e desempenho funcional",      color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.5)" },
  3: { nivel: "Nível 3", nome: "Baixo Impacto",    label: "Nível 3 — Baixo Impacto",    short: "Baixo",    desc: "Pouca interferência comportamental na participação e nas atividades",                     color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.5)" },
};

export const ABC_DISCLAIMER = "A classificação tem caráter organizacional e não diagnóstico, sendo utilizada exclusivamente para definição de prioridade assistencial e direcionamento terapêutico.";

export type AbcScores = {
  porArea: Record<AbcAreaKey, number>;
  total: number;
  nivel: AbcNivel;
};

/** Calcula pontuação por área, total e nível a partir dos itens marcados. */
export function calcAbcScores(marcados: Iterable<number>): AbcScores {
  const set = new Set(marcados);
  const porArea: Record<AbcAreaKey, number> = { sensorial: 0, relacionamento: 0, corpo: 0, linguagem: 0, pessoalSocial: 0 };
  let total = 0;
  for (const it of ABC_ITEMS) {
    if (!set.has(it.id)) continue;
    porArea[it.area] += it.peso;
    total += it.peso;
  }
  return { porArea, total, nivel: abcNivel(total) };
}

export function abcItemsByArea(area: AbcAreaKey): AbcItem[] {
  return ABC_ITEMS.filter(i => i.area === area);
}

export type AbcPrintInput = {
  nome: string;
  prontuario?: string | null;
  dataNascimento?: string | null;
  /** Data da aplicação (YYYY-MM-DD ou ISO). */
  dataAplicacao?: string | null;
  tipo?: "entrada" | "alta";
  marcados: Iterable<number>;
  observacoes?: string | null;
  profissional?: string | null;
};

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function fmtData(d?: string | null): string {
  if (!d) return "—";
  const iso = d.length === 10 ? `${d}T00:00:00` : d;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
}

/** Abre a folha de impressão do Checklist ABC (mesmo layout do app NFs – Triagem). */
export function printAbcChecklist(input: AbcPrintInput): void {
  const set = new Set(input.marcados);
  const scores = calcAbcScores(set);
  const nivel = ABC_NIVEL_INFO[scores.nivel];
  const marcados = ABC_ITEMS.filter(i => set.has(i.id));
  const naoMarcados = ABC_ITEMS.filter(i => !set.has(i.id));

  const itemRow = (item: AbcItem, on: boolean) => {
    const a = ABC_AREA_BY_KEY[item.area];
    return `<tr style="border-bottom:1px solid #e5e7eb;${on ? "background:#fef9c3;" : ""}">
      <td style="padding:6px 10px;font-weight:bold;color:${a.printColor};text-align:center;width:40px">${String(item.id).padStart(2, "0")}</td>
      <td style="padding:6px 10px;">
        <div style="font-size:13px;${on ? "font-weight:600;" : ""}">${escHtml(item.texto)}</div>
        <div style="font-size:11px;color:#6b7280;font-style:italic;margin-top:2px">${escHtml(item.hint)}</div>
      </td>
      <td style="padding:6px 10px;text-align:center;width:60px">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${a.printColor}18;color:${a.printColor};border:1px solid ${a.printColor}30">${a.code}</span>
      </td>
      <td style="padding:6px 10px;text-align:center;width:50px;font-weight:bold">${item.peso}</td>
      <td style="padding:6px 10px;text-align:center;width:50px;font-size:18px">${on ? "✔" : ""}</td>
    </tr>`;
  };
  const tabela = (titulo: string, lista: AbcItem[], on: boolean, cor?: string) => lista.length === 0 ? "" : `
    <div class="section-title"${cor ? ` style="color:${cor}"` : ""}>${titulo} (${lista.length})</div>
    <table><thead><tr>
      <th style="width:40px;text-align:center">Nº</th>
      <th>Descrição / Explicação Simplificada</th>
      <th style="width:60px;text-align:center">Cat.</th>
      <th style="width:50px;text-align:center">Peso</th>
      <th style="width:50px;text-align:center">✔</th>
    </tr></thead><tbody>${lista.map(i => itemRow(i, on)).join("")}</tbody></table>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ABC - ${escHtml(input.nome || "Paciente")}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1f2937; margin: 0; padding: 20px; }
    .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; color: #1e40af; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #6b7280; }
    .patient-info { display: flex; flex-wrap: wrap; gap: 8px 24px; padding: 12px 16px; background: #f0f9ff; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
    .patient-info span { font-weight: 600; color: #1e40af; }
    .result-box { text-align: center; padding: 16px; border-radius: 12px; margin-bottom: 16px; border: 2px solid; }
    .subtotals { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .subtotals > div { flex: 1; min-width: 80px; text-align: center; padding: 8px; border-radius: 8px; border: 1px solid #e5e7eb; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { background: #f3f4f6; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #d1d5db; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .section-title { font-size: 14px; font-weight: 700; margin: 20px 0 8px; padding: 6px 12px; background: #f3f4f6; border-radius: 6px; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
    .toolbar button { padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; border: 1px solid #cbd5e1; background: #f1f5f9; color: #334155; }
    .toolbar button.primary { background: #1e40af; color: #fff; border-color: #1e40af; }
    @media print { body { padding: 0; } .toolbar { display: none; } }
  </style></head><body>
  <div class="toolbar">
    <button onclick="window.close()">← Voltar ao Sistema</button>
    <button class="primary" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
  </div>
  <div class="header">
    <h1>NFS – Gestão Terapêutica</h1>
    <p>Avaliação multidisciplinar para crianças e adolescentes</p>
    <p style="margin-top:8px;font-size:16px;font-weight:700;color:#1e40af">ABC — Autism Behavior Checklist</p>
    <p style="font-size:11px;color:#6b7280">Checklist de Comportamento Autístico · Versão Brasileira${input.tipo ? ` · ${input.tipo === "alta" ? "Avaliação de Alta (reavaliação)" : "Avaliação de Entrada"}` : ""}</p>
  </div>

  <div class="patient-info">
    <div><span>Paciente:</span> ${escHtml(input.nome || "—")}</div>
    <div><span>Prontuário:</span> ${escHtml(input.prontuario || "—")}</div>
    <div><span>Nascimento:</span> ${fmtData(input.dataNascimento)}</div>
    <div><span>Data da Aplicação:</span> ${fmtData(input.dataAplicacao ?? new Date().toISOString())}</div>
    ${input.profissional ? `<div><span>Aplicado por:</span> ${escHtml(input.profissional)}</div>` : ""}
  </div>

  <div class="result-box" style="border-color:${nivel.color};background:${nivel.color}08">
    <div style="font-size:22px;font-weight:800;color:${nivel.color}">${nivel.nivel} — ${nivel.nome}</div>
    <div style="font-size:32px;font-weight:900;color:${nivel.color};margin:4px 0">${scores.total} pontos</div>
    <div style="font-size:12px;color:#6b7280">${nivel.desc}</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:4px">${marcados.length} de ${ABC_ITEMS.length} itens marcados</div>
  </div>

  <div class="subtotals">
    ${ABC_AREAS.map(a => `
      <div style="border-color:${a.printColor}30">
        <div style="font-size:20px;font-weight:800;color:${a.printColor}">${scores.porArea[a.key]}</div>
        <div style="font-size:10px;font-weight:700;color:#6b7280">${a.code}</div>
        <div style="font-size:9px;color:#9ca3af">${a.label}</div>
      </div>`).join("")}
  </div>

  ${input.observacoes ? `<div class="section-title">Observações</div><p style="font-size:12px;padding:0 12px;white-space:pre-wrap">${escHtml(input.observacoes)}</p>` : ""}

  ${tabela("✔ Itens Marcados", marcados, true)}
  ${tabela("Itens Não Marcados", naoMarcados, false, "#9ca3af")}

  <div class="footer">
    <p>${ABC_DISCLAIMER}</p>
    <p style="margin-top:6px">© ${new Date().getFullYear()} NFS – Gestão Terapêutica · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
  </div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
