// Casos de uso de IA (módulo 6): explicar una simulación y simular escenarios "¿y si…?".
// La IA solo explica; los números salen del motor. Si la IA falla, se usa la plantilla.

import { resumirSimulacion, compararSimulaciones } from '../../domain/ia/resumen.js';
import { sumarDias } from '../../domain/shared/util.js';

/**
 * @param {{ explicador?: import('../ports/ExplicadorPort.js').ExplicadorPort|null,
 *           respaldo: import('../ports/ExplicadorPort.js').ExplicadorPort }} dependencias
 */
export function crearExplicarRecomendacion({ explicador = null, respaldo }) {
  return async function explicarRecomendacion({ resultado, pregunta = null, base = null, escenario = null }) {
    const resumen = resumirSimulacion(resultado);
    const comparacion = base ? compararSimulaciones(base, resultado) : null;
    const pedido = { resumen, pregunta, comparacion, escenario };
    if (explicador) {
      try {
        return { ...(await explicador.explicar(pedido)), resumen, comparacion };
      } catch (error) {
        const r = await respaldo.explicar(pedido);
        return { ...r, aviso: `la IA no respondió (${error.message}); se usó la explicación de respaldo`, resumen, comparacion };
      }
    }
    return { ...(await respaldo.explicar(pedido)), resumen, comparacion };
  };
}

// Escenarios soportados: modifican la entrada de simularPlan.
export const ESCENARIOS = {
  lluvia: {
    descripcion: (v) => `llueve ${v} días más durante la cosecha`,
    aplicar: (e, v) => ({ ...e, diasDisponibles: Math.max(1, e.diasDisponibles - v) }),
  },
  demora: {
    descripcion: (v) => `la cosecha arranca ${v} días ${v >= 0 ? 'más tarde' : 'antes'}`,
    aplicar: (e, v) => ({ ...e, fechaInicioCosecha: sumarDias(e.fechaInicioCosecha, v) }),
  },
  precioPuerto: {
    descripcion: (v) => `el precio en el puerto ${v >= 0 ? 'sube' : 'baja'} ${Math.abs(v)} US$/t`,
    aplicar: (e, v) => ({ ...e, destinos: (e.destinos ?? []).map((d) => (d.tipo === 'puerto' && d.precioUsdPorT != null ? { ...d, precioUsdPorT: d.precioUsdPorT + v } : d)) }),
  },
  flete: {
    descripcion: (v) => `el flete ${v >= 0 ? 'sube' : 'baja'} ${Math.abs(v)}%`,
    // La tarifa CATAC depende de los km: se aproxima como un costo adicional proporcional por tonelada.
    aplicar: (e, v) => ({ ...e, destinos: (e.destinos ?? []).map((d) => (d.distanciaKm ? { ...d, costoAdicionalUsdPorT: (d.costoAdicionalUsdPorT ?? 0) + (d.distanciaKm * 0.094 * v) / 100 } : d)) }),
  },
  saturacion: {
    descripcion: (v) => `llegan ${v}% más camiones al puerto`,
    aplicar: (e, v) => ({ ...e, paramsSaturacion: { ...e.paramsSaturacion, participacionMercado: (e.paramsSaturacion?.participacionMercado ?? 0.05) / (1 + v / 100) } }),
  },
};

/**
 * @param {{ simularPlan: Function, explicarRecomendacion: Function }} dependencias
 */
export function crearSimularEscenario({ simularPlan, explicarRecomendacion }) {
  return async function simularEscenario({ entrada, base, escenario, pregunta = null }) {
    const def = ESCENARIOS[escenario?.tipo];
    if (!def) throw new RangeError(`escenario inválido: ${escenario?.tipo}. Opciones: ${Object.keys(ESCENARIOS).join(', ')}`);
    const valor = Number(escenario.valor);
    if (!Number.isFinite(valor)) throw new RangeError('el escenario necesita un valor numérico');
    const descripcion = def.descripcion(valor);
    const resultado = await simularPlan(def.aplicar(entrada, valor));
    const explicacion = await explicarRecomendacion({ resultado, base, pregunta, escenario: { tipo: escenario.tipo, valor, descripcion } });
    return { escenario: { tipo: escenario.tipo, valor, descripcion }, resultado, explicacion };
  };
}
