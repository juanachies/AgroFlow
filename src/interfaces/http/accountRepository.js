import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';
import { ErrorHttp } from './validacion.js';

let pool;

function obtenerPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada en el servidor.');
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    attachDatabasePool(pool);
  }
  return pool;
}

function campoDesdeFila(row) {
  return {
    id: row.id,
    name: row.name,
    areaHa: Number(row.area_ha),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofertaDesdeFila(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceType: row.service_type,
    subtype: row.subtype,
    price: Number(row.price),
    currency: row.currency,
    priceUnit: row.price_unit,
    capacity: Number(row.capacity),
    capacityUnit: row.capacity_unit,
    baseLatitude: Number(row.base_latitude),
    baseLongitude: Number(row.base_longitude),
    serviceRadiusKm: Number(row.service_radius_km),
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    details: row.details ?? {},
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function solicitudDesdeFila(row) {
  return {
    id: row.id,
    providerId: row.provider_user_id,
    requesterId: row.requester_user_id,
    field: {
      id: row.field_id,
      name: row.field_name,
      latitude: Number(row.field_latitude),
      longitude: Number(row.field_longitude),
    },
    provider: {
      displayName: row.provider_name,
      phone: row.provider_phone,
    },
    requester: {
      displayName: row.requester_name,
      phone: row.requester_phone,
    },
    serviceType: row.service_type,
    subtype: row.subtype,
    quantity: Number(row.quantity),
    quantityUnit: row.quantity_unit,
    neededFrom: row.needed_from,
    neededUntil: row.needed_until,
    requestDetails: row.request_details ?? {},
    message: row.message,
    status: row.status,
    quote: row.quote_price == null ? null : {
      price: Number(row.quote_price),
      currency: row.quote_currency,
      priceUnit: row.quote_price_unit,
      message: row.quote_message,
      validUntil: row.quote_valid_until,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SOLICITUD_SELECT = `
  SELECT request.id, request.provider_user_id, request.requester_user_id, request.field_id,
    request.service_type, request.quantity, request.quantity_unit, request.needed_from, request.needed_until,
    request.request_details, request.message, request.status, request.quote_price, request.quote_currency,
    request.quote_price_unit, request.quote_message, request.quote_valid_until, request.created_at, request.updated_at,
    field.name AS field_name, field.latitude AS field_latitude, field.longitude AS field_longitude,
    provider.display_name AS provider_name,
    CASE WHEN request.status = 'accepted' THEN provider.phone END AS provider_phone,
    requester.display_name AS requester_name,
    CASE WHEN request.status = 'accepted' THEN requester.phone END AS requester_phone,
    offering.subtype
  FROM service_requests request
  JOIN app_user_profiles provider ON provider.user_id = request.provider_user_id
  JOIN app_user_profiles requester ON requester.user_id = request.requester_user_id
  JOIN account_fields field ON field.id = request.field_id
  JOIN service_offerings offering ON offering.id = request.offering_id
`;

function distanciaKm(a, b) {
  const radianes = (grados) => grados * Math.PI / 180;
  const latDelta = radianes(b.latitude - a.latitude);
  const lonDelta = radianes(b.longitude - a.longitude);
  const lat1 = radianes(a.latitude);
  const lat2 = radianes(b.latitude);
  const h = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function exigirCompatibilidadOferta(offering, field, request) {
  const details = offering.details ?? {};
  const requestDetails = request.requestDetails;
  const supported = request.serviceType === 'transporte'
    ? details.loadTypes
    : request.serviceType === 'almacenamiento'
      ? details.storageTypes
      : details.activities;
  const requested = request.serviceType === 'transporte'
    ? requestDetails.loadType
    : request.serviceType === 'almacenamiento'
      ? requestDetails.storageType
      : requestDetails.activity;
  if (Array.isArray(supported) && supported.length && !supported.includes(requested)) {
    throw new ErrorHttp(409, 'el servicio no ofrece esa tarea o tipo de carga');
  }
  if (request.serviceType === 'almacenamiento' && Array.isArray(details.crops) && details.crops.length && !details.crops.includes(requestDetails.crop)) {
    throw new ErrorHttp(409, 'el servicio no admite ese cultivo');
  }
  if (
    (request.neededFrom && offering.available_from && request.neededFrom < offering.available_from)
    || (request.neededUntil && offering.available_until && request.neededUntil > offering.available_until)
    || (request.neededUntil && offering.available_from && request.neededUntil < offering.available_from)
    || (request.neededFrom && offering.available_until && request.neededFrom > offering.available_until)
  ) {
    throw new ErrorHttp(409, 'la fecha solicitada queda fuera de la disponibilidad del prestador');
  }
  const distance = distanciaKm(
    { latitude: Number(field.latitude), longitude: Number(field.longitude) },
    { latitude: Number(offering.base_latitude), longitude: Number(offering.base_longitude) },
  );
  if (distance > Number(offering.service_radius_km)) {
    throw new ErrorHttp(409, 'el campo está fuera del radio de cobertura del prestador');
  }
}

async function leerSolicitud(client, requestId, viewerId) {
  const result = await client.query(
    `${SOLICITUD_SELECT}
     WHERE request.id = $1 AND (request.provider_user_id = $2 OR request.requester_user_id = $2)`,
    [requestId, viewerId],
  );
  if (!result.rows[0]) throw new ErrorHttp(404, 'no se encontró esa solicitud');
  return solicitudDesdeFila(result.rows[0]);
}

async function enTransaccion(work) {
  const client = await obtenerPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('No se pudo revertir la transacción de cuenta.', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function leerCuenta(client, userId) {
  const profileResult = await client.query(
    'SELECT user_id, role, display_name, phone, created_at, updated_at FROM app_user_profiles WHERE user_id = $1',
    [userId],
  );
  const profile = profileResult.rows[0];
  if (!profile) return { profile: null, fields: [], offering: null };
  const [fieldsResult, offeringResult] = await Promise.all([
    client.query(
      'SELECT id, name, area_ha, latitude, longitude, created_at, updated_at FROM account_fields WHERE user_id = $1 ORDER BY created_at, id',
      [userId],
    ),
    client.query(
      'SELECT id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit, base_latitude, base_longitude, service_radius_km, available_from, available_until, details, notes, created_at, updated_at FROM service_offerings WHERE user_id = $1',
      [userId],
    ),
  ]);
  return {
    profile: {
      userId: profile.user_id,
      role: profile.role,
      displayName: profile.display_name,
      phone: profile.phone,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    fields: fieldsResult.rows.map(campoDesdeFila),
    offering: ofertaDesdeFila(offeringResult.rows[0]),
  };
}

async function exigirRol(client, userId, role) {
  const result = await client.query('SELECT role FROM app_user_profiles WHERE user_id = $1', [userId]);
  if (!result.rows[0]) throw new ErrorHttp(404, 'completá primero el perfil de tu cuenta');
  if (result.rows[0].role !== role) throw new ErrorHttp(403, 'esta acción no corresponde al tipo de cuenta');
}

async function insertarCampo(client, userId, field) {
  const result = await client.query(
    `INSERT INTO account_fields (user_id, name, area_ha, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, area_ha, latitude, longitude, created_at, updated_at`,
    [userId, field.name, field.areaHa, field.latitude, field.longitude],
  );
  return campoDesdeFila(result.rows[0]);
}

async function guardarOferta(client, userId, offering) {
  const result = await client.query(
    `INSERT INTO service_offerings (
       user_id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit,
       base_latitude, base_longitude, service_radius_km, available_from, available_until, details, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (user_id) DO UPDATE SET
       service_type = EXCLUDED.service_type,
       subtype = EXCLUDED.subtype,
       price = EXCLUDED.price,
       currency = EXCLUDED.currency,
       price_unit = EXCLUDED.price_unit,
       capacity = EXCLUDED.capacity,
       capacity_unit = EXCLUDED.capacity_unit,
       base_latitude = EXCLUDED.base_latitude,
       base_longitude = EXCLUDED.base_longitude,
       service_radius_km = EXCLUDED.service_radius_km,
       available_from = EXCLUDED.available_from,
       available_until = EXCLUDED.available_until,
       details = EXCLUDED.details,
       notes = EXCLUDED.notes,
       updated_at = now()
     RETURNING id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit,
       base_latitude, base_longitude, service_radius_km, available_from, available_until, details, notes,
       created_at, updated_at`,
    [
      userId,
      offering.serviceType,
      offering.subtype,
      offering.price,
      offering.currency,
      offering.priceUnit,
      offering.capacity,
      offering.capacityUnit,
      offering.baseLatitude,
      offering.baseLongitude,
      offering.serviceRadiusKm,
      offering.availableFrom,
      offering.availableUntil,
      offering.details,
      offering.notes,
    ],
  );
  return ofertaDesdeFila(result.rows[0]);
}

export const accountRepository = {
  get: async (userId) => leerCuenta(obtenerPool(), userId),

  create: async (userId, account) => enTransaccion(async (client) => {
    const created = await client.query(
      `INSERT INTO app_user_profiles (user_id, role, display_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING user_id`,
      [userId, account.role, account.displayName, account.phone],
    );
    if (!created.rowCount) throw new ErrorHttp(409, 'la cuenta ya tiene un perfil');
    if (account.role === 'productor') await insertarCampo(client, userId, account.field);
    if (account.role === 'prestador') await guardarOferta(client, userId, account.offering);
    return leerCuenta(client, userId);
  }),

  updateProfile: async (userId, profile) => {
    const result = await obtenerPool().query(
      `UPDATE app_user_profiles
       SET display_name = $2, phone = $3, updated_at = now()
       WHERE user_id = $1
       RETURNING user_id, role, display_name, phone, created_at, updated_at`,
      [userId, profile.displayName, profile.phone],
    );
    if (!result.rowCount) throw new ErrorHttp(404, 'completá primero el perfil de tu cuenta');
    return {
      userId: result.rows[0].user_id,
      role: result.rows[0].role,
      displayName: result.rows[0].display_name,
      phone: result.rows[0].phone,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    };
  },

  listFields: async (userId) => {
    await exigirRol(obtenerPool(), userId, 'productor');
    const result = await obtenerPool().query(
      'SELECT id, name, area_ha, latitude, longitude, created_at, updated_at FROM account_fields WHERE user_id = $1 ORDER BY created_at, id',
      [userId],
    );
    return result.rows.map(campoDesdeFila);
  },

  createField: async (userId, field) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'productor');
    return insertarCampo(client, userId, field);
  }),

  updateField: async (userId, fieldId, field) => {
    const result = await obtenerPool().query(
      `UPDATE account_fields
       SET name = $3, area_ha = $4, latitude = $5, longitude = $6, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, area_ha, latitude, longitude, created_at, updated_at`,
      [fieldId, userId, field.name, field.areaHa, field.latitude, field.longitude],
    );
    if (!result.rowCount) throw new ErrorHttp(404, 'no se encontró ese campo en tu cuenta');
    return campoDesdeFila(result.rows[0]);
  },

  deleteField: async (userId, fieldId) => {
    const result = await obtenerPool().query(
      'DELETE FROM account_fields WHERE id = $1 AND user_id = $2 RETURNING id',
      [fieldId, userId],
    );
    if (!result.rowCount) throw new ErrorHttp(404, 'no se encontró ese campo en tu cuenta');
  },

  getOffering: async (userId) => {
    await exigirRol(obtenerPool(), userId, 'prestador');
    const result = await obtenerPool().query(
      `SELECT id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit,
        base_latitude, base_longitude, service_radius_km, available_from, available_until, details, notes,
        created_at, updated_at
       FROM service_offerings WHERE user_id = $1`,
      [userId],
    );
    return ofertaDesdeFila(result.rows[0]);
  },

  saveOffering: async (userId, offering) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'prestador');
    return guardarOferta(client, userId, offering);
  }),

  listServiceOfferings: async (userId, serviceType) => {
    await exigirRol(obtenerPool(), userId, 'productor');
    const result = await obtenerPool().query(
      `SELECT offering.id, offering.user_id, profile.display_name, offering.service_type, offering.subtype,
        offering.price, offering.currency, offering.price_unit, offering.capacity, offering.capacity_unit,
        offering.base_latitude, offering.base_longitude, offering.service_radius_km,
        offering.available_from, offering.available_until, offering.details, offering.notes,
        offering.created_at, offering.updated_at
       FROM service_offerings offering
       JOIN app_user_profiles profile ON profile.user_id = offering.user_id
       WHERE profile.role = 'prestador' AND ($1::text IS NULL OR offering.service_type = $1)
       ORDER BY offering.service_type, profile.display_name, offering.updated_at DESC`,
      [serviceType],
    );
    return result.rows.map((row) => ({
      providerId: row.user_id,
      providerName: row.display_name,
      offering: ofertaDesdeFila(row),
    }));
  },

  listServiceRequests: async (userId) => {
    const roleResult = await obtenerPool().query('SELECT role FROM app_user_profiles WHERE user_id = $1', [userId]);
    const role = roleResult.rows[0]?.role;
    if (!role) throw new ErrorHttp(404, 'completá primero el perfil de tu cuenta');
    if (!['productor', 'prestador'].includes(role)) throw new ErrorHttp(403, 'esta acción no corresponde al tipo de cuenta');
    const side = role === 'prestador' ? 'provider_user_id' : 'requester_user_id';
    const result = await obtenerPool().query(
      `${SOLICITUD_SELECT}
       WHERE request.${side} = $1
       ORDER BY CASE request.status WHEN 'pending' THEN 0 WHEN 'quoted' THEN 1 ELSE 2 END,
         request.created_at DESC`,
      [userId],
    );
    return result.rows.map(solicitudDesdeFila);
  },

  createServiceRequest: async (userId, request) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'productor');
    const offeringResult = await client.query(
      `SELECT id, user_id, service_type, details, base_latitude, base_longitude,
        service_radius_km, available_from, available_until
       FROM service_offerings WHERE id = $1 AND user_id = $2 FOR SHARE`,
      [request.offeringId, request.providerId],
    );
    const fieldResult = await client.query(
      'SELECT id, latitude, longitude FROM account_fields WHERE id = $1 AND user_id = $2 FOR SHARE',
      [request.fieldId, userId],
    );
    const offering = offeringResult.rows[0];
    const field = fieldResult.rows[0];
    if (!offering || !field || offering.service_type !== request.serviceType) {
      throw new ErrorHttp(404, 'no se encontró una oferta compatible con ese campo');
    }
    exigirCompatibilidadOferta(offering, field, request);
    const inserted = await client.query(
      `INSERT INTO service_requests (
         offering_id, provider_user_id, requester_user_id, field_id, service_type,
         quantity, quantity_unit, needed_from, needed_until, request_details, message
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        offering.id,
        offering.user_id,
        userId,
        field.id,
        request.serviceType,
        request.quantity,
        request.quantityUnit,
        request.neededFrom,
        request.neededUntil,
        request.requestDetails,
        request.message,
      ],
    );
    return leerSolicitud(client, inserted.rows[0].id, userId);
  }),

  submitServiceQuote: async (userId, requestId, quote) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'prestador');
    const result = await client.query(
      `UPDATE service_requests request
       SET status = 'quoted', quote_price = $3, quote_currency = $4, quote_price_unit = offering.price_unit,
         quote_message = $5, quote_valid_until = $6, updated_at = now()
       FROM service_offerings offering
       WHERE request.id = $1 AND request.provider_user_id = $2
         AND request.offering_id = offering.id AND request.status = 'pending'
       RETURNING request.id`,
      [requestId, userId, quote.price, quote.currency, quote.message, quote.validUntil],
    );
    if (!result.rowCount) throw new ErrorHttp(409, 'la solicitud ya no está pendiente o no pertenece a tu cuenta');
    return leerSolicitud(client, requestId, userId);
  }),

  declineServiceRequest: async (userId, requestId) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'prestador');
    const result = await client.query(
      `UPDATE service_requests SET status = 'declined', updated_at = now()
       WHERE id = $1 AND provider_user_id = $2 AND status = 'pending' RETURNING id`,
      [requestId, userId],
    );
    if (!result.rowCount) throw new ErrorHttp(409, 'la solicitud ya no está pendiente o no pertenece a tu cuenta');
    return leerSolicitud(client, requestId, userId);
  }),

  respondToServiceQuote: async (userId, requestId, action) => enTransaccion(async (client) => {
    await exigirRol(client, userId, 'productor');
    let result;
    if (action === 'accept_quote') {
      result = await client.query(
        `UPDATE service_requests SET status = 'accepted', updated_at = now()
         WHERE id = $1 AND requester_user_id = $2 AND status = 'quoted'
           AND (quote_valid_until IS NULL OR quote_valid_until >= CURRENT_DATE)
         RETURNING id`,
        [requestId, userId],
      );
    } else if (action === 'decline_quote') {
      result = await client.query(
        `UPDATE service_requests SET status = 'declined', updated_at = now()
         WHERE id = $1 AND requester_user_id = $2 AND status = 'quoted' RETURNING id`,
        [requestId, userId],
      );
    } else {
      result = await client.query(
        `UPDATE service_requests SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND requester_user_id = $2 AND status IN ('pending', 'quoted') RETURNING id`,
        [requestId, userId],
      );
    }
    if (!result.rowCount) throw new ErrorHttp(409, 'la cotización ya no está disponible para responder');
    return leerSolicitud(client, requestId, userId);
  }),
};
