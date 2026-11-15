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
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function enTransaccion(work) {
  const client = await obtenerPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
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
      'SELECT id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit, base_latitude, base_longitude, service_radius_km, available_from, available_until, notes, created_at, updated_at FROM service_offerings WHERE user_id = $1',
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
       base_latitude, base_longitude, service_radius_km, available_from, available_until, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
       notes = EXCLUDED.notes,
       updated_at = now()
     RETURNING id, service_type, subtype, price, currency, price_unit, capacity, capacity_unit,
       base_latitude, base_longitude, service_radius_km, available_from, available_until, notes,
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
        base_latitude, base_longitude, service_radius_km, available_from, available_until, notes,
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
};
