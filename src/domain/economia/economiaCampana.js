// Economía de la campaña (dominio puro): cuánto gana el productor con cada modalidad de venta y
// almacenaje (puerto directo, acopio, silobolsa) y dos estrategias distintas por lote:
//   - "rápida": cosechar y entregar lo antes posible, aceptando el riesgo mínimo de llegar al barco;
//   - "grande": maximizar la ganancia neta esperada exigiendo poco riesgo de perder el barco.
// Todo en USD. Los supuestos son editables y están rotulados: no son cotizaciones ni mediciones.

import { diasEntre, redondear, sumarDias } from '../shared/util.js';
import { condicionesDe, costoDeSecado, riesgoSilobolsaPorHumedad } from '../cosecha/condicionesCosecha.js';
import { perdidasPorDemora } from '../cosecha/perdidasPorDemora.js';
import { diasViaje } from '../maquinaria/logistica.js';
import { precioEsperado } from '../venta/precios.js';
import { PRECIOS_DEFAULT, SUPUESTOS_VENTA } from '../venta/supuestos.js';

export const QQ_POR_TONELADA = 10;
const TOLERANCIA_USD = 1;

export const SUPUESTOS_ECONOMIA = {
  tasaAnual: 0.08, // costo financiero de cobrar más tarde
  mermaManipuleoPct: 0.2, // por carga y descarga (supuesto; no hay fuente abierta con un valor único)
  mermaSilobolsaMensualPct: 0.5, // sin dato de humedad: riesgo medio de tarifas.silobolsa.merma_pct_por_mes
  costoEsperaUSDtDia: SUPUESTOS_VENTA.costoEsperaUSDtDia,
  costoGuardarCortoUSDtDia: SUPUESTOS_VENTA.costoGuardarCortoUSDtDia,
  fleteUSDtKm: SUPUESTOS_VENTA.fleteUSDtKm, // para llevar la silobolsa al destino cuando se vende
  diasPerdidaBarco: 7, // si el barco ya se fue, el grano espera al siguiente
  mesesMaxSilobolsa: 6,
  probLlegarRapida: 0.5, // piso de la estrategia rápida
  probLlegarMinima: 0.8, // piso de la estrategia grande
  margenLlegadaDias: 10, // días de corrimiento posible de la entrega al puerto
};

const nivelDeRiesgo = (probLlegar) => {
  if (probLlegar == null) return 'sin-dato';
  if (probLlegar >= 0.9) return 'bajo';
  if (probLlegar >= 0.7) return 'medio';
  return 'alto';
};

const redondearUSD = (valor) => Math.round(valor);
const sumar = (objeto) => Object.values(objeto).reduce((a, b) => a + b, 0);

function destinoDe(destinos, alternativa) {
  return destinos.find((d) => (d.nombre ?? d.terminal ?? d.tipo) === alternativa.destino && d.tipo === alternativa.tipo)
    ?? destinos.find((d) => d.tipo === alternativa.tipo);
}

function factorPrecioSilobolsa({ curva, cultivo, fecha, meses }) {
  if (curva) return precioEsperado(curva, fecha).precioUSDt / curva.spotUSDt;
  const referencia = PRECIOS_DEFAULT[cultivo];
  if (!referencia) return 1;
  const ratioTresMeses = referencia.futuroUSDt / referencia.puertoHoyUSDt;
  return 1 + (ratioTresMeses - 1) * (meses / 3);
}

function fila({ alternativa, destino, fechaLlegada, fechaCobro, hoy, toneladas, mermas, precioUSDt, costos, probLlegar, extra = {} }) {
  const mermaTotalPct = mermas.cosechaPct + mermas.manipuleoPct + mermas.almacenajePct + (mermas.secadoPct ?? 0);
  const toneladasVendidas = toneladas.cosechadas * (1 - mermaTotalPct / 100);
  const ingreso = toneladasVendidas * precioUSDt;
  const financiero = ingreso * (SUPUESTOS_ECONOMIA.tasaAnual / 365) * Math.max(0, diasEntre(hoy, fechaCobro));
  const todos = { ...costos, financiero };
  const operativos = costos.cosecha + costos.transporte + costos.almacenaje + costos.otros + (costos.secado ?? 0);
  const netos = ingreso - sumar(todos);
  const qqCosechados = toneladas.cosechadas * QQ_POR_TONELADA;
  const mermaUSD = toneladas.cosechadas * (mermaTotalPct / 100) * precioUSDt;
  return {
    tipo: alternativa.tipo,
    destino: alternativa.destino,
    fechaLlegada,
    fechaCobro,
    diasHastaCobro: Math.max(0, diasEntre(hoy, fechaCobro)),
    precioUSDt: redondear(precioUSDt, 2),
    toneladasCosechadas: redondear(toneladas.cosechadas, 1),
    toneladasVendidas: redondear(toneladasVendidas, 1),
    qqCosechados: redondear(qqCosechados, 0),
    qqVendidos: redondear(toneladasVendidas * QQ_POR_TONELADA, 0),
    ingresoBrutoUSD: redondearUSD(ingreso),
    costos: Object.fromEntries(Object.entries(todos).map(([clave, valor]) => [clave, redondearUSD(valor)])),
    costoTotalUSD: redondearUSD(sumar(todos)),
    gananciaBrutaUSD: redondearUSD(ingreso - operativos),
    gananciaNetaUSD: redondearUSD(netos),
    porQq: {
      ingresoUSD: redondear(ingreso / qqCosechados, 2),
      costoUSD: redondear(sumar(todos) / qqCosechados, 2),
      gananciaUSD: redondear(netos / qqCosechados, 2),
    },
    merma: { ...Object.fromEntries(Object.entries(mermas).map(([k, v]) => [k, redondear(v, 2)])), totalPct: redondear(mermaTotalPct, 2), qq: redondear(qqCosechados * (mermaTotalPct / 100), 0), usd: redondearUSD(mermaUSD) },
    riesgo: { probLlegar, nivel: probLlegar == null ? (alternativa.tipo === 'puerto' ? 'sin-dato' : 'bajo') : nivelDeRiesgo(probLlegar) },
    ...extra,
  };
}

function resumenHumedad(ctx, secado) {
  if (ctx.humedadGranoPct == null) return null;
  return { granoPct: ctx.humedadGranoPct, objetivoPct: secado.objetivoPct ?? null, puntosASecar: secado.puntos, mermaSecadoPct: Math.round(secado.mermaPct * 100) / 100 };
}

function costosBase(alternativa, toneladas) {
  const servicios = alternativa.costos_por_servicio ?? {};
  const extraccion = alternativa.costo_extraccion_usd ?? 0;
  const cosecha = servicios.cosecha ?? 0;
  const transporte = servicios.transporte ?? 0;
  const almacenajeServicio = servicios.almacenaje ?? 0;
  const otros = Math.max(0, (alternativa.costo_usd ?? 0) - cosecha - transporte - almacenajeServicio - extraccion);
  return { cosecha, transporte, almacenaje: almacenajeServicio + extraccion, otros, toneladas };
}

function evaluarPuerto({ alternativa, destino, ctx }) {
  const { s, hoy, cosecha, saturacionPorFecha, modo, toneladas } = ctx;
  const base = costosBase(alternativa, toneladas.cosechadas);
  const viaje = diasViaje(destino?.distanciaKm ?? 0);
  const llegadaBase = sumarDias(cosecha.fin, viaje);
  const secado = ctx.secar(ctx.condiciones?.humedadBaseRecibo);
  const candidatos = [];
  for (let desplazamiento = 0; desplazamiento <= s.margenLlegadaDias; desplazamiento += 1) {
    const fecha = sumarDias(llegadaBase, desplazamiento);
    const senal = saturacionPorFecha.get(fecha);
    const probLlegar = senal?.probBarco ?? null;
    const espera = toneladas.cosechadas * (senal?.esperaDias ?? 0) * s.costoEsperaUSDtDia;
    const riesgoBarco = probLlegar == null ? 0 : toneladas.cosechadas * (1 - probLlegar) * s.diasPerdidaBarco * s.costoEsperaUSDtDia;
    const guardarEnCampo = toneladas.cosechadas * desplazamiento * s.costoGuardarCortoUSDtDia;
    const candidata = fila({
      alternativa, destino, fechaLlegada: fecha, fechaCobro: fecha, hoy, toneladas,
      mermas: { ...ctx.mermas(1), secadoPct: secado.mermaPct }, precioUSDt: ctx.precioBase(alternativa),
      costos: { cosecha: base.cosecha, transporte: base.transporte, almacenaje: base.almacenaje, otros: base.otros, secado: secado.usd, espera, guardarEnCampo, riesgoBarco },
      probLlegar,
      extra: { humedad: resumenHumedad(ctx, secado) },
    });
    candidatos.push(candidata);
    if (modo === 'rapida' && (probLlegar == null || probLlegar >= s.probLlegarRapida)) return conAhorroDeFecha(candidata, candidatos[0]);
  }
  if (modo === 'rapida') return conAhorroDeFecha(candidatos[0], candidatos[0]);
  const aceptables = candidatos.filter((c) => c.riesgo.probLlegar == null || c.riesgo.probLlegar >= s.probLlegarMinima);
  const elegida = aceptables.length
    ? aceptables.reduce((mejor, c) => (c.gananciaNetaUSD > mejor.gananciaNetaUSD ? c : mejor))
    : [...candidatos].sort((a, b) => (b.riesgo.probLlegar ?? 0) - (a.riesgo.probLlegar ?? 0) || b.gananciaNetaUSD - a.gananciaNetaUSD)[0];
  return conAhorroDeFecha(elegida, candidatos[0]);
}

// Lo que se evita en espera, riesgo de perder el barco y grano parado al elegir la fecha de entrega
// en vez de despachar el primer día posible.
function conAhorroDeFecha(elegida, primera) {
  const costoFecha = (c) => c.costos.espera + c.costos.riesgoBarco + c.costos.guardarEnCampo;
  return { ...elegida, ahorroPorFechaUSD: costoFecha(primera) - costoFecha(elegida) };
}

function evaluarAcopio({ alternativa, destino, ctx }) {
  const { hoy, cosecha, toneladas } = ctx;
  const base = costosBase(alternativa, toneladas.cosechadas);
  const fecha = sumarDias(cosecha.fin, diasViaje(destino?.distanciaKm ?? 0));
  const secado = ctx.secar(ctx.condiciones?.humedadBaseRecibo);
  return fila({
    alternativa, destino, fechaLlegada: fecha, fechaCobro: fecha, hoy, toneladas,
    mermas: { ...ctx.mermas(1), secadoPct: secado.mermaPct }, precioUSDt: ctx.precioBase(alternativa),
    costos: { cosecha: base.cosecha, transporte: base.transporte, almacenaje: base.almacenaje, otros: base.otros, secado: secado.usd, espera: 0, guardarEnCampo: 0, riesgoBarco: 0 },
    probLlegar: null,
    extra: { humedad: resumenHumedad(ctx, secado) },
  });
}

function evaluarSilobolsa({ alternativa, ctx, alternativas, destinos }) {
  const { s, hoy, cosecha, toneladas, curva, cultivo } = ctx;
  const base = costosBase(alternativa, toneladas.cosechadas);
  // Al abrir la bolsa el grano se vende en el destino final (puerto o, si no hay, acopio): mismo precio
  // y mismo flete que esa alternativa, que la silobolsa paga recién al vender.
  const alternativaDeVenta = alternativas.find((a) => a.tipo === 'puerto' && a.ingreso_usd != null)
    ?? alternativas.find((a) => a.tipo === 'acopio' && a.ingreso_usd != null)
    ?? alternativa;
  const destinoDeVenta = destinoDe(destinos, alternativaDeVenta);
  const transporteDiferido = alternativaDeVenta === alternativa ? 0 : (alternativaDeVenta.costos_por_servicio?.transporte ?? 0);
  const precioSpot = ctx.precioBase(alternativaDeVenta);
  const opciones = [];
  const maximo = ctx.condiciones?.humedadMaximaSilobolsa;
  const humedad = ctx.humedadGranoPct;
  const hayExceso = humedad != null && maximo != null && humedad > maximo;
  // Con grano más húmedo que el máximo de bajo riesgo hay dos caminos: embolsar así (más merma por mes)
  // o secar antes de embolsar (merma y tarifa de secado, pero riesgo bajo).
  const variantes = hayExceso ? [false, true] : [false];
  for (let meses = 1; meses <= s.mesesMaxSilobolsa; meses += 1) {
    const fechaCobro = sumarDias(cosecha.fin, 30 * meses);
    const precio = precioSpot * factorPrecioSilobolsa({ curva, cultivo, fecha: fechaCobro, meses });
    const variantesDelMes = variantes.map((secarAntes) => {
      const secado = secarAntes ? ctx.secar(maximo) : ctx.secar(undefined);
      const humedadAlEmbolsar = secarAntes ? maximo : humedad;
      const riesgoHumedad = humedadAlEmbolsar == null ? null : riesgoSilobolsaPorHumedad(cultivo, humedadAlEmbolsar);
      const mermaMensual = riesgoHumedad && riesgoHumedad.nivel !== 'sin-dato' ? riesgoHumedad.mermaMensualPct : s.mermaSilobolsaMensualPct;
      const mermas = { ...ctx.mermas(2), almacenajePct: mermaMensual * meses, secadoPct: secado.mermaPct };
      return fila({
        alternativa, destino: destinoDeVenta, fechaLlegada: cosecha.fin, fechaCobro, hoy, toneladas, mermas, precioUSDt: precio,
        costos: { cosecha: base.cosecha, transporte: base.transporte + transporteDiferido, almacenaje: base.almacenaje, otros: base.otros, secado: secado.usd, espera: 0, guardarEnCampo: 0, riesgoBarco: 0 },
        probLlegar: null,
        extra: {
          mesesGuardado: meses,
          riesgo: { probLlegar: null, nivel: riesgoHumedad?.nivel ?? 'sin-dato', motivo: 'humedad del grano' },
          humedad: { granoPct: humedad, objetivoPct: maximo ?? null, puntosASecar: secarAntes ? secado.puntos : 0, secarAntes, exceso: hayExceso ? Math.round((humedad - maximo) * 10) / 10 : 0, mermaMensualPct: mermaMensual },
        },
      });
    });
    opciones.push(variantesDelMes.reduce((a, o) => (o.gananciaNetaUSD > a.gananciaNetaUSD ? o : a)));
  }
  const mejor = opciones.reduce((a, o) => (o.gananciaNetaUSD > a.gananciaNetaUSD ? o : a));
  return {
    ...mejor,
    curvaSilobolsa: opciones.map((o) => ({ meses: o.mesesGuardado, fecha: o.fechaCobro, precioUSDt: o.precioUSDt, mermaPct: o.merma.totalPct, gananciaNetaUSD: o.gananciaNetaUSD, secarAntes: o.humedad?.secarAntes ?? false, riesgo: o.riesgo.nivel })),
  };
}

/**
 * Ganancia neta de cada modalidad de venta/almacenaje para un plan simulado.
 * @param {{ simulacion: object, modo?: 'rapida'|'grande', hoy: string, cosecha: {inicio:string, fin:string},
 *           curva?: object|null, diasDemora?: number, supuestos?: object }} entrada
 */
export function evaluarModalidades({ simulacion, modo = 'grande', hoy, cosecha, curva = null, diasDemora = 0, humedadGranoPct = null, supuestos = {} }) {
  const s = { ...SUPUESTOS_ECONOMIA, ...supuestos };
  const entrada = simulacion.entrada ?? {};
  const destinos = entrada.destinos ?? [];
  const cultivo = entrada.cultivo;
  const condiciones = condicionesDe(cultivo);
  const perdida = perdidasPorDemora({ diasDemora, cultivo, rendimientoEsperadoKgha: Number(entrada.qqHa) * 100 });
  const toneladas = { cosechadas: simulacion.plan.toneladas };
  const saturacionPorFecha = new Map((simulacion.saturacion?.dias ?? []).map((dia) => [dia.fecha, dia]));
  const ctx = {
    s, hoy, cosecha, modo, toneladas, curva, cultivo, saturacionPorFecha,
    precioBase: (alternativa) => (alternativa.ingreso_usd ?? 0) / toneladas.cosechadas,
    mermas: (tramos) => ({ cosechaPct: perdida.porcentaje, manipuleoPct: s.mermaManipuleoPct * tramos, almacenajePct: 0 }),
    condiciones,
    humedadGranoPct: Number.isFinite(humedadGranoPct) ? humedadGranoPct : null,
    // Secar el grano hasta `objetivoPct`: merma de peso y tarifa de secado por tonelada.
    secar: (objetivoPct) => {
      const secado = costoDeSecado({ humedadPct: Number.isFinite(humedadGranoPct) ? humedadGranoPct : null, objetivoPct });
      return { ...secado, usd: secado.usdPorTonelada * toneladas.cosechadas, objetivoPct };
    },
  };

  return simulacion.plan.alternativas
    .filter((alternativa) => alternativa.ingreso_usd != null)
    .map((alternativa) => {
      const destino = destinoDe(destinos, alternativa);
      if (alternativa.tipo === 'puerto') return evaluarPuerto({ alternativa, destino, ctx });
      if (alternativa.tipo === 'silobolsa') return evaluarSilobolsa({ alternativa, ctx, alternativas: simulacion.plan.alternativas, destinos });
      return evaluarAcopio({ alternativa, destino, ctx });
    });
}

const mejorPor = (lista, criterio) => lista.reduce((mejor, item) => (criterio(item) > criterio(mejor) ? item : mejor));

export function elegirModalidad(modalidades, modo, supuestos = {}) {
  const s = { ...SUPUESTOS_ECONOMIA, ...supuestos };
  if (!modalidades.length) return null;
  if (modo === 'rapida') {
    const rapidas = modalidades.filter((m) => m.tipo !== 'silobolsa' && (m.riesgo.probLlegar == null || m.riesgo.probLlegar >= s.probLlegarRapida));
    if (rapidas.length) {
      const primero = Math.min(...rapidas.map((m) => m.diasHastaCobro));
      return mejorPor(rapidas.filter((m) => m.diasHastaCobro === primero), (m) => m.gananciaNetaUSD);
    }
    return mejorPor(modalidades, (m) => m.gananciaNetaUSD);
  }
  const seguras = modalidades.filter((m) => m.riesgo.probLlegar == null || m.riesgo.probLlegar >= s.probLlegarMinima);
  return mejorPor(seguras.length ? seguras : modalidades, (m) => (seguras.length ? m.gananciaNetaUSD : (m.riesgo.probLlegar ?? 0)));
}

function resumenModalidades(modalidades, elegida) {
  const peor = modalidades.reduce((a, m) => (m.gananciaNetaUSD < a.gananciaNetaUSD ? m : a));
  const inmediatas = modalidades.filter((m) => m.tipo !== 'silobolsa');
  const mejorInmediata = inmediatas.length ? mejorPor(inmediatas, (m) => m.gananciaNetaUSD) : null;
  return modalidades.map((m) => {
    const silobolsa = m.tipo === 'silobolsa' && mejorInmediata ? {
      extraVsVenderYaUSD: m.gananciaNetaUSD - mejorInmediata.gananciaNetaUSD,
      mesesParaMejorar: m.curvaSilobolsa.find((p) => p.gananciaNetaUSD > mejorInmediata.gananciaNetaUSD + TOLERANCIA_USD)?.meses ?? null,
    } : null;
    return {
      ...m,
      elegida: m === elegida,
      ahorroVsPeorUSD: m.gananciaNetaUSD - peor.gananciaNetaUSD,
      diferenciaVsMejorUSD: m.gananciaNetaUSD - mejorPor(modalidades, (x) => x.gananciaNetaUSD).gananciaNetaUSD,
      ...(silobolsa ? { silobolsa } : {}),
    };
  });
}

/**
 * Arma una estrategia: evalúa las modalidades del plan simulado y elige la que corresponde al modo.
 */
export function armarEstrategia({ modo, simulacion, hoy, cosecha, curva, diasDemora, humedadGranoPct, supuestos }) {
  const modalidades = evaluarModalidades({ simulacion, modo, hoy, cosecha, curva, diasDemora, humedadGranoPct, supuestos });
  const elegida = elegirModalidad(modalidades, modo, supuestos);
  if (!elegida) return null;
  return { modo, cosecha, urgencia: simulacion.plan.urgencia, elegida, modalidades: resumenModalidades(modalidades, elegida) };
}

/**
 * Ahorro de cada una de las tres decisiones al elegir el camino "grande" frente al "rápido" y a la peor opción.
 */
export function compararEstrategias({ rapida, grande }) {
  if (!rapida || !grande) return null;
  const r = rapida.elegida;
  const g = grande.elegida;
  const todas = grande.modalidades;
  const costoDeCosecha = (m) => m.costos.cosecha + (m.merma.totalPct ? m.merma.usd * (m.merma.cosechaPct / m.merma.totalPct) : 0);
  const transporteTotal = (m) => m.costos.transporte + m.costos.espera + m.costos.riesgoBarco + m.costos.guardarEnCampo;
  const masCaraEnTransporte = mejorPor(todas.filter((m) => m.tipo !== 'silobolsa'), transporteTotal);
  const peor = todas.reduce((a, m) => (m.gananciaNetaUSD < a.gananciaNetaUSD ? m : a));
  const coinciden = r.tipo === g.tipo && r.fechaCobro === g.fechaCobro && rapida.cosecha.inicio === grande.cosecha.inicio
    && rapida.urgencia === grande.urgencia;
  return {
    coinciden,
    gananciaExtraUSD: g.gananciaNetaUSD - r.gananciaNetaUSD,
    gananciaExtraPct: r.gananciaNetaUSD ? redondear(((g.gananciaNetaUSD - r.gananciaNetaUSD) / Math.abs(r.gananciaNetaUSD)) * 100, 1) : null,
    diasMasLentoQueRapida: g.diasHastaCobro - r.diasHastaCobro,
    decisiones: {
      cosecha: {
        costoElegidoUSD: costoDeCosecha(g),
        costoRapidoUSD: costoDeCosecha(r),
        ahorroUSD: costoDeCosecha(r) - costoDeCosecha(g),
        nota: 'Máquinas más la pérdida de grano en el cabezal, frente a terminar lo antes posible.',
      },
      transporte: {
        costoElegidoUSD: transporteTotal(g),
        costoMasCaroUSD: transporteTotal(masCaraEnTransporte),
        ahorroUSD: g.ahorroPorFechaUSD ?? transporteTotal(masCaraEnTransporte) - transporteTotal(g),
        nota: 'Flete, espera en puerto, riesgo de perder el barco y grano parado; el ahorro sale de elegir la fecha de entrega.',
      },
      almacenaje: {
        gananciaElegidaUSD: g.gananciaNetaUSD,
        gananciaPeorUSD: peor.gananciaNetaUSD,
        ahorroUSD: g.gananciaNetaUSD - peor.gananciaNetaUSD,
        nota: `Modalidad ${g.tipo} frente a la peor modalidad (${peor.tipo}).`,
      },
    },
  };
}
