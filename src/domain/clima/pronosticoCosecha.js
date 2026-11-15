// Combina el pronóstico (días cercanos, valor medido por el modelo) con la climatología
// (días lejanos, probabilidad histórica) en una sola serie diaria apta para decidir (dominio puro).
// Si se indica el cultivo, cada día se califica también por viento y por humedad del grano.

import { sumarDias, diasEntre } from '../shared/util.js';
import { calificarHumedadGrano, calificarViento, condicionesDe, estimarHumedadGrano } from '../cosecha/condicionesCosecha.js';
import { UMBRAL_LLUVIA_COSECHA_MM } from './ajusteLluvia.js';
import { UMBRAL_LLUVIA_APRECIABLE_MM, climatologiaDe } from './climatologia.js';

// Supuestos editables sobre la probabilidad histórica de un evento adverso para calificar un día.
export const PROB_FUERTE_BUENO = 0.15;
export const PROB_FUERTE_REGULAR = 0.3;

const GRAVEDAD = { desconocido: 0, bueno: 1, regular: 2, malo: 3 };
const peorCalificacion = (calificaciones) => {
  const peor = calificaciones.reduce((a, b) => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a), 'desconocido');
  return peor;
};

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

export function calificarVientoClimatologico(cultivo, probRafaga) {
  const condiciones = condicionesDe(cultivo);
  const probabilidad = condiciones ? probRafaga?.[condiciones.viento.maloKmh] : null;
  if (!Number.isFinite(probabilidad)) return 'desconocido';
  return calificarClimatologia(probabilidad);
}

function motivosDe(calificaciones) {
  const motivos = [];
  if (calificaciones.lluvia === 'malo') motivos.push('lluvia fuerte');
  if (calificaciones.viento === 'malo') motivos.push('viento fuerte');
  if (calificaciones.humedad === 'malo') motivos.push('grano húmedo');
  if (calificaciones.humedad === 'regular') motivos.push('humedad del grano fuera del rango ideal');
  if (calificaciones.viento === 'regular') motivos.push('ráfagas moderadas');
  return motivos;
}

function diaPronosticado(fecha, dato, cultivo) {
  const { lluviaMm, tempMaxC = null, tempMinC = null, rafagaKmh = null, vientoKmh = null, humedadRelPct = null } = dato;
  const humedadGranoPct = cultivo ? estimarHumedadGrano({ cultivo, humedadRelativaPct: humedadRelPct, lluviaMm }) : null;
  const calificaciones = {
    lluvia: calificarPronostico(lluviaMm),
    viento: cultivo ? calificarViento(cultivo, rafagaKmh) : 'desconocido',
    humedad: cultivo ? calificarHumedadGrano(cultivo, humedadGranoPct) : 'desconocido',
  };
  return {
    fecha, fuente: 'pronostico', lluviaMm, tempMaxC, tempMinC, rafagaKmh, vientoKmh, humedadRelPct, humedadGranoPct,
    probLluvia: null, probFuerte: null, calificaciones, motivos: motivosDe(calificaciones),
    apto: peorCalificacion(Object.values(calificaciones)),
  };
}

function diaHistorico(fecha, historica, cultivo) {
  const humedadGranoPct = cultivo ? estimarHumedadGrano({ cultivo, humedadRelativaPct: historica.humedadRelMedia }) : null;
  const calificaciones = {
    lluvia: calificarClimatologia(historica.probFuerte),
    viento: cultivo ? calificarVientoClimatologico(cultivo, historica.probRafaga) : 'desconocido',
    humedad: cultivo ? calificarHumedadGrano(cultivo, humedadGranoPct) : 'desconocido',
  };
  return {
    fecha, fuente: 'climatologia', lluviaMm: historica.mmMedio, tempMaxC: null, tempMinC: null, rafagaKmh: null, vientoKmh: null,
    humedadRelPct: historica.humedadRelMedia ?? null, humedadGranoPct,
    probLluvia: historica.probLluvia, probFuerte: historica.probFuerte,
    probRafaga: cultivo ? (historica.probRafaga?.[condicionesDe(cultivo)?.viento.maloKmh] ?? null) : null,
    calificaciones, motivos: motivosDe(calificaciones), apto: peorCalificacion(Object.values(calificaciones)),
  };
}

/**
 * @param {{ desde:string, hasta:string, pronostico?:object[], climatologia?:object|null, cultivo?:string|null }} entrada
 *   pronostico: [{ fecha, lluviaMm, rafagaKmh?, humedadRelPct?, ... }]
 */
export function combinarPronostico({ desde, hasta, pronostico = [], climatologia = null, cultivo = null }) {
  const pronosticoPorFecha = new Map(pronostico.filter((dia) => Number.isFinite(dia.lluviaMm)).map((dia) => [dia.fecha, dia]));
  const dias = [];
  for (let i = 0; i <= diasEntre(desde, hasta); i += 1) {
    const fecha = sumarDias(desde, i);
    if (pronosticoPorFecha.has(fecha)) {
      dias.push(diaPronosticado(fecha, pronosticoPorFecha.get(fecha), cultivo));
      continue;
    }
    const historica = climatologiaDe(climatologia, fecha);
    if (historica) {
      dias.push(diaHistorico(fecha, historica, cultivo));
    } else {
      dias.push({
        fecha, fuente: 'sin-dato', lluviaMm: null, probLluvia: null, probFuerte: null, humedadGranoPct: null,
        calificaciones: { lluvia: 'desconocido', viento: 'desconocido', humedad: 'desconocido' }, motivos: [], apto: 'desconocido',
      });
    }
  }
  return dias;
}
