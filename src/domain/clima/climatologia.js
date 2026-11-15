// Climatología de lluvia por día del año a partir de años anteriores (dominio puro).
// Sirve para estimar, más allá de los 16 días que cubre el pronóstico, qué tan probable es
// que llueva en cada fecha. No es un pronóstico: es la frecuencia histórica de esa época.

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
 * @param {{ fechas: string[], lluviaMm: (number|null)[] }} serie  serie diaria de años anteriores
 * @returns {Record<string, { muestras:number, probLluvia:number, probFuerte:number, mmMedio:number }>}
 */
export function resumirClimatologia({ fechas, lluviaMm }, { radio = RADIO_SUAVIZADO_DIAS } = {}) {
  const claves = clavesDelAnio();
  const posicion = new Map(claves.map((clave, i) => [clave, i]));
  const muestras = claves.map(() => []);
  fechas.forEach((fecha, i) => {
    const mm = lluviaMm[i];
    const indice = posicion.get(claveDe(fecha));
    if (Number.isFinite(mm) && indice !== undefined) muestras[indice].push(mm);
  });

  const resumen = {};
  claves.forEach((clave, indice) => {
    const juntas = [];
    for (let delta = -radio; delta <= radio; delta += 1) {
      juntas.push(...muestras[(indice + delta + DIAS_DEL_ANIO) % DIAS_DEL_ANIO]);
    }
    if (!juntas.length) return;
    const fraccion = (condicion) => juntas.filter(condicion).length / juntas.length;
    resumen[clave] = {
      muestras: juntas.length,
      probLluvia: redondear(fraccion((mm) => mm >= UMBRAL_LLUVIA_APRECIABLE_MM)),
      probFuerte: redondear(fraccion((mm) => mm >= UMBRAL_LLUVIA_COSECHA_MM)),
      mmMedio: redondear(juntas.reduce((suma, mm) => suma + mm, 0) / juntas.length),
    };
  });
  return resumen;
}

const redondear = (valor) => Math.round(valor * 100) / 100;

export function climatologiaDe(resumen, fecha) {
  return resumen?.[claveDe(fecha)] ?? null;
}
