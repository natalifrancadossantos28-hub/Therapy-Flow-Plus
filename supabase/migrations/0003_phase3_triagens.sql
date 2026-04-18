-- Phase 3 - Triagem: storing triagens in Supabase
--
-- Adds a single table "triagens" plus SECURITY DEFINER RPCs so the triagem
-- frontend can list, fetch, create, update and delete triagens directly from
-- the browser via PostgREST.
--
-- Security model (matches Phase 1/2):
--   * Company admin operations require slug + password (verified with bcrypt
--     via _verify_company_admin from migration 0002).
--   * RLS is enabled on the table without any policy, so anon /
--     authenticated roles cannot touch rows directly - every request MUST go
--     through the RPCs.

create extension if not exists pgcrypto with schema extensions;

-- --- Table ------------------------------------------------------------------
create table if not exists public.triagens (
  id                  bigserial   primary key,
  company_id          bigint      not null references public.ponto_companies(id) on delete cascade,
  nome                text        not null,
  data_nascimento     text,
  idade               text,
  responsavel         text,
  telefone            text,
  endereco            text,
  naturalidade        text,
  rg                  text,
  cpf                 text,
  sus                 text,

  -- family
  nome_mae            text,
  escolaridade_mae    text,
  profissao_mae       text,
  nome_pai            text,
  escolaridade_pai    text,
  profissao_pai       text,
  num_irmaos          text,
  tipo_imovel         text,

  -- social benefits
  bolsa_familia       boolean     default false,
  bpc                 boolean     default false,
  pensao              boolean     default false,
  auxilio_doenca      boolean     default false,
  outros_auxilios     text,
  renda_familiar      text,

  -- clinical
  diagnostico         text,
  cid                 text,
  cid_11              text,
  medico              text,
  data_ultima_cons    text,

  -- assistive devices
  cadeira_de_rodas    boolean     default false,
  orteses_proteses    boolean     default false,
  aparelho_auditivo   boolean     default false,

  -- critical flags
  medicacao_continua  text,
  alergias            text,
  problemas_saude     text,

  -- socioeconomic context
  tipo_escola         text,
  trabalho_pais       text,
  outro_atendimento   boolean,
  local_atendimento   text,

  -- census / registry
  tipo_registro       text,

  -- professional
  profissional        text,
  especialidade       text,

  -- result
  data                text,
  resultado           text,
  respostas           text,

  created_at          timestamptz not null default now()
);

create index if not exists triagens_company_id_idx on public.triagens (company_id);
create index if not exists triagens_created_at_idx on public.triagens (created_at desc);

alter table public.triagens enable row level security;

-- --- Composite return type --------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'triagem_row') then
    create type public.triagem_row as (
      id                  bigint,
      company_id          bigint,
      nome                text,
      data_nascimento     text,
      idade               text,
      responsavel         text,
      telefone            text,
      endereco            text,
      naturalidade        text,
      rg                  text,
      cpf                 text,
      sus                 text,
      nome_mae            text,
      escolaridade_mae    text,
      profissao_mae       text,
      nome_pai            text,
      escolaridade_pai    text,
      profissao_pai       text,
      num_irmaos          text,
      tipo_imovel         text,
      bolsa_familia       boolean,
      bpc                 boolean,
      pensao              boolean,
      auxilio_doenca      boolean,
      outros_auxilios     text,
      renda_familiar      text,
      diagnostico         text,
      cid                 text,
      cid_11              text,
      medico              text,
      data_ultima_cons    text,
      cadeira_de_rodas    boolean,
      orteses_proteses    boolean,
      aparelho_auditivo   boolean,
      medicacao_continua  text,
      alergias            text,
      problemas_saude     text,
      tipo_escola         text,
      trabalho_pais       text,
      outro_atendimento   boolean,
      local_atendimento   text,
      tipo_registro       text,
      profissional        text,
      especialidade       text,
      data                text,
      resultado           text,
      respostas           text,
      created_at          timestamptz
    );
  end if;
end $$;

-- --- Helper: return a triagem row as composite ------------------------------
create or replace function public._triagem_to_row(t public.triagens)
returns public.triagem_row
language sql
immutable
as $$
  select (
    t.id, t.company_id, t.nome, t.data_nascimento, t.idade, t.responsavel,
    t.telefone, t.endereco, t.naturalidade, t.rg, t.cpf, t.sus,
    t.nome_mae, t.escolaridade_mae, t.profissao_mae,
    t.nome_pai, t.escolaridade_pai, t.profissao_pai,
    t.num_irmaos, t.tipo_imovel,
    t.bolsa_familia, t.bpc, t.pensao, t.auxilio_doenca,
    t.outros_auxilios, t.renda_familiar,
    t.diagnostico, t.cid, t.cid_11, t.medico, t.data_ultima_cons,
    t.cadeira_de_rodas, t.orteses_proteses, t.aparelho_auditivo,
    t.medicacao_continua, t.alergias, t.problemas_saude,
    t.tipo_escola, t.trabalho_pais, t.outro_atendimento, t.local_atendimento,
    t.tipo_registro, t.profissional, t.especialidade,
    t.data, t.resultado, t.respostas, t.created_at
  )::public.triagem_row;
$$;

-- --- RPC: list_triagens -----------------------------------------------------
create or replace function public.list_triagens(
  p_slug     text,
  p_password text
)
returns setof public.triagem_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select public._triagem_to_row(t)
      from public.triagens t
     where t.company_id = v_company_id
     order by t.created_at desc;
end;
$$;

revoke all on function public.list_triagens(text, text) from public;
grant execute on function public.list_triagens(text, text) to anon, authenticated;

-- --- RPC: get_triagem -------------------------------------------------------
create or replace function public.get_triagem(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns public.triagem_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row public.triagens%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_row
    from public.triagens
   where id = p_id and company_id = v_company_id
   limit 1;
  if not found then
    return null;
  end if;
  return public._triagem_to_row(v_row);
end;
$$;

revoke all on function public.get_triagem(text, text, bigint) from public;
grant execute on function public.get_triagem(text, text, bigint) to anon, authenticated;

-- --- RPC: upsert_triagem ----------------------------------------------------
create or replace function public.upsert_triagem(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.triagem_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row public.triagens%rowtype;
  v_nome text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_nome := nullif(btrim(coalesce(p_payload->>'nome', '')), '');
  if v_nome is null then
    raise exception 'nome is required';
  end if;

  if p_id is null then
    insert into public.triagens (
      company_id, nome, data_nascimento, idade, responsavel, telefone, endereco,
      naturalidade, rg, cpf, sus,
      nome_mae, escolaridade_mae, profissao_mae,
      nome_pai, escolaridade_pai, profissao_pai,
      num_irmaos, tipo_imovel,
      bolsa_familia, bpc, pensao, auxilio_doenca, outros_auxilios, renda_familiar,
      diagnostico, cid, cid_11, medico, data_ultima_cons,
      cadeira_de_rodas, orteses_proteses, aparelho_auditivo,
      medicacao_continua, alergias, problemas_saude,
      tipo_escola, trabalho_pais, outro_atendimento, local_atendimento,
      tipo_registro, profissional, especialidade,
      data, resultado, respostas
    ) values (
      v_company_id,
      v_nome,
      p_payload->>'dataNascimento',
      p_payload->>'idade',
      p_payload->>'responsavel',
      p_payload->>'telefone',
      p_payload->>'endereco',
      p_payload->>'naturalidade',
      p_payload->>'rg',
      p_payload->>'cpf',
      p_payload->>'sus',
      p_payload->>'nomeMae',
      p_payload->>'escolaridadeMae',
      p_payload->>'profissaoMae',
      p_payload->>'nomePai',
      p_payload->>'escolaridadePai',
      p_payload->>'profissaoPai',
      p_payload->>'numIrmaos',
      p_payload->>'tipoImovel',
      coalesce((p_payload->>'bolsaFamilia')::boolean, false),
      coalesce((p_payload->>'bpc')::boolean, false),
      coalesce((p_payload->>'pensao')::boolean, false),
      coalesce((p_payload->>'auxilioDoenca')::boolean, false),
      p_payload->>'outrosAuxilios',
      p_payload->>'rendaFamiliar',
      p_payload->>'diagnostico',
      p_payload->>'cid',
      p_payload->>'cid11',
      p_payload->>'medico',
      p_payload->>'dataUltimaCons',
      coalesce((p_payload->>'cadeiraDeRodas')::boolean, false),
      coalesce((p_payload->>'ortesesProteses')::boolean, false),
      coalesce((p_payload->>'aparelhoAuditivo')::boolean, false),
      p_payload->>'medicacaoContinua',
      p_payload->>'alergias',
      p_payload->>'problemasSaude',
      p_payload->>'tipoEscola',
      p_payload->>'trabalhoPais',
      case when p_payload ? 'outroAtendimento'
           then (p_payload->>'outroAtendimento')::boolean
           else null end,
      p_payload->>'localAtendimento',
      coalesce(p_payload->>'tipoRegistro', 'Paciente da Unidade'),
      p_payload->>'profissional',
      p_payload->>'especialidade',
      p_payload->>'data',
      p_payload->>'resultado',
      p_payload->>'respostas'
    )
    returning * into v_row;
  else
    update public.triagens set
      nome              = v_nome,
      data_nascimento   = p_payload->>'dataNascimento',
      idade             = p_payload->>'idade',
      responsavel       = p_payload->>'responsavel',
      telefone          = p_payload->>'telefone',
      endereco          = p_payload->>'endereco',
      naturalidade      = p_payload->>'naturalidade',
      rg                = p_payload->>'rg',
      cpf               = p_payload->>'cpf',
      sus               = p_payload->>'sus',
      nome_mae          = p_payload->>'nomeMae',
      escolaridade_mae  = p_payload->>'escolaridadeMae',
      profissao_mae     = p_payload->>'profissaoMae',
      nome_pai          = p_payload->>'nomePai',
      escolaridade_pai  = p_payload->>'escolaridadePai',
      profissao_pai     = p_payload->>'profissaoPai',
      num_irmaos        = p_payload->>'numIrmaos',
      tipo_imovel       = p_payload->>'tipoImovel',
      bolsa_familia     = coalesce((p_payload->>'bolsaFamilia')::boolean, false),
      bpc               = coalesce((p_payload->>'bpc')::boolean, false),
      pensao            = coalesce((p_payload->>'pensao')::boolean, false),
      auxilio_doenca    = coalesce((p_payload->>'auxilioDoenca')::boolean, false),
      outros_auxilios   = p_payload->>'outrosAuxilios',
      renda_familiar    = p_payload->>'rendaFamiliar',
      diagnostico       = p_payload->>'diagnostico',
      cid               = p_payload->>'cid',
      cid_11            = p_payload->>'cid11',
      medico            = p_payload->>'medico',
      data_ultima_cons  = p_payload->>'dataUltimaCons',
      cadeira_de_rodas  = coalesce((p_payload->>'cadeiraDeRodas')::boolean, false),
      orteses_proteses  = coalesce((p_payload->>'ortesesProteses')::boolean, false),
      aparelho_auditivo = coalesce((p_payload->>'aparelhoAuditivo')::boolean, false),
      medicacao_continua= p_payload->>'medicacaoContinua',
      alergias          = p_payload->>'alergias',
      problemas_saude   = p_payload->>'problemasSaude',
      tipo_escola       = p_payload->>'tipoEscola',
      trabalho_pais     = p_payload->>'trabalhoPais',
      outro_atendimento = case when p_payload ? 'outroAtendimento'
                               then (p_payload->>'outroAtendimento')::boolean
                               else null end,
      local_atendimento = p_payload->>'localAtendimento',
      tipo_registro     = coalesce(p_payload->>'tipoRegistro', 'Paciente da Unidade'),
      profissional      = p_payload->>'profissional',
      especialidade     = p_payload->>'especialidade',
      data              = p_payload->>'data',
      resultado         = p_payload->>'resultado',
      respostas         = p_payload->>'respostas'
    where id = p_id and company_id = v_company_id
    returning * into v_row;

    if not found then
      raise exception 'triagem not found';
    end if;
  end if;

  return public._triagem_to_row(v_row);
end;
$$;

revoke all on function public.upsert_triagem(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_triagem(text, text, bigint, jsonb) to anon, authenticated;

-- --- RPC: delete_triagem ----------------------------------------------------
create or replace function public.delete_triagem(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_deleted int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.triagens
   where id = p_id and company_id = v_company_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_triagem(text, text, bigint) from public;
grant execute on function public.delete_triagem(text, text, bigint) to anon, authenticated;
