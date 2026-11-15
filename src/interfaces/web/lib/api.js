// Cliente de la API HTTP de AgroFlow (src/interfaces/http). Ver docs/API.md.
// En desarrollo Vite reenvía /api al servidor (npm run dev:api). En producción, si el front
// se despliega aparte, definir VITE_AGROFLOW_API con la URL base de la API.

const BASE = (import.meta.env?.VITE_AGROFLOW_API ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('No se pudo conectar con la API de AgroFlow. ¿Está corriendo `npm run dev:api`?', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? `Error ${response.status}`, response.status);
  return data;
}

const query = (params) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  salud: (opts) => request('/api/salud', opts),
  ejemplo: (opts) => request('/api/ejemplo', opts),
  simular: (entrada) => request('/api/simular', { method: 'POST', body: entrada }),
  confirmarReservas: (simulacionId, loteId) => request('/api/reservas', { method: 'POST', body: { simulacionId, loteId } }),
  reservas: (params = {}) => request(`/api/reservas${query(params)}`),
  ofertas: (params = {}) => request(`/api/ofertas${query(params)}`),
  publicarOferta: (oferta) => request('/api/ofertas', { method: 'POST', body: oferta }),
  saturacion: (params) => request(`/api/saturacion${query(params)}`),
};

/** Arma la entrada de POST /api/simular a partir de un lote del navegador. */
export function entradaDesdeLote(lot, ejemplo, overrides = {}) {
  return {
    ...ejemplo,
    lote: { id: lot.id, lat: lot.latitude, lon: lot.longitude },
    ha: Math.round(lot.areaHa * 100) / 100,
    cultivo: lot.crop,
    fechaSiembra: lot.sowingDate,
    fechaInicioCosecha: undefined,
    ...overrides,
  };
}
