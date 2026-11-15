import { condicionesDe } from '../../domain/cosecha/condicionesCosecha.js';
import { decidirOperacion } from '../../domain/decision/decisionOperacion.js';
import { armarEstrategia, compararEstrategias, SUPUESTOS_ECONOMIA } from '../../domain/economia/economiaCampana.js';
import { fleterosDeLaZona, factorZonaTransporte, transporteDeLaZona } from '../../domain/destino/zona.js';
import { diasEntre, sumarDias } from '../../domain/shared/util.js';
import { curvaDesdePrecios } from '../../domain/venta/index.js';
import { obtenerDiasDeClima } from './diasDeClima.js';

const DIAS_ANTES_DEL_INICIO = 20;
const DIAS_DESPUES_DEL_INICIO = 60;
export const MAX_DIAS_CONSULTA_CLIMA = 366;

const hoyIso = (ahora) => ahora().toISOString().slice(0, 10);

const fechasDeCosecha = (simulacion) => {
  const pedidos = (simulacion.plan.recomendado.pedidos ?? []).filter((p) => p.servicio === 'cosecha');
  const inicio = pedidos.map((p) => p.usar_desde).sort()[0] ?? simulacion.entrada.fechaInicioCosecha;
  const fin = pedidos.map((p) => p.usar_hasta).sort().at(-1) ?? sumarDias(inicio, simulacion.plan.dias_efectivos - 1);
  return { inicio, fin };
};

async function curvaDePrecios({ precios, cultivo, hoy }) {
  if (!precios) return { curva: null, fuente: 'supuestos de precios por defecto' };
  try {
    const curva = curvaDesdePrecios(hoy, await precios.precios(cultivo));
    return { curva, fuente: curva.fuente ?? precios.origen ?? 'PreciosPort' };
  } catch {
    return { curva: null, fuente: 'supuestos de precios por defecto (falló PreciosPort)' };
  }
}

const humedadGranoEn = (almanaque, { inicio, fin }) => {
  const valores = almanaque.filter((dia) => dia.fecha >= inicio && dia.fecha <= fin).map((dia) => dia.clima.humedadGranoPct).filter(Number.isFinite);
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
};

const diasMalosEn = (almanaque, { inicio, fin }) => almanaque
  .filter((dia) => dia.fecha >= inicio && dia.fecha <= fin && dia.clima.apto === 'malo').length;

// Dos caminos para el mismo lote: terminar y cobrar lo antes posible, o maximizar la ganancia neta
// con poco riesgo de perder el barco. La opción "grande" explora varias combinaciones de urgencia y
// fecha de cosecha (incluida la rápida), así que nunca rinde menos que la rápida.
async function calcularEconomia({ entrada, simulacion, decision, hoy, simularPlan, precios }) {
  if (!entrada.destinos?.length) return null;
  const inicioPlan = simulacion.entrada.fechaInicioCosecha;
  const { inicioMasRapido, inicio: inicioClima } = decision.cosecha;
  const candidatas = [
    { clave: 'rapida', urgencia: 'alta', inicio: inicioMasRapido },
    { clave: 'sin-apuro-rapido', urgencia: 'baja', inicio: inicioMasRapido },
    { clave: 'sin-apuro-clima', urgencia: 'baja', inicio: inicioClima },
    { clave: 'plan', urgencia: entrada.urgencia ?? 'media', inicio: inicioPlan },
  ];
  const [{ curva, fuente }, ...simuladas] = await Promise.all([
    curvaDePrecios({ precios, cultivo: entrada.cultivo, hoy }),
    ...candidatas.map(async (c) => {
      const entradaC = { ...entrada, urgencia: c.urgencia, fechaInicioCosecha: c.inicio };
      return { ...c, entrada: entradaC, simulacion: await simularPlan(entradaC) };
    }),
  ]);

  const estrategia = (modo, c) => {
    const cosecha = fechasDeCosecha(c.simulacion);
    const diasDemora = Math.max(0, diasEntre(inicioPlan, c.inicio)) + diasMalosEn(decision.almanaque, cosecha);
    return { ...armarEstrategia({ modo, simulacion: c.simulacion, hoy, cosecha, curva, diasDemora, humedadGranoPct: humedadGranoEn(decision.almanaque, cosecha), factorTransporte: factorZonaTransporte(c.simulacion.asignacion) }), origen: c };
  };
  const rapida = estrategia('rapida', simuladas[0]);
  const exploradas = simuladas.map((c) => estrategia('grande', c)).filter((e) => e.elegida);
  const grande = exploradas.reduce((mejor, e) => (e.elegida.gananciaNetaUSD > mejor.elegida.gananciaNetaUSD ? e : mejor));

  // Cada camino se vuelve a simular con solo el destino que la economía eligió: así el plan, las reservas y
  // el almanaque son los de esa modalidad y no los del destino que el plan sugería por margen bruto.
  const fijarDestino = async (estrategia) => {
    const entradaFija = { ...estrategia.origen.entrada, destinos: entrada.destinos.filter((d) => d.tipo === estrategia.elegida.tipo) };
    return { entrada: entradaFija, simulacion: await simularPlan(entradaFija) };
  };
  const [rapidaFija, grandeFija] = await Promise.all([fijarDestino(rapida), fijarDestino(grande)]);

  const publico = ({ origen, ...resto }) => ({ ...resto, urgencia: origen.urgencia });
  return {
    economia: {
      rapida: publico(rapida),
      grande: publico(grande),
      comparacion: compararEstrategias({ rapida: publico(rapida), grande: publico(grande) }),
      exploradas: exploradas.map((e) => ({ urgencia: e.origen.urgencia, inicio: e.cosecha.inicio, modalidad: e.elegida.tipo, gananciaNetaUSD: e.elegida.gananciaNetaUSD })),
      fuentePrecios: fuente,
      supuestos: SUPUESTOS_ECONOMIA,
    },
    simulaciones: { rapida: rapidaFija, grande: grandeFija },
  };
}

/**
 * Decisión completa (cosecha + transporte + almacenaje + almanaque): simula el plan y lo ajusta
 * con el clima del lote. Devuelve la simulación con la decisión adjunta, así que sigue siendo
 * confirmable con confirmarReservas().
 */
// Estado de la zona del lote: fleteros que llegan y cuánto sale el transporte por esos lados.
async function calcularZona({ entrada, simulacion, marketplace, tarifas }) {
  const lote = simulacion.lote ?? entrada.lote;
  const inicio = simulacion.entrada.fechaInicioCosecha;
  const ofertas = marketplace ? await marketplace.ofertas({ desde: inicio, hasta: sumarDias(inicio, 60) }) : [];
  const fleteros = fleterosDeLaZona({ lote, ofertas });
  const factor = factorZonaTransporte(simulacion.asignacion);
  const recomendado = simulacion.plan.recomendado;
  const destino = (entrada.destinos ?? []).find((d) => (d.nombre ?? d.terminal) === recomendado.destino);
  const km = simulacion.distancias?.find((d) => d.destino === recomendado.destino)?.km ?? destino?.distanciaKm ?? null;
  const vigentes = tarifas ? await tarifas.vigentes() : null;
  return { fleteros, transporte: vigentes && km ? transporteDeLaZona({ distanciaKm: km, tarifas: vigentes, factor }) : null };
}

export function crearDecidirOperacion({ simularPlan, clima = null, climatologia = null, precios = null, marketplace = null, tarifas = null, fuentesExternas = false, ahora = () => new Date() }) {
  return async function decidir(entrada) {
    const simulacion = await simularPlan(entrada);
    const hoy = entrada.hoy ?? hoyIso(ahora);
    const inicioPlan = simulacion.entrada?.fechaInicioCosecha ?? hoy;
    const desde = sumarDias(inicioPlan, -DIAS_ANTES_DEL_INICIO);
    const hasta = sumarDias(inicioPlan, DIAS_DESPUES_DEL_INICIO);
    const lote = simulacion.lote ?? entrada.lote ?? {};

    const climaDiario = fuentesExternas
      // El horizonte del pronóstico se cuenta desde el día real, aunque el plan simule otra fecha de "hoy".
      ? await obtenerDiasDeClima({ latitude: lote.lat, longitude: lote.lon, desde, hasta, hoy: hoyIso(ahora), clima, climatologia, cultivo: entrada.cultivo })
      : { dias: [], fuentes: { pronostico: false, climatologia: false }, errores: [] };

    const decisionBase = decidirOperacion({ simulacion, dias: climaDiario.dias, hoy });
    let economia = null;
    let errorEconomia = null;
    try {
      economia = await calcularEconomia({ entrada, simulacion, decision: decisionBase, hoy, simularPlan, precios });
    } catch (reason) {
      errorEconomia = reason.message;
    }

    // La decisión final es la del camino "grande": mismo destino, fechas y reservas que la economía eligió.
    const elegida = economia?.simulaciones.grande ?? { entrada, simulacion };
    const decision = economia ? decidirOperacion({ simulacion: elegida.simulacion, dias: climaDiario.dias, hoy, margenBusquedaDias: 0 }) : decisionBase;
    let zona = null;
    try {
      zona = await calcularZona({ entrada: elegida.entrada, simulacion: elegida.simulacion, marketplace, tarifas });
    } catch {
      zona = null;
    }
    return {
      ...elegida.simulacion,
      decision: {
        ...decision,
        zona,
        condiciones: condicionesDe(entrada.cultivo),
        clima: { fuentes: climaDiario.fuentes, errores: climaDiario.errores },
        economia: economia?.economia ?? null,
        ...(errorEconomia ? { errorEconomia } : {}),
      },
      estrategiasSimuladas: economia?.simulaciones ?? null,
    };
  };
}

/**
 * Clima público del punto: pronóstico a 16 días y, para fechas más lejanas, probabilidad histórica de lluvia.
 */
export function crearConsultarClima({ clima = null, climatologia = null, ahora = () => new Date() }) {
  return async function consultarClima({ latitude, longitude, desde, hasta, cultivo = null }) {
    const hoy = hoyIso(ahora);
    const inicio = desde ?? hoy;
    const fin = hasta ?? sumarDias(inicio, 90);
    if (fin < inicio) throw new RangeError('hasta no puede ser anterior a desde');
    if (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`) > MAX_DIAS_CONSULTA_CLIMA * 86400000) {
      throw new RangeError(`el rango máximo es de ${MAX_DIAS_CONSULTA_CLIMA} días`);
    }
    const { dias, fuentes, errores } = await obtenerDiasDeClima({ latitude, longitude, desde: inicio, hasta: fin, hoy, clima, climatologia, cultivo });
    return {
      coordenadas: { latitude: Number(latitude), longitude: Number(longitude) },
      desde: inicio,
      hasta: fin,
      fuentes: {
        pronostico: fuentes.pronostico ? 'Open-Meteo (hasta 16 días)' : null,
        climatologia: fuentes.climatologia ? 'Open-Meteo Historical (frecuencia de lluvia de los últimos 10 años)' : null,
      },
      errores,
      dias,
    };
  };
}
