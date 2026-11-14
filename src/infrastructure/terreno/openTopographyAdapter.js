import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry, validarCoordenadas } from '../http.js';

export class OpenTopographyAdapter {
  constructor({
    apiKey = process.env.OPENTOPOGRAPHY_API_KEY,
    baseUrl = 'https://portal.opentopography.org/API/globaldem',
    outputDirectory = './data/cache/topography',
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.outputDirectory = path.resolve(outputDirectory);
    this.fetchImpl = fetchImpl;
  }

  async descargarDEM({ south, north, west, east, dataset = 'SRTMGL1' }) {
    if (!this.apiKey) {
      throw new Error('OpenTopography requiere OPENTOPOGRAPHY_API_KEY');
    }
    validarCoordenadas(south, west);
    validarCoordenadas(north, east);
    if (Number(south) >= Number(north) || Number(west) >= Number(east)) {
      throw new TypeError('El bbox DEM debe cumplir south < north y west < east');
    }

    const params = new URLSearchParams({
      demtype: dataset,
      south: String(south),
      north: String(north),
      west: String(west),
      east: String(east),
      outputFormat: 'GTiff',
      API_Key: this.apiKey,
    });
    const response = await fetchWithRetry(`${this.baseUrl}?${params}`, {}, {
      fetchImpl: this.fetchImpl,
      timeoutMs: 60_000,
      retries: 1,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = Buffer.from(await response.arrayBuffer());
    if (!contentType.includes('image/tiff') && !contentType.includes('application/octet-stream')) {
      throw new TypeError(`OpenTopography devolvió ${contentType || 'un tipo desconocido'}, no GeoTIFF`);
    }

    const digest = createHash('sha256')
      .update(`${dataset}:${south}:${north}:${west}:${east}`)
      .digest('hex')
      .slice(0, 20);
    await mkdir(this.outputDirectory, { recursive: true });
    const filePath = path.join(this.outputDirectory, `dem-${digest}.tif`);
    await writeFile(filePath, data);

    return {
      filePath,
      bytes: data.byteLength,
      format: 'GeoTIFF',
      dataset,
      bounds: { south: Number(south), north: Number(north), west: Number(west), east: Number(east) },
      source: 'OpenTopography Global Datasets API',
      downloadedAt: new Date().toISOString(),
      parsed: false,
      warning: 'El raster se descarga para análisis GIS; esta implementación no calcula pendiente ni depresiones.',
    };
  }
}

export default OpenTopographyAdapter;
