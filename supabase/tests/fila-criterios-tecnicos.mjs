import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create schema extensions;
create role anon;
create role authenticated;
create table ponto_companies(id bigint primary key);
insert into ponto_companies values(1),(2);
create function public._verify_company_admin(text,text) returns bigint language sql as $$ select 1::bigint $$;
create function public._fila_age_policy(text) returns text language sql as $$ select 'fifo'::text $$;
create function public._atende_fora(text,boolean) returns boolean language sql as $$ select nullif(btrim($1),'') is not null and lower(btrim($1)) not in ('sem atendimento','nenhum') $$;
create function public._pais_registrados(text,text) returns boolean language sql as $$ select false $$;
create function public._fila_atende_fora_tipo(text,boolean) returns text language sql as $$ select null::text $$;
create function public._fila_bonus_trabalho(text,boolean) returns integer language sql as $$ select 0 $$;
create function public._fila_demanda(text,text) returns text language sql as $$ select case when $2='TEA' then 'TEA' else null end $$;
create function public._fila_prioridade_maxima(text,text,boolean) returns boolean language sql as $$ select false $$;
create function public._calc_priority(integer,boolean,boolean,boolean) returns text language sql as $$ select 'baixo'::text $$;
create function public._calc_priority_specialty(integer,boolean,boolean) returns text language sql as $$ select 'baixo'::text $$;
create table patients (
 id bigint primary key, company_id bigint default 1, status text default 'Aguardando Triagem', name text, phone text, prontuario text, date_of_birth text, triagem_score integer,
 escola_publica boolean, trabalho_na_roca boolean, trabalho_pais text, abrigo_casa_crianca boolean,
 mother_name text, father_name text, local_atendimento text, outro_atendimento boolean, diagnosis text,
 score_psicologia integer, score_psicomotricidade integer, score_fisioterapia integer,
 score_psicopedagogia integer, score_ed_fisica integer, score_fonoaudiologia integer, score_to integer,
 score_nutricionista integer, tipo_registro text
);
create table professionals (id bigint primary key, company_id bigint default 1, name text, specialty text);
create table appointments (id bigserial primary key, company_id bigint, patient_id bigint, professional_id bigint, "date" text, status text, paused boolean default false, recurrence_group_id text);
create table patient_specialty_discharges(company_id bigint,patient_id bigint,specialty text);
create table recurrence_cuts(company_id bigint,recurrence_group_id text,cut_from text);
create table waiting_list (
 id bigserial primary key, company_id bigint, patient_id bigint, professional_id bigint, specialty text, priority text, notes text,
 entry_date text, created_at timestamptz, updated_at timestamptz, paused boolean, paused_at timestamptz,
 paused_reason text, paused_return_date text, paused_origin text, sem_laudo boolean
);
create table abc_avaliacoes (id bigint, patient_id bigint, score_total integer, nivel integer, company_id bigint, tipo text, created_at timestamptz);
create table triagens_86 (id bigint, patient_id bigint, resultado jsonb, respostas jsonb, social jsonb, responsavel text, encaminhamento jsonb, company_id bigint, created_at timestamptz);
insert into patients (id,name,prontuario,date_of_birth,diagnosis) values
 (1,'Antigo pequeno','1','2022-01-01',null), (542,'Recente A','542','2022-01-01','TEA'),
 (547,'Recente B','547','2022-01-01','TEA'), (2,'Sem laudo','2','2020-01-01',null),
 (3,'Com laudo','3','2020-01-01',null), (4,'Pausado','4','2020-01-01',null),
 (5,'Outra empresa','5','2020-01-01',null), (6,'Data ausente','6','2020-01-01',null);
insert into waiting_list (id,company_id,patient_id,specialty,entry_date,created_at,paused,sem_laudo) values
 (1,1,1,'Psicologia','2025-01-01','2025-01-01',false,false),
 (2,1,542,'Psicologia','2026-10-28','2026-10-28 08:00Z',false,false),
 (3,1,547,'Psicologia','2026-10-28','2026-10-28 09:00Z',false,false),
 (4,1,2,'Nutrição','2024-01-01','2024-01-01',false,true),
 (5,1,3,'Nutrição','2026-10-28','2026-10-28',false,false),
 (6,1,4,'Psicologia','2023-01-01','2023-01-01',true,false),
 (7,2,5,'Psicologia','2022-01-01','2022-01-01',false,false),
 (8,1,6,'Psicologia','','2022-01-01',false,false);
insert into triagens_86(id,patient_id,resultado,respostas,company_id,created_at) values (1,547,'{}','{"PR03":"sim","PR08":"sim"}',1,now());
insert into abc_avaliacoes values (1,547,158,1,1,'entrada',now());
`);
const migration = readFileSync(process.argv[2] ?? new URL('../migrations/0135_fila_criterios_tecnicos.sql', import.meta.url),'utf8');
await db.exec(migration);

await db.exec(`
insert into patients(id,name,date_of_birth,diagnosis,local_atendimento) values
 (7,'Antigo maior','2017-01-01',null,null),
 (9,'Terapia fora','2022-01-01',null,'CAPS'),
 (10,'Bebê',to_char(current_date-interval '1 year','YYYY-MM-DD'),null,null),
 (11,'Fisio antigo','2020-01-01',null,null),
 (50,'Final Não','2022-01-01','TEA',null),
 (51,'Final Sim','2022-01-01',null,null),
 (52,'Final inválido','2022-01-01',null,null);
update patients set escola_publica=false where id=1;
update patients set date_of_birth=to_char(current_date-interval '4 years','YYYY-MM-DD') where id in (1,542,547,9,50,51,52);
update patients set date_of_birth=to_char(current_date-interval '9 years','YYYY-MM-DD') where id=7;
update patients set date_of_birth=to_char(current_date-interval '8 years','YYYY-MM-DD') where id=6;
insert into waiting_list(id,company_id,patient_id,specialty,entry_date,created_at,paused,sem_laudo) values
 (9,1,7,'Psicologia','2025-02-01','2025-02-01',false,false),
 (10,1,9,'Psicologia','2024-01-01','2024-01-01',false,false),
 (11,1,10,'Fisioterapia','2026-10-29','2026-10-29',false,false),
 (12,1,11,'Fisioterapia','2025-01-01','2025-01-01',false,false);
select setval('waiting_list_id_seq',100);
`);
const read = async () => (await db.query("select public.list_waiting_list('teste','teste') as fila")).rows[0].fila;
let rows=await read();
const psy = () => rows.filter(x=>x.specialty==='Psicologia'&&!x.paused).map(x=>x.patientId);
assert.deepEqual(psy(),[1,7,542,547,6,9]);
assert.equal(rows.find(x=>x.patientId===1).escolaParticular,false);
assert.deepEqual(rows.filter(x=>x.specialty==='Fisioterapia').map(x=>x.patientId),[10,11]);
assert.deepEqual(rows.filter(x=>x.specialty==='Nutrição').map(x=>x.patientId),[3,2]);
assert.equal(rows.at(-1).patientId,4);
assert.equal(rows.some(x=>x.patientId===5),false);
let recent=rows.find(x=>x.patientId===547);
assert.deepEqual(recent.alertaRisco,['PR03','PR08']);
assert.equal(recent.abcTotal,158);
assert.equal(recent.urgente,false);
assert.equal(recent.ordenacao,'tecnica_validada');
console.log('OK: alternância, cronologia dentro do grupo, sem prioridade por TEA/ABC/PR, escola desconhecida sem penalidade, bebê/Fisio, atendimento fora, sem laudo, pausas e isolamento');
const validate=async(id,urgent,school,expected=null) => (await db.query(
 "select validar_criterios_fila('teste','teste',$1,$2,$3,'Técnica','Decisão técnica de teste',$4) as v",[id,urgent,school,expected])).rows[0].v;
let v=await validate(3,true,false);
rows=await read(); assert.equal(psy()[0],547);
await assert.rejects(()=>validate(3,false,false),/alterados por outra pessoa/);
await assert.rejects(()=>validate(7,true,false),/não encontrada/);
v=await validate(3,false,false,v.id);
rows=await read();assert.deepEqual(psy(),[1,7,542,547,6,9]);
await validate(1,false,true);
rows=await read();assert.deepEqual(psy().slice(-2),[9,1]);
await validate(10,true,false);
rows=await read();assert.equal(psy()[0],9);
console.log('OK: urgência só após decisão técnica, revogação, histórico, escola particular ao fim, urgência confirmada prevalece e proteção contra edição concorrente');
await db.exec(`
insert into triagens_86(id,patient_id,resultado,respostas,social,responsavel,company_id,created_at) values
 (50,50,'{}','{"P01":"3","P02":"3","P03":"3","PR03":"sim"}','{"prioridadeFila":{"prioritaria":false}}','Triadora',1,now()),
 (51,51,'{}','{"P01":"3","P02":"3","P03":"3","F01":"3","F02":"3","F03":"3"}','{"prioridadeFila":{"prioritaria":true,"especialidades":["Psicologia"],"justificativa":"Prioridade validada"}}','Triadora',1,now()),
 (52,52,'{}','{"P01":"3","P02":"3","P03":"3"}','{"prioridadeFila":{"prioritaria":true,"especialidades":["Psicologia"],"justificativa":""}}','Triadora',1,now());
select _t86_encaminhar(1,50);
select _t86_encaminhar(1,51);
`);
rows=await read();
assert.equal(rows.find(x=>x.patientId===50).urgente,false);
assert.equal(rows.find(x=>x.patientId===51&&x.specialty==='Psicologia').urgente,true);
assert.equal(rows.find(x=>x.patientId===51&&x.specialty==='Fonoaudiologia').urgente,false);
await assert.rejects(()=>db.query('select _t86_encaminhar(1,52)'),/justificativa/);
assert.equal((await db.query('select count(*)::int as n from waiting_list where patient_id=52')).rows[0].n,0);
const n=(await db.query('select count(*)::int as n from fila_criterios_validacoes')).rows[0].n;
await db.query('select _t86_encaminhar(1,51)');
assert.equal((await db.query('select count(*)::int as n from fila_criterios_validacoes')).rows[0].n,n);
console.log('OK: decisão final Não mantém ordem normal, Sim apenas na especialidade escolhida, justificativa obrigatória, falha atômica e encaminhamento idempotente');
// Equidade no acesso: especialidades distintas, nunca número de sessões ou filas.
await db.exec(`
insert into professionals(id,name,specialty) values
 (1,'Psico A','Psicologia'),(2,'Psico B','Psicologia'),(3,'Fisio','Fisioterapia'),
 (4,'TO','Terapia Ocupacional'),(5,'Motorista','Motorista'),(6,'Mães','Psicologia Parental'),
 (7,'Pilates','Fisioterapia Pilates'),(8,'Nutri','Nutrição');
insert into patients(id,name,date_of_birth) values
 (60,'Sem terapia',to_char(current_date-interval '4 years','YYYY-MM-DD')),
 (61,'Uma área',to_char(current_date-interval '4 years','YYYY-MM-DD')),
 (62,'Duas áreas',to_char(current_date-interval '4 years','YYYY-MM-DD')),
 (63,'Três áreas',to_char(current_date-interval '4 years','YYYY-MM-DD')),
 (64,'Maior duas áreas',to_char(current_date-interval '9 years','YYYY-MM-DD')),
 (65,'Maior sem terapia',to_char(current_date-interval '9 years','YYYY-MM-DD'));
insert into waiting_list(id,company_id,patient_id,specialty,entry_date,created_at,paused,sem_laudo) values
 (160,1,60,'Fonoaudiologia','2026-10-29','2026-10-29',false,false),
 (161,1,61,'Fonoaudiologia','2020-01-01','2020-01-01',false,false),
 (162,1,62,'Fonoaudiologia','2019-01-01','2019-01-01',false,false),
 (163,1,63,'Fonoaudiologia','2020-01-01','2020-01-01',false,false),
 (164,1,64,'Fonoaudiologia','2019-02-01','2019-02-01',false,false),
 (165,1,65,'Fonoaudiologia','2025-01-01','2025-01-01',false,false),
 (166,1,60,'Psicologia','2025-01-01','2025-01-01',false,false);
-- Duas agendas de psicologia continuam sendo UMA especialidade.
insert into appointments(company_id,patient_id,professional_id,"date",status) values
 (1,61,1,current_date::text,'atendimento'),(1,61,2,current_date::text,'presente'),
 (1,62,1,current_date::text,'atendimento'),(1,62,3,current_date::text,'atendimento'),
 (1,63,1,current_date::text,'atendimento'),(1,63,3,current_date::text,'atendimento'),(1,63,4,current_date::text,'atendimento'),
 (1,64,1,current_date::text,'atendimento'),(1,64,3,current_date::text,'atendimento'),
 (1,60,5,current_date::text,'atendimento'),(1,60,6,current_date::text,'atendimento'),(1,60,7,current_date::text,'atendimento'),
 (1,60,3,current_date::text,'cancelado'),(1,60,4,(current_date+90)::text,'atendimento'),
 (1,60,8,(current_date+1)::text,'agendado'),
 (1,65,1,(current_date-90)::text,'presente'),
 (1,61,3,current_date::text,'atendimento');
insert into patient_specialty_discharges values(1,61,'Fisioterapia');
insert into appointments(company_id,patient_id,professional_id,"date",status,paused,recurrence_group_id) values
 (1,61,4,current_date::text,'atendimento',true,null),
 (1,61,8,current_date::text,'atendimento',false,'cortada');
insert into recurrence_cuts values(1,'cortada',current_date::text);
`);
rows=await read();
const accessRows=()=>rows.filter(x=>x.specialty==='Fonoaudiologia'&&x.patientId>=60&&x.patientId<=65);
assert.deepEqual(accessRows().map(x=>x.patientId),[60,65,61,62,64,63]);
for(const [id,n] of [[60,0],[61,1],[62,2],[63,3],[64,2],[65,0]]) {
 assert.equal(rows.find(x=>x.patientId===id).especialidadesAtivas,n);
}
const accessV=await validate(163,true,false);
rows=await read();assert.equal(accessRows()[0].patientId,63);
await validate(163,false,false,accessV.id);
rows=await read();assert.deepEqual(accessRows().map(x=>x.patientId),[60,65,61,62,64,63]);
console.log('OK: acesso 0 antes de 1 antes de 2+, alternância em cada bloco, especialidades distintas, espera/primeira avaliação/altas/pausas/cortes/transporte/responsáveis não inflam contagem, urgência preservada');
const before=await db.query('select * from waiting_list order by id');
await read();
assert.deepEqual((await db.query('select * from waiting_list order by id')).rows,before.rows);
await db.exec(migration);
assert.deepEqual((await read()).map(x=>x.id),rows.map(x=>x.id));
console.log('OK: consulta não modifica dados e migração pode ser reaplicada');
await db.close();
