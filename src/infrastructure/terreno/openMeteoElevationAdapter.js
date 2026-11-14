import { fetchJson, validarCoordenadas } from '../http.js';

export class OpenMeteoElevationAdapter {
  constructor({
    baseUrl = 'https://api.open-meteo.com/v1/elevation',
    fetchImpl = globalThis.fetch,
    cache = null,
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
  }

  async elevacion({ latitude, longitude }) {
    validarCoordenadas(latitude, longitude);
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    });
    const key = `open-meteo-elevation:${params}`;
    const cached = await this.cache?.get(key);
    if (cached) return cached;

    const payload = await fetchJson(`${this.baseUrl}?${params}`, {}, { fetchImpl: this.fetchImpl });
    if (!Array.isArray(payload.elevation) || !Number.isFinite(Number(payload.elevation[0]))) {
      throw new TypeError('Open-Meteo Elevation no devolvió una elevación válida');
    }

    const result = {
      elevationMeters: Number(payload.elevation[0]),
      coordinates: { latitude: Number(latitude), longitude: Number(longitude) },
      source: 'Open-Meteo Elevation (DEM)',
      queriedAt: new Date().toISOString(),
      quality: 'regional_dem_estimate',
      warning: 'Elevación de DEM regional; no identifica depresiones sublote ni transitabilidad.',
    };
    await this.cache?.set(key, result, 30 * 24 * 60 * 60 * 1000);
    return result;
  }
}

export default OpenMeteoElevationAdapter;
