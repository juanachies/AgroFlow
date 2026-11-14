import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchJson, fetchWithRetry } from '../http.js';

const STAC_SEARCH_URL = 'https://catalogue.dataspace.copernicus.eu/stac/search';
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';

function isCopernicusDownloadUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === 'download.dataspace.copernicus.eu'
    || hostname.endsWith('.dataspace.copernicus.eu');
}

export class CopernicusStacAdapter {
  constructor({
    username = process.env.CDSE_USERNAME,
    password = process.env.CDSE_PASSWORD,
    totp = process.env.CDSE_TOTP,
    fetchImpl = globalThis.fetch,
    outputDirectory = './data/cache/sentinel',
  } = {}) {
    this.username = username;
    this.password = password;
    this.totp = totp;
    this.fetchImpl = fetchImpl;
    this.outputDirectory = path.resolve(outputDirectory);
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  async buscarProductos({
    collection,
    bbox,
    start,
    end,
    limit = 20,
  }) {
    if (!['sentinel-1-grd', 'sentinel-2-l2a'].includes(collection)) {
      throw new TypeError('collection debe ser sentinel-1-grd o sentinel-2-l2a');
    }
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) {
      throw new TypeError('bbox debe ser [west, south, east, north]');
    }
    if (Number(bbox[0]) >= Number(bbox[2]) || Number(bbox[1]) >= Number(bbox[3])) {
      throw new TypeError('bbox inválido: west < east y south < north son requeridos');
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      throw new TypeError('start/end deben ser fechas válidas y start no puede superar end');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('limit debe estar entre 1 y 100');
    }

    const payload = await fetchJson(STAC_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: [collection],
        bbox: bbox.map(Number),
        datetime: `${startDate.toISOString()}/${endDate.toISOString()}`,
        limit,
      }),
    }, { fetchImpl: this.fetchImpl });
    if (!Array.isArray(payload.features)) {
      throw new TypeError('Copernicus STAC respondió sin features');
    }
    return {
      source: 'Copernicus Data Space STAC',
      collection,
      queriedAt: new Date().toISOString(),
      products: payload.features.map((feature) => ({
        id: feature.id,
        datetime: feature.properties?.datetime ?? null,
        bbox: feature.bbox ?? null,
        cloudCover: feature.properties?.['eo:cloud_cover'] ?? null,
        assets: Object.fromEntries(Object.entries(feature.assets ?? {}).map(([name, asset]) => [
          name,
          {
            href: asset.alternate?.https?.href ?? asset.href,
            type: asset.type ?? null,
            roles: asset.roles ?? [],
          },
        ])),
      })),
      next: payload.links?.find((link) => link.rel === 'next')?.href ?? null,
      warning: collection === 'sentinel-1-grd'
        ? 'La retrodispersión SAR no es una medición directa de humedad ni de transitabilidad.'
        : 'Los índices de vegetación requieren procesamiento de las bandas y no miden humedad del suelo.',
    };
  }

  async obtenerToken() {
    if (this.accessToken && this.tokenExpiresAt > Date.now()) return this.accessToken;
    if (!this.username || !this.password) {
      throw new Error('Descargar activos Sentinel requiere CDSE_USERNAME y CDSE_PASSWORD');
    }
    const form = new URLSearchParams({
      grant_type: 'password',
      client_id: 'cdse-public',
      username: this.username,
      password: this.password,
    });
    if (this.totp) form.set('totp', this.totp);
    const result = await fetchJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }, { fetchImpl: this.fetchImpl });
    if (!result.access_token || !Number.isFinite(Number(result.expires_in))) {
      throw new TypeError('Copernicus Data Space no devolvió un token válido');
    }
    this.accessToken = result.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000;
    return this.accessToken;
  }

  async descargarActivo({ url, filename }) {
    if (!isCopernicusDownloadUrl(url)) {
      throw new TypeError('La URL de descarga no pertenece al dominio de Copernicus Data Space');
    }
    const token = await this.obtenerToken();
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    }, { fetchImpl: this.fetchImpl, timeoutMs: 60_000, retries: 1 });
    const data = Buffer.from(await response.arrayBuffer());
    const safeName = path.basename(filename ?? new URL(url).pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new TypeError('El activo no tiene un nombre de archivo válido');
    }
    await mkdir(this.outputDirectory, { recursive: true });
    const filePath = path.join(this.outputDirectory, safeName);
    await writeFile(filePath, data);
    return {
      filePath,
      bytes: data.byteLength,
      source: 'Copernicus Data Space',
      downloadedAt: new Date().toISOString(),
      parsed: false,
    };
  }
}

export default CopernicusStacAdapter;
