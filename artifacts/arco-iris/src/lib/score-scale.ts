// =============================================================================
// score-scale.ts — escala das notas por área da triagem.
// -----------------------------------------------------------------------------
// As colunas score_* do banco (e _calc_priority / autolink da Triagem) seguem no
// domínio 0-45 por área (0-360 no total). A unidade passou a usar a escala do
// Questionário Multidisciplinar, 0-30 por área, então a conversão acontece só na
// borda da tela — nada muda no cálculo de prioridade.
// =============================================================================
export const AREA_MAX_UI = 30;
export const AREA_MAX_DB = 45;

/** Nota do banco (0-45) → escala exibida (0-30). */
export const areaToUi = (db: number | null | undefined): number =>
  Math.round(((db ?? 0) * AREA_MAX_UI) / AREA_MAX_DB);

/** Nota digitada (0-30) → domínio do banco (0-45). */
export const areaToDb = (ui: number): number =>
  Math.round((ui * AREA_MAX_DB) / AREA_MAX_UI);
