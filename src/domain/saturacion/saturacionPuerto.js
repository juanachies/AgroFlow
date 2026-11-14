// Pronóstico de saturación del puerto (dominio puro).
//
// El problema que ataca el producto: en el pico de cosecha miles de camiones llegan al mismo puerto
// los mismos días. Para cada día se cruzan dos lados:
//   - Demanda de los barcos: toneladas que cargan por día los barcos presentes (módulo Barcos:
//     line-up oficial + estacionalidad) = capacidad en puerto ÷ días de estadía.
//   - Oferta de camiones: camiones que van a llegar ese día. Fuente principal = RESERVAS DEL
//     MARKETPLACE (dato propio: cuántos camiones van a qué puerto y qué día, antes de que salgan),
//     escaladas por la participación de mercado; si no hay reservas, el dato publicado del día.
//
//   saturación       = camiones esperados ÷ camiones de un día pico de descarga
//   demanda ÷ oferta = t/día que cargan los barcos del cultivo ÷ t/día del cultivo que llegan en camión
//                      (solo si se indica `participacionCultivo`: qué fracción de los camiones lleva ese
//                      cultivo, p. ej. de la tabla de camiones por producto de la BCR; los barcos son de
//                      un cultivo y los camiones reservados, de todos)
//   estado           = 'saturado' | 'cargado' | 'fluido'
// Sin datos de camiones, el estado sale de la espera esperada hasta tener barco.

import { sumarDias, diasEntre, redondear } from '../shared/util.js';

export const PARAMS_SATURACION = {
  camionesDiaPico: 7000, // pico de descarga del Gran Rosario (récords de 5.500 a 7.000 camiones/día)
  participacionMercado: 0.05, // qué fracción del grano que llega al puerto se reserva por el marketplace
  participacionCultivo: null, // fracción de los camiones que lleva el cultivo analizado (null = no se usa)
  capacidadCamionT: 30,
  diasEstadiaBarco: 5,
  saturacionCargado: 0.6,
  saturacionSaturado: 0.85,
  demandaOfertaSaturado: 0.8,
  demandaOfertaCargado: 1.1,
  esperaCargadoDias: 1,
  esperaSaturadoDias: 3,
};

// Camiones y toneladas reservadas que llegan a `puerto` cada día del rango.
export function flujoReservado(reservas, { puerto, desde, hasta }) {
  const dias = diasEntre(desde, hasta);
  const out = [];
  for (let d = 0; d <= dias; d++) {
    const fecha = sumarDias(desde, d);
    let camiones = 0;
    let toneladas = 0;
    for (const r of reservas) {
      if (r.recurso !== 'camión' || r.puerto !== puerto || r.desde > fecha || r.hasta < fecha) continue;
      const llegadas = r.unidades * (r.viajesPorDia ?? 1);
      camiones += llegadas;
      toneladas += llegadas * (r.capacidadT ?? 30);
    }
    out.push({ fecha, camiones, toneladas });
  }
  return out;
}

/**
 * @param {{ barcos:object, reservas?:object[], camionesPublicadosDia?:number|null, params?:object }} entrada
 *   barcos: salida de analizarBarcos() del puerto. camionesPublicadosDia: dato del día (BCR / MAGyP), opcional.
 */
export function pronosticarSaturacion({ barcos, reservas = [], camionesPublicadosDia = null, params = {} }) {
  const p = { ...PARAMS_SATURACION, ...params };
  const senal = barcos.senal;
  const flujo = new Map(flujoReservado(reservas, { puerto: barcos.puerto, desde: senal[0].fecha, hasta: senal.at(-1).fecha }).map((f) => [f.fecha, f]));
  const dias = senal.map((s) => {
    const reservado = flujo.get(s.fecha) ?? { camiones: 0, toneladas: 0 };
    const estimadoReservas = reservado.camiones > 0 ? reservado.camiones / p.participacionMercado : null;
    const camionesEsperados = estimadoReservas ?? camionesPublicadosDia ?? null;
    const fuenteCamiones = estimadoReservas != null ? 'reservas del marketplace' : camionesPublicadosDia != null ? 'dato publicado del día' : 'sin dato';
    const demandaTDia = s.capacidadT / p.diasEstadiaBarco;
    const ofertaTDia = camionesEsperados == null || p.participacionCultivo == null ? null : camionesEsperados * p.participacionCultivo * p.capacidadCamionT;
    const saturacion = camionesEsperados == null ? null : camionesEsperados / p.camionesDiaPico;
    const demandaOferta = ofertaTDia ? demandaTDia / ofertaTDia : null;

    let estado;
    if (saturacion != null) {
      const dyo = demandaOferta ?? Infinity;
      if (saturacion > p.saturacionSaturado || dyo < p.demandaOfertaSaturado || s.esperaDias > p.esperaSaturadoDias) estado = 'saturado';
      else if (saturacion > p.saturacionCargado || dyo < p.demandaOfertaCargado || s.esperaDias > p.esperaCargadoDias) estado = 'cargado';
      else estado = 'fluido';
    } else {
      estado = s.esperaDias > p.esperaSaturadoDias ? 'saturado' : s.esperaDias > p.esperaCargadoDias ? 'cargado' : 'fluido';
    }
    return {
      fecha: s.fecha,
      camionesReservados: reservado.camiones,
      camionesEsperados: camionesEsperados == null ? null : Math.round(camionesEsperados),
      fuenteCamiones,
      saturacion: saturacion == null ? null : redondear(saturacion, 2),
      demandaOferta: demandaOferta == null ? null : redondear(demandaOferta, 2),
      esperaDias: s.esperaDias,
      probBarco: s.probBarcoEnTolerancia,
      estado,
    };
  });
  return {
    puerto: barcos.puerto,
    dias,
    diasSaturados: dias.filter((d) => d.estado === 'saturado').map((d) => d.fecha),
    params: p,
  };
}

const PESO = { fluido: 0, cargado: 1, saturado: 10 };

/**
 * Mejor ventana de `duracion` días para llegar al puerto, cerca de `desde` (hasta ±`margenDias`),
 * evitando días saturados. Prefiere el menor desplazamiento a igual puntaje.
 */
export function mejorVentanaDeEntrega({ pronostico, desde, duracion, margenDias = 15, noAntesDe = null }) {
  const porFecha = new Map(pronostico.dias.map((d) => [d.fecha, d]));
  const evaluar = (inicio) => {
    let puntaje = 0;
    let saturados = 0;
    for (let i = 0; i < duracion; i++) {
      const d = porFecha.get(sumarDias(inicio, i));
      if (!d) return null; // fuera del horizonte
      puntaje += PESO[d.estado];
      if (d.estado === 'saturado') saturados++;
    }
    return { puntaje, saturados };
  };
  const original = evaluar(desde);
  let mejor = original ? { inicio: desde, ...original, desplazamientoDias: 0 } : null;
  for (let k = 1; k <= margenDias; k++) {
    for (const delta of [k, -k]) {
      const inicio = sumarDias(desde, delta);
      if (noAntesDe && inicio < noAntesDe) continue;
      const e = evaluar(inicio);
      if (e && (!mejor || e.puntaje < mejor.puntaje)) mejor = { inicio, ...e, desplazamientoDias: delta };
    }
  }
  if (!mejor) return null;
  return {
    inicio: mejor.inicio,
    fin: sumarDias(mejor.inicio, duracion - 1),
    desplazamientoDias: mejor.desplazamientoDias,
    diasSaturados: mejor.saturados,
    diasSaturadosOriginal: original?.saturados ?? null,
  };
}
