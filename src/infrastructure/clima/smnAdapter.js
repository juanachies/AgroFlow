import { crearObservacion, fetchJson, validarCoordenadas } from '../http.js';

export class SmnAdapter {
  constructor({
    baseUrl,
    username = process.env.SMN_API_USERNAME,
    password = process.env.SMN_API_PASSWORD,
    fetchImpl = globalThis.fetch,
    cache = null,
    tokenTtlMs = 20 * 60 * 1000,
  } = {}) {
    if (!baseUrl) {
      throw new Error('Configurar SMN_API_BASE_URL con una base documentada; la API de producción no está confirmada');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.tokenTtlMs = tokenTtlMs;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.tokenPromise = null;
  }

  async autenticar() {
    if (this.token && this.tokenExpiresAt > Date.now()) return this.token;
    if (this.tokenPromise) return this.tokenPromise;
    if (!this.username || !this.password) {
      throw new Error('SMN requiere SMN_API_USERNAME y SMN_API_PASSWORD');
    }

    this.tokenPromise = (async () => {
      const result = await fetchJson(`${this.baseUrl}/api-token/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
      }, { fetchImpl: this.fetchImpl });
      if (typeof result.token !== 'string' || result.token.length === 0) {
        throw new TypeError('SMN no devolvió un token de autenticación válido');
      }
      this.token = result.token;
      this.tokenExpiresAt = Date.now() + this.tokenTtlMs;
      return this.token;
    })();
    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  async obtenerPronostico({ latitude, longitude }) {
    validarCoordenadas(latitude, longitude);
    const key = `smn:forecast:${latitude}:${longitude}`;
    const cached = await this.cache?.get(key);
    if (cached) return cached;

    const token = await this.autenticar();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    const payload = await fetchJson(`${this.baseUrl}/forecast/location/coord?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, { fetchImpl: this.fetchImpl });
    if (!Array.isArray(payload.forecast)) {
      throw new TypeError('Respuesta SMN sin arreglo forecast');
    }

    const queriedAt = new Date().toISOString();
    const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    const observations = [];
    for (const day of payload.forecast) {
      const periods = ['early_morning', 'morning', 'afternoon', 'night'];
      for (const period of periods) {
        const segment = day[period];
        if (!segment) continue;
        const interval = `${day.date}:${period}`;
        for (const [variable, value, unit] of [
          ['temperature', segment.temperature, 'degC'],
          ['relative_humidity', segment.humidity, '%'],
          ['precipitation_probability_min', segment.rain_prob_range?.[0], '%'],
          ['precipitation_probability_max', segment.rain_prob_range?.[1], '%'],
          ['precipitation_6h', segment.rain06h, 'mm/6h'],
          ['wind_speed', segment.wind?.speed, 'km/h'],
          ['wind_gust_min', segment.gust_range?.[0], 'km/h'],
          ['wind_gust_max', segment.gust_range?.[1], 'km/h'],
        ]) {
          if (value === undefined) continue;
          observations.push(crearObservacion({
            variable,
            value: value == null ? null : Number(value),
            unit,
            source: 'Servicio Meteorológico Nacional',
            observedAt: interval,
            queriedAt,
            coordinates,
            spatialResolutionKm: null,
            quality: value == null ? 'missing' : 'valid',
            type: 'forecast',
          }));
        }
      }
    }

    const result = {
      source: 'Servicio Meteorológico Nacional',
      queriedAt,
      updatedAt: payload.updated ?? null,
      location: payload.location ?? null,
      forecast: payload.forecast,
      observations,
    };
    await this.cache?.set(key, result, this.tokenTtlMs);
    return result;
  }

  async historialPrecipitacion({ latitude, longitude, start, end, period = 24 }) {
    validarCoordenadas(latitude, longitude);
    if (!start || !end || !Number.isInteger(period) || period < 1) {
      throw new TypeError('historial SMN requiere start, end y period positivo en horas');
    }
    const token = await this.autenticar();
    const headers = { Authorization: `Bearer ${token}` };
    const coordinateParams = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    const location = await fetchJson(
      `${this.baseUrl}/georef/location/coord?${coordinateParams}`,
      { headers },
      { fetchImpl: this.fetchImpl },
    );
    if (!Number.isInteger(Number(location.id))) {
      throw new TypeError('SMN no encontró una localidad de referencia para esas coordenadas');
    }

    const params = new URLSearchParams({
      start,
      end,
      period: String(period),
    });
    const payload = await fetchJson(
      `${this.baseUrl}/history/precipitation/location/${encodeURIComponent(location.id)}?${params}`,
      { headers },
      { fetchImpl: this.fetchImpl },
    );
    if (!Array.isArray(payload.list)) {
      throw new TypeError('Respuesta SMN de precipitación histórica sin list');
    }

    const queriedAt = new Date().toISOString();
    return {
      source: 'Servicio Meteorológico Nacional',
      queriedAt,
      location,
      stationId: payload.station_id ?? null,
      observations: payload.list.map((item) => crearObservacion({
        variable: 'precipitation',
        value: item.valid && item.precipitation != null ? Number(item.precipitation) : null,
        unit: 'mm',
        source: 'Servicio Meteorológico Nacional',
        observedAt: item.date,
        queriedAt,
        coordinates: { latitude: Number(latitude), longitude: Number(longitude) },
        spatialResolutionKm: null,
        quality: item.valid ? 'valid' : 'missing',
        type: 'observed',
      })),
    };
  }

  async obtenerAlertas({ latitude, longitude }) {
    validarCoordenadas(latitude, longitude);
    const token = await this.autenticar();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    const headers = { Authorization: `Bearer ${token}` };
    const endpoints = [
      ['alertas', `${this.baseUrl}/warning/alert/location/coord?${params}`],
      ['avisosCortoPlazo', `${this.baseUrl}/warning/shortterm/location/coord?${params}`],
    ];
    const results = await Promise.allSettled(endpoints.map(([, url]) => fetchJson(url, { headers }, {
      fetchImpl: this.fetchImpl,
    })));
    const data = {};
    const failures = [];
    results.forEach((result, index) => {
      const name = endpoints[index][0];
      if (result.status === 'fulfilled') {
        data[name] = result.value;
      } else {
        failures.push({
          source: `SMN ${name}`,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    return {
      source: 'Servicio Meteorológico Nacional',
      queriedAt: new Date().toISOString(),
      ...data,
      failures,
    };
  }
}

export default SmnAdapter;
