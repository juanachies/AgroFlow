import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchJson, fetchWithRetry, validarCoordenadas } from '../http.js';

const CMR_URL = 'https://cmr.earthdata.nasa.gov/search/granules.json';

function isEarthdataUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname.endsWith('.nasa.gov') || hostname.endsWith('.nsidc.org');
}

export class NasaSmapAdapter {
  constructor({
    earthdataToken = process.env.NASA_EARTHDATA_TOKEN,
    collection = 'SPL4SMGP',
    version = '008',
    outputDirectory = './data/cache/smap',
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.earthdataToken = earthdataToken;
    this.collection = collection;
    this.version = version;
    this.outputDirectory = path.resolve(outputDirectory);
    this.fetchImpl = fetchImpl;
  }

  async buscarGranulos({ latitude, longitude, start, end, radiusDegrees = 0.1, limit = 20 }) {
    validarCoordenadas(latitude, longitude);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('limit debe estar entre 1 y 100');
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      throw new TypeError('start/end deben ser fechas válidas y start no puede superar end');
    }
    const params = new URLSearchParams({
      short_name: this.collection,
      version: this.version,
      bounding_box: [
        Number(longitude) - radiusDegrees,
        Number(latitude) - radiusDegrees,
        Number(longitude) + radiusDegrees,
        Number(latitude) + radiusDegrees,
      ].join(','),
      temporal: `${startDate.toISOString()},${endDate.toISOString()}`,
      page_size: String(limit),
    });
    const payload = await fetchJson(`${CMR_URL}?${params}`, {}, { fetchImpl: this.fetchImpl });
    const granules = payload.feed?.entry;
    if (!Array.isArray(granules)) {
      throw new TypeError('NASA CMR respondió en un formato no reconocido');
    }

    return {
      source: 'NASA SMAP L4 Global 3-hourly 9 km (SPL4SMGP)',
      queriedAt: new Date().toISOString(),
      productVersion: this.version,
      spatialResolutionKm: 9,
      granules: granules.map((granule) => ({
        id: granule.id,
        title: granule.title,
        timeStart: granule.time_start,
        timeEnd: granule.time_end,
        links: (granule.links ?? [])
          .filter((link) => link.href && /data/i.test(`${link.rel} ${link.title ?? ''}`))
          .map((link) => ({ href: link.href, rel: link.rel, title: link.title ?? null })),
      })),
      downloaded: false,
      warning: 'CMR ofrece descubrimiento de granulos; los valores del archivo HDF5 aún requieren procesamiento raster.',
    };
  }

  async descargarGranulo(url) {
    if (!this.earthdataToken) {
      throw new Error('Descargar SMAP requiere NASA_EARTHDATA_TOKEN; el token no debe exponerse al frontend');
    }
    if (!isEarthdataUrl(url)) {
      throw new TypeError('La URL de descarga no pertenece a un dominio de datos NASA/NSIDC');
    }
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${this.earthdataToken}` },
      redirect: 'follow',
    }, { fetchImpl: this.fetchImpl, timeoutMs: 60_000, retries: 1 });
    const data = Buffer.from(await response.arrayBuffer());
    const filename = path.basename(new URL(url).pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename || filename === '.' || filename === '..') {
      throw new TypeError('NASA CMR proporcionó un nombre de archivo no válido');
    }
    await mkdir(this.outputDirectory, { recursive: true });
    const filePath = path.join(this.outputDirectory, filename);
    await writeFile(filePath, data);
    return {
      filePath,
      bytes: data.byteLength,
      source: 'NASA SMAP',
      downloadedAt: new Date().toISOString(),
      parsed: false,
    };
  }
}

export default NasaSmapAdapter;
