/**
 * Contrato: explicar una recomendación en lenguaje de productor (módulo 6, IA).
 *
 * La IA no calcula: recibe el resumen de la simulación (domain/ia/resumen.js) y, si es un
 * escenario, la comparación con la simulación base. Adaptadores: infrastructure/ia/openaiAdapter
 * (OpenAI, con reintentos y límites) y explicadorPlantillaAdapter (respaldo sin IA).
 *
 * @typedef {object} ExplicadorPort
 * @property {(entrada: { resumen: object, pregunta?: string, comparacion?: object, escenario?: object })
 *   => Promise<{ texto: string, fuente: string, modelo?: string }>} explicar
 * @property {string} [origen]
 */
export {};
