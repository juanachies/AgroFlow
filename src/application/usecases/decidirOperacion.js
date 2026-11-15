import { decidirOperacion } from '../../domain/decision/decisionOperacion.js';
import { armarEstrategia, compararEstrategias, SUPUESTOS_ECONOMIA } from '../../domain/economia/economiaCampana.js';
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
    return { ...armarEstrategia({ modo, simulacion: c.simulacion, hoy, cosecha, curva, diasDemora, humedadGranoPct: humedadGranoEn(decision.almanaque, cosecha) }), origen: c };
  };
  const rapida = estrategia('rapida', simuladas[0]);
  const exploradas = simuladas.map((c) => estrategia('grande', c)).filter((e) => e.elegida);
  const grande = exploradas.reduce((mejor, e) => (e.elegida.gananciaNetaUSD > mejor.elegida.gananciaNetaUSD ? e : mejor));

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
    simulaciones: {
      rapida: { entrada: rapida.origen.entrada, simulacion: rapida.origen.simulacion },
      grande: { entrada: grande.origen.entrada, simulacion: grande.origen.simulacion },
    },
  };
}

/**
 * Decisión completa (cosecha + transporte + almacenaje + almanaque): simula el plan y lo ajusta
 * con el clima del lote. Devuelve la simulación con la decisión adjunta, así que sigue siendo
 * confirmable con confirmarReservas().
 */
export function crearDecidirOperacion({ simularPlan, clima = null, climatologia = null, precios = null, fuentesExternas = false, ahora = () => new Date() }) {
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

    const decision = decidirOperacion({ simulacion, dias: climaDiario.dias, hoy });
    let economia = null;
    let errorEconomia = null;
    try {
      economia = await calcularEconomia({ entrada, simulacion, decision, hoy, simularPlan, precios });
    } catch (reason) {
      errorEconomia = reason.message;
    }
    return {
      ...simulacion,
      decision: {
        ...decision,
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
