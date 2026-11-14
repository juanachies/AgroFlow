import { fetchJson } from '../http.js';

const CKAN_BASE_URL = 'https://datos.gob.ar/api/3/action';
const RESOURCE_ID = '2f3d94e1-9e58-5e51-a25d-d6c2bbc697fe';

const CROP_ALIASES = {
  soja: ['soja'],
  maiz: ['maiz', 'maíz'],
  trigo: ['trigo', 'trigo pan'],
};

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export class DatosGobArAdapter {
  constructor({
    baseUrl = CKAN_BASE_URL,
    resourceId = RESOURCE_ID,
    fetchImpl = globalThis.fetch,
    cache = null,
    cacheTtlMs = 7 * 24 * 60 * 60 * 1000,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.resourceId = resourceId;
    this.fetchImpl = fetchImpl;
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
  }

  async rindeHistorico({ cultivo, provincia, departamento, years = 5 }) {
    if (!cultivo || !provincia || !departamento) {
      throw new TypeError('cultivo, provincia y departamento son obligatorios');
    }
    if (!Number.isInteger(years) || years < 1 || years > 20) {
      throw new RangeError('years debe ser un entero entre 1 y 20');
    }

    const cacheKey = `datos-gob-ar:yields:${normalizeText(cultivo)}:${normalizeText(provincia)}:${normalizeText(departamento)}:${years}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) return cached;

    const cropKey = normalizeText(cultivo);
    const cropNames = CROP_ALIASES[cropKey] ?? [cropKey];
    let records = [];
    for (const crop of cropNames) {
      const filters = JSON.stringify({ cultivo: crop, provincia, departamento });
      const params = new URLSearchParams({
        resource_id: this.resourceId,
        filters,
        sort: 'anio desc',
        limit: '100',
      });
      const payload = await fetchJson(`${this.baseUrl}/datastore_search?${params}`, {}, {
        fetchImpl: this.fetchImpl,
      });
      if (!payload.success) {
        throw new Error('datos.gob.ar rechazó la consulta de rendimientos');
      }
      records = payload.result.records ?? [];
      if (records.length > 0) break;
    }

    if (records.length === 0) {
      throw new Error(`No hay rendimientos para ${cultivo}, ${departamento}, ${provincia}`);
    }

    const matching = records
      .filter((record) => normalizeText(record.provincia) === normalizeText(provincia)
        && normalizeText(record.departamento) === normalizeText(departamento))
      .sort((a, b) => Number(b.anio) - Number(a.anio));
    const latestByYear = new Map();
    for (const record of matching) {
      const year = Number(record.anio);
      const yieldKgHa = Number(record.rendimiento_kgxha);
      if (Number.isInteger(year) && Number.isFinite(yieldKgHa) && yieldKgHa > 0 && !latestByYear.has(year)) {
        latestByYear.set(year, yieldKgHa);
      }
      if (latestByYear.size >= years) break;
    }
    const selected = [...latestByYear.entries()].map(([year, kgHa]) => ({ year, kgHa }));
    if (selected.length === 0) {
      throw new Error('El dataset no devolvió rindes válidos en kg/ha');
    }

    const averageKgHa = selected.reduce((total, item) => total + item.kgHa, 0) / selected.length;
    const result = {
      cultivo,
      provincia,
      departamento,
      source: 'datos.gob.ar / Secretaría de Agricultura, Estimaciones Agrícolas',
      resourceId: this.resourceId,
      yearsRequested: years,
      yearsUsed: selected.map((item) => item.year),
      observations: selected,
      average: {
        kgHa: Number(averageKgHa.toFixed(2)),
        qqHa: Number((averageKgHa / 100).toFixed(2)),
        tonHa: Number((averageKgHa / 1000).toFixed(3)),
      },
      queriedAt: new Date().toISOString(),
      quality: selected.length < years ? 'partial_history' : 'valid',
      warning: 'Rinde histórico departamental; no es una medición ni una predicción específica del lote.',
    };
    await this.cache?.set(cacheKey, result, this.cacheTtlMs);
    return result;
  }
}

export default DatosGobArAdapter;
