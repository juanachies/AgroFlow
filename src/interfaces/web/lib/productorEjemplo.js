import { crearLote, estimarCiclo, sembrarLote } from './data.js';

// Productor de ejemplo para probar la aplicación como si fuera real. Todo es ficticio y los lotes no
// traen perímetro: lo dibuja el usuario en el mapa. Las fechas de siembra son relativas a hoy, así que
// siempre hay cosechas cercanas (con pronóstico real) y lejanas (con clima histórico).
export const PRODUCTOR_EJEMPLO = {
  establecimiento: 'Estancia La Esperanza (ejemplo)',
  responsable: 'Productor de ejemplo',
  zona: 'Norte de Buenos Aires · Pergamino, Rojas y Junín',
  telefono: '+54 9 2477 000000',
};

export const PREFIJO_LOTE_EJEMPLO = 'lote-ej-';
export const esLoteDeEjemplo = (lot) => lot?.id?.startsWith(PREFIJO_LOTE_EJEMPLO) ?? false;

const LOTES = [
  { id: 'lote-ej-01', name: 'La Esperanza · Norte', crop: 'trigo', variety: 'trigo-intermedio', areaHa: 85, latitude: -33.842, longitude: -60.521, diasDesdeSiembra: 150 },
  { id: 'lote-ej-02', name: 'La Esperanza · Aguada', crop: 'trigo', variety: 'trigo-largo', areaHa: 62, latitude: -33.881, longitude: -60.612, diasDesdeSiembra: 168 },
  { id: 'lote-ej-03', name: 'San Ramón · Loma', crop: 'maiz', variety: 'maiz-intermedio', areaHa: 110, latitude: -34.052, longitude: -60.703, diasDesdeSiembra: 55 },
  { id: 'lote-ej-04', name: 'San Ramón · Cañada', crop: 'soja', variety: 'soja-medio', areaHa: 140, latitude: -34.151, longitude: -60.802, diasDesdeSiembra: 12 },
  { id: 'lote-ej-05', name: 'El Ombú', crop: 'soja', variety: 'soja-corto', areaHa: 70, latitude: -33.951, longitude: -60.481, diasDesdeSiembra: 8 },
  { id: 'lote-ej-06', name: 'Los Álamos', crop: 'maiz', variety: 'maiz-largo', areaHa: 95, latitude: -34.251, longitude: -60.951, diasDesdeSiembra: 40 },
];

const aIso = (fecha) => fecha.toISOString().slice(0, 10);
const restarDias = (fecha, dias) => new Date(fecha.getTime() - dias * 86400000);

export function lotesDeEjemplo(hoy = new Date()) {
  return LOTES.map(({ id, diasDesdeSiembra, crop, variety, ...terreno }) => {
    const sowingDate = aIso(restarDias(hoy, diasDesdeSiembra));
    const ciclo = estimarCiclo({ crop, variety, latitude: terreno.latitude, sowingDate });
    const lote = { ...crearLote(terreno), id, createdAt: restarDias(hoy, diasDesdeSiembra + 20).toISOString() };
    return sembrarLote(lote, { crop, variety, sowingDate, cycleDays: String(ciclo.dias) });
  });
}

// Silobolsas de la campaña anterior, con lecturas del sensor: una con humedad baja y otra con riesgo medio.
export const SILOBOLSAS_EJEMPLO = [
  { cultivo: 'soja', kg: 190000, diasAtras: 150, loteId: 'lote-ej-04', lectura: { humedad: 13.2, temperatura: 22, co2: 3.1 } },
  { cultivo: 'maiz', kg: 200000, diasAtras: 200, loteId: 'lote-ej-03', lectura: { humedad: 14.9, temperatura: 27, co2: 5.2 } },
];

const LECTURAS_POR_BOLSA = 5;

export function lecturasDeEjemplo(lectura, ahora = new Date()) {
  return Array.from({ length: LECTURAS_POR_BOLSA }, (_, i) => ({
    timestamp: new Date(ahora.getTime() - (LECTURAS_POR_BOLSA - 1 - i) * 86400000).toISOString(),
    humedad: Math.round((lectura.humedad - 0.1 * (LECTURAS_POR_BOLSA - 1 - i)) * 10) / 10,
    temperatura: lectura.temperatura,
    co2: Math.round((lectura.co2 - 0.05 * (LECTURAS_POR_BOLSA - 1 - i)) * 100) / 100,
  }));
}

// Registra las silobolsas de ejemplo en la API si todavía no están (se reconocen por el lote de ejemplo).
async function registrarSilobolsasFaltantes(api, hoy) {
  const { silobolsas } = await api.silobolsas();
  const yaCargadas = new Set(silobolsas.map((bolsa) => bolsa.loteId));
  for (const bolsa of SILOBOLSAS_EJEMPLO.filter((item) => !yaCargadas.has(item.loteId))) {
    const { silobolsa } = await api.registrarSilobolsa({
      cultivo: bolsa.cultivo, kg: bolsa.kg, fechaCreacion: aIso(restarDias(hoy, bolsa.diasAtras)), loteId: bolsa.loteId,
    });
    await api.cargarLecturas(silobolsa.id, lecturasDeEjemplo(bolsa.lectura, hoy));
  }
}

let cargaEnCurso = null;

// Si se pide dos veces a la vez, comparten la misma carga para no duplicar las silobolsas.
export function cargarSilobolsasDeEjemplo(api, hoy = new Date()) {
  if (!cargaEnCurso) cargaEnCurso = registrarSilobolsasFaltantes(api, hoy).finally(() => { cargaEnCurso = null; });
  return cargaEnCurso;
}

const CLAVE_CARGADO = 'agroflow-ejemplo-cargado';

export function ejemploYaCargado() {
  try {
    return globalThis.localStorage?.getItem(CLAVE_CARGADO) === '1';
  } catch {
    return false;
  }
}

export function marcarEjemploCargado() {
  try {
    globalThis.localStorage?.setItem(CLAVE_CARGADO, '1');
  } catch { /* sin almacenamiento: se vuelve a ofrecer en la próxima visita */ }
}
