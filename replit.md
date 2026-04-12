# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

---

## NFS – Gestão Terapêutica (Product)

This codebase is the master copy of a commercial SaaS therapeutic management system. Key facts:

- **System 1:** `artifacts/arco-iris` — NFS Gestão Terapêutica (main management portal — 8 pages)
- **System 2:** `artifacts/triagem` — NFs Triagem Multidisciplinar (separate screening app — 80 questions)
- **API:** `artifacts/api-server` — Express REST API shared by both frontends

### Feature Summary
- Patients (prontuário, CNS, Nome da Mãe, status lifecycle: pré-cadastro/Atendimento/Alta/Óbito/Desistência)
- Professionals (PIN-protected agenda access)
- Weekly Agenda grid (Mon–Fri, 08:00–15:40 @ 50-min slots, lunch 12:10, afternoon resumes 13:10)
- Waiting List (priority ordering: ALTA → MÉDIA → BAIXA, auto-sync with booking)
- Reception (attendance tracking, PDF print of daily agenda)
- Dashboard (patient count by year 2023–2026, appointment stats semanal/mensal/trimestral/semestral/anual)
- Professional Portal `/agenda-profissionais` (PIN login, booking from waiting list, PDF print)
- Triagem (80 questions, scoring, patient list, PDF export)

### Real-time Sync
All modules use React Query with cache invalidation on key mutations (booking, status changes). Dashboard and Waiting List auto-refresh every 30s. Reception auto-refreshes every 20s. Booking from waiting list simultaneously: creates appointment + updates patient status to "Atendimento" + removes from waiting list + links professional to patient.

### SaaS Multi-tenancy (IMPLEMENTED)
All three systems (Triagem, Arco-Íris, Ponto) now share a unified multi-tenant architecture:

1. **Shared company registry** — `ponto_companies` table with module flags: `modulePonto`, `moduleTriagem`, `moduleArcoIris`
2. **Data isolation** — `company_id` added to ALL tables: `triagens`, `professionals`, `patients`, `appointments`, `waiting_list`
3. **Company auth** — All apps authenticate via `POST /api/ponto/auth/company {slug, password}` which returns module flags
4. **CompanyGuard** (`artifacts/triagem/src/CompanyGuard.tsx`) — blocks Triagem unless `moduleTriagem: true`
5. **AdminGuard** (`artifacts/arco-iris/src/components/AdminGuard.tsx`) — blocks Arco-Íris unless `moduleArcoIris: true`
6. **window.fetch patch** — Both Triagem and Arco-Íris patch `window.fetch` in `main.tsx` to inject `x-company-id` / `x-company-auth` headers automatically for all `/api/` calls
7. **Offline queue** — `artifacts/triagem/src/lib/offline-queue.ts` queues triagem submissions to localStorage when offline; auto-syncs on reconnect via `window.online` event; banner shows pending count
8. **Master panel** — Ponto companies page shows module badges and allows toggling all 3 modules per company
9. **Error logs** — `nfs_error_logs` table + `/api/error-logs` route for centralized error reporting

---

## NFs – Bater Ponto (Multi-tenant Architecture)

**System 3:** `artifacts/ponto` — Time-clock kiosk with QR code scanning, multi-company SaaS.

### Multi-tenancy Design (IMPLEMENTED)

**DB Tables:**
- `ponto_companies` — company registry with per-company settings
- `ponto_employees.company_id` — scopes every employee to a company
- `ponto_records` — linked via employee, inherits company scope

**Session Storage (`nfs_ponto_session`):**
```json
// Company admin:
{ "type": "company", "companyId": 1, "companyName": "...", "companySlug": "...", "adminToken": "..." }
// Master admin:
{ "type": "master", "masterToken": "nfs_master_2024" }
// Kiosk (public, set on URL param ?c=slug):
{ "type": "kiosk", "companyId": 1, "companyName": "..." }
```

**Header injection:** `lib/api-client-react/src/custom-fetch.ts` automatically injects `x-company-id`, `x-company-auth`, and `x-master-auth` headers on every API call from sessionStorage.

**Master password:** env var `MASTER_PASSWORD` (default: `nfs_master_2024`). Grants access to company CRUD panel.

**Kiosk URL:** `/?c=SLUG` — looks up company by slug, sets kiosk session. Scopes all QR lookups to that company.

**Per-company settings:** `toleranceMinutes`, `overtimeBlockEnabled`, `defaultBreakMinutes` stored in `ponto_companies`.

### 4-Punch Clock System (IMPLEMENTED)

**Punch sequence per day (auto-determined by server):**
1. `ENTRADA_DIARIA` — Start of work (green)
2. `SAIDA_ALMOCO` — Going to lunch (amber)
3. `RETORNO_ALMOCO` — Return from lunch (blue)
4. `SAIDA_FINAL` — End of work (rose)

**Rules enforced by server:**
- Server auto-determines next punch type from count of today's records (no client-side type logic)
- 1-minute duplicate lock: returns error with remaining seconds if last punch was < 60s ago
- 4th punch complete: returns 422 "Você já completou todas as 4 batidas de hoje"
- Legacy `entrada`/`saida` records still supported in reports/summary (backward compat)

**Kiosk success screen:** Shows punch type label, time, employee photo, and progress dots (1/4, 2/4...)

**Weekly Schedule per employee (`schedule` column, JSON):**
```json
{ "mon": {"in": "08:00", "out": "17:00", "dayOff": false}, ..., "sat": {"in": "", "out": "", "dayOff": true} }
```
Employee form shows per-day schedule grid with Folga (day-off) toggles and auto-calculated total hours vs contract hours comparison badge.

**Espelho de Ponto (reports):** 4 columns (Entrada / Saída Almoço / Retorno / Saída Final) + Saldo daily balance. PDF exported in landscape A4. Balance calculated from `weeklyHours / workDays` vs actual time worked.

**Auth flow:**
1. Company admin: POST `/api/ponto/auth/company` `{slug, password}` → stores company session
2. Master admin: POST `/api/ponto/auth/master` `{password}` → stores master session
3. Kiosk: GET `/api/ponto/companies/slug/:slug` → stores kiosk session (no password)

**DB rebuild after schema changes:**
```bash
pnpm --filter @workspace/db run push      # push schema
cd lib/db && npx tsc -b --force           # rebuild declaration files
```

### DB Schema push
```bash
cd lib/db && pnpm run push          # safe push
cd lib/db && pnpm run push-force    # force push (schema conflicts)
```
