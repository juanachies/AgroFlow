import { fetchJson, validarCoordenadas } from '../http.js';

let lastNominatimRequest = 0;

async function esperarLimiteNominatim() {
  const elapsed = Date.now() - lastNominatimRequest;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimRequest = Date.now();
}

export class OpenStreetMapAdapter {
  constructor({
    nominatimUrl = 'https://nominatim.openstreetmap.org',
    osrmUrl = 'https://router.project-osrm.org',
    userAgent = 'MarcianosCosecha/1.0',
    fetchImpl = globalThis.fetch,
    cache = null,
  } = {}) {
    this.nominatimUrl = nominatimUrl.replace(/\/$/, '');
    this.osrmUrl = osrmUrl.replace(/\/$/, '');
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
  }

  async geocodificar(texto) {
    if (typeof texto !== 'string' || texto.trim().length === 0) {
      throw new TypeError('texto de geocodificación requerido');
    }

    const cacheKey = `nominatim:${texto.trim().toLowerCase()}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) return cached;

    await esperarLimiteNominatim();
    const params = new URLSearchParams({ q: texto, format: 'jsonv2', limit: '1' });
    const result = await fetchJson(`${this.nominatimUrl}/search?${params}`, {
      headers: { 'User-Agent': this.userAgent },
    }, { fetchImpl: this.fetchImpl });
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error(`OpenStreetMap no encontró la ubicación: ${texto}`);
    }
    const location = {
      latitude: Number(result[0].lat),
      longitude: Number(result[0].lon),
      displayName: result[0].display_name,
      source: 'OpenStreetMap Nominatim',
    };
    await this.cache?.set(cacheKey, location, 30 * 24 * 60 * 60 * 1000);
    return location;
  }

  async distanciaKm(origen, destino) {
    validarCoordenadas(origen?.latitude ?? origen?.lat, origen?.longitude ?? origen?.lon);
    validarCoordenadas(destino?.latitude ?? destino?.lat, destino?.longitude ?? destino?.lon);
    const start = `${Number(origen.longitude ?? origen.lon)},${Number(origen.latitude ?? origen.lat)}`;
    const end = `${Number(destino.longitude ?? destino.lon)},${Number(destino.latitude ?? destino.lat)}`;
    const cacheKey = `osrm:route:${start}:${end}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) return cached;

    const result = await fetchJson(
      `${this.osrmUrl}/route/v1/driving/${start};${end}?overview=false&steps=false`,
      { headers: { 'User-Agent': this.userAgent } },
      { fetchImpl: this.fetchImpl },
    );
    if (result.code !== 'Ok' || !result.routes?.[0]) {
      throw new Error(`OSRM no pudo calcular la ruta (${result.code ?? 'respuesta inválida'})`);
    }
    const route = {
      distanceKm: Number((result.routes[0].distance / 1000).toFixed(2)),
      durationHours: Number((result.routes[0].duration / 3600).toFixed(2)),
      source: 'OpenStreetMap OSRM',
      isRoadDistance: true,
    };
    await this.cache?.set(cacheKey, route, 30 * 24 * 60 * 60 * 1000);
    return route;
  }
}

export default OpenStreetMapAdapter;
