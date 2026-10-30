import assert from "node:assert/strict";
import test from "node:test";
import { resumoAgenda, hojeISO } from "../src/lib/indicadores";
import { specialtyShortLabel } from "../src/lib/specialty-colors";

type Appointment = Parameters<typeof resumoAgenda>[0][number];
const appointment = (id: number, status: string, date = hojeISO()) => ({
  patientId: id, professionalId: 1, date, time: "08:00", status,
}) as Appointment;

test("separa faltas justificadas das não justificadas", () => {
  const r = resumoAgenda([
    appointment(1, "ausente"), appointment(2, "falta_nao_justificada"),
    appointment(3, "justificado"), appointment(4, "abonado"),
    appointment(5, "falta_justificada"), appointment(6, "presente"),
  ]);
  assert.equal(r.faltas, 2);
  assert.equal(r.justificadas, 3);
  assert.equal(r.realizados, 1);
  assert.equal(r.pacientesAtendidos, 1);
  assert.equal(r.taxaPresenca, 33);
});

test("não conta sessões duplicadas nem realizadas/faltas em datas futuras", () => {
  const presente = appointment(1, "presente");
  const r = resumoAgenda([
    presente, { ...presente }, appointment(2, "em_atendimento"),
    appointment(3, "presente", "9999-12-31"), appointment(4, "ausente", "9999-12-31"),
    appointment(5, "agendado"), appointment(6, "cancelado"),
  ]);
  assert.equal(r.realizados, 2);
  assert.equal(r.pacientesAtendidos, 2);
  assert.equal(r.faltas, 0);
  assert.equal(r.cancelados, 1);
});

test("distingue os rótulos de Educação Física e Educação Física (Oficina)", () => {
  assert.equal(specialtyShortLabel("Educação Física"), "Ed. Física");
  assert.equal(specialtyShortLabel("Educação Física (Oficina)"), "Ed. Física (Oficina)");
});
