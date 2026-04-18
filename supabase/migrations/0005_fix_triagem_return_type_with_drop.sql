-- Phase 3 hotfix v2: 0004 falhou com 42P13 (cannot change return type of
-- existing function). Postgres exige DROP antes de recriar com retorno
-- diferente. Este arquivo dropa e recria as 3 RPCs afetadas.

drop function if exists public.list_triagens(text, text);
drop function if exists public.get_triagem(text, text, bigint);
drop function if exists public.upsert_triagem(text, text, bigint, jsonb);

create or replace function public.list_triagens(
  p_slug     text,
  p_password text
)
returns setof public.triagens
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.triagens t
     where t.company_id = v_company_id
     order by t.created_at desc;
end;
$$;

create or replace function public.get_triagem(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns public.triagens
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
  return v_row;
end;
$$;

create or replace function public.upsert_triagem(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.triagens
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

  return v_row;
end;
$$;

revoke all on function public.list_triagens(text, text) from public;
grant execute on function public.list_triagens(text, text) to anon, authenticated;

revoke all on function public.get_triagem(text, text, bigint) from public;
grant execute on function public.get_triagem(text, text, bigint) to anon, authenticated;

revoke all on function public.upsert_triagem(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_triagem(text, text, bigint, jsonb) to anon, authenticated;
