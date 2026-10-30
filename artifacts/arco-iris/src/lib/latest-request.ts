/** Impede respostas atrasadas de sobrescreverem uma consulta mais recente. */
export function createLatestRequest() {
  let sequence = 0;
  return {
    start(key: string) { return { sequence: ++sequence, key }; },
    accepts(request: { sequence: number; key: string }, currentKey: string) {
      return request.sequence === sequence && request.key === currentKey;
    },
    invalidate() { sequence++; },
  };
}
