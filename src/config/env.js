import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function cargarEnvDelUsuario() {
  const file = path.join(os.homedir(), '.env');
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    process.env[match[1]] = value;
  }
}

cargarEnvDelUsuario();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  openAIApiKey: process.env.OPENAI_API_KEY ?? '',
  openAIModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  openMeteoBaseUrl: process.env.OPENMETEO_BASE_URL ?? 'https://api.open-meteo.com/v1/forecast',
  powerBaseUrl: process.env.POWER_BASE_URL ?? 'https://power.larc.nasa.gov/api/temporal/hourly/point',
  gpmProductBaseUrl: process.env.GPM_PRODUCT_BASE_URL
    ?? 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHL.07',
  nasaEarthdataUsername: process.env.NASA_EARTHDATA_USERNAME ?? '',
  nasaEarthdataPassword: process.env.NASA_EARTHDATA_PASSWORD ?? '',
  nasaEarthdataToken: process.env.NASA_EARTHDATA_TOKEN ?? '',
  smnApiBaseUrl: process.env.SMN_API_BASE_URL ?? '',
  smnApiUsername: process.env.SMN_API_USERNAME ?? '',
  smnApiPassword: process.env.SMN_API_PASSWORD ?? '',
  openTopographyApiKey: process.env.OPENTOPOGRAPHY_API_KEY ?? '',
  copernicusCdsApiToken: process.env.COPERNICUS_CDS_API_TOKEN ?? '',
  era5TermsAccepted: process.env.ERA5_TERMS_ACCEPTED === '1',
  cdseUsername: process.env.CDSE_USERNAME ?? '',
  cdsePassword: process.env.CDSE_PASSWORD ?? '',
  cdseTotp: process.env.CDSE_TOTP ?? '',
  osmUserAgent: process.env.OSM_USER_AGENT ?? 'AgroFlow/1.0',
  cacheDirectory: process.env.DATA_CACHE_DIRECTORY ?? './data/cache',
};

export default env;
