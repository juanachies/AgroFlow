import { crearObservacion, fechaUtcCompacta, fetchJson, validarCoordenadas } from '../http.js';

const PARAMETER_UNITS = {
  PRECTOTCORR: 'mm/h',
  T2M: 'degC',
  T2M_MAX: 'degC',
  T2M_MIN: 'degC',
  RH2M: '%',
  WS2M: 'm/s',
  GWETTOP: 'fraction',
};

function validarRespuesta(data) {
  if (!data?.properties?.parameter || !data?.header?.fill_value) {
    throw new TypeError('Respuesta NASA POWER sin propiedades meteorológicas reconocibles');
  }
}

export class NasaPowerAdapter {
  constructor({
    baseUrl = 'https://power.larc.nasa.gov/api/temporal/hourly/point',
    fetchImpl = globalThis.fetch,
    cache = null,
    cacheTtlMs = 6 * 60 * 60 * 1000,
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
  }

  async obtenerHistorial({
    latitude,
    longitude,
    start,
    end,
    parameters = ['PRECTOTCORR', 'T2M', 'RH2M', 'WS2M', 'GWETTOP'],
    community = 'AG',
  }) {
    validarCoordenadas(latitude, longitude);
    if (!Array.isArray(parameters) || parameters.length === 0 || parameters.length > 15) {
      throw new TypeError('NASA POWER admite entre 1 y 15 parámetros por consulta');
    }

    const startDate = fechaUtcCompacta(start);
    const endDate = fechaUtcCompacta(end);
    const params = new URLSearchParams({
      parameters: parameters.join(','),
      community,
      longitude: String(longitude),
      latitude: String(latitude),
      start: startDate,
      end: endDate,
      format: 'JSON',
      'time-standard': 'UTC',
    });
    const url = `${this.baseUrl}?${params}`;
    const cacheKey = `nasa-power:${params.toString()}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payload = await fetchJson(url, {}, { fetchImpl: this.fetchImpl });
    validarRespuesta(payload);

    const fillValue = Number(payload.header.fill_value);
    const parameterData = payload.properties.parameter;
    const observations = [];
    for (const [variable, values] of Object.entries(parameterData)) {
      for (const [timestamp, rawValue] of Object.entries(values)) {
        const value = Number(rawValue);
        const missing = !Number.isFinite(value) || value === fillValue || value <= -999;
        observations.push(crearObservacion({
          variable,
          value: missing ? null : value,
          unit: PARAMETER_UNITS[variable] ?? null,
          source: 'NASA POWER',
          observedAt: timestamp,
          coordinates: { latitude: Number(latitude), longitude: Number(longitude) },
          spatialResolutionKm: 50,
          quality: missing ? 'missing' : 'valid',
          type: 'estimated',
        }));
      }
    }

    const result = {
      source: 'NASA POWER',
      queriedAt: new Date().toISOString(),
      timeStandard: 'UTC',
      parameters: [...Object.keys(parameterData)],
      observations,
      metadata: payload.header,
    };
    await this.cache?.set(cacheKey, result, this.cacheTtlMs);
    return result;
  }

  async obtenerPronostico(args) {
    return this.obtenerHistorial(args);
  }
}

export default NasaPowerAdapter;
