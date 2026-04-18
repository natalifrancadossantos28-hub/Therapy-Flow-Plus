// React Query hooks that wrap the Supabase RPC layer. Mirror the shape of
// the previously generated `@workspace/api-client-react` hooks so the pages
// only need to swap their import path.

import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import {
  deleteEmployee,
  getEmployee,
  getEmployeeByCpf,
  listEmployees,
  listRecords,
  recordsSummary,
  registerPunch,
  upsertEmployee,
  type PontoDaySummary,
  type PontoEmployee,
  type PontoKioskEmployee,
  type PontoPunchResult,
  type PontoRecord,
  type UpsertEmployeeInput,
} from "./ponto-rpc";

// ── Query keys ──────────────────────────────────────────────────────────────
export const getGetPontoEmployeesQueryKey = () => ["ponto", "employees"] as const;
export const getGetPontoEmployeeQueryKey = (id: number) => ["ponto", "employee", id] as const;
export const getGetPontoEmployeeByCpfQueryKey = (cpf: string) => ["ponto", "employee", "cpf", cpf] as const;
export const getGetPontoRecordsQueryKey = (filters?: { employeeId?: number; date?: string }) =>
  ["ponto", "records", filters?.employeeId ?? null, filters?.date ?? null] as const;
export const getGetPontoSummaryQueryKey = (filters: { date: string; employeeId?: number }) =>
  ["ponto", "summary", filters.date, filters.employeeId ?? null] as const;

type QueryOpts<TData, TKey extends readonly unknown[]> = {
  query?: Omit<UseQueryOptions<TData, Error, TData, TKey>, "queryKey" | "queryFn">;
};

// ── Queries ─────────────────────────────────────────────────────────────────
export function useGetPontoEmployees(
  opts?: QueryOpts<PontoEmployee[], ReturnType<typeof getGetPontoEmployeesQueryKey>>,
) {
  return useQuery({
    queryKey: getGetPontoEmployeesQueryKey(),
    queryFn: () => listEmployees(),
    ...opts?.query,
  });
}

export function useGetPontoEmployee(
  id: number,
  opts?: QueryOpts<PontoEmployee | null, ReturnType<typeof getGetPontoEmployeeQueryKey>>,
) {
  return useQuery({
    queryKey: getGetPontoEmployeeQueryKey(id),
    queryFn: () => getEmployee(id),
    enabled: opts?.query?.enabled ?? (id > 0),
    ...opts?.query,
  });
}

export function useGetPontoEmployeeByCpf(
  cpf: string,
  opts?: QueryOpts<PontoKioskEmployee | null, ReturnType<typeof getGetPontoEmployeeByCpfQueryKey>>,
) {
  return useQuery({
    queryKey: getGetPontoEmployeeByCpfQueryKey(cpf),
    queryFn: () => getEmployeeByCpf(cpf),
    enabled: opts?.query?.enabled ?? !!cpf,
    retry: opts?.query?.retry ?? false,
    ...opts?.query,
  });
}

export function useGetPontoRecords(
  filters?: { employeeId?: number; date?: string },
  opts?: QueryOpts<PontoRecord[], ReturnType<typeof getGetPontoRecordsQueryKey>>,
) {
  return useQuery({
    queryKey: getGetPontoRecordsQueryKey(filters),
    queryFn: () => listRecords(filters ?? {}),
    ...opts?.query,
  });
}

export function useGetPontoSummary(
  filters: { date: string; employeeId?: number },
  opts?: QueryOpts<PontoDaySummary[], ReturnType<typeof getGetPontoSummaryQueryKey>>,
) {
  return useQuery({
    queryKey: getGetPontoSummaryQueryKey(filters),
    queryFn: () => recordsSummary(filters),
    ...opts?.query,
  });
}

// ── Mutations (signatures match the orval-generated hooks) ──────────────────
type EmployeePayload = Omit<UpsertEmployeeInput, "id">;

export function useCreatePontoEmployee(
  opts?: UseMutationOptions<PontoEmployee, Error, { data: EmployeePayload }>,
) {
  return useMutation({
    mutationFn: ({ data }) => upsertEmployee({ id: null, ...data }),
    ...opts,
  });
}

export function useUpdatePontoEmployee(
  opts?: UseMutationOptions<PontoEmployee, Error, { id: number; data: EmployeePayload }>,
) {
  return useMutation({
    mutationFn: ({ id, data }) => upsertEmployee({ id, ...data }),
    ...opts,
  });
}

export function useDeletePontoEmployee(
  opts?: UseMutationOptions<void, Error, { id: number }>,
) {
  return useMutation({
    mutationFn: ({ id }) => deleteEmployee(id),
    ...opts,
  });
}

// Pages call this as `createRecord.mutate({ data: { employeeId, type } })`.
// The `type` field is ignored — the server auto-determines the next punch.
export function useCreatePontoRecord(
  opts?: UseMutationOptions<PontoPunchResult, Error, { data: { employeeId: number; type?: string } }>,
) {
  return useMutation({
    mutationFn: ({ data }) => registerPunch(data.employeeId),
    ...opts,
  });
}
