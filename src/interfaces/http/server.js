// Servidor HTTP de AgroFlow:  npm start
//
// Variables de entorno (todas opcionales; también se leen de ~/.env):
//   PORT, HOST, CORS_ORIGIN
//   OPENAI_API_KEY, OPENAI_MODEL     IA para explicar; sin key se usa la plantilla
//   AGROFLOW_FUENTES_EXTERNAS=0      apaga pronóstico (Open-Meteo) y rutas (OSRM) en el simulador
//   AGROFLOW_MERCADO_DEMO=0          sin reservas simuladas del resto del mercado
//   AGROFLOW_PRECIOS                 JSON de precios (pizarra + futuros); por defecto data/precios-ejemplo.json
//   AGROFLOW_LINEUP                  line-up real: texto del PDF de NABSA (.txt) o CSV manual (.csv)
//   AGROFLOW_MAGYP                   tabla oficial "Barcos anunciados" de MAGyP (TSV/CSV)
//   AGROFLOW_MERCADO                 JSON con { programadas?, camiones? } (BCR / MAGyP del día)
//
// Si existe dist/ (front compilado con `npm run build`), se sirve en la misma URL.

import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearContenedor } from '../../config/container.js';
import { crearBarcosSimuladosAdapter } from '../../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearMarketplaceMemoriaAdapter, simularReservasMercado } from '../../infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearPreciosManualAdapter } from '../../infrastructure/precios/preciosManualAdapter.js';
import { crearSilobolsasMemoriaAdapter } from '../../infrastructure/silobolsas/silobolsasMemoriaAdapter.js';
import { crearLecturasMemoriaAdapter } from '../../infrastructure/iot/lecturasMemoriaAdapter.js';
import { crearApi } from './app.js';
import { crearServidorEstatico } from './estatico.js';

const RAIZ = new URL('../../../', import.meta.url);
const DIST = fileURLToPath(new URL('dist/', RAIZ));
const RUTA_PRECIOS_EJEMPLO = fileURLToPath(new URL('data/precios-ejemplo.json', RAIZ));

/**
 * @param {{ mercadoDemo?: boolean, fuentesExternas?: boolean, explicador?: object|null|undefined,
 *           rutaPrecios?: string, rutaLineup?: string|null, rutaMagyp?: string|null, rutaMercado?: string|null }} opciones
 *   explicador: undefined = OpenAI si hay key; null = solo plantilla.
 */
export function armarContenedor({
  mercadoDemo = true,
  fuentesExternas = false,
  explicador = undefined,
  rutaPrecios = RUTA_PRECIOS_EJEMPLO,
  rutaLineup = null,
  rutaMagyp = null,
  rutaMercado = null,
} = {}) {
  const reservas = mercadoDemo
    ? simularReservasMercado({ puerto: 'gran-rosario', desde: '2027-03-01', dias: 90, camionesBaseDia: 3800, picos: [{ fecha: '2027-04-14', camionesDia: 7200, ancho: 5 }] })
    : [];
  const barcos = rutaLineup ? (rutaLineup.endsWith('.csv') ? 'manual' : 'nabsa') : crearBarcosSimuladosAdapter({ semilla: 7 });
  return crearContenedor({
    marketplace: crearMarketplaceMemoriaAdapter({ reservas }),
    barcos,
    rutaLineup,
    rutaMagyp,
    mercado: rutaMercado ? JSON.parse(readFileSync(rutaMercado, 'utf8')) : null,
    precios: crearPreciosManualAdapter({ ruta: rutaPrecios }),
    silobolsas: crearSilobolsasMemoriaAdapter(),
    lecturasIot: crearLecturasMemoriaAdapter(),
    fuentesExternas,
    ...(explicador === undefined ? {} : { explicador }),
  });
}

export function crearServidor({ contenedor = armarContenedor(), origenCors = '*', conFront = true } = {}) {
  const servirEstatico = conFront && existsSync(`${DIST}index.html`) ? crearServidorEstatico(DIST) : null;
  return http.createServer(crearApi({ contenedor, servirEstatico, origenCors }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const e = process.env;
  const puerto = Number(e.PORT ?? 3000);
  const host = e.HOST ?? '0.0.0.0';
  const contenedor = armarContenedor({
    mercadoDemo: e.AGROFLOW_MERCADO_DEMO !== '0',
    fuentesExternas: e.AGROFLOW_FUENTES_EXTERNAS !== '0',
    rutaPrecios: e.AGROFLOW_PRECIOS ?? RUTA_PRECIOS_EJEMPLO,
    rutaLineup: e.AGROFLOW_LINEUP ?? null,
    rutaMagyp: e.AGROFLOW_MAGYP ?? null,
    rutaMercado: e.AGROFLOW_MERCADO ?? null,
  });
  const servidor = crearServidor({ contenedor, origenCors: e.CORS_ORIGIN ?? '*' });
  servidor.listen(puerto, host, () => {
    const front = existsSync(`${DIST}index.html`) ? ' + front (dist/)' : '';
    console.log(`AgroFlow API${front} en http://${host === '0.0.0.0' ? 'localhost' : host}:${puerto} · IA: ${contenedor.explicador?.origen ?? 'plantilla'}`);
  });
  const cerrar = () => servidor.close(() => process.exit(0));
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}
