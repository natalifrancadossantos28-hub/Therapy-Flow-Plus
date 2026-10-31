import assert from "node:assert/strict";
import test from "node:test";
import { interpretarFrase, comandoVoz } from "../src/lib/agenda-exec-voz";
const hoje = new Date(2026, 9, 31, 0, 35);
for(const [fala,hora] of [
  ["meia-noite","00:00"],["meia noite e quarenta","00:40"],
  ["meia-noite e quarenta e cinco","00:45"],["meia-noite e 40","00:40"],
  ["zero horas e quarenta","00:40"],["00:40","00:40"],
  ["às nove e quarenta e cinco","09:45"],["às vinte e três e cinquenta e nove","23:59"],
  ["às duas e meia da tarde","14:30"],["meio-dia e meia","12:30"],
  ["meio dia e quarenta","12:40"],["às doze da madrugada","00:00"],
] as const) test(`entende ${fala}`,()=>{
  const r=interpretarFrase(`Reunião agora ${fala}`,hoje);
  assert.equal(r.hora,hora);assert.equal(r.data,"2026-10-31");assert.deepEqual(r.falta,[]);
  assert.equal(r.titulo,"Reunião");
});
test("data não é inventada e amanhã permanece amanhã após meia-noite",()=>{
  assert.equal(interpretarFrase("reunião meia-noite e quarenta",hoje).data,null);
  assert.equal(interpretarFrase("reunião amanhã à meia-noite e quarenta",hoje).data,"2026-11-01");
  assert.equal(interpretarFrase("reunião hoje à meia-noite e 65",hoje).hora,null);
});
test("comandos precisam ser frases inteiras para evitar gravação acidental",()=>{
  for(const t of ["salvar","Salva!","pode salvar","confirmo","salvar por favor"])assert.equal(comandoVoz(t),"salvar");
  for(const t of ["cancelar","cancela","pode cancelar"])assert.equal(comandoVoz(t),"cancelar");
  for(const t of ["corrigir","corrige","quero corrigir"])assert.equal(comandoVoz(t),"corrigir");
  for(const t of ["reunião para salvar o projeto amanhã às 9","não salvar","não cancelar","consulta para corrigir postura","reunião amanhã às 9 salvar"])assert.equal(comandoVoz(t),null);
});
