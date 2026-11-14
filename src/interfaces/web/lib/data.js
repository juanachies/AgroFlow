import { calcularVentanaCosecha } from '../../../domain/cosecha/ventanaCosecha.js';

export const CULTIVOS = [
  { value: 'soja', label: 'Soja', cycleDays: 120 },
  { value: 'maiz', label: 'Maíz', cycleDays: 145 },
  { value: 'trigo', label: 'Trigo', cycleDays: 170 },
];

export function crearLote(values) {
  const name = values.name?.trim();
  const crop = CULTIVOS.find(({ value }) => value === values.crop);
  const areaHa = Number(values.areaHa);
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);
  const cycleDays = values.cycleDays ? Number(values.cycleDays) : crop?.cycleDays;

  if (!name) throw new TypeError('Ingresá un nombre para el lote.');
  if (!crop) throw new TypeError('Seleccioná un cultivo válido.');
  if (!Number.isFinite(areaHa) || areaHa <= 0) throw new TypeError('La superficie debe ser mayor a cero.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new TypeError('La latitud debe estar entre -90 y 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('La longitud debe estar entre -180 y 180.');
  }
  if (!values.sowingDate || Number.isNaN(Date.parse(`${values.sowingDate}T00:00:00Z`))) {
    throw new TypeError('Ingresá una fecha de siembra válida.');
  }
  if (!Number.isFinite(cycleDays) || cycleDays <= 0) {
    throw new TypeError('El ciclo del cultivo debe ser mayor a cero.');
  }

  return {
    id: crypto.randomUUID(),
    name,
    crop: crop.value,
    areaHa,
    latitude,
    longitude,
    sowingDate: values.sowingDate,
    cycleDays,
    boundary: null,
    createdAt: new Date().toISOString(),
  };
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
  return CULTIVOS.find(({ value: crop }) => crop === value)?.label ?? 'Cultivo';
}
