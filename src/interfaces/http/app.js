// API HTTP de AgroFlow (adaptador de entrada). Solo llama casos de uso del contenedor.
//
//   GET  /api/salud                 estado y fuentes
//   GET  /api/ejemplo               entrada de ejemplo para POST /api/simular
//   POST /api/simular               plan + saturación del puerto + marketplace → { simulacionId, ... }
//   POST /api/reservas              confirma una simulación: { simulacionId, loteId? }
//   GET  /api/reservas              ?desde&hasta&puerto
//   GET  /api/ofertas               ?desde&hasta&recurso
//   POST /api/ofertas               alta de un proveedor
//   GET  /api/saturacion            ?puerto&cultivo&hoy[&camionesPublicadosDia]
// Cualquier otra ruta GET se sirve desde src/interfaces/web si el front está ahí.

import { randomUUID } from 'node:crypto';
import { ErrorHttp, exigirFecha, fechaParam, leerJson, responder, responderError } from './validacion.js';

export const ENTRADA_EJEMPLO = {
  lote: { id: 'lote-pergamino', lat: -33.95, lon: -60.6 },
  hoy: '2027-03-20',
  ha: 1200,
  qqHa: 38,
  cultivo: 'soja',
  diasDisponibles: 12,
  urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
  servicios: ['transporte', 'almacenaje'],
  destinos: [
    { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 300 },
    { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 35, costoAdicionalUsdPorT: 6, precioUsdPorT: 303 },
    { nombre: 'Puerto Gran Rosario', tipo: 'puerto', terminal: 'Puerto Gran Rosario', distanciaKm: 230, precioUsdPorT: 335 },
  ],
};

function cors(origen) {
  return {
    'access-control-allow-origin': origen,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
  };
}

/**
 * @param {{ contenedor: object, servirEstatico?: Function|null, origenCors?: string, maxSimulaciones?: number, version?: string }} opciones
 */
export function crearApi({ contenedor, servirEstatico = null, origenCors = '*', maxSimulaciones = 500, version = '0.1.0' }) {
  const { simularPlan, confirmarReservas, consultarSaturacion, marketplace } = contenedor;
  const simulaciones = new Map();
  const encabezados = cors(origenCors);

  const guardar = (resultado) => {
    const id = randomUUID();
    simulaciones.set(id, resultado);
    if (simulaciones.size > maxSimulaciones) simulaciones.delete(simulaciones.keys().next().value);
    return id;
  };

  const rutas = {
    'GET /api/salud': async () => [200, {
      ok: true,
      servicio: 'AgroFlow API',
      version,
      marketplace: marketplace?.origen ?? null,
      simulacionesGuardadas: simulaciones.size,
    }],

    'GET /api/ejemplo': async () => [200, ENTRADA_EJEMPLO],

    'POST /api/simular': async (req) => {
      const entrada = await leerJson(req);
      if (entrada.hoy) exigirFecha(entrada.hoy, 'hoy');
      const resultado = await simularPlan(entrada);
      return [200, { simulacionId: guardar(resultado), ...resultado }];
    },

    'POST /api/reservas': async (req) => {
      const { simulacionId, loteId } = await leerJson(req);
      if (!simulacionId) throw new ErrorHttp(400, 'falta simulacionId (lo devuelve POST /api/simular)');
      const simulacion = simulaciones.get(simulacionId);
      if (!simulacion) throw new ErrorHttp(404, 'simulación inexistente o vencida: volvé a simular');
      const reservas = await confirmarReservas({ simulacion, loteId: loteId ?? simulacion.lote?.id });
      simulaciones.delete(simulacionId);
      return [201, { reservas }];
    },

    'GET /api/reservas': async (_req, url) => {
      const desde = fechaParam(url, 'desde');
      const hasta = fechaParam(url, 'hasta');
      const reservas = await marketplace.reservas({ desde, hasta, puerto: url.searchParams.get('puerto') ?? undefined });
      return [200, { reservas }];
    },

    'GET /api/ofertas': async (_req, url) => {
      const ofertas = await marketplace.ofertas({
        desde: fechaParam(url, 'desde'),
        hasta: fechaParam(url, 'hasta'),
        recurso: url.searchParams.get('recurso') ?? undefined,
      });
      return [200, { ofertas }];
    },

    'POST /api/ofertas': async (req) => {
      if (!marketplace.publicar) throw new ErrorHttp(501, 'el marketplace configurado no admite altas');
      const oferta = await marketplace.publicar(await leerJson(req));
      return [201, { oferta }];
    },

    'GET /api/saturacion': async (_req, url) => {
      const camiones = url.searchParams.get('camionesPublicadosDia');
      const pronostico = await consultarSaturacion({
        puerto: url.searchParams.get('puerto') ?? 'gran-rosario',
        cultivo: url.searchParams.get('cultivo') ?? 'soja',
        hoy: fechaParam(url, 'hoy', { requerido: true }),
        camionesPublicadosDia: camiones == null ? null : Number(camiones),
      });
      return [200, pronostico];
    },
  };

  return async function manejar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, encabezados);
        return res.end();
      }
      const ruta = rutas[`${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`];
      if (ruta) {
        const [estado, cuerpo] = await ruta(req, url);
        return responder(res, estado, cuerpo, encabezados);
      }
      if (url.pathname.startsWith('/api/')) {
        const existe = Object.keys(rutas).some((r) => r.endsWith(` ${url.pathname.replace(/\/$/, '')}`));
        throw new ErrorHttp(existe ? 405 : 404, existe ? 'método no permitido' : 'ruta inexistente');
      }
      if (req.method === 'GET' && servirEstatico && (await servirEstatico(url.pathname, res))) return undefined;
      throw new ErrorHttp(404, 'ruta inexistente');
    } catch (error) {
      if (res.headersSent) return res.end();
      for (const [k, v] of Object.entries(encabezados)) res.setHeader(k, v);
      return responderError(res, error);
    }
  };
}
