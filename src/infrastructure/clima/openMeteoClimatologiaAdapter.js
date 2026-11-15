import { resumirClimatologia } from '../../domain/clima/climatologia.js';
import { fetchJson, validarCoordenadas } from '../http.js';

const MS_POR_DIA = 86400000;

// API pública y sin clave de Open-Meteo con el histórico diario (reanálisis). Se usa para estimar
// la frecuencia de lluvia por fecha cuando el pronóstico (16 días) no alcanza.
export class OpenMeteoClimatologiaAdapter {
  constructor({
    baseUrl = 'https://archive-api.open-meteo.com/v1/archive',
    fetchImpl = globalThis.fetch,
    cache = null,
    cacheTtlMs = 30 * MS_POR_DIA,
    timezone = 'America/Argentina/Buenos_Aires',
    anios = 10,
    ahora = () => new Date(),
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
    this.timezone = timezone;
    this.anios = anios;
    this.ahora = ahora;
  }

  async climatologiaDiaria({ latitude, longitude }) {
    validarCoordenadas(latitude, longitude);
    // Se redondea a 0,1° (~11 km): lotes vecinos comparten la misma consulta y el mismo caché.
    const lat = Math.round(Number(latitude) * 10) / 10;
    const lon = Math.round(Number(longitude) * 10) / 10;
    const ultimoAnio = this.ahora().getUTCFullYear() - 1;
    const desde = `${ultimoAnio - this.anios + 1}-01-01`;
    const hasta = `${ultimoAnio}-12-31`;

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: desde,
      end_date: hasta,
      daily: 'precipitation_sum',
      timezone: this.timezone,
    });
    const cacheKey = `open-meteo-archive:${params}`;
    const guardado = await this.cache?.get(cacheKey);
    if (guardado) return guardado;

    const payload = await fetchJson(`${this.baseUrl}?${params}`, {}, { fetchImpl: this.fetchImpl, timeoutMs: 30_000 });
    if (!payload?.daily?.time || !payload.daily.precipitation_sum) {
      throw new TypeError('Respuesta Open-Meteo histórica incompleta: falta precipitation_sum diaria');
    }
    const resultado = {
      source: 'Open-Meteo Historical',
      anios: this.anios,
      desde,
      hasta,
      coordinates: { latitude: lat, longitude: lon },
      resumen: resumirClimatologia({ fechas: payload.daily.time, lluviaMm: payload.daily.precipitation_sum }),
    };
    await this.cache?.set(cacheKey, resultado, this.cacheTtlMs);
    return resultado;
  }
}
