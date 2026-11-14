import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { container } from '../../config/container.js';

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const latitude = Number(process.env.LOT_LATITUDE);
  const longitude = Number(process.env.LOT_LONGITUDE);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Configurar LOT_LATITUDE y LOT_LONGITUDE antes de actualizar el pronóstico');
  }

  const today = localDate();
  const now = new Date();
  const locationKey = createHash('sha256')
    .update(`${latitude}:${longitude}`)
    .digest('hex')
    .slice(0, 16);
  const result = await container.usecases.consultarCondicionesCosecha({
    lote: { latitude, longitude },
    startDate: today,
    endDate: addDays(today, 15),
    historyStartDate: addDays(today, -14),
    historyEndDate: today,
    incluirIMERG: process.env.INCLUDE_IMERG === '1',
    incluirSMAP: process.env.INCLUDE_SMAP === '1',
    incluirSentinel: process.env.INCLUDE_SENTINEL === '1',
    imergStartDate: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
    imergEndDate: now.toISOString(),
  });

  const outputDirectory = path.resolve('./data/cache/harvest', locationKey);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${today}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    date: today,
    sources: result.sourceStatus,
    forecastDays: result.dailyForecast.length,
  }));
}

await main();
