import { fetchWithRetry, crearObservacion, validarCoordenadas } from '../http.js';

function fechasMediaHora(start, end) {
  const inicio = new Date(start);
  const fin = new Date(end);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio > fin) {
    throw new TypeError('start/end deben ser fechas válidas y start no puede superar end');
  }
  if (fin - inicio > 3 * 24 * 60 * 60 * 1000) {
    throw new RangeError('IMERG acepta como máximo 3 días por consulta para limitar las llamadas OPeNDAP');
  }

  const cursor = new Date(inicio);
  const minute = cursor.getUTCMinutes();
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(minute + ((30 - (minute % 30)) % 30));
  if (cursor < inicio) cursor.setUTCMinutes(cursor.getUTCMinutes() + 30);
  const fechas = [];
  while (cursor <= fin) {
    fechas.push(new Date(cursor));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 30);
  }
  return fechas;
}

function imergLocation(latitude, longitude) {
  const longitudeIndex = Math.round((Number(longitude) + 180) * 10);
  const latitudeIndex = Math.round((Number(latitude) + 90) * 10);
  if (longitudeIndex < 0 || longitudeIndex > 3599 || latitudeIndex < 0 || latitudeIndex > 1799) {
    throw new RangeError('Coordenadas fuera de la grilla global IMERG');
  }
  return { longitudeIndex, latitudeIndex };
}

function imergGranulePath(time, productBaseUrl) {
  const year = time.getUTCFullYear();
  const dayOfYear = String(Math.floor((Date.UTC(year, time.getUTCMonth(), time.getUTCDate()) - Date.UTC(year, 0, 0)) / 86400000)).padStart(3, '0');
  const startMinute = time.getUTCMinutes();
  const end = new Date(time.getTime() + 29 * 60 * 1000 + 59 * 1000);
  const stamp = (date) => `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}`;
  const filename = `3B-HHR-L.MS.MRG.3IMERG.${year}${String(time.getUTCMonth() + 1).padStart(2, '0')}${String(time.getUTCDate()).padStart(2, '0')}-S${stamp(time)}-E${stamp(end)}.0000.V07B.HDF5`;
  return `${productBaseUrl.replace(/\/$/, '')}/${year}/${dayOfYear}/${filename}.ascii`;
}

function parseOpendapScalar(text) {
  const data = text.split(/\bData:\s*/i).at(-1) ?? text;
  const match = data.match(/=\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*;?\s*$/m);
  if (!match) {
    throw new TypeError('IMERG OPeNDAP devolvió una respuesta sin valor escalar reconocible');
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > -9000 ? value : null;
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(values[index], index);
    }
  }));
  return output;
}

export class NasaGpmImergAdapter {
  constructor({
    username = process.env.NASA_EARTHDATA_USERNAME,
    password = process.env.NASA_EARTHDATA_PASSWORD,
    productBaseUrl = 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHL.07',
    fetchImpl = globalThis.fetch,
    cache = null,
  } = {}) {
    this.username = username;
    this.password = password;
    this.productBaseUrl = productBaseUrl;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
  }

  async lluviaEnPunto({ latitude, longitude, start, end }) {
    validarCoordenadas(latitude, longitude);
    if (!this.username || !this.password) {
      throw new Error('IMERG requiere NASA_EARTHDATA_USERNAME y NASA_EARTHDATA_PASSWORD');
    }
    const times = fechasMediaHora(start, end);
    const { longitudeIndex, latitudeIndex } = imergLocation(latitude, longitude);
    const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    const queriedAt = new Date().toISOString();
    const observations = await mapLimit(times, 3, async (time) => {
      const path = imergGranulePath(time, this.productBaseUrl);
      const url = `${path}?precipitation[0][${longitudeIndex}][${latitudeIndex}]`;
      const cacheKey = `imerg:${url}`;
      const cached = await this.cache?.get(cacheKey);
      if (cached) return cached;

      const authorization = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Basic ${authorization}` },
      }, { fetchImpl: this.fetchImpl, timeoutMs: 20_000 });
      const rawValue = parseOpendapScalar(await response.text());
      const observation = crearObservacion({
        variable: 'precipitation',
        value: rawValue == null ? null : Number((rawValue * 0.5).toFixed(4)),
        unit: 'mm/30min',
        source: 'NASA GPM IMERG Late V07B',
        observedAt: time.toISOString(),
        queriedAt,
        coordinates,
        spatialResolutionKm: 10,
        quality: rawValue == null ? 'missing' : 'valid',
        type: 'estimated',
        uncertainty: 'Precipitación satelital estimada; no es medición puntual ni de transitabilidad.',
      });
      await this.cache?.set(cacheKey, observation, 30 * 24 * 60 * 60 * 1000);
      return observation;
    });

    return {
      source: 'NASA GPM IMERG Late V07B',
      queriedAt,
      coordinates,
      observations,
    };
  }
}

export default NasaGpmImergAdapter;
