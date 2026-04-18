# Supabase Setup

This directory contains SQL migrations that provision the Supabase backend
for the NFs platform. The migration is split into phases so each PR can be
deployed and rolled back independently.

## Fases

| Fase | Arquivo | O que cria |
| --- | --- | --- |
| 1 | `migrations/0001_phase1_auth_companies.sql` | Login: tabela `ponto_companies`, `ponto_master_config`, RPCs `authenticate_company` / `authenticate_master`, utilitário `set_master_password` / `upsert_company`. |

Fases seguintes (ainda não implementadas):
- **Fase 2**: `ponto_employees`, `ponto_records`, RLS por empresa, RPCs para
  registrar ponto e gerar relatórios.
- **Fase 3**: `triagens`, RLS por empresa.
- **Fase 4**: `professionals`, `patients`, `appointments`, `waiting_list`
  para o Arco-Íris.

## Como rodar a Fase 1

1. Abra https://supabase.com/dashboard e selecione o projeto.
2. Vá em **SQL Editor** → **New query**.
3. Cole o conteúdo de `migrations/0001_phase1_auth_companies.sql` e clique
   **Run**. Deve finalizar sem erro.
4. Ainda no SQL Editor, defina a senha master **uma vez**:

   ```sql
   select public.set_master_password('troque-esta-senha-forte');
   ```

5. Crie a primeira empresa (ajuste slug/senha/módulos):

   ```sql
   select public.upsert_company(
     p_slug            => 'clinica-nfs',
     p_name            => 'Clínica NFs',
     p_admin_password  => 'senha-da-empresa',
     p_module_ponto    => true,
     p_module_triagem  => true,
     p_module_arco_iris => false,
     p_active          => true
   );
   ```

6. Pegue as chaves em **Settings → API**:
   - `VITE_SUPABASE_URL` ← "Project URL"
   - `VITE_SUPABASE_ANON_KEY` ← "anon public"
7. No painel da Vercel, para cada projeto (ponto, triagem, arco-iris,
   nfs-gestao-oficial), adicione essas duas variáveis em
   **Settings → Environment Variables** e faça um novo deploy.

## Como testar

- `select * from public.authenticate_company('clinica-nfs', 'senha-da-empresa');`
  → deve retornar 1 linha.
- `select * from public.authenticate_company('clinica-nfs', 'errada');`
  → deve retornar 0 linhas.
- `select public.authenticate_master('troque-esta-senha-forte');` → `true`.
- `select public.authenticate_master('errada');` → `false`.

## Segurança

- Senhas armazenadas como `crypt(password, gen_salt('bf', 10))` (bcrypt).
- Nenhum cliente anon consegue ler `ponto_companies` diretamente: RLS está
  ligada sem nenhuma policy. O único acesso é via RPCs `SECURITY DEFINER`.
- As RPCs expõem apenas a view `ponto_companies_safe` (sem hash de senha).
- `set_master_password` e `upsert_company` exigem `service_role` — só o
  dashboard / scripts administrativos.
