const PHOTON_URL = 'https://photon.komoot.io/api/';
const CACHE_LIMIT = 100;
const REQUEST_GAP_MS = 1100;
const cache = new Map();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

async function waitForRequestSlot() {
  const previous = requestQueue;
  let release;
  requestQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  const delay = nextRequestAt - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  nextRequestAt = Date.now() + REQUEST_GAP_MS;
  release();
}

export async function searchArgentineCities(query, fetchImpl = fetch) {
  const normalized = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  if (normalized.length < 2) throw new TypeError('Ingresá una ciudad o localidad.');
  if (normalized.length > 100) throw new TypeError('La búsqueda supera los 100 caracteres.');

  const cacheKey = normalized.toLocaleLowerCase('es-AR');
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  await waitForRequestSlot();
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', `${normalized}, Argentina`);
  url.searchParams.set('lang', 'es');
  url.searchParams.set('limit', '5');

  const response = await fetchImpl(url, { headers: { accept: 'application/geo+json, application/json' } });
  if (!response.ok) throw new Error('No se pudo buscar esa ciudad en el mapa. Probá de nuevo.');
  const data = await response.json();
  const places = (Array.isArray(data.features) ? data.features : [])
    .filter((feature) => feature.properties?.country?.toLocaleLowerCase('es-AR') === 'argentina')
    .filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      return Array.isArray(coordinates)
        && Number.isFinite(coordinates[0])
        && Number.isFinite(coordinates[1])
        && Math.abs(coordinates[0]) <= 180
        && Math.abs(coordinates[1]) <= 90;
    })
    .map((feature) => {
      const properties = feature.properties;
      const city = properties.city ?? properties.town ?? properties.village ?? properties.name;
      const context = [properties.state, properties.country].filter(Boolean).join(', ');
      return {
        city: city || normalized,
        label: [properties.name ?? city, context].filter(Boolean).join(' · '),
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
      };
    });

  if (!places.length) throw new Error('No encontramos esa localidad en Argentina. Probá con ciudad y provincia.');
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, places);
  return places;
}
