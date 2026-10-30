import assert from "node:assert/strict";
import test from "node:test";
import { ITENS_86, ITENS_TRIAGEM_ATUAL, calcularResultado86, erroDecisaoPrioridadeFila } from "../src/lib/triagem-86";

test("formulário atual só inclui perguntas por especialidade e preserva o catálogo histórico", () => {
  assert.ok(ITENS_TRIAGEM_ATUAL.length > 0);
  assert.ok(ITENS_TRIAGEM_ATUAL.every(i => i.tipo === "clinica"));
  assert.ok(ITENS_86.some(i => i.tipo === "social"));
  assert.ok(ITENS_86.some(i => i.tipo === "prioridade"));
});

test("responder somente a triagem clínica não inventa respostas sociais ou de risco", () => {
  const resp = Object.fromEntries(ITENS_TRIAGEM_ATUAL.map(i => [i.code,"1"]));
  const result = calcularResultado86(resp,{});
  assert.ok(result.areas.every(a => a.respondidas > 0));
  assert.deepEqual(result.prioridades,[]);
  assert.deepEqual(result.social,[]);
  assert.ok(!Object.keys(resp).some(c => c.startsWith("S") || c.startsWith("PR")));
});

test("decisão Não segue fluxo normal sem exigir justificativa ou criar urgência", () => {
  assert.equal(erroDecisaoPrioridadeFila({prioritaria:false,especialidades:[],justificativa:""},["Psicologia"]),null);
});

test("decisão Sim exige justificativa e especialidade elegível", () => {
  const eligible = ["Psicologia"];
  assert.ok(erroDecisaoPrioridadeFila({prioritaria:true,especialidades:[],justificativa:"urgência"},eligible));
  assert.ok(erroDecisaoPrioridadeFila({prioritaria:true,especialidades:["Psicologia"],justificativa:"  "},eligible));
  assert.ok(erroDecisaoPrioridadeFila({prioritaria:true,especialidades:["Nutrição"],justificativa:"urgência"},eligible));
  assert.equal(erroDecisaoPrioridadeFila({prioritaria:true,especialidades:eligible,justificativa:"urgência validada pela equipe"},eligible),null);
});
