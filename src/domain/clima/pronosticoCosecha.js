// Combina el pronóstico (días cercanos, valor medido por el modelo) con la climatología
// (días lejanos, probabilidad histórica) en una sola serie diaria apta para decidir (dominio puro).

import { sumarDias, diasEntre } from '../shared/util.js';
import { UMBRAL_LLUVIA_COSECHA_MM } from './ajusteLluvia.js';
import { UMBRAL_LLUVIA_APRECIABLE_MM, climatologiaDe } from './climatologia.js';

// Supuestos editables sobre la probabilidad histórica de lluvia fuerte (>= 5 mm) para calificar un día.
export const PROB_FUERTE_BUENO = 0.15;
export const PROB_FUERTE_REGULAR = 0.3;

export function calificarPronostico(lluviaMm) {
  if (!Number.isFinite(lluviaMm)) return 'desconocido';
  if (lluviaMm >= UMBRAL_LLUVIA_COSECHA_MM) return 'malo';
  if (lluviaMm >= UMBRAL_LLUVIA_APRECIABLE_MM) return 'regular';
  return 'bueno';
}

export function calificarClimatologia(probFuerte) {
  if (!Number.isFinite(probFuerte)) return 'desconocido';
  if (probFuerte < PROB_FUERTE_BUENO) return 'bueno';
  if (probFuerte < PROB_FUERTE_REGULAR) return 'regular';
  return 'malo';
}

/**
 * @param {{ desde:string, hasta:string, pronostico?:{fecha:string, lluviaMm:number}[], climatologia?:object|null }} entrada
 */
export function combinarPronostico({ desde, hasta, pronostico = [], climatologia = null }) {
  const pronosticoPorFecha = new Map(pronostico.filter((dia) => Number.isFinite(dia.lluviaMm)).map((dia) => [dia.fecha, dia]));
  const dias = [];
  for (let i = 0; i <= diasEntre(desde, hasta); i += 1) {
    const fecha = sumarDias(desde, i);
    if (pronosticoPorFecha.has(fecha)) {
      const { lluviaMm, tempMaxC = null, tempMinC = null } = pronosticoPorFecha.get(fecha);
      dias.push({ fecha, fuente: 'pronostico', lluviaMm, tempMaxC, tempMinC, probLluvia: null, probFuerte: null, apto: calificarPronostico(lluviaMm) });
      continue;
    }
    const historica = climatologiaDe(climatologia, fecha);
    if (historica) {
      dias.push({ fecha, fuente: 'climatologia', lluviaMm: historica.mmMedio, probLluvia: historica.probLluvia, probFuerte: historica.probFuerte, apto: calificarClimatologia(historica.probFuerte) });
    } else {
      dias.push({ fecha, fuente: 'sin-dato', lluviaMm: null, probLluvia: null, probFuerte: null, apto: 'desconocido' });
    }
  }
  return dias;
}
