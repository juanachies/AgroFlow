// Estado de la zona de un lote (dominio puro): qué fleteros llegan, cuánto cuesta realmente el
// transporte por esos lados y cuál es el acopio más cercano. Todo sale de datos ya cargados en el
// sistema (marketplace y tarifas CATAC); nada se pide a mano.

import { distanciaKm } from '../marketplace/index.js';
import { tarifaFleteUsdPorT } from '../flete/costoFlete.js';

// Datos de ejemplo: el proyecto todavía no tiene un padrón oficial de acopios con coordenadas.
export const ACOPIOS_EJEMPLO = [
  { id: 'ac-pergamino', nombre: 'Acopio ejemplo · Pergamino', lat: -33.89, lon: -60.57 },
  { id: 'ac-rojas', nombre: 'Acopio ejemplo · Rojas', lat: -34.2, lon: -60.73 },
  { id: 'ac-junin', nombre: 'Acopio ejemplo · Junín', lat: -34.59, lon: -60.95 },
  { id: 'ac-venado', nombre: 'Acopio ejemplo · Venado Tuerto', lat: -33.75, lon: -61.97 },
  { id: 'ac-casilda', nombre: 'Acopio ejemplo · Casilda', lat: -33.04, lon: -61.17 },
  { id: 'ac-marcos', nombre: 'Acopio ejemplo · Marcos Juárez', lat: -32.7, lon: -62.1 },
];

const FACTOR_RUTA_SOBRE_RECTA = 1.3;

export function acopioMasCercano(lote, acopios = ACOPIOS_EJEMPLO) {
  const conDistancia = acopios.map((acopio) => ({ ...acopio, rectaKm: distanciaKm(lote, acopio) }));
  const cercano = conDistancia.reduce((a, b) => (b.rectaKm < a.rectaKm ? b : a));
  return { ...cercano, distanciaKm: Math.max(1, Math.round(cercano.rectaKm * FACTOR_RUTA_SOBRE_RECTA)) };
}

const promedio = (valores) => {
  const presentes = valores.filter(Number.isFinite);
  return presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
};
const redondear = (valor, decimales = 2) => (valor == null ? null : Math.round(valor * 10 ** decimales) / 10 ** decimales);

/** Proveedores del marketplace cuyo radio de servicio alcanza al lote, resumidos por recurso. */
export function fleterosDeLaZona({ lote, ofertas = [] }) {
  const alcanzan = ofertas
    .map((oferta) => ({ oferta, distancia: distanciaKm(lote, oferta.base) }))
    .filter(({ oferta, distancia }) => distancia <= oferta.radioKm);
  const porRecurso = {};
  for (const recurso of new Set(alcanzan.map(({ oferta }) => oferta.recurso))) {
    const delRecurso = alcanzan.filter(({ oferta }) => oferta.recurso === recurso);
    porRecurso[recurso] = {
      proveedores: new Set(delRecurso.map(({ oferta }) => oferta.proveedor)).size,
      unidades: delRecurso.reduce((suma, { oferta }) => suma + oferta.unidades, 0),
      precioRelativoMedio: redondear(promedio(delRecurso.map(({ oferta }) => oferta.precioRelativo)), 3),
      calificacionMedia: redondear(promedio(delRecurso.map(({ oferta }) => oferta.calificacion)), 1),
      masCercanoKm: Math.round(Math.min(...delRecurso.map(({ distancia }) => distancia))),
    };
  }
  return {
    ofertas: alcanzan.length,
    proveedores: new Set(alcanzan.map(({ oferta }) => oferta.proveedor)).size,
    porRecurso,
  };
}

/**
 * Cuánto más (o menos) que la tarifa de referencia cobran los camiones que el sistema contrató para este lote:
 * costo contratado ÷ costo a tarifa de referencia. Sin camiones asignados vale 1.
 */
export function factorZonaTransporte(asignacion) {
  const lineas = (asignacion?.lineas ?? []).filter((l) => l.linea?.recurso === 'camión');
  const asignaciones = lineas.flatMap((l) => l.asignaciones ?? []).filter((a) => a.precioRelativo > 0 && a.costoUsd > 0);
  if (!asignaciones.length) return 1;
  const contratado = asignaciones.reduce((suma, a) => suma + a.costoUsd, 0);
  const aTarifaDeReferencia = asignaciones.reduce((suma, a) => suma + a.costoUsd / a.precioRelativo, 0);
  return aTarifaDeReferencia ? contratado / aTarifaDeReferencia : 1;
}

/** Costo del transporte por esos lados, en USD por tonelada y por quintal. */
export function transporteDeLaZona({ distanciaKm: km, tarifas, factor = 1 }) {
  if (!(km > 0)) return null;
  const tarifaCatac = tarifaFleteUsdPorT(km, tarifas);
  const costoUSDt = tarifaCatac * factor;
  return {
    distanciaKm: Math.round(km),
    tarifaCatacUSDt: redondear(tarifaCatac),
    factorZona: redondear(factor, 3),
    costoUSDt: redondear(costoUSDt),
    costoUSDqq: redondear(costoUSDt / 10, 3),
    estadiaUSDDia: redondear(tarifas.flete.estadia_ars_por_dia / tarifas.parametros_generales.tipo_cambio_ars_usd),
    fuente: tarifas.flete.fuente_url ?? 'tarifa CATAC',
    fechaFuente: tarifas.flete.fuente_fecha ?? null,
  };
}
