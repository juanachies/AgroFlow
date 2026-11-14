/**
 * Contrato: precios del grano, los provee otro módulo.
 *
 * @typedef {object} PreciosPort
 * @property {(cultivo: string) => Promise<{ spot: number, futuros: { mes: string, precio: number }[] }>} precios
 *   USD por tonelada; `mes` en formato AAAA-MM.
 */
export {};
