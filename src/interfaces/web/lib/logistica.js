import { distanciaKm } from './data.js';

export const PUERTOS_GEO = [
  { id: 'Puerto Gran Rosario', label: 'Gran Rosario', latitude: -32.95, longitude: -60.63 },
  { id: 'Bahía Blanca', label: 'Bahía Blanca', latitude: -38.78, longitude: -62.27 },
  { id: 'Quequén', label: 'Quequén / Necochea', latitude: -38.55, longitude: -58.7 },
];

// Datos de ejemplo para la demo: el proyecto todavía no tiene un padrón real de acopios con coordenadas.
export const ACOPIOS_EJEMPLO = [
  { id: 'ac-pergamino', name: 'Acopio ejemplo · Pergamino', latitude: -33.89, longitude: -60.57 },
  { id: 'ac-rojas', name: 'Acopio ejemplo · Rojas', latitude: -34.2, longitude: -60.73 },
  { id: 'ac-junin', name: 'Acopio ejemplo · Junín', latitude: -34.59, longitude: -60.95 },
  { id: 'ac-venado', name: 'Acopio ejemplo · Venado Tuerto', latitude: -33.75, longitude: -61.97 },
  { id: 'ac-casilda', name: 'Acopio ejemplo · Casilda', latitude: -33.04, longitude: -61.17 },
  { id: 'ac-marcos', name: 'Acopio ejemplo · Marcos Juárez', latitude: -32.7, longitude: -62.1 },
];

export const RECURSOS = {
  'camión': { label: 'Camiones', color: '#2563eb' },
  cosechadora: { label: 'Cosechadoras', color: '#d97706' },
  'tractor con tolva': { label: 'Tractores con tolva', color: '#7c3aed' },
  embolsadora: { label: 'Embolsadoras', color: '#0d9488' },
};

const UMBRAL_LLUVIA_LEVE_MM = 1;
const UMBRAL_LLUVIA_FUERTE_MM = 10;
const MS_POR_DIA = 86400000;

const aMs = (iso) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);

export function diasEntre(desde, hasta) {
  return Math.round((aMs(hasta) - aMs(desde)) / MS_POR_DIA);
}

export function fleterosCercanos(lot, ofertas = []) {
  if (!lot) return [];
  return ofertas
    .map((oferta) => ({
      ...oferta,
      distanciaKm: distanciaKm(lot, { latitude: oferta.base.lat, longitude: oferta.base.lon }),
    }))
    .filter((oferta) => oferta.distanciaKm <= oferta.radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

export function resumirFleteros(cercanos) {
  const porRecurso = {};
  for (const oferta of cercanos) {
    const actual = porRecurso[oferta.recurso] ?? { proveedores: 0, unidades: 0 };
    porRecurso[oferta.recurso] = { proveedores: actual.proveedores + 1, unidades: actual.unidades + oferta.unidades };
  }
  return porRecurso;
}

export function clasificarLluvia(mm) {
  if (!Number.isFinite(mm)) return 'sin-dato';
  if (mm < UMBRAL_LLUVIA_LEVE_MM) return 'seco';
  if (mm < UMBRAL_LLUVIA_FUERTE_MM) return 'leve';
  return 'fuerte';
}

// Solo clasifica lluvia pronosticada: no mide transitabilidad del lote.
export function evaluarClima(forecast = [], window) {
  const dias = forecast.map((day) => ({
    fecha: day.date,
    mm: day.precipitationMm,
    maxC: day.temperatureMaxC,
    estado: clasificarLluvia(day.precipitationMm),
    enVentana: Boolean(window && day.date >= window.inicio && day.date <= window.fin),
  }));
  return { dias, mejorTramo: mejorTramoSeco(dias) };
}

function mejorTramoSeco(dias) {
  let mejor = null;
  let actual = null;
  for (const dia of dias) {
    if (dia.estado === 'seco' || dia.estado === 'leve') {
      actual = actual ? { ...actual, hasta: dia.fecha, dias: actual.dias + 1 } : { desde: dia.fecha, hasta: dia.fecha, dias: 1 };
      if (!mejor || actual.dias > mejor.dias) mejor = actual;
    } else {
      actual = null;
    }
  }
  return mejor;
}

export function etapaDelCiclo(lot, window, hoy) {
  if (!lot?.sowingDate || !window) return null;
  const total = diasEntre(lot.sowingDate, window.fin);
  const transcurridos = diasEntre(lot.sowingDate, hoy);
  return {
    progreso: Math.max(0, Math.min(1, transcurridos / total)),
    diasHastaInicio: diasEntre(hoy, window.inicio),
    diasHastaCentro: diasEntre(hoy, window.optimo),
    enCosecha: hoy >= window.inicio && hoy <= window.fin,
    cosechado: hoy > window.fin,
  };
}

const OFFSET_GRADOS = 0.004;

// Las silobolsas no tienen coordenadas propias: se ubican en su lote, abiertas en abanico si comparten lote.
export function ubicarSilobolsas(bolsas = [], lots = []) {
  const porLote = new Map();
  const ubicadas = [];
  for (const bolsa of bolsas) {
    const lote = lots.find((lot) => lot.id === bolsa.loteId);
    if (!lote) continue;
    const indice = porLote.get(lote.id) ?? 0;
    porLote.set(lote.id, indice + 1);
    const angulo = indice * (Math.PI / 3);
    ubicadas.push({
      bolsa,
      lote,
      latitude: lote.latitude + (indice ? Math.sin(angulo) * OFFSET_GRADOS : 0),
      longitude: lote.longitude + (indice ? Math.cos(angulo) * OFFSET_GRADOS : 0),
    });
  }
  return ubicadas;
}

export function circuloGeoJSON(latitude, longitude, radioKm, pasos = 64) {
  const kmPorGradoLat = 111.32;
  const kmPorGradoLon = kmPorGradoLat * Math.cos((latitude * Math.PI) / 180);
  const anillo = Array.from({ length: pasos + 1 }, (_, i) => {
    const angulo = (i / pasos) * 2 * Math.PI;
    return [longitude + (Math.cos(angulo) * radioKm) / kmPorGradoLon, latitude + (Math.sin(angulo) * radioKm) / kmPorGradoLat];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anillo] } };
}

const RECURSOS_DEL_PLAN = [
  { recurso: 'camión', etapa: 'Transporte' },
  { recurso: 'cosechadora', etapa: 'Cosecha' },
  { recurso: 'tractor con tolva', etapa: 'Cosecha' },
  { recurso: 'embolsadora', etapa: 'Almacenaje' },
];

// Quién va a venir a trabajar al lote y cuánto cobra: sale de la asignación del marketplace, con los
// datos de cada proveedor (localidad, calificación) cuando están disponibles.
export function armarPlanDeProveedores({ asignacion, ofertas = [], toneladas = 0 }) {
  const lineas = asignacion?.lineas ?? [];
  const porOferta = new Map((Array.isArray(ofertas) ? ofertas : []).map((oferta) => [oferta.id, oferta]));
  const filas = lineas.flatMap(({ linea, asignaciones = [] }) => asignaciones.map((asignado) => {
    const oferta = porOferta.get(asignado.ofertaId);
    return {
      recurso: linea.recurso,
      proveedor: asignado.proveedor,
      localidad: oferta?.base?.localidad ?? null,
      calificacion: oferta?.calificacion ?? null,
      unidades: asignado.unidades,
      distanciaKm: asignado.distanciaKm,
      precioRelativo: asignado.precioRelativo,
      costoUSD: asignado.costoUsd,
      desde: linea.usar_desde,
      hasta: linea.usar_hasta,
      pedirAntesDel: linea.pedir_antes_del,
    };
  }));

  const camiones = filas.filter((fila) => fila.recurso === 'camión');
  const costoCamionesUSD = camiones.reduce((suma, fila) => suma + fila.costoUSD, 0);
  const grupos = RECURSOS_DEL_PLAN
    .map(({ recurso, etapa }) => ({ recurso, etapa, filas: filas.filter((fila) => fila.recurso === recurso) }))
    .filter((grupo) => grupo.filas.length);
  return {
    filas,
    grupos,
    faltantes: lineas.filter((l) => l.faltan > 0).map((l) => ({ recurso: l.linea.recurso, faltan: l.faltan, desde: l.linea.usar_desde, hasta: l.linea.usar_hasta })),
    camiones: {
      transportistas: new Set(camiones.map((fila) => fila.proveedor)).size,
      unidades: camiones.reduce((suma, fila) => suma + fila.unidades, 0),
      costoUSD: costoCamionesUSD,
      costoUSDt: toneladas > 0 ? costoCamionesUSD / toneladas : null,
      costoUSDqq: toneladas > 0 ? costoCamionesUSD / (toneladas * 10) : null,
    },
    costoTotalUSD: filas.reduce((suma, fila) => suma + fila.costoUSD, 0),
    coberturaPct: asignacion?.coberturaPct ?? null,
  };
}
