-- 0105 — Mensagens comemorativas automáticas para o profissional
--
-- No dia do aniversário do profissional e no dia da categoria dele (Dia do
-- Psicólogo, Dia do Fonoaudiólogo…) o sistema grava sozinho um recado de
-- parabéns na caixa de entrada daquele profissional, usando os mesmos modelos
-- da Central de Mensagens da Administração.
--
-- A geração é idempotente: `unique (company_id, professional_id, tipo,
-- data_ref)` garante no máximo um recado por profissional, por tipo, por dia —
-- então pode ser chamada quantas vezes for (a cada carga da agenda, por um
-- agendamento pg_cron ou pelo backend) sem duplicar nada.

begin;

create table if not exists public.mensagens_profissional (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  professional_id bigint      not null references public.professionals(id) on delete cascade,
  tipo            text        not null,
  data_ref        date        not null,
  titulo          text        not null,
  mensagem        text        not null,
  lido            boolean     not null default false,
  created_at      timestamptz not null default now()
);

alter table public.mensagens_profissional
  drop constraint if exists mensagens_profissional_tipo_chk;
alter table public.mensagens_profissional
  add constraint mensagens_profissional_tipo_chk
  check (tipo in ('aniversario', 'categoria'));

create unique index if not exists mensagens_profissional_unica_idx
  on public.mensagens_profissional (company_id, professional_id, tipo, data_ref);

create index if not exists mensagens_profissional_leitura_idx
  on public.mensagens_profissional (company_id, professional_id, created_at desc);

alter table public.mensagens_profissional enable row level security;

-- --- Apoio ------------------------------------------------------------------

-- Remove acentos sem depender da extensão `unaccent` (nem sempre habilitada).
create or replace function public.unaccent_fallback(p_text text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p_text, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;

-- Mesma normalização do front (`specialtyKey`): "T.O.", "Terapia Ocupacional"
-- e "TO" caem na mesma categoria.
create or replace function public._specialty_key(p_specialty text)
returns text
language plpgsql
immutable
as $$
declare
  s text := btrim(regexp_replace(lower(unaccent_fallback(coalesce(p_specialty, ''))), '[^a-z0-9]+', ' ', 'g'));
begin
  if s = '' then return 'default'; end if;
  if s ~ '(^| )t o( |$)' or s like '%terapia ocupacional%' then return 'to'; end if;
  if s like '%fono%'     then return 'fono'; end if;
  if s like '%psicop%'   then return 'psicoped'; end if;
  if s like '%psicomot%' then return 'psicomotricidade'; end if;
  if s like '%parental%' then return 'parental'; end if;
  if s like '%psico%'    then return 'psicologia'; end if;
  if s like '%fisio%'    then return 'fisio'; end if;
  if s like '%ed fisica%' or s like '%educacao fisica%' or s ~ '(^| )ef( |$)' then return 'edfisica'; end if;
  if s like '%nutri%'    then return 'nutricao'; end if;
  if s like '%motorista%' or s like '%transporte%' then return 'motorista'; end if;
  return 'default';
end;
$$;

-- Datas comemorativas por categoria, espelhando `CATEGORY_DAYS` do front.
create or replace function public._categoria_do_dia(p_specialty text, p_data date)
returns table (titulo text, papel text)
language sql
immutable
as $$
  select d.titulo, d.papel
    from (values
      ('psicologia',       'Dia do Psicólogo',                          'Psicólogo(a)',                      8, 27),
      ('parental',         'Dia do Psicólogo',                          'Psicólogo(a)',                      8, 27),
      ('nutricao',         'Dia do Nutricionista',                      'Nutricionista',                     8, 31),
      ('edfisica',         'Dia do Profissional de Educação Física',    'Profissional de Educação Física',   9,  1),
      ('fisio',            'Dia do Fisioterapeuta',                     'Fisioterapeuta',                   10, 13),
      ('to',               'Dia do Terapeuta Ocupacional',              'Terapeuta Ocupacional',            10, 13),
      ('psicoped',         'Dia do Psicopedagogo',                      'Psicopedagogo(a)',                 11, 10),
      ('fono',             'Dia do Fonoaudiólogo',                      'Fonoaudiólogo(a)',                 12,  9),
      ('psicomotricidade', 'Dia do Psicomotricista',                    'Psicomotricista',                   8, 19),
      ('motorista',        'Dia do Motorista',                          'Motorista',                         7, 25)
    ) as d(chave, titulo, papel, mes, dia)
   where d.chave = public._specialty_key(p_specialty)
     and d.mes = extract(month from p_data)::int
     and d.dia = extract(day   from p_data)::int
   limit 1;
$$;

create or replace function public._mensagem_to_json(m public.mensagens_profissional)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id',             m.id,
    'professionalId', m.professional_id,
    'tipo',           m.tipo,
    'dataRef',        m.data_ref,
    'titulo',         m.titulo,
    'mensagem',       m.mensagem,
    'lido',           m.lido,
    'createdAt',      m.created_at
  );
$$;

-- --- Geração diária ---------------------------------------------------------

create or replace function public.gerar_mensagens_comemorativas(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_hoje       date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prof       record;
  v_cat        record;
  v_nome       text;
  v_texto      text;
  v_criadas    int := 0;
  -- `{nome}`, `{titulo}` e `{categoria}` seguem os modelos da Central.
  v_aniversario text[] := array[
    'Feliz aniversário, {nome}! 🎉 Que este novo ano de vida venha cheio de saúde, alegria e conquistas. Obrigado por fazer parte da nossa equipe!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Parabéns, {nome}! 🥳 Hoje é dia de comemorar você — a sua dedicação com as nossas crianças faz toda a diferença. Um dia maravilhoso!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    '{nome}, felicidades! 🎂 Desejamos um ano novo de vida repleto de realizações, paz e muitos motivos para sorrir. Conte sempre com a gente!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Feliz aniversário, {nome}! 🎈 Que Deus abençoe cada passo do seu caminho e retribua todo o cuidado que você dedica às nossas famílias.' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Hoje o dia é seu, {nome}! 🎁 Que a alegria que você leva para os atendimentos volte multiplicada para você. Parabéns!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Parabéns pelo seu dia, {nome}! ✨ Que venham muitos anos de saúde, sucesso e boas histórias ao lado da nossa equipe.' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈'
  ];
  v_categoria text[] := array[
    'Parabéns pelo seu dia, {nome}! 🎉 Hoje é o {titulo} e queremos agradecer por todo o cuidado que você dedica às nossas crianças.' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    '{nome}, feliz {titulo}! 👏 Sua atuação como {categoria} transforma a vida das nossas famílias todos os dias. Obrigado!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Hoje celebramos você, {nome}! 💙 Feliz {titulo} — que a sua profissão continue sendo motivo de orgulho e realização.' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Feliz {titulo}, {nome}! 🌟 Ser {categoria} é cuidar, ensinar e acolher — e você faz isso com maestria. Parabéns!' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈',
    'Parabéns, {nome}! 🎊 No {titulo}, nosso reconhecimento por cada atendimento, cada evolução conquistada e cada família acolhida.' || chr(10) || 'Equipe Núcleo de Atendimento Novo Arco-íris 🌈'
  ];
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  for v_prof in
    select id, name, specialty, birth_date
      from public.professionals
     where company_id = v_company_id
  loop
    v_nome := split_part(btrim(v_prof.name), ' ', 1);

    -- Aniversário: compara só mês/dia.
    if v_prof.birth_date is not null
       and extract(month from v_prof.birth_date) = extract(month from v_hoje)
       and extract(day   from v_prof.birth_date) = extract(day   from v_hoje)
    then
      -- O modelo varia por profissional e por ano, para não repetir sempre o mesmo texto.
      v_texto := replace(
        v_aniversario[1 + ((v_prof.id + extract(year from v_hoje)::bigint) % array_length(v_aniversario, 1))],
        '{nome}', v_nome
      );
      insert into public.mensagens_profissional (company_id, professional_id, tipo, data_ref, titulo, mensagem)
      values (v_company_id, v_prof.id, 'aniversario', v_hoje, 'Feliz aniversário! 🎉', v_texto)
      on conflict do nothing;
      if found then v_criadas := v_criadas + 1; end if;
    end if;

    -- Dia da categoria.
    select * into v_cat from public._categoria_do_dia(v_prof.specialty, v_hoje);
    if found then
      v_texto := v_categoria[1 + ((v_prof.id + extract(year from v_hoje)::bigint) % array_length(v_categoria, 1))];
      v_texto := replace(replace(replace(v_texto, '{nome}', v_nome), '{titulo}', v_cat.titulo), '{categoria}', v_cat.papel);
      insert into public.mensagens_profissional (company_id, professional_id, tipo, data_ref, titulo, mensagem)
      values (v_company_id, v_prof.id, 'categoria', v_hoje, v_cat.titulo || ' 🎉', v_texto)
      on conflict do nothing;
      if found then v_criadas := v_criadas + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('data', v_hoje, 'criadas', v_criadas);
end;
$$;

-- --- Leitura pelo profissional ---------------------------------------------

create or replace function public.list_mensagens_profissional(
  p_slug            text,
  p_password        text,
  p_professional_id bigint,
  p_limit           int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_professional_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t.j order by t.data_ref desc, t.id desc), '[]'::jsonb)
    into v_result
    from (
      select public._mensagem_to_json(m) as j, m.data_ref, m.id
        from public.mensagens_profissional m
       where m.company_id = v_company_id
         and m.professional_id = p_professional_id
       order by m.data_ref desc, m.id desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;

  return v_result;
end;
$$;

create or replace function public.marcar_mensagem_profissional_lida(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.mensagens_profissional%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  update public.mensagens_profissional
     set lido = true
   where id = p_id and company_id = v_company_id
   returning * into v_row;

  if not found then raise exception 'Mensagem % não encontrada', p_id; end if;

  return public._mensagem_to_json(v_row);
end;
$$;

revoke all on function public.gerar_mensagens_comemorativas(text, text)             from public;
revoke all on function public.list_mensagens_profissional(text, text, bigint, int)  from public;
revoke all on function public.marcar_mensagem_profissional_lida(text, text, bigint) from public;

grant execute on function public.gerar_mensagens_comemorativas(text, text)             to anon, authenticated;
grant execute on function public.list_mensagens_profissional(text, text, bigint, int)  to anon, authenticated;
grant execute on function public.marcar_mensagem_profissional_lida(text, text, bigint) to anon, authenticated;

commit;
