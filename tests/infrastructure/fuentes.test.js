import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { consultarCondicionesCosecha } from '../../src/application/usecases/consultarCondicionesCosecha.js';
import { NasaGpmImergAdapter } from '../../src/infrastructure/clima/nasaGpmImergAdapter.js';
import { NasaPowerAdapter } from '../../src/infrastructure/clima/nasaPowerAdapter.js';
import { OpenMeteoAdapter } from '../../src/infrastructure/clima/openMeteoAdapter.js';
import { SmnAdapter } from '../../src/infrastructure/clima/smnAdapter.js';
import { Era5LandAdapter } from '../../src/infrastructure/clima/era5LandAdapter.js';
import { DatosGobArAdapter } from '../../src/infrastructure/rinde/datosGobArAdapter.js';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Open-Meteo normaliza variables horarias y conserva valores faltantes', async () => {
  let requestUrl;
  const adapter = new OpenMeteoAdapter({
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return jsonResponse({
        latitude: -32.9,
        longitude: -60.6,
        timezone: 'America/Argentina/Buenos_Aires',
        hourly_units: { precipitation: 'mm' },
        hourly: {
          time: ['2026-11-14T09:00'],
          precipitation: [null],
          precipitation_probability: [35],
        },
        daily_units: { precipitation_sum: 'mm' },
        daily: { time: ['2026-11-14'], precipitation_sum: [0] },
      });
    },
  });

  const result = await adapter.obtenerPronostico({
    latitude: -32.9,
    longitude: -60.6,
    forecastDays: 1,
  });

  assert.equal(requestUrl.searchParams.get('timezone'), 'America/Argentina/Buenos_Aires');
  assert.equal(result.observations.find((item) => item.variable === 'precipitation').quality, 'missing');
  assert.equal(result.observations.find((item) => item.variable === 'precipitation_probability').value, 35);
});

test('NASA POWER convierte los valores de relleno en datos faltantes, no en cero', async () => {
  const adapter = new NasaPowerAdapter({
    fetchImpl: async () => jsonResponse({
      header: { fill_value: -999 },
      properties: {
        parameter: {
          PRECTOTCORR: { '2026111400': 0, '2026111401': -999 },
        },
      },
    }),
  });

  const result = await adapter.obtenerHistorial({
    latitude: -32.9,
    longitude: -60.6,
    start: '2026-11-14',
    end: '2026-11-14',
    parameters: ['PRECTOTCORR'],
  });

  assert.equal(result.observations[0].value, 0);
  assert.equal(result.observations[1].value, null);
  assert.equal(result.observations[1].quality, 'missing');
});

test('datos.gob.ar calcula promedio histórico departamental en qq/ha', async () => {
  const adapter = new DatosGobArAdapter({
    fetchImpl: async () => jsonResponse({
      success: true,
      result: {
        records: [
          { anio: 2024, provincia: 'Santa Fe', departamento: 'Rosario', rendimiento_kgxha: 3000 },
          { anio: 2023, provincia: 'Santa Fe', departamento: 'Rosario', rendimiento_kgxha: 4000 },
        ],
      },
    }),
  });

  const result = await adapter.rindeHistorico({
    cultivo: 'soja',
    provincia: 'Santa Fe',
    departamento: 'Rosario',
    years: 5,
  });

  assert.equal(result.average.kgHa, 3500);
  assert.equal(result.average.qqHa, 35);
  assert.equal(result.quality, 'partial_history');
});

test('SMN solicita token y consulta el pronóstico usando los endpoints documentados', async () => {
  const urls = [];
  const adapter = new SmnAdapter({
    baseUrl: 'https://api-test.smn.gob.ar/v1',
    username: 'test-user',
    password: 'test-password',
    fetchImpl: async (url, options = {}) => {
      urls.push({ url: String(url), options });
      if (String(url).endsWith('/api-token/auth')) {
        return jsonResponse({ token: 'test-jwt' });
      }
      return jsonResponse({
        updated: '2026-11-14T10:00:00-03:00',
        forecast: [{
          date: '2026-11-14',
          morning: { rain06h: 2, rain_prob_range: [10, 40], humidity: 80, temperature: 22 },
        }],
      });
    },
  });

  const result = await adapter.obtenerPronostico({ latitude: -32.9, longitude: -60.6 });

  assert.equal(urls[0].url, 'https://api-test.smn.gob.ar/v1/api-token/auth');
  assert.match(urls[1].url, /\/forecast\/location\/coord\?/);
  assert.equal(urls[1].options.headers.Authorization, 'Bearer test-jwt');
  assert.ok(result.observations.some((item) => item.variable === 'precipitation_6h' && item.value === 2));
});

test('fuentes opcionales fallidas quedan explícitas y no bloquean el pronóstico', async () => {
  const result = await consultarCondicionesCosecha({
    lote: { latitude: -32.9, longitude: -60.6 },
    adapters: {
      openMeteo: {
        async obtenerPronostico() {
          return {
            timezone: 'America/Argentina/Buenos_Aires',
            daily: {
              time: ['2026-11-14'],
              precipitation_sum: [4],
              temperature_2m_max: [26],
            },
            hourly: {
              time: ['2026-11-14T09:00'],
              precipitation_probability: [20],
            },
          };
        },
      },
      nasaPower: {
        async obtenerHistorial() {
          throw new Error('POWER no disponible');
        },
      },
    },
    historyStartDate: '2026-11-01',
    historyEndDate: '2026-11-14',
  });

  assert.equal(result.dailyForecast[0].precipitationMm, 4);
  assert.equal(result.sourceStatus.quality, 'partial');
  assert.equal(result.sourceStatus.failed[0].source, 'NASA POWER');
});

test('fuentes protegidas exigen credenciales y aceptación de términos antes de descargar', async () => {
  const imerg = new NasaGpmImergAdapter({ username: '', password: '' });
  const era5 = new Era5LandAdapter({ apiToken: '', termsAccepted: false });

  await assert.rejects(
    imerg.lluviaEnPunto({
      latitude: -32.9,
      longitude: -60.6,
      start: '2026-11-14T00:00:00Z',
      end: '2026-11-14T01:00:00Z',
    }),
    /NASA_EARTHDATA_USERNAME/,
  );
  await assert.rejects(
    era5.descargarSeriePunto({
      latitude: -32.9,
      longitude: -60.6,
      variables: ['total_precipitation'],
    }),
    /términos/,
  );
});

test('IMERG solicita una celda de la granula correcta y convierte tasa horaria a mm/30min', async () => {
  let requestUrl;
  const adapter = new NasaGpmImergAdapter({
    username: 'earthdata-user',
    password: 'earthdata-password',
    fetchImpl: async (url) => {
      requestUrl = String(url);
      return new Response('Dataset { Float32 precipitation[time=1][lon=3600][lat=1800]; } Data:\nprecipitation[0][1194][571] = 0.6;\n');
    },
  });

  const result = await adapter.lluviaEnPunto({
    latitude: -32.95,
    longitude: -60.64,
    start: '2026-11-14T00:00:00Z',
    end: '2026-11-14T00:00:00Z',
  });

  assert.match(requestUrl, /\/2026\/318\/3B-HHR-L\.MS\.MRG\.3IMERG\.20261114-S000000-E002959\.0000\.V07B\.HDF5\.ascii/);
  assert.match(requestUrl, /precipitation\[0\]\[1194\]\[571\]/);
  assert.equal(result.observations[0].value, 0.3);
  assert.equal(result.observations[0].unit, 'mm/30min');
});

test('ERA5-Land descarga la salida del proceso asíncrono tras aceptar sus términos', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'marcianos-era5-'));
  const requests = [];
  const adapter = new Era5LandAdapter({
    apiToken: 'private-test-token',
    termsAccepted: true,
    outputDirectory: directory,
    sleep: async () => {},
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('/execution')) {
        return jsonResponse({ jobID: 'job-1', status: 'accepted' });
      }
      if (String(url).endsWith('/jobs/job-1')) {
        return jsonResponse({ jobID: 'job-1', status: 'successful' });
      }
      if (String(url).endsWith('/jobs/job-1/results')) {
        return jsonResponse({ asset: { value: { href: 'https://files.example.test/era5.csv' } } });
      }
      return new Response('time,total_precipitation\n2026-11-14T00:00:00Z,0.001\n');
    },
  });

  try {
    const result = await adapter.descargarSeriePunto({
      latitude: -32.95,
      longitude: -60.64,
      variables: ['total_precipitation'],
    });
    const requestBody = JSON.parse(requests[0].options.body);
    assert.equal(requests[0].options.headers['PRIVATE-TOKEN'], 'private-test-token');
    assert.deepEqual(requestBody.inputs.variable, ['total_precipitation']);
    assert.equal(requestBody.inputs.data_format, 'csv');
    assert.equal((await readFile(result.filePath, 'utf8')).includes('total_precipitation'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
