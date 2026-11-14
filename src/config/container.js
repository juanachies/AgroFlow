import { env } from './env.js';
import { FileCache } from '../infrastructure/cache/fileCache.js';
import { NasaGpmImergAdapter } from '../infrastructure/clima/nasaGpmImergAdapter.js';
import { NasaPowerAdapter } from '../infrastructure/clima/nasaPowerAdapter.js';
import { NasaSmapAdapter } from '../infrastructure/clima/nasaSmapAdapter.js';
import { OpenMeteoAdapter } from '../infrastructure/clima/openMeteoAdapter.js';
import { SmnAdapter } from '../infrastructure/clima/smnAdapter.js';
import { Era5LandAdapter } from '../infrastructure/clima/era5LandAdapter.js';
import { DatosGobArAdapter } from '../infrastructure/rinde/datosGobArAdapter.js';
import { OpenStreetMapAdapter } from '../infrastructure/rutas/openStreetMapAdapter.js';
import { OpenMeteoElevationAdapter } from '../infrastructure/terreno/openMeteoElevationAdapter.js';
import { OpenTopographyAdapter } from '../infrastructure/terreno/openTopographyAdapter.js';
import { CopernicusStacAdapter } from '../infrastructure/satellite/copernicusStacAdapter.js';
import { consultarCondicionesCosecha } from '../application/usecases/consultarCondicionesCosecha.js';

const cache = new FileCache(env.cacheDirectory);
const smn = env.smnApiBaseUrl
  ? new SmnAdapter({
    baseUrl: env.smnApiBaseUrl,
    username: env.smnApiUsername,
    password: env.smnApiPassword,
    cache,
  })
  : null;

export const container = {
  env,
  cache,
  services: {
    clima: new OpenMeteoAdapter({ baseUrl: env.openMeteoBaseUrl, cache }),
    nasaPower: new NasaPowerAdapter({ baseUrl: env.powerBaseUrl, cache }),
    smap: new NasaSmapAdapter({ earthdataToken: env.nasaEarthdataToken }),
    era5Land: new Era5LandAdapter({
      apiToken: env.copernicusCdsApiToken,
      termsAccepted: env.era5TermsAccepted,
    }),
    imerg: new NasaGpmImergAdapter({
      username: env.nasaEarthdataUsername,
      password: env.nasaEarthdataPassword,
      productBaseUrl: env.gpmProductBaseUrl,
      cache,
    }),
    smn,
    rinde: new DatosGobArAdapter({ cache }),
    rutas: new OpenStreetMapAdapter({ userAgent: env.osmUserAgent, cache }),
    elevacion: new OpenMeteoElevationAdapter({ cache }),
    dem: new OpenTopographyAdapter({ apiKey: env.openTopographyApiKey }),
    sentinel: new CopernicusStacAdapter({
      username: env.cdseUsername,
      password: env.cdsePassword,
      totp: env.cdseTotp,
    }),
  },
  usecases: {
    consultarCondicionesCosecha: (params) => consultarCondicionesCosecha({
      ...params,
      adapters: container.services,
    }),
  },
};

export default container;
