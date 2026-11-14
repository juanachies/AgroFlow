/**
 * Contrato: de dónde salen los precios, tarifas y capacidades vigentes.
 *
 * @typedef {object} TarifasPort
 * @property {() => Promise<object>} vigentes
 *   Devuelve el catálogo completo (forma de data/tarifas.json): parámetros generales,
 *   urgencia, cosecha, maquinaria, flete, silobolsa y plazos de reserva.
 */
export {};
