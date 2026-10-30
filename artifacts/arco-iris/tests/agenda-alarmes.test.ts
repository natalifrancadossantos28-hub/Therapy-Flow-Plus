import assert from "node:assert/strict";
import test from "node:test";
import { alarmesDevidos, tocarMelodia, pararMelodia } from "../src/lib/agenda-exec-alarmes";
const c={id:1,titulo:"Reunião",data:"2026-11-02",hora:"10:00",local:null,antecedenciaMin:60,concluido:false};
const asTime=(t:string)=>Date.parse(`2026-11-02T${t}:00-03:00`);
test("lembrete anterior não impede despertar na hora",()=>{
 const antes=alarmesDevidos([c],asTime("09:00"),new Set());
 assert.equal(antes.length,1);assert.equal(antes[0].naHora,false);
 const hora=alarmesDevidos([c],asTime("10:00"),new Set(antes.map(x=>x.chave)));
 assert.equal(hora.length,1);assert.equal(hora[0].naHora,true);
 assert.equal(alarmesDevidos([c],asTime("10:00"),new Set([...antes,...hora].map(x=>x.chave))).length,0);
});
test("antecedência zero toca uma vez na hora, sem alertar antes",()=>{
 assert.equal(alarmesDevidos([{...c,antecedenciaMin:0}],asTime("09:59"),new Set()).length,0);
 const v=alarmesDevidos([{...c,antecedenciaMin:0}],asTime("10:00"),new Set());assert.equal(v.length,1);assert.equal(v[0].naHora,true);
});
test("não toca concluídos, sem horário, opt-out, passado distante ou futuro",()=>{
 const now=asTime("10:00");
 for(const item of [{...c,concluido:true},{...c,hora:null},{...c,antecedenciaMin:null},{...c,data:"2026-11-01"},{...c,data:"2026-11-03"}]) assert.equal(alarmesDevidos([item],now,new Set()).length,0);
 assert.equal(alarmesDevidos([c],asTime("10:03"),new Set()).length,0);
});
test("mudança de horário cria um novo alerta sem reutilizar o já visto",()=>{
 const old=alarmesDevidos([c],asTime("10:00"),new Set());
 assert.equal(alarmesDevidos([{...c,hora:"11:00"}],asTime("11:00"),new Set(old.map(x=>x.chave))).length,1);
});
test("melodia depende de áudio liberado e pode ser parada",()=>{
 const nodes:any[]=[];
 const ctx={state:"running",currentTime:0,destination:{},createOscillator(){const n={type:"",frequency:{value:0},connect(){},disconnect(){},start(){},stop(){this.stopped=true;},stopped:false};nodes.push(n);return n;},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}} as unknown as AudioContext;
 assert.equal(tocarMelodia({...ctx,state:"suspended"} as AudioContext),false);
 assert.equal(tocarMelodia(ctx),true);assert.equal(nodes.length,6);
 pararMelodia(ctx);assert.ok(nodes.every(x=>x.stopped));
});
