import { calcularVentanaCosecha } from '../../../domain/cosecha/ventanaCosecha.js';

// Días siembra→cosecha orientativos, alineados con dataset_ciclos_cultivos.py (zona núcleo).
// Los grupos de madurez y el ciclo exacto dependen del cultivar y la fecha: el usuario puede ajustarlos.
export const CULTIVOS = [
  {
    value: 'soja',
    label: 'Soja',
    variedades: [
      { value: 'soja-corto', label: 'Ciclo corto (GM III–IV corto)', cycleDays: 150, siembraOptima: '11-10' },
      { value: 'soja-medio', label: 'Ciclo medio (GM IV largo–V corto)', cycleDays: 165, siembraOptima: '11-10' },
      { value: 'soja-largo', label: 'Ciclo largo (GM V largo–VII)', cycleDays: 180, siembraOptima: '11-05' },
      { value: 'soja-segunda', label: 'Soja de segunda (sobre trigo)', cycleDays: 145, siembraOptima: '12-20' },
    ],
  },
  {
    value: 'maiz',
    label: 'Maíz',
    variedades: [
      { value: 'maiz-corto', label: 'Ciclo corto', cycleDays: 145, siembraOptima: '10-15' },
      { value: 'maiz-intermedio', label: 'Ciclo intermedio', cycleDays: 160, siembraOptima: '10-01' },
      { value: 'maiz-largo', label: 'Ciclo largo', cycleDays: 180, siembraOptima: '09-25' },
      { value: 'maiz-tardio', label: 'Siembra tardía (diciembre)', cycleDays: 175, siembraOptima: '12-10' },
    ],
  },
  {
    value: 'trigo',
    label: 'Trigo',
    variedades: [
      { value: 'trigo-corto', label: 'Ciclo corto (siembra tardía)', cycleDays: 150, siembraOptima: '07-10' },
      { value: 'trigo-intermedio', label: 'Ciclo intermedio', cycleDays: 170, siembraOptima: '06-25' },
      { value: 'trigo-largo', label: 'Ciclo largo (siembra temprana)', cycleDays: 190, siembraOptima: '06-05' },
    ],
  },
  {
    value: 'sorgo',
    label: 'Sorgo granífero',
    variedades: [
      { value: 'sorgo-corto', label: 'Ciclo corto', cycleDays: 115, siembraOptima: '11-20' },
      { value: 'sorgo-medio', label: 'Ciclo medio', cycleDays: 135, siembraOptima: '11-10' },
      { value: 'sorgo-largo', label: 'Ciclo largo', cycleDays: 155, siembraOptima: '11-01' },
    ],
  },
];

// Aproximación agronómica, no un modelo calibrado:
// - Sembrar después de la fecha óptima acorta el ciclo (más temperatura y fotoperiodo): ~0,4 días por día de atraso.
// - Sembrar antes lo alarga: ~0,3 días por día de adelanto.
// - Al sur de la zona núcleo (lat -33°) hace más frío y el ciclo se alarga ~1,5 días por grado; al norte se acorta.
const LATITUD_REFERENCIA = -33;
const DIAS_POR_GRADO = 1.5;
const GRADOS_MAXIMOS = 8;
const DIAS_ACORTA_POR_ATRASO = 0.4;
const DIAS_ALARGA_POR_ADELANTO = 0.3;
const TOPE_AJUSTE_FECHA = 25;

function diasDeAtraso(sowingDate, siembraOptima) {
  const sembrada = new Date(`${sowingDate}T12:00:00Z`);
  const optima = new Date(`${sembrada.getUTCFullYear()}-${siembraOptima}T12:00:00Z`);
  let diferencia = Math.round((sembrada - optima) / 86400000);
  if (diferencia > 182) diferencia -= 365;
  if (diferencia < -182) diferencia += 365;
  return diferencia;
}

export function estimarCiclo({ crop, variety, latitude, sowingDate }) {
  const elegida = variedadesDe(crop).find(({ value }) => value === variety);
  if (!elegida) return null;

  const grados = Math.max(-GRADOS_MAXIMOS, Math.min(GRADOS_MAXIMOS, LATITUD_REFERENCIA - Number(latitude)));
  const ajusteZona = Number.isFinite(grados) ? Math.round(grados * DIAS_POR_GRADO) || 0 : 0;

  let ajusteFecha = 0;
  if (sowingDate && !Number.isNaN(Date.parse(`${sowingDate}T12:00:00Z`))) {
    const atraso = diasDeAtraso(sowingDate, elegida.siembraOptima);
    const bruto = atraso > 0 ? -atraso * DIAS_ACORTA_POR_ATRASO : -atraso * DIAS_ALARGA_POR_ADELANTO;
    ajusteFecha = Math.round(Math.max(-TOPE_AJUSTE_FECHA, Math.min(TOPE_AJUSTE_FECHA, bruto))) || 0;
  }

  return { dias: elegida.cycleDays + ajusteZona + ajusteFecha, base: elegida.cycleDays, ajusteZona, ajusteFecha };
}

export function variedadesDe(cropValue) {
  return CULTIVOS.find(({ value }) => value === cropValue)?.variedades ?? [];
}

function validarCoordenadas(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new TypeError('La latitud debe estar entre -90 y 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('La longitud debe estar entre -180 y 180.');
  }
}

function datosDelTerreno(values) {
  const name = values.name?.trim();
  const areaHa = Number(values.areaHa);
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);

  if (!name) throw new TypeError('Ingresá un nombre para el lote.');
  if (!Number.isFinite(areaHa) || areaHa <= 0) throw new TypeError('La superficie debe ser mayor a cero.');
  validarCoordenadas(latitude, longitude);
  return { name, areaHa, latitude, longitude };
}

export function crearLote(values) {
  return {
    id: crypto.randomUUID(),
    ...datosDelTerreno(values),
    crop: null,
    variety: null,
    sowingDate: null,
    cycleDays: null,
    boundary: null,
    createdAt: new Date().toISOString(),
  };
}

export function editarLote(lot, values) {
  return { ...lot, ...datosDelTerreno(values) };
}

export function sembrarLote(lot, values) {
  const crop = CULTIVOS.find(({ value }) => value === values.crop);
  if (!crop) throw new TypeError('Seleccioná un cultivo válido.');
  const variety = crop.variedades.find(({ value }) => value === values.variety);
  if (!variety) throw new TypeError('Seleccioná el tipo de ciclo.');
  if (!values.sowingDate || Number.isNaN(Date.parse(`${values.sowingDate}T00:00:00Z`))) {
    throw new TypeError('Ingresá una fecha de siembra válida.');
  }
  const cycleDays = Number(values.cycleDays || variety.cycleDays);
  if (!Number.isFinite(cycleDays) || cycleDays <= 0) {
    throw new TypeError('El ciclo del cultivo debe ser mayor a cero.');
  }
  return { ...lot, crop: crop.value, variety: variety.value, sowingDate: values.sowingDate, cycleDays };
}

export function quitarSiembra(lot) {
  return { ...lot, crop: null, variety: null, sowingDate: null, cycleDays: null };
}

function isPosition(position) {
  return Array.isArray(position)
    && position.length >= 2
    && Number.isFinite(position[0])
    && position[0] >= -180
    && position[0] <= 180
    && Number.isFinite(position[1])
    && position[1] >= -90
    && position[1] <= 90;
}

function isClosedRing(ring) {
  return Array.isArray(ring)
    && ring.length >= 4
    && ring.every(isPosition)
    && ring[0][0] === ring.at(-1)[0]
    && ring[0][1] === ring.at(-1)[1];
}

function isPolygonGeometry(geometry) {
  if (geometry?.type === 'Polygon') {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(isClosedRing);
  }
  if (geometry?.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(
        (polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(isClosedRing),
      );
  }
  return false;
}

export function parsearGeoJSON(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new TypeError('El archivo no contiene JSON válido.');
  }

  const features = document?.type === 'FeatureCollection'
    ? document.features
    : document?.type === 'Feature'
      ? [document]
      : null;
  if (!Array.isArray(features)) {
    throw new TypeError('El GeoJSON debe ser una Feature o FeatureCollection.');
  }

  const polygons = features.filter((feature) => feature?.geometry?.type === 'Polygon'
    || feature?.geometry?.type === 'MultiPolygon');
  if (!polygons.length) {
    throw new TypeError('No se encontraron límites Polygon o MultiPolygon en el GeoJSON.');
  }
  if (polygons.some((feature) => !isPolygonGeometry(feature.geometry))) {
    throw new TypeError('El GeoJSON contiene un polígono inválido o coordenadas fuera de rango.');
  }

  return polygons.map((feature, index) => ({
    type: 'Feature',
    id: feature.id ?? index,
    properties: feature.properties && typeof feature.properties === 'object' ? feature.properties : {},
    geometry: feature.geometry,
  }));
}

export function validarSnapshotClimatico(snapshot) {
  const latitude = Number(snapshot?.lote?.latitude);
  const longitude = Number(snapshot?.lote?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('El snapshot no incluye coordenadas válidas del punto consultado.');
  }
  if (!snapshot.queriedAt || Number.isNaN(Date.parse(snapshot.queriedAt))) {
    throw new TypeError('El snapshot no incluye una fecha de consulta válida.');
  }
  if (!Array.isArray(snapshot.dailyForecast)) {
    throw new TypeError('El snapshot no incluye la serie diaria de pronóstico.');
  }
  if (!snapshot.sourceStatus || typeof snapshot.sourceStatus !== 'object') {
    throw new TypeError('El snapshot no incluye el estado de sus fuentes.');
  }
  return snapshot;
}

export function leerSnapshotClimatico(text) {
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new TypeError('El archivo no contiene JSON válido.');
  }
  return validarSnapshotClimatico(snapshot);
}

export function ventanaDelLote(lot) {
  if (!lot?.sowingDate) return null;
  return calcularVentanaCosecha({
    fechaSiembra: lot.sowingDate,
    cultivo: lot.crop,
    duracionDias: lot.cycleDays,
  });
}

export function diasEnVentana(forecast = [], window) {
  if (!window) return [];
  return forecast.filter(({ date }) => date >= window.inicio && date <= window.fin);
}

export function distanciaKm(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function promedio(values = []) {
  const present = values.filter(Number.isFinite);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export function nombreCultivo(value) {
  return CULTIVOS.find(({ value: crop }) => crop === value)?.label ?? 'Sin cultivo';
}

export function nombreVariedad(cropValue, varietyValue) {
  return variedadesDe(cropValue).find(({ value }) => value === varietyValue)?.label ?? '';
}
