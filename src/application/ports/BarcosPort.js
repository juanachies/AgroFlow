/**
 * Contrato: calendario de barcos de un puerto, lo provee otro módulo.
 *
 * @typedef {{ id: string, terminal: string, arribo: string, cierreCarga: string, toneladasMax: number }} Barco
 *   `arribo` y `cierreCarga` en AAAA-MM-DD.
 * @typedef {object} BarcosPort
 * @property {(terminal: string, desde: string, hasta: string) => Promise<Barco[]>} calendario
 */
export {};
