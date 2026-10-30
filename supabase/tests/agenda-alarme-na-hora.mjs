// Execute em pasta temporária com @electric-sql/pglite@0.3.14 instalado.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role anon;create role authenticated;
create table agenda_exec_config(id int,vapid_private text);insert into agenda_exec_config values(1,'test-only');
create table agenda_exec_lotes(criado_em timestamptz);
create table agenda_exec_envios(chave text primary key,em timestamptz default now());
create table agenda_exec_push(usuario_id bigint);insert into agenda_exec_push values(1);
create table agenda_exec_compromissos(id bigint,dona_id bigint,titulo text,data date,hora text,local text,concluido boolean default false,antecedencia_min int,avisar_dia boolean default false,avisar_vespera boolean default false);
create table agenda_exec_testes(usuario_id bigint,enviar_em timestamptz);
create table captured(payload jsonb);
create function _agx_hora(text) returns text language sql as $$select $1$$;
create function _agx_falta(int) returns text language sql as $$select $1::text$$;
create function _agx_enviar(jsonb) returns int language plpgsql as $$begin insert into captured values($1);return jsonb_array_length($1);end$$;
insert into agenda_exec_compromissos(id,dona_id,titulo,data,hora,antecedencia_min,concluido)
select id,1,'Evento '||id,(now() at time zone 'America/Sao_Paulo')::date,
 to_char((now() at time zone 'America/Sao_Paulo')+(case when id=3 then interval '1 hour' else interval '0' end),'HH24:MI'),
 case when id=1 then 0 when id=4 then null else 60 end,id=5
from generate_series(1,5)id;
`);
await db.exec(readFileSync(process.argv[2],'utf8'));
let r=await db.query('select agenda_exec_disparar() as n');assert.equal(r.rows[0].n,3);
const payload=(await db.query('select payload from captured')).rows[0].payload;
assert.equal(payload.filter(x=>x.title.startsWith('⏰ Agora:')).length,2);
assert.equal(payload.filter(x=>x.title.includes('Evento 3')).length,1);
assert.ok(!payload.some(x=>/Evento [45]/.test(x.title)));
r=await db.query('select agenda_exec_disparar() as n');assert.equal(r.rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from agenda_exec_envios')).rows[0].n,3);
console.log('OK: aviso anterior e aviso na hora independentes; sem duplicatas; opt-out/concluído respeitados; reexecução idempotente.');
await db.close();
