import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequest } from "../src/lib/latest-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test("resposta antiga não substitui uma recarga mais recente da mesma agenda", async () => {
  const requests = createLatestRequest();
  const old = deferred<string>();
  const recent = deferred<string>();
  let visible = "";
  const load = async (response: Promise<string>) => {
    const ticket = requests.start("prof-1");
    const result = await response;
    if (requests.accepts(ticket, "prof-1")) visible = result;
  };
  const first = load(old.promise);
  const second = load(recent.promise);
  recent.resolve("dados atuais");
  await second;
  old.resolve("dados antigos");
  await first;
  assert.equal(visible, "dados atuais");
});

test("trocar de profissional ou mês descarta resposta pendente imediatamente", () => {
  const requests = createLatestRequest();
  const ticket = requests.start("2026-10:1");
  assert.equal(requests.accepts(ticket, "2026-11:1"), false);
  assert.equal(requests.accepts(ticket, "2026-10:2"), false);
});

test("falha atrasada não limpa resultado de sucesso nem finaliza nova consulta", async () => {
  const requests = createLatestRequest();
  const old = deferred<string>();
  const recent = deferred<string>();
  let visible = "";
  let loading = false;
  const load = async (response: Promise<string>) => {
    const ticket = requests.start("multi");
    loading = true;
    try {
      const result = await response;
      if (requests.accepts(ticket, "multi")) visible = result;
    } catch {
      if (requests.accepts(ticket, "multi")) visible = "erro";
    } finally {
      if (requests.accepts(ticket, "multi")) loading = false;
    }
  };
  const first = load(old.promise);
  const second = load(recent.promise);
  old.reject(new Error("requisição antiga falhou"));
  await first;
  assert.equal(loading, true);
  recent.resolve("dados atuais");
  await second;
  assert.equal(visible, "dados atuais");
  assert.equal(loading, false);
});

test("desmontar tela invalida uma resposta pendente", () => {
  const requests = createLatestRequest();
  const ticket = requests.start("agenda");
  requests.invalidate();
  assert.equal(requests.accepts(ticket, "agenda"), false);
});
