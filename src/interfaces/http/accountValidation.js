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
const CARGO_TYPES = new Set(['granos', 'insumos', 'maquinaria', 'otros']);
const CROPS = new Set(['soja', 'maiz', 'trigo', 'girasol']);
const STORAGE_TYPES = new Set(['silo_bolsa', 'silo_fijo', 'deposito', 'celda']);
const MACHINERY_ACTIVITIES = new Set(['cosecha', 'siembra', 'pulverizacion', 'labranza', 'embolsado']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErrorHttp(400, `${field} tiene que ser un objeto`);
  }
  return value;
}

function enumList(value, field, allowed) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new ErrorHttp(400, `${field} contiene opciones inválidas`);
  }
  return [...new Set(value)];
}

function boolean(value, field, fallback = false) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') throw new ErrorHttp(400, `${field} tiene que ser verdadero o falso`);
  return value;
}

function uuid(value, field) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ErrorHttp(400, `${field} no es válido`);
  return value;
}

function validarLimiteCampo(value) {
  if (value == null) return null;
  const feature = object(value, 'el perímetro del campo');
  const geometry = object(feature.geometry, 'la geometría del perímetro');
  if (feature.type !== 'Feature' || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
    throw new ErrorHttp(400, 'el perímetro tiene que ser un polígono GeoJSON');
  }
  const [ring] = geometry.coordinates;
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 501) {
    throw new ErrorHttp(400, 'el perímetro necesita entre 3 y 500 vértices');
  }
  const coordinates = ring.map((position) => {
    if (!Array.isArray(position) || position.length < 2) {
      throw new ErrorHttp(400, 'el perímetro contiene coordenadas inválidas');
    }
    return [
      number(position[0], 'longitud del perímetro', { min: -180, max: 180 }),
      number(position[1], 'latitud del perímetro', { min: -90, max: 90 }),
    ];
  });
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new ErrorHttp(400, 'el perímetro tiene que estar cerrado');
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

function areaPoligonoHa(ring) {
  const radius = 6378137;
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [longitude1, latitude1] = ring[index];
    const [longitude2, latitude2] = ring[index + 1];
    total += ((longitude2 - longitude1) * Math.PI / 180)
      * (2 + Math.sin(latitude1 * Math.PI / 180) + Math.sin(latitude2 * Math.PI / 180));
  }
  return Math.abs(total * radius * radius / 2) / 10000;
}

export function validarDetallesOferta(serviceType, value = {}) {
  const details = object(value, 'los detalles del servicio');
  if (serviceType === 'transporte') {
    return { loadTypes: enumList(details.loadTypes, 'los tipos de carga', CARGO_TYPES) };
  }
  if (serviceType === 'almacenamiento') {
    const storageTypes = enumList(details.storageTypes, 'los tipos de almacenamiento', STORAGE_TYPES);
    const crops = enumList(details.crops, 'los cultivos admitidos', CROPS);
    return {
      storageTypes,
      crops,
      dryingAvailable: boolean(details.dryingAvailable, 'el servicio de secado'),
    };
  }
  return {
    activities: enumList(details.activities, 'las tareas de maquinaria', MACHINERY_ACTIVITIES),
    operatorIncluded: boolean(details.operatorIncluded, 'la inclusión del operador'),
  };
}

export function validarCampo(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ErrorHttp(400, 'los datos del campo son obligatorios');
  }
  const boundary = validarLimiteCampo(input.boundary);
  if (!boundary) throw new ErrorHttp(400, 'dibujá el perímetro del campo en el mapa');
  const ring = boundary.geometry.coordinates[0];
  const vertices = ring.slice(0, -1);
  const areaHa = areaPoligonoHa(ring);
  if (!Number.isFinite(areaHa) || areaHa <= 0) throw new ErrorHttp(400, 'el perímetro del campo debe encerrar una superficie válida');
  const [longitude, latitude] = vertices.reduce(
    ([sumLongitude, sumLatitude], [pointLongitude, pointLatitude]) => [sumLongitude + pointLongitude, sumLatitude + pointLatitude],
    [0, 0],
  ).map((sum) => sum / vertices.length);
  return {
    name: text(input.name, 'nombre del campo'),
    city: text(input.city, 'ciudad o localidad', { max: 120 }),
    areaHa,
    latitude,
    longitude,
    boundary,
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
    city: text(input.city, 'ciudad o localidad', { max: 120 }),
    baseAddress: text(input.baseAddress, 'dirección o zona aproximada', { required: false, max: 160 }),
    serviceRadiusKm: number(input.serviceRadiusKm, 'radio de servicio', { min: Number.MIN_VALUE }),
    availableFrom,
    availableUntil,
    details: validarDetallesOferta(input.serviceType, input.details),
    notes: text(input.notes, 'notas', { required: false, max: 500 }),
  };
}

export function validarFiltroServicio(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SERVICE_TYPES.has(value)) throw new ErrorHttp(400, 'tipo de servicio inválido');
  return value;
}

export function validarIdentificadorSolicitud(value) {
  return uuid(value, 'el identificador de solicitud');
}

export function validarIdentificadorCampo(value) {
  return uuid(value, 'el identificador del campo');
}

export function validarSolicitudCotizacion(input) {
  const request = object(input, 'los datos de la solicitud');
  if (!SERVICE_TYPES.has(request.serviceType)) throw new ErrorHttp(400, 'tipo de servicio inválido');
  const neededFrom = validDate(request.neededFrom, 'fecha estimada desde');
  const neededUntil = validDate(request.neededUntil, 'fecha estimada hasta');
  if (neededFrom && neededUntil && neededUntil < neededFrom) {
    throw new ErrorHttp(400, 'la fecha hasta no puede ser anterior a la fecha desde');
  }
  const details = object(request.requestDetails, 'los detalles solicitados');
  let requestDetails;
  if (request.serviceType === 'transporte') {
    if (!CARGO_TYPES.has(details.loadType)) throw new ErrorHttp(400, 'tipo de carga inválido');
    requestDetails = {
      loadType: details.loadType,
      destination: text(details.destination, 'destino', { max: 120 }),
    };
  } else if (request.serviceType === 'almacenamiento') {
    if (!CROPS.has(details.crop)) throw new ErrorHttp(400, 'cultivo inválido');
    if (!STORAGE_TYPES.has(details.storageType)) throw new ErrorHttp(400, 'tipo de almacenamiento inválido');
    const storageDays = number(details.storageDays, 'días de almacenamiento', { min: 1, max: 3650 });
    if (!Number.isInteger(storageDays)) throw new ErrorHttp(400, 'los días de almacenamiento tienen que ser un entero');
    requestDetails = {
      crop: details.crop,
      storageType: details.storageType,
      storageDays,
    };
  } else {
    if (!MACHINERY_ACTIVITIES.has(details.activity)) throw new ErrorHttp(400, 'tarea de maquinaria inválida');
    requestDetails = { activity: details.activity };
  }
  return {
    providerId: uuid(request.providerId, 'el prestador'),
    offeringId: uuid(request.offeringId, 'la oferta'),
    fieldId: uuid(request.fieldId, 'el campo'),
    serviceType: request.serviceType,
    quantity: number(request.quantity, 'cantidad', { min: Number.MIN_VALUE }),
    quantityUnit: request.serviceType === 'maquinaria' ? 'hectareas' : 'toneladas',
    neededFrom,
    neededUntil,
    requestDetails,
    message: text(request.message, 'mensaje', { required: false, max: 1000 }),
  };
}

export function validarCotizacion(input) {
  const quote = object(input, 'los datos de la cotización');
  const currency = quote.currency;
  if (!['ARS', 'USD'].includes(currency)) throw new ErrorHttp(400, 'moneda de cotización inválida');
  const validUntil = validDate(quote.validUntil, 'vigencia de la cotización');
  if (validUntil && validUntil < new Date().toISOString().slice(0, 10)) {
    throw new ErrorHttp(400, 'la vigencia de la cotización no puede ser anterior a hoy');
  }
  return {
    price: number(quote.price, 'precio cotizado', { min: Number.MIN_VALUE }),
    currency,
    message: text(quote.message, 'mensaje de la cotización', { required: false, max: 1000 }),
    validUntil,
  };
}

export function validarAccionSolicitud(input) {
  const body = object(input, 'la respuesta a la solicitud');
  if (!['quote', 'decline', 'accept_quote', 'decline_quote', 'cancel'].includes(body.action)) {
    throw new ErrorHttp(400, 'acción de solicitud inválida');
  }
  return body.action;
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
    return {
      ...profile,
      role: input.role,
      ...(input.field ? { field: validarCampo(input.field) } : {}),
    };
  }
  return {
    ...profile,
    role: input.role,
    ...(input.offering ? { offering: validarOferta(input.offering) } : {}),
  };
}

export function validarActualizacionPerfil(input) {
  return validarDatosPerfil(input);
}
