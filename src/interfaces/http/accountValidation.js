import { ErrorHttp } from './validacion.js';

const ROLE_VALUES = new Set(['productor', 'prestador']);
const SERVICE_TYPES = new Set(['transporte', 'almacenamiento', 'maquinaria']);
const PRICE_UNITS = new Set([
  'por_viaje',
  'por_km',
  'por_dia',
  'por_tonelada',
  'por_tonelada_mes',
  'por_tonelada_dia',
  'por_hectarea',
  'por_hora',
]);
const CAPACITY_UNITS = new Set(['toneladas', 'hectareas_dia', 'hectareas', 'metros_cubicos']);

function text(value, field, { required = true, max = 120 } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') throw new ErrorHttp(400, `${field} debe ser texto`);
  const result = value.trim();
  if (required && !result) throw new ErrorHttp(400, `falta ${field}`);
  if (result.length > max) throw new ErrorHttp(400, `${field} supera ${max} caracteres`);
  return result || null;
}

function number(value, field, { min, max = Number.POSITIVE_INFINITY } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new ErrorHttp(400, `${field} tiene que ser un número entre ${min} y ${max}`);
  }
  return result;
}

function validDate(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ErrorHttp(400, `${field} tiene que tener formato AAAA-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ErrorHttp(400, `${field} no es una fecha válida`);
  }
  return value;
}

export function validarCampo(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ErrorHttp(400, 'los datos del campo son obligatorios');
  }
  return {
    name: text(input.name, 'nombre del campo'),
    areaHa: number(input.areaHa, 'hectáreas', { min: Number.MIN_VALUE }),
    latitude: number(input.latitude, 'latitud', { min: -90, max: 90 }),
    longitude: number(input.longitude, 'longitud', { min: -180, max: 180 }),
  };
}

export function validarOferta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ErrorHttp(400, 'los datos del servicio son obligatorios');
  }
  if (!SERVICE_TYPES.has(input.serviceType)) {
    throw new ErrorHttp(400, 'tipo de servicio inválido');
  }
  if (!PRICE_UNITS.has(input.priceUnit)) throw new ErrorHttp(400, 'unidad de precio inválida');
  if (!CAPACITY_UNITS.has(input.capacityUnit)) throw new ErrorHttp(400, 'unidad de capacidad inválida');
  if (!['ARS', 'USD'].includes(input.currency)) throw new ErrorHttp(400, 'moneda inválida');

  const availableFrom = validDate(input.availableFrom, 'disponible desde');
  const availableUntil = validDate(input.availableUntil, 'disponible hasta');
  if (availableFrom && availableUntil && availableUntil < availableFrom) {
    throw new ErrorHttp(400, 'la disponibilidad hasta no puede ser anterior a la fecha desde');
  }

  return {
    serviceType: input.serviceType,
    subtype: text(input.subtype, 'detalle del servicio'),
    price: number(input.price, 'precio', { min: Number.MIN_VALUE }),
    currency: input.currency,
    priceUnit: input.priceUnit,
    capacity: number(input.capacity, 'capacidad', { min: Number.MIN_VALUE }),
    capacityUnit: input.capacityUnit,
    baseLatitude: number(input.baseLatitude, 'latitud de base', { min: -90, max: 90 }),
    baseLongitude: number(input.baseLongitude, 'longitud de base', { min: -180, max: 180 }),
    serviceRadiusKm: number(input.serviceRadiusKm, 'radio de servicio', { min: Number.MIN_VALUE }),
    availableFrom,
    availableUntil,
    notes: text(input.notes, 'notas', { required: false, max: 500 }),
  };
}

function validarDatosPerfil(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ErrorHttp(400, 'los datos de la cuenta son obligatorios');
  }
  const displayName = text(input.displayName, 'nombre');
  if (displayName.length < 2) throw new ErrorHttp(400, 'el nombre debe tener al menos 2 caracteres');
  return {
    displayName,
    phone: text(input.phone, 'teléfono', { required: false, max: 32 }),
  };
}

export function validarAltaCuenta(input) {
  const profile = validarDatosPerfil(input);
  if (!ROLE_VALUES.has(input.role)) throw new ErrorHttp(400, 'seleccioná productor o prestador');
  if (input.role === 'productor') {
    return { ...profile, role: input.role, field: validarCampo(input.field) };
  }
  return { ...profile, role: input.role, offering: validarOferta(input.offering) };
}

export function validarActualizacionPerfil(input) {
  return validarDatosPerfil(input);
}
