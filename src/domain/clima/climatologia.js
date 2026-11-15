// Climatología de lluvia por día del año a partir de años anteriores (dominio puro).
// Sirve para estimar, más allá de los 16 días que cubre el pronóstico, qué tan probable es
// que llueva en cada fecha. No es un pronóstico: es la frecuencia histórica de esa época.

import { UMBRALES_RAFAGA_KMH } from '../cosecha/condicionesCosecha.js';
import { UMBRAL_LLUVIA_COSECHA_MM } from './ajusteLluvia.js';

export const UMBRAL_LLUVIA_APRECIABLE_MM = 1;
// Se juntan los días vecinos para que 10 años no den una probabilidad ruidosa día por día.
export const RADIO_SUAVIZADO_DIAS = 3;

const ANIO_REFERENCIA = 2001; // no bisiesto: da las 365 claves MM-DD
const DIAS_DEL_ANIO = 365;

const claveDe = (fecha) => (fecha.slice(5) === '02-29' ? '02-28' : fecha.slice(5, 10));

function clavesDelAnio() {
  const inicio = Date.UTC(ANIO_REFERENCIA, 0, 1);
  return Array.from({ length: DIAS_DEL_ANIO }, (_, i) => new Date(inicio + i * 86400000).toISOString().slice(5, 10));
}

/**
 * @param {{ fechas: string[], lluviaMm: (number|null)[], rafagaKmh?: (number|null)[], humedadRelPct?: (number|null)[] }} serie
 *   serie diaria de años anteriores
 * @returns {Record<string, { muestras:number, probLluvia:number, probFuerte:number, mmMedio:number,
 *   probRafaga:Record<number, number>|null, humedadRelMedia:number|null }>}
 */
export function resumirClimatologia({ fechas, lluviaMm, rafagaKmh = [], humedadRelPct = [] }, { radio = RADIO_SUAVIZADO_DIAS } = {}) {
  const claves = clavesDelAnio();
  const posicion = new Map(claves.map((clave, i) => [clave, i]));
  const lluvias = claves.map(() => []);
  const rafagas = claves.map(() => []);
  const humedades = claves.map(() => []);
  fechas.forEach((fecha, i) => {
    const indice = posicion.get(claveDe(fecha));
    if (indice === undefined) return;
    if (Number.isFinite(lluviaMm[i])) lluvias[indice].push(lluviaMm[i]);
    if (Number.isFinite(rafagaKmh[i])) rafagas[indice].push(rafagaKmh[i]);
    if (Number.isFinite(humedadRelPct[i])) humedades[indice].push(humedadRelPct[i]);
  });

  const juntar = (series, indice) => {
    const juntas = [];
    for (let delta = -radio; delta <= radio; delta += 1) juntas.push(...series[(indice + delta + DIAS_DEL_ANIO) % DIAS_DEL_ANIO]);
    return juntas;
  };
  const fraccion = (valores, condicion) => valores.filter(condicion).length / valores.length;

  const resumen = {};
  claves.forEach((clave, indice) => {
    const juntas = juntar(lluvias, indice);
    if (!juntas.length) return;
    const viento = juntar(rafagas, indice);
    const humedad = juntar(humedades, indice);
    resumen[clave] = {
      muestras: juntas.length,
      probLluvia: redondear(fraccion(juntas, (mm) => mm >= UMBRAL_LLUVIA_APRECIABLE_MM)),
      probFuerte: redondear(fraccion(juntas, (mm) => mm >= UMBRAL_LLUVIA_COSECHA_MM)),
      mmMedio: redondear(juntas.reduce((suma, mm) => suma + mm, 0) / juntas.length),
      probRafaga: viento.length ? Object.fromEntries(UMBRALES_RAFAGA_KMH.map((umbral) => [umbral, redondear(fraccion(viento, (kmh) => kmh >= umbral))])) : null,
      humedadRelMedia: humedad.length ? Math.round(humedad.reduce((suma, rh) => suma + rh, 0) / humedad.length) : null,
    };
  });
  return resumen;
}

const redondear = (valor) => Math.round(valor * 100) / 100;

export function climatologiaDe(resumen, fecha) {
  return resumen?.[claveDe(fecha)] ?? null;
}
