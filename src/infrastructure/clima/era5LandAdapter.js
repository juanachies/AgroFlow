import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchJson, fetchWithRetry, validarCoordenadas } from '../http.js';

const API_BASE_URL = 'https://cds.climate.copernicus.eu/api/retrieve/v1';
const PROCESS_ID = 'reanalysis-era5-land-timeseries';
const ALLOWED_VARIABLES = new Set([
  '10m_u_component_of_wind',
  '10m_v_component_of_wind',
  '2m_dewpoint_temperature',
  '2m_temperature',
  'skin_temperature',
  'snow_cover',
  'snow_depth',
  'snowfall',
  'soil_temperature_level_1',
  'soil_temperature_level_2',
  'soil_temperature_level_3',
  'soil_temperature_level_4',
  'surface_pressure',
  'surface_solar_radiation_downwards',
  'surface_thermal_radiation_downwards',
  'total_precipitation',
  'volumetric_soil_water_level_1',
  'volumetric_soil_water_level_2',
  'volumetric_soil_water_level_3',
  'volumetric_soil_water_level_4',
]);

function findDownloadUrl(result) {
  if (Array.isArray(result)) {
    for (const item of result) {
      try {
        return findDownloadUrl(item);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
  } else if (result && typeof result === 'object') {
    if (typeof result.href === 'string') return result.href;
    if (result.value && typeof result.value === 'object') {
      try {
        return findDownloadUrl(result.value);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    for (const key of ['asset', 'data', 'output', 'download']) {
      if (key in result) {
        try {
          return findDownloadUrl(result[key]);
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
    }
    for (const [key, value] of Object.entries(result)) {
      if (['asset', 'data', 'output', 'download', 'value'].includes(key)) continue;
      try {
        return findDownloadUrl(value);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
  }
  throw new TypeError('Copernicus CDS no devolvió un enlace de descarga en los resultados del trabajo');
}

export class Era5LandAdapter {
  constructor({
    apiToken = process.env.COPERNICUS_CDS_API_TOKEN,
    termsAccepted = process.env.ERA5_TERMS_ACCEPTED === '1',
    baseUrl = API_BASE_URL,
    outputDirectory = './data/cache/era5-land',
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pollIntervalMs = 5_000,
    maxWaitMs = 10 * 60 * 1000,
  } = {}) {
    this.apiToken = apiToken;
    this.termsAccepted = termsAccepted;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.outputDirectory = path.resolve(outputDirectory);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.pollIntervalMs = pollIntervalMs;
    this.maxWaitMs = maxWaitMs;
  }

  async descargarSeriePunto({ latitude, longitude, variables, areaDegrees = 0.05 }) {
    validarCoordenadas(latitude, longitude);
    if (!this.termsAccepted) {
      throw new Error('Antes de usar ERA5-Land hay que aceptar manualmente sus términos y configurar ERA5_TERMS_ACCEPTED=1');
    }
    if (!this.apiToken) {
      throw new Error('ERA5-Land requiere COPERNICUS_CDS_API_TOKEN');
    }
    if (!Array.isArray(variables) || variables.length === 0
      || variables.some((variable) => !ALLOWED_VARIABLES.has(variable))) {
      throw new TypeError('variables debe contener nombres admitidos por ERA5-Land timeseries');
    }
    if (!Number.isFinite(areaDegrees) || areaDegrees <= 0 || areaDegrees > 0.5) {
      throw new RangeError('areaDegrees debe ser mayor que 0 y no superar 0.5 grados');
    }

    const north = Math.min(90, Number(latitude) + areaDegrees);
    const south = Math.max(-90, Number(latitude) - areaDegrees);
    const west = Math.max(-180, Number(longitude) - areaDegrees);
    const east = Math.min(180, Number(longitude) + areaDegrees);
    const requestBody = {
      inputs: {
        variable: variables,
        data_format: 'csv',
        area: [north, west, south, east],
      },
    };
    const headers = {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': this.apiToken,
    };

    const submitted = await fetchJson(`${this.baseUrl}/processes/${PROCESS_ID}/execution`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    }, { fetchImpl: this.fetchImpl, timeoutMs: 30_000 });
    if (!submitted.jobID) {
      throw new TypeError('Copernicus CDS no devolvió jobID al solicitar ERA5-Land');
    }

    const deadline = Date.now() + this.maxWaitMs;
    let job = submitted;
    while (!['successful', 'failed', 'rejected', 'dismissed'].includes(job.status)) {
      if (Date.now() >= deadline) {
        throw new Error(`El trabajo ERA5-Land ${submitted.jobID} superó el tiempo máximo de espera`);
      }
      await this.sleep(this.pollIntervalMs);
      job = await fetchJson(`${this.baseUrl}/jobs/${encodeURIComponent(submitted.jobID)}`, {
        headers,
      }, { fetchImpl: this.fetchImpl });
    }
    if (job.status !== 'successful') {
      throw new Error(`El trabajo ERA5-Land ${submitted.jobID} terminó con estado ${job.status}: ${job.message ?? 'sin detalle'}`);
    }

    const results = await fetchJson(`${this.baseUrl}/jobs/${encodeURIComponent(submitted.jobID)}/results`, {
      headers,
    }, { fetchImpl: this.fetchImpl });
    const downloadUrl = findDownloadUrl(results);
    if (new URL(downloadUrl).protocol !== 'https:') {
      throw new TypeError('Copernicus CDS devolvió un enlace de descarga no HTTPS');
    }
    const response = await fetchWithRetry(downloadUrl, {}, {
      fetchImpl: this.fetchImpl,
      timeoutMs: 60_000,
      retries: 1,
    });
    const data = Buffer.from(await response.arrayBuffer());
    const key = createHash('sha256')
      .update(`${latitude}:${longitude}:${variables.join(',')}`)
      .digest('hex')
      .slice(0, 20);
    await mkdir(this.outputDirectory, { recursive: true });
    const filePath = path.join(this.outputDirectory, `era5-land-${key}.csv`);
    await writeFile(filePath, data);

    return {
      filePath,
      bytes: data.byteLength,
      source: 'Copernicus ERA5-Land timeseries',
      dataset: PROCESS_ID,
      variables,
      coordinates: { latitude: Number(latitude), longitude: Number(longitude) },
      area: [north, west, south, east],
      jobId: submitted.jobID,
      downloadedAt: new Date().toISOString(),
      parsed: false,
      warning: 'ERA5-Land es reanálisis regional, no medición del lote. Este archivo CSV requiere posterior ingesta y filtrado temporal.',
    };
  }
}

export default Era5LandAdapter;
