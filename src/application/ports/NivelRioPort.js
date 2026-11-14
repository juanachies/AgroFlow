// Puerto de salida: altura del Paraná en Rosario (m).
// Adaptadores: infrastructure/rio/nivelRioManualAdapter (manual). Fuente real a conectar: INA
// (alerta.ina.gob.ar, reporte diario y series), o SWOT.

/**
 * @typedef {Object} NivelRioPort
 * @property {(fecha:string) => Promise<number|null>} nivel  Altura en metros, o null si no hay dato.
 */

export {};
