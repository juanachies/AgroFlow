// Estrategias con índice de confianza (dominio puro): traduce cada modalidad económica a una acción
// concreta para el productor y explica cuánto pesa cada factor en la confianza. El índice es
// orientativo y nunca llega a 100: AgroFlow informa, el productor y su agrónomo deciden.

import { diasEntre } from '../shared/util.js';

export const AVISO_ESTRATEGIAS = 'AgroFlow no asegura resultados: el índice de confianza es orientativo y no reemplaza la decisión del productor ni el consejo de un agrónomo.';

export const BASE_CONFIANZA = 85;
export const CONFIANZA_MINIMA = 5;
export const CONFIANZA_MAXIMA = 95;
export const NIVEL_ALTA_DESDE = 70;
export const NIVEL_MEDIA_DESDE = 45;

export const IMPACTO_FUENTE_CLIMA = { pronostico: 0, mixta: -10, climatologia: -20, 'sin-dato': -30 };
export const IMPACTO_POR_DIA_MALO = -5;
export const TOPE_DIAS_MALOS = -20;
export const IMPACTO_POR_DIA_VIENTO = -3;
export const TOPE_VIENTO = -9;
export const IMPACTO_PRECIOS_POR_DEFECTO = -15;
export const IMPACTO_POR_MES_SILOBOLSA = -4;
export const ESCALA_RIESGO_BARCO = 40;
export const IMPACTO_POR_DIA_SATURADO = -3;
export const TOPE_SATURACION = -15;
export const IMPACTO_HUMEDAD_FUERA_DE_BASE = -8;
export const IMPACTO_RIESGO_ALMACENAJE = { alto: -20, medio: -10, bajo: 0 };

const FUENTE_CLIMA = {
  pronostico: 'Open-Meteo',
  mixta: 'pronóstico y climatología (Open-Meteo)',
  climatologia: 'climatología histórica',
  'sin-dato': 'sin fuente de clima',
};

const FUENTE_CLIMA_VALOR = {
  pronostico: 'Pronóstico',
  mixta: 'Mixta',
  climatologia: 'Climatología histórica',
  'sin-dato': 'Sin dato',
};

const TITULOS = { puerto: 'Venta directa a puerto', acopio: 'Venta en acopio', silobolsa: 'Silobolsa' };

export const ETAPAS = ['cosecha', 'transporte', 'almacenaje', 'venta'];

const TITULOS_ETAPA = { cosecha: 'Cosecha', transporte: 'Transporte', almacenaje: 'Almacenaje', venta: 'Venta' };

const acotar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

const textoDias = (dias) => `${dias} ${dias === 1 ? 'día' : 'días'}`;
const textoMeses = (meses) => `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
const textoPorcentaje = (fraccion) => `${Math.round(fraccion * 100)} %`;
const textoHumedad = (valor) => `${valor.toFixed(1)} %`;

function nivelDeConfianza(indice) {
  if (indice >= NIVEL_ALTA_DESDE) return 'alta';
  if (indice >= NIVEL_MEDIA_DESDE) return 'media';
  return 'baja';
}

function factor({ id, categoria, nombre, valor, detalle, impacto, fuente }) {
  const efecto = impacto < 0 ? 'desfavorable' : 'neutral';
  return { id, categoria, nombre, valor, detalle, efecto, impacto: Math.round(impacto), fuente };
}

function factorFuenteClima(cosecha) {
  const fuente = cosecha?.fuenteClima ?? 'sin-dato';
  const impacto = IMPACTO_FUENTE_CLIMA[fuente] ?? IMPACTO_FUENTE_CLIMA['sin-dato'];
  return factor({
    id: 'clima-fuente',
    categoria: 'clima',
    nombre: 'Fuente del pronóstico',
    valor: FUENTE_CLIMA_VALOR[fuente] ?? FUENTE_CLIMA_VALOR['sin-dato'],
    detalle: impacto === 0 ? 'Hay pronóstico para la ventana de cosecha.' : 'El clima de la ventana no es un pronóstico firme.',
    impacto,
    fuente: FUENTE_CLIMA[fuente] ?? FUENTE_CLIMA['sin-dato'],
  });
}

function factorDiasMalos(cosecha) {
  const dias = Math.max(0, Number(cosecha?.diasMalos) || 0);
  return factor({
    id: 'clima-dias-malos',
    categoria: 'clima',
    nombre: 'Días malos en la cosecha',
    valor: textoDias(dias),
    detalle: dias ? `${dias} día(s) con lluvia o condiciones adversas en la ventana.` : 'Sin días malos en la ventana de cosecha.',
    impacto: Math.max(TOPE_DIAS_MALOS, dias * IMPACTO_POR_DIA_MALO),
    fuente: FUENTE_CLIMA[cosecha?.fuenteClima] ?? FUENTE_CLIMA['sin-dato'],
  });
}

function factorViento(cosecha) {
  const dias = Math.max(0, Number(cosecha?.diasConVientoFuerte) || 0);
  return factor({
    id: 'clima-viento',
    categoria: 'clima',
    nombre: 'Días con viento fuerte',
    valor: textoDias(dias),
    detalle: dias ? `${dias} día(s) con ráfagas fuertes: más desgrane y menos horas de cosecha.` : 'Sin días de viento fuerte en la ventana.',
    impacto: Math.max(TOPE_VIENTO, dias * IMPACTO_POR_DIA_VIENTO),
    fuente: FUENTE_CLIMA[cosecha?.fuenteClima] ?? FUENTE_CLIMA['sin-dato'],
  });
}

function factorPrecioFuente(economia) {
  const fuente = economia?.fuentePrecios ?? '';
  const porDefecto = String(fuente).includes('por defecto');
  return factor({
    id: 'precio-fuente',
    categoria: 'precio',
    nombre: 'Fuente de precios',
    valor: fuente || null,
    detalle: porDefecto ? 'No hay precios de mercado: se usan supuestos por defecto.' : 'Los precios vienen de una fuente de mercado.',
    impacto: porDefecto ? IMPACTO_PRECIOS_POR_DEFECTO : 0,
    fuente: fuente || 'supuestos de precios',
  });
}

function factorPrecioFuturo(modalidad) {
  const meses = Number(modalidad.mesesGuardado) || 0;
  return factor({
    id: 'precio-futuro',
    categoria: 'precio',
    nombre: 'Precio futuro del grano',
    valor: textoMeses(meses),
    detalle: `Guardar ${meses} mes(es) hace más incierto el precio de venta.`,
    impacto: meses * IMPACTO_POR_MES_SILOBOLSA,
    fuente: 'curva de precios',
  });
}

function factorRiesgoBarco(modalidad) {
  const probLlegar = modalidad.riesgo?.probLlegar;
  const hayDato = typeof probLlegar === 'number' && Number.isFinite(probLlegar);
  return factor({
    id: 'logistica-barco',
    categoria: 'logistica',
    nombre: 'Riesgo de perder el barco',
    valor: hayDato ? textoPorcentaje(probLlegar) : null,
    detalle: hayDato
      ? `Probabilidad estimada de llegar al barco: ${Math.round(probLlegar * 100)} %.`
      : 'Sin dato de llegada al barco.',
    impacto: hayDato ? -Math.round((1 - probLlegar) * ESCALA_RIESGO_BARCO) : 0,
    fuente: 'simulación de logística',
  });
}

function factorPuertoSaturado(modalidad, transporte) {
  const dias = Array.isArray(transporte?.diasSaturados) ? transporte.diasSaturados.length : 0;
  return factor({
    id: 'logistica-saturacion',
    categoria: 'logistica',
    nombre: 'Puerto saturado',
    valor: textoDias(dias),
    detalle: dias ? `${dias} día(s) de transporte caen con el puerto saturado.` : 'Sin días de puerto saturado en la ventana.',
    impacto: Math.max(TOPE_SATURACION, dias * IMPACTO_POR_DIA_SATURADO),
    fuente: 'simulación de logística',
  });
}

function factorHumedad(modalidad, decision) {
  const exceso = Number(modalidad.humedad?.exceso) || 0;
  const granoPct = modalidad.humedad?.granoPct ?? decision.cosecha?.humedadGranoPct;
  const basePct = decision.condiciones?.humedadBaseRecibo;
  const fueraDeBase = exceso > 0 || (Number.isFinite(granoPct) && Number.isFinite(basePct) && granoPct > basePct);
  const hayDato = Number.isFinite(granoPct) || Number.isFinite(basePct);
  const resultado = factor({
    id: 'grano-humedad',
    categoria: 'grano',
    nombre: 'Humedad del grano',
    valor: Number.isFinite(granoPct) ? textoHumedad(granoPct) : null,
    detalle: fueraDeBase
      ? `El grano húmedo obliga a secar y agrega merma${Number.isFinite(basePct) ? ` sobre la base de ${basePct} %` : ''}.`
      : 'La humedad está dentro de la base de recibo.',
    impacto: fueraDeBase ? IMPACTO_HUMEDAD_FUERA_DE_BASE : 0,
    fuente: 'base de recibo de la Cámara Arbitral',
  });
  return hayDato && !fueraDeBase ? { ...resultado, efecto: 'favorable' } : resultado;
}

function factorRiesgoAlmacenaje(modalidad) {
  const nivel = modalidad.riesgo?.nivel ?? 'bajo';
  const impacto = IMPACTO_RIESGO_ALMACENAJE[nivel] ?? 0;
  return factor({
    id: 'almacenaje-riesgo',
    categoria: 'almacenaje',
    nombre: 'Riesgo de guardar el grano',
    valor: nivel,
    detalle: impacto === 0 ? 'El riesgo de almacenaje es bajo.' : `El riesgo de almacenaje es ${nivel}.`,
    impacto,
    fuente: modalidad.tipo === 'silobolsa' ? 'riesgo de silobolsa por humedad (INTA)' : 'simulación de almacenaje',
  });
}

function factoresDe(modalidad, decision, economia) {
  const factores = [
    factorFuenteClima(decision.cosecha),
    factorDiasMalos(decision.cosecha),
    factorViento(decision.cosecha),
    factorPrecioFuente(economia),
  ];
  if (modalidad.tipo === 'silobolsa') factores.push(factorPrecioFuturo(modalidad));
  factores.push(factorRiesgoBarco(modalidad));
  if (modalidad.tipo === 'puerto') factores.push(factorPuertoSaturado(modalidad, decision.transporte));
  factores.push(factorHumedad(modalidad, decision));
  factores.push(factorRiesgoAlmacenaje(modalidad));
  return factores;
}

function explicarConfianza(factores) {
  const restan = factores.filter((f) => f.impacto < 0).sort((a, b) => a.impacto - b.impacto).slice(0, 2);
  if (!restan.length) return 'Ningún factor resta confianza de forma relevante.';
  const nombres = restan.map((f) => `${f.nombre.toLowerCase()} (${f.impacto} puntos)`).join(' y ');
  return `Los factores que más restan son ${nombres}.`;
}

function confianzaDe(factores) {
  const indice = acotar(BASE_CONFIANZA + factores.reduce((total, f) => total + f.impacto, 0), CONFIANZA_MINIMA, CONFIANZA_MAXIMA);
  return { indice, nivel: nivelDeConfianza(indice), explicacion: explicarConfianza(factores) };
}

function tituloDe(modalidad) {
  if (modalidad.tipo !== 'silobolsa') return TITULOS[modalidad.tipo] ?? 'Venta del grano';
  const meses = Number(modalidad.mesesGuardado) || 0;
  return `${TITULOS.silobolsa} ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

function accionDe(modalidad) {
  if (modalidad.tipo === 'puerto') return 'Cosechá y entregá el grano al puerto en la fecha de cobro indicada.';
  if (modalidad.tipo === 'acopio') return 'Llevá la cosecha al acopio y vendé desde ahí.';
  if (modalidad.tipo === 'silobolsa') return `Embolsá el grano y vendelo a los ${Number(modalidad.mesesGuardado) || 0} meses.`;
  return 'Vendé el grano en la fecha de cobro indicada.';
}

function resumenDe(gananciaNetaUSD, fechaCobro) {
  const cobro = fechaCobro ? ` con cobro el ${fechaCobro}` : '';
  return `Ganancia neta estimada de USD ${gananciaNetaUSD}${cobro}.`;
}

function diasHastaCobroDe(modalidad, hoy) {
  if (Number.isFinite(modalidad.diasHastaCobro)) return modalidad.diasHastaCobro;
  if (hoy && modalidad.fechaCobro) return Math.max(0, diasEntre(hoy, modalidad.fechaCobro));
  return null;
}

function idsDeCategoria(factores, categorias) {
  return factores.filter((factor) => categorias.includes(factor.categoria)).map((factor) => factor.id);
}

function etapaCosecha({ cosecha, factores }) {
  const inicio = cosecha?.inicio ?? null;
  const fin = cosecha?.fin ?? null;
  const dias = inicio && fin ? Math.max(1, diasEntre(inicio, fin) + 1) : null;
  return {
    id: 'cosecha',
    titulo: TITULOS_ETAPA.cosecha,
    decision: inicio && fin ? `Cosechar del ${inicio} al ${fin}` : 'Cosechar en la fecha del plan',
    fecha: inicio,
    detalle: dias ? `${textoDias(dias)} de cosecha.` : 'Sin fechas de cosecha confirmadas.',
    factores: idsDeCategoria(factores, ['clima', 'grano']),
  };
}

function etapaTransporte({ modalidad, tipo, decision, factores }) {
  if (tipo === 'silobolsa') {
    return {
      id: 'transporte',
      titulo: TITULOS_ETAPA.transporte,
      decision: 'Sin transporte inmediato',
      fecha: null,
      detalle: 'El flete se paga al abrir la bolsa y vender el grano.',
      factores: idsDeCategoria(factores, ['logistica']),
    };
  }
  const transporte = decision.transporte;
  const destino = transporte?.destino ?? modalidad.destino ?? null;
  const camiones = Number(transporte?.camiones) || 0;
  const tramo = transporte?.desde && transporte?.hasta ? ` Del ${transporte.desde} al ${transporte.hasta}.` : '';
  return {
    id: 'transporte',
    titulo: TITULOS_ETAPA.transporte,
    decision: destino
      ? `Llevar a ${destino}${camiones ? ` en ${camiones} ${camiones === 1 ? 'camión' : 'camiones'}` : ''}`
      : 'Sin datos de transporte',
    fecha: transporte?.desde ?? null,
    detalle: `${camiones ? `${camiones} ${camiones === 1 ? 'camión' : 'camiones'} programados.` : 'Sin camiones programados.'}${tramo}`,
    factores: idsDeCategoria(factores, ['logistica']),
  };
}

function etapaAlmacenaje({ tipo, modalidad, factores }) {
  const meses = Number(modalidad.mesesGuardado) || 0;
  const silobolsa = tipo === 'silobolsa';
  return {
    id: 'almacenaje',
    titulo: TITULOS_ETAPA.almacenaje,
    decision: silobolsa ? `Silobolsa ${textoMeses(meses)}` : 'Directo, sin almacenar',
    fecha: null,
    detalle: silobolsa
      ? 'El grano queda en el campo y se vende al abrir la bolsa.'
      : 'El grano se entrega apenas se cosecha.',
    factores: idsDeCategoria(factores, ['almacenaje']),
  };
}

function etapaVenta({ tipo, modalidad, factores }) {
  const fechaCobro = modalidad.fechaCobro ?? null;
  const destino = tipo === 'puerto' ? 'puerto' : 'acopio';
  const precio = Number.isFinite(modalidad.precioUSDt) ? `Precio estimado USD ${modalidad.precioUSDt}/t.` : 'Sin precio estimado para esta estrategia.';
  return {
    id: 'venta',
    titulo: TITULOS_ETAPA.venta,
    decision: fechaCobro ? `Vender en ${destino} y cobrar el ${fechaCobro}` : `Vender en ${destino}`,
    fecha: fechaCobro,
    detalle: precio,
    factores: idsDeCategoria(factores, ['precio']),
  };
}

function etapasDe({ modalidad, tipo, decision, cosecha, factores }) {
  return [
    etapaCosecha({ cosecha, factores }),
    etapaTransporte({ modalidad, tipo, decision, factores }),
    etapaAlmacenaje({ tipo, modalidad, factores }),
    etapaVenta({ tipo, modalidad, factores }),
  ];
}

function estrategiaDe(modalidad, { decision, economia, hoy, id, tipo, titulo, accion, cosecha }) {
  const gananciaNetaUSD = Number.isFinite(modalidad.gananciaNetaUSD) ? modalidad.gananciaNetaUSD : 0;
  const factores = factoresDe({ ...modalidad, tipo }, decision, economia);
  const conTipo = { ...modalidad, tipo };
  return {
    id,
    titulo: titulo ?? tituloDe({ ...modalidad, tipo }),
    resumen: resumenDe(gananciaNetaUSD, modalidad.fechaCobro),
    accion: accion ?? accionDe({ ...modalidad, tipo }),
    recomendadaPorModelo: false,
    gananciaNetaUSD,
    diferenciaVsMejorUSD: 0,
    fechaCobro: modalidad.fechaCobro ?? null,
    diasHastaCobro: diasHastaCobroDe(modalidad, hoy),
    confianza: confianzaDe(factores),
    factores,
    etapas: etapasDe({ modalidad: conTipo, tipo, decision, cosecha: cosecha ?? decision.cosecha, factores }),
    supuestos: [
      'Ganancia neta estimada en USD, con los costos y precios del escenario simulado.',
      'El índice de confianza es una probabilidad orientativa, no una garantía de resultado.',
    ],
  };
}

function modalidadesDe(economia) {
  const grande = economia.grande?.modalidades;
  if (!Array.isArray(grande)) return [];
  return grande.map((modalidad) => ({
    modalidad,
    id: modalidad.tipo === 'silobolsa' ? `silobolsa-${Number(modalidad.mesesGuardado) || 0}` : modalidad.tipo,
    tipo: modalidad.tipo,
  }));
}

/**
 * Arma las estrategias del lote a partir de la decisión y su economía.
 * @param {{ decision: object, hoy?: string }} entrada
 */
export function armarEstrategias({ decision, hoy = null }) {
  const economia = decision?.economia;
  if (!economia) return { aviso: AVISO_ESTRATEGIAS, estrategias: [] };

  const cosechaGrande = economia.grande?.cosecha ?? decision.cosecha;
  const base = modalidadesDe(economia).map(({ modalidad, id, tipo }) => estrategiaDe(modalidad, { decision, economia, hoy, id, tipo, cosecha: cosechaGrande }));
  const rapida = economia.rapida?.elegida;
  if (economia.comparacion?.coinciden === false && rapida) {
    base.push(estrategiaDe(rapida, {
      decision, economia, hoy, id: 'cosecha-rapida', tipo: rapida.tipo,
      titulo: 'Cosecha rápida',
      cosecha: economia.rapida?.cosecha ?? decision.cosecha,
      accion: 'Cosechá y vendé lo antes posible para cobrar antes, aceptando menos ganancia.',
    }));
  }

  base.sort((a, b) => b.gananciaNetaUSD - a.gananciaNetaUSD);
  const mejor = base.length ? base[0].gananciaNetaUSD : 0;
  const recomendada = base.find((e) => e.confianza.indice >= NIVEL_MEDIA_DESDE);
  for (const estrategia of base) {
    estrategia.diferenciaVsMejorUSD = estrategia.gananciaNetaUSD - mejor;
    estrategia.recomendadaPorModelo = estrategia === recomendada;
  }
  return { aviso: AVISO_ESTRATEGIAS, estrategias: base };
}
