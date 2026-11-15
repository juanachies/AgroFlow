// Servidor HTTP de AgroFlow:  npm start   (PORT, HOST y CORS_ORIGIN por entorno)
//
// Arma el contenedor con:
//   - barcos simulados (o NABSA / CSV si se configuran en el contenedor),
//   - marketplace en memoria con las ofertas de ejemplo y, salvo AGROFLOW_MERCADO_DEMO=0, reservas
//     simuladas del resto del mercado con un pico en Gran Rosario a mediados de abril de 2027,
//   - precios de data/precios-ejemplo.json.
// Si existe src/interfaces/web, se sirve como front en la misma URL.

import http from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearContenedor } from '../../config/container.js';
import { crearBarcosSimuladosAdapter } from '../../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearMarketplaceMemoriaAdapter, simularReservasMercado } from '../../infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearPreciosManualAdapter } from '../../infrastructure/precios/preciosManualAdapter.js';
import { crearApi } from './app.js';
import { crearServidorEstatico } from './estatico.js';

// El front es React (JSX): se sirve el build de Vite (npm run build → dist/). Sin build, la fuente.
const RAIZ_DIST = fileURLToPath(new URL('../../../dist/', import.meta.url));
const RAIZ_WEB = existsSync(`${RAIZ_DIST}index.html`) ? RAIZ_DIST : fileURLToPath(new URL('../web/', import.meta.url));
const RUTA_PRECIOS = fileURLToPath(new URL('../../../data/precios-ejemplo.json', import.meta.url));

export function armarContenedor({ mercadoDemo = true } = {}) {
  const reservas = mercadoDemo
    ? simularReservasMercado({ puerto: 'gran-rosario', desde: '2027-03-01', dias: 90, camionesBaseDia: 3800, picos: [{ fecha: '2027-04-14', camionesDia: 7200, ancho: 5 }] })
    : [];
  return crearContenedor({
    marketplace: crearMarketplaceMemoriaAdapter({ reservas }),
    barcos: crearBarcosSimuladosAdapter({ semilla: 7 }),
    precios: crearPreciosManualAdapter({ ruta: RUTA_PRECIOS }),
  });
}

export function crearServidor({ contenedor = armarContenedor(), origenCors = '*', conFront = true } = {}) {
  const servirEstatico = conFront && existsSync(RAIZ_WEB) ? crearServidorEstatico(RAIZ_WEB) : null;
  return http.createServer(crearApi({ contenedor, servirEstatico, origenCors }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const puerto = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const servidor = crearServidor({
    contenedor: armarContenedor({ mercadoDemo: process.env.AGROFLOW_MERCADO_DEMO !== '0' }),
    origenCors: process.env.CORS_ORIGIN ?? '*',
  });
  servidor.listen(puerto, host, () => {
    console.log(`AgroFlow API escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${puerto}  (GET /api/salud)`);
  });
  const cerrar = () => servidor.close(() => process.exit(0));
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}
