-- 0066_perf_indexes.sql
-- Performance: índices para acelerar as telas (Agenda, Dashboard, Recepção).
--
-- Motivo: list_appointments faz um LATERAL join com _absence_stats_by_prof()
-- para CADA linha retornada, e essa função varre a tabela appointments
-- filtrando por (company_id, patient_id, professional_id). Sem índice, cada
-- chamada é um seq scan na tabela inteira (~21k linhas), o que deixava as
-- telas lentas para abrir. Os índices abaixo transformam esses scans em
-- buscas indexadas (apenas leitura — não alteram nenhum dado nem
-- comportamento, só a velocidade).

-- Acelera _absence_stats_by_prof (count + sequência de faltas por
-- paciente+profissional).
create index if not exists idx_appointments_company_patient_prof
  on public.appointments (company_id, patient_id, professional_id);

-- Acelera a Agenda (janela por profissional + intervalo de datas).
create index if not exists idx_appointments_company_prof_date
  on public.appointments (company_id, professional_id, "date");

-- Acelera Dashboard/Recepção (filtros por intervalo de datas).
create index if not exists idx_appointments_company_date
  on public.appointments (company_id, "date");

-- Mantém o planner atualizado após criar os índices.
analyze public.appointments;
