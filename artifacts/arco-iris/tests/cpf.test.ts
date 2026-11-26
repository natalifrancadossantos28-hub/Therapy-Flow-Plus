import assert from "node:assert/strict";
import test from "node:test";
import { cpfDuplicates, cpfProblem, isValidCpf } from "../src/lib/cpf";

test("CPF válido com ou sem máscara", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(cpfProblem("529.982.247-25"), null);
  assert.equal(cpfProblem(""), null);
});

test("CPF inválido: tamanho, dígito verificador e repetido", () => {
  assert.match(cpfProblem("1234567890") ?? "", /10 número/);
  assert.match(cpfProblem("529.982.247-24") ?? "", /confira/);
  assert.notEqual(cpfProblem("111.111.111-11"), null);
});

test("CPF já cadastrado ignora o próprio paciente e máscara", () => {
  const ps = [
    { id: 1, name: "A", cpf: "529.982.247-25" },
    { id: 2, name: "B", cpf: "52998224725" },
    { id: 3, name: "C", cpf: null },
  ];
  assert.deepEqual(cpfDuplicates("52998224725", ps, 1).map(p => p.id), [2]);
  assert.deepEqual(cpfDuplicates("123", ps), []);
});
