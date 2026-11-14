import { crearObservacion, fetchJson, validarCoordenadas } from '../http.js';

const HOURLY_UNITS = {
  precipitation_probability: '%',
  precipitation: 'mm',
  rain: 'mm',
  showers: 'mm',
  temperature_2m: 'degC',
  relative_humidity_2m: '%',
  dew_point_2m: 'degC',
  wind_speed_10m: 'km/h',
  wind_gusts_10m: 'km/h',
  shortwave_radiation: 'W/m2',
  et0_fao_evapotranspiration: 'mm',
  soil_moisture_0_to_1cm: 'm3/m3',
  soil_moisture_1_to_3cm: 'm3/m3',
  soil_moisture_3_to_9cm: 'm3/m3',
  soil_moisture_9_to_27cm: 'm3/m3',
  soil_moisture_27_to_81cm: 'm3/m3',
};

const DEFAULT_HOURLY = Object.keys(HOURLY_UNITS);
const DEFAULT_DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_hours',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'shortwave_radiation_sum',
  'et0_fao_evapotranspiration',
];

export class OpenMeteoAdapter {
  constructor({
    baseUrl = 'https://api.open-meteo.com/v1/forecast',
    fetchImpl = globalThis.fetch,
    cache = null,
    cacheTtlMs = 60 * 60 * 1000,
    timezone = 'America/Argentina/Buenos_Aires',
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
    this.timezone = timezone;
  }

  async obtenerPronostico({
    latitude,
    longitude,
    startDate,
    endDate,
    forecastDays,
    hourly = DEFAULT_HOURLY,
    daily = DEFAULT_DAILY,
    model,
  }) {
    validarCoordenadas(latitude, longitude);
    if (!Array.isArray(hourly) || !Array.isArray(daily)) {
      throw new TypeError('hourly y daily deben ser arreglos de variables');
    }

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: this.timezone,
      hourly: hourly.join(','),
      daily: daily.join(','),
      timeformat: 'iso8601',
    });
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (!startDate && !endDate && forecastDays) {
      params.set('forecast_days', String(forecastDays));
    }
    if (model) params.set('models', model);

    const url = `${this.baseUrl}?${params}`;
    const cacheKey = `open-meteo:${params.toString()}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payload = await fetchJson(url, {}, { fetchImpl: this.fetchImpl });
    if (!payload?.hourly?.time || !payload?.daily?.time) {
      throw new TypeError('Respuesta Open-Meteo incompleta: faltan series horarias o diarias');
    }

    const coordinates = {
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
    };
    const queriedAt = new Date().toISOString();
    const hourlyObservations = [];
    for (const [variable, values] of Object.entries(payload.hourly)) {
      if (variable === 'time' || !Array.isArray(values)) continue;
      values.forEach((value, index) => {
        hourlyObservations.push(crearObservacion({
          variable,
          value: value == null ? null : Number(value),
          unit: payload.hourly_units?.[variable] ?? HOURLY_UNITS[variable] ?? null,
          source: 'Open-Meteo',
          observedAt: payload.hourly.time[index],
          queriedAt,
          coordinates,
          spatialResolutionKm: null,
          quality: value == null ? 'missing' : 'valid',
          type: 'forecast',
        }));
      });
    }

    const result = {
      source: 'Open-Meteo',
      queriedAt,
      model: payload.model ?? model ?? 'automatic',
      timezone: payload.timezone,
      elevationMeters: payload.elevation ?? null,
      coordinates,
      hourly: payload.hourly,
      hourlyUnits: payload.hourly_units ?? {},
      daily: payload.daily,
      dailyUnits: payload.daily_units ?? {},
      observations: hourlyObservations,
    };
    await this.cache?.set(cacheKey, result, this.cacheTtlMs);
    return result;
  }
}

export default OpenMeteoAdapter;
