// Índices de mercado del puerto, calculados con datos publicados (sin precios ni umbrales:
// los umbrales a cumplir para vender están en el módulo Venta, criterios.js).
//
// I1 demandaOferta  = toneladas que los barcos necesitan cargar por día ÷ toneladas que entran en camión por día
//                     Fuentes: line-up NABSA o "Buques a la carga" BCR / "Posición de camiones" BCR o MAGyP.
//                     > 1: los barcos necesitan más grano del que llega (el puerto paga y descarga rápido).
//                     < 1: entra más grano del que se embarca (cola, descuentos).
// I2 saturacion     = camiones ingresados en el día ÷ camiones de un día pico de descarga del Up-River.
// I3 demandaBarcos  = barcos presentes ÷ barcos normales del mes (índice de demanda del pronóstico).
// I4 espera         = días esperados hasta tener barco si el grano llega ese día (pronóstico).
// I5 nivelParana    = altura del Paraná en Rosario (m), fuente INA (solo Up-River).

import { PUERTOS } from './datos.js';
import { redondear } from '../comun/util.js';

// Toneladas de grano de soja equivalentes por tonelada de harina de soja (rinde de molienda ~78%).
// La soja argentina se exporta mayormente como harina y aceite: la demanda de soja de los barcos
// es grano + harina convertida a grano.
export const SOJA_POR_T_HARINA = 1 / 0.78;

export const PARAMS_INDICES = {
  capacidadCamionT: 30,
  // Camiones en un día pico de descarga del Gran Rosario (referencia de récords de ~5.500 a 7.000
  // camiones/día). Editable; calibrar con la serie histórica de la BCR.
  camionesDiaPicoUpRiver: 7000,
};

// Demanda diaria de los barcos para el cultivo (t/día) a partir de toneladas programadas.
// programadas: { desde, hasta, toneladas: { soja, maiz, trigo, harinas | 'harina-soja', ... } }
export function demandaDiariaBarcos(cultivo, programadas) {
  const t = programadas.toneladas ?? {};
  const dias = programadas.dias ?? Math.max(1, Math.round((new Date(programadas.hasta) - new Date(programadas.desde)) / 86400000) + 1);
  let total = t[cultivo] ?? 0;
  let nota = null;
  if (cultivo === 'soja') {
    const harina = t['harina-soja'] ?? t.harinas ?? 0;
    total += harina * SOJA_POR_T_HARINA;
    nota = t['harina-soja'] != null ? 'soja grano + harina de soja / 0,78' : 'soja grano + harinas / 0,78 (BCR agrupa todas las harinas: sobreestima levemente)';
  }
  return { tDia: total / dias, dias, toneladas: Math.round(total), nota };
}

export function calcularIndicesMercado({ cultivo, puerto, programadas = null, camiones = null, nivelParanaM = null, senalLlegada = null, params = {} }) {
  const p = { ...PARAMS_INDICES, ...params };
  const indices = {};

  if (programadas && camiones?.camiones?.[cultivo] != null) {
    const dem = demandaDiariaBarcos(cultivo, programadas);
    const ofertaTDia = camiones.camiones[cultivo] * p.capacidadCamionT;
    indices.demandaOferta = {
      valor: ofertaTDia > 0 ? redondear(dem.tDia / ofertaTDia, 2) : null,
      demandaTDia: Math.round(dem.tDia),
      ofertaTDia: Math.round(ofertaTDia),
      detalle: `${dem.toneladas.toLocaleString('es-AR')} t a cargar en ${dem.dias} días contra ${camiones.camiones[cultivo].toLocaleString('es-AR')} camiones/día de ${cultivo}`,
      nota: dem.nota,
      fuente: `${programadas.fuente ?? 'line-up'} + ${camiones.fuente ?? 'camiones'} ${camiones.fecha ?? ''}`.trim(),
    };
  }

  if (camiones?.camiones?.total != null && puerto === 'gran-rosario') {
    indices.saturacion = {
      valor: redondear(camiones.camiones.total / p.camionesDiaPicoUpRiver, 2),
      detalle: `${camiones.camiones.total.toLocaleString('es-AR')} camiones/día contra un pico de ${p.camionesDiaPicoUpRiver.toLocaleString('es-AR')}`,
      fuente: `${camiones.fuente ?? 'camiones'} ${camiones.fecha ?? ''}`.trim(),
    };
  }

  if (senalLlegada) {
    indices.demandaBarcos = {
      valor: senalLlegada.indiceDemanda,
      detalle: `barcos en puerto el ${senalLlegada.fecha} contra lo normal del mes (fuente del dato: ${senalLlegada.fuente})`,
      fuente: 'pronóstico Barcos',
    };
    indices.espera = {
      valor: senalLlegada.esperaDias,
      detalle: `si el grano llega el ${senalLlegada.fecha}; P(barco en ≤3 días) ${Math.round(senalLlegada.probBarcoEnTolerancia * 100)}%`,
      fuente: 'pronóstico Barcos',
    };
  }

  if (nivelParanaM != null && PUERTOS[puerto]?.dependeParana) {
    indices.nivelParana = {
      valor: Number(nivelParanaM),
      detalle: `altura del Paraná en Rosario: ${nivelParanaM} m`,
      fuente: 'INA (alerta.ina.gob.ar)',
    };
  }

  return indices;
}
