-- =========================================================================
-- 0035_triagem_novos_campos.sql
--
-- Adiciona 3 campos novos a triagem:
--   * cpf_responsavel       (Dados do Paciente)
--   * sus_responsavel       (Dados do Paciente)
--   * abrigo_casa_crianca   (Contexto Socioeconomico)
--
-- E atualiza:
--   * upsert_triagem para gravar os 3 campos
--   * autolink_triagem para propagar abrigo_casa_crianca em patients
--     (ja existe coluna em patients desde 0033)
--
-- Migration idempotente.
-- =========================================================================

begin;

alter table public.triagens
  add column if not exists cpf_responsavel     text,
  add column if not exists sus_responsavel     text,
  add column if not exists abrigo_casa_crianca boolean default false;

-- ─────────────────────────────────────────────────────────────────────────
-- upsert_triagem: re-cria com os 3 campos novos.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.upsert_triagem(text, text, bigint, jsonb);

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
      naturalidade, rg, cpf, sus, cpf_responsavel, sus_responsavel,
      nome_mae, escolaridade_mae, profissao_mae,
      nome_pai, escolaridade_pai, profissao_pai,
      num_irmaos, tipo_imovel,
      bolsa_familia, bpc, pensao, auxilio_doenca, outros_auxilios, renda_familiar,
      diagnostico, cid, cid_11, medico, data_ultima_cons,
      cadeira_de_rodas, orteses_proteses, aparelho_auditivo,
      medicacao_continua, alergias, problemas_saude,
      tipo_escola, trabalho_pais, outro_atendimento, abrigo_casa_crianca,
      local_atendimento,
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
      p_payload->>'cpfResponsavel',
      p_payload->>'susResponsavel',
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
      coalesce((p_payload->>'abrigoCasaCrianca')::boolean, false),
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
      cpf_responsavel   = case when p_payload ? 'cpfResponsavel'
                               then p_payload->>'cpfResponsavel'
                               else cpf_responsavel end,
      sus_responsavel   = case when p_payload ? 'susResponsavel'
                               then p_payload->>'susResponsavel'
                               else sus_responsavel end,
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
      abrigo_casa_crianca = case when p_payload ? 'abrigoCasaCrianca'
                                 then (p_payload->>'abrigoCasaCrianca')::boolean
                                 else abrigo_casa_crianca end,
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

revoke all on function public.upsert_triagem(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_triagem(text, text, bigint, jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Propagar abrigo_casa_crianca da triagem para o patient.
-- Trigger leve AFTER INSERT/UPDATE em triagens: copia a flag pro paciente
-- vinculado (match por CPF). Idempotente. Nao bloqueia o save em caso de
-- falha. A coluna patients.abrigo_casa_crianca foi criada em 0033.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public._tg_triagens_sync_abrigo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cpf_clean text;
begin
  v_cpf_clean := nullif(regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g'), '');
  if v_cpf_clean is null or length(v_cpf_clean) < 11 then
    return new;
  end if;
  begin
    update public.patients
       set abrigo_casa_crianca = coalesce(new.abrigo_casa_crianca, false)
     where company_id = new.company_id
       and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = v_cpf_clean
       and coalesce(abrigo_casa_crianca, false) is distinct from coalesce(new.abrigo_casa_crianca, false);
  exception when others then
    raise warning 'sync_abrigo falhou para triagem %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists tg_triagens_sync_abrigo on public.triagens;
create trigger tg_triagens_sync_abrigo
  after insert or update of cpf, abrigo_casa_crianca
  on public.triagens
  for each row
  execute function public._tg_triagens_sync_abrigo();

-- One-shot backfill: se ja existem triagens com abrigo=true e o patient
-- vinculado nao tem a flag, sincroniza.
update public.patients p
   set abrigo_casa_crianca = coalesce(t.abrigo_casa_crianca, p.abrigo_casa_crianca, false)
  from public.triagens t
 where t.cpf is not null
   and regexp_replace(coalesce(t.cpf, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g')
   and length(regexp_replace(coalesce(t.cpf, ''), '[^0-9]', '', 'g')) >= 11
   and t.company_id = p.company_id
   and coalesce(t.abrigo_casa_crianca, false) is distinct from coalesce(p.abrigo_casa_crianca, false);

-- Recalcular waiting_list.priority pra refletir Prioridade Maxima nos
-- pacientes que receberam o flag agora.
update public.waiting_list w
   set priority = 'maxima'
  from public.patients p
 where p.id = w.patient_id
   and coalesce(p.abrigo_casa_crianca, false) = true
   and w.priority is distinct from 'maxima';

commit;
