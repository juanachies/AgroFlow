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
//   POST /api/explicar              { simulacionId, pregunta? }: explicación en lenguaje de productor (IA o plantilla)
//   POST /api/escenario             { simulacionId, escenario: { tipo, valor }, pregunta? }: "¿y si…?"
//   GET  /api/escenarios            tipos de escenario disponibles
//   POST /api/venta-cosecha         venta durante la cosecha según barcos e índices del puerto
//   GET  /api/silobolsas            silobolsas registrados
//   POST /api/silobolsas            registra un silobolsa { id?, cultivo, kg, fechaCreacion }
//   POST /api/silobolsas/:id/lecturas  agrega lecturas del IoT { lecturas: [{ timestamp, humedad, temperatura, co2 }] }
//   GET  /api/silobolsas/:id/riesgo    riesgo según las lecturas
//   POST /api/silobolsas/:id/venta     barco, fletes o plan B { hoy, destino: { terminal, distanciaKm, acopios? }, tasaAnual }
// Cualquier otra ruta GET se sirve desde src/interfaces/web si el front está ahí.

import { randomUUID } from 'node:crypto';
import { ESCENARIOS } from '../../application/usecases/explicar.js';
import { coordenadaParam, ErrorHttp, exigirFecha, fechaParam, leerJson, responder, responderError } from './validacion.js';
import { manejarCuenta } from './accountApi.js';

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
    { nombre: 'Cooperativa local', tipo: 'acopio', lat: -33.89, lon: -60.57, distanciaKm: 35, costoAdicionalUsdPorT: 6, precioUsdPorT: 303 },
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
  const { simularPlan, decidirOperacion, consultarClima, confirmarReservas, consultarSaturacion, marketplace, explicarRecomendacion, simularEscenario } = contenedor;
  const simulaciones = new Map();
  const encabezados = cors(origenCors);

  const guardar = (entrada, resultado) => {
    const id = randomUUID();
    simulaciones.set(id, { entrada, resultado });
    if (simulaciones.size > maxSimulaciones) simulaciones.delete(simulaciones.keys().next().value);
    return id;
  };

  const rutas = {
    'GET /api/salud': async () => [200, {
      ok: true,
      servicio: 'AgroFlow API',
      version,
      marketplace: marketplace?.origen ?? null,
      ia: contenedor.explicador?.origen ?? 'plantilla (sin OPENAI_API_KEY)',
      silobolsas: Boolean(contenedor.silobolsas),
      simulacionesGuardadas: simulaciones.size,
    }],

    'GET /api/ejemplo': async () => [200, ENTRADA_EJEMPLO],

    'POST /api/simular': async (req) => {
      const entrada = await leerJson(req);
      if (entrada.hoy) exigirFecha(entrada.hoy, 'hoy');
      const resultado = await simularPlan(entrada);
      return [200, { simulacionId: guardar(entrada, resultado), ...resultado }];
    },

    'POST /api/decision': async (req) => {
      const entrada = await leerJson(req);
      if (entrada.hoy) exigirFecha(entrada.hoy, 'hoy');
      const resultado = await decidirOperacion(entrada);
      return [200, { simulacionId: guardar(entrada, resultado), ...resultado }];
    },

    'GET /api/clima': async (_req, url) => {
      if (!consultarClima) throw new ErrorHttp(503, 'el clima externo está desactivado en este servidor');
      const latitude = coordenadaParam(url, 'lat', 90);
      const longitude = coordenadaParam(url, 'lon', 180);
      try {
        return [200, await consultarClima({ latitude, longitude, desde: fechaParam(url, 'desde'), hasta: fechaParam(url, 'hasta') })];
      } catch (error) {
        if (error instanceof RangeError) throw new ErrorHttp(400, error.message);
        throw error;
      }
    },

    'POST /api/reservas': async (req) => {
      const { simulacionId, loteId } = await leerJson(req);
      if (!simulacionId) throw new ErrorHttp(400, 'falta simulacionId (lo devuelve POST /api/simular)');
      const simulacion = simulaciones.get(simulacionId);
      if (!simulacion) throw new ErrorHttp(404, 'simulación inexistente o vencida: volvé a simular');
      const reservas = await confirmarReservas({ simulacion: simulacion.resultado, loteId: loteId ?? simulacion.resultado.lote?.id });
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

    'POST /api/explicar': async (req) => {
      const { simulacionId, pregunta } = await leerJson(req);
      const simulacion = buscarSimulacion(simulacionId);
      return [200, await explicarRecomendacion({ resultado: simulacion.resultado, pregunta: pregunta ?? null })];
    },

    'POST /api/escenario': async (req) => {
      const { simulacionId, escenario, pregunta } = await leerJson(req);
      const simulacion = buscarSimulacion(simulacionId);
      const r = await simularEscenario({ entrada: simulacion.entrada, base: simulacion.resultado, escenario, pregunta: pregunta ?? null });
      return [200, { ...r, simulacionId: guardar(r.resultado.entrada, r.resultado) }];
    },

    'GET /api/escenarios': async () => [200, {
      escenarios: Object.entries(ESCENARIOS).map(([tipo, def]) => ({ tipo, ejemplo: def.descripcion(tipo === 'precioPuerto' ? -10 : 10) })),
    }],

    'POST /api/venta-cosecha': async (req) => {
      if (!contenedor.decidirVentaCosecha) throw new ErrorHttp(501, 'venta en cosecha no configurada');
      return [200, await contenedor.decidirVentaCosecha(await leerJson(req))];
    },

    'GET /api/silobolsas': async () => {
      const silobolsas = exigirSilobolsas();
      return [200, { silobolsas: await silobolsas.listar() }];
    },

    'POST /api/silobolsas': async (req) => {
      const silobolsas = exigirSilobolsas();
      const datos = await leerJson(req);
      if (!['soja', 'maiz', 'trigo', 'girasol'].includes(datos.cultivo)) throw new ErrorHttp(400, 'cultivo inválido (soja, maiz, trigo o girasol)');
      if (!(Number(datos.kg) > 0)) throw new ErrorHttp(400, 'kg tiene que ser mayor que 0');
      exigirFecha(datos.fechaCreacion, 'fechaCreacion');
      const silobolsa = { id: datos.id ?? `SB-${randomUUID().slice(0, 8)}`, cultivo: datos.cultivo, kg: Number(datos.kg), fechaCreacion: datos.fechaCreacion, ...(datos.loteId ? { loteId: datos.loteId } : {}) };
      silobolsas.registrar(silobolsa);
      return [201, { silobolsa }];
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

  function buscarSimulacion(simulacionId) {
    if (!simulacionId) throw new ErrorHttp(400, 'falta simulacionId (lo devuelve POST /api/simular)');
    const simulacion = simulaciones.get(simulacionId);
    if (!simulacion) throw new ErrorHttp(404, 'simulación inexistente o vencida: volvé a simular');
    return simulacion;
  }

  function exigirSilobolsas() {
    if (!contenedor.silobolsas?.registrar) throw new ErrorHttp(501, 'registro de silobolsas no configurado');
    return contenedor.silobolsas;
  }

  // Rutas con parámetro (:id del silobolsa).
  const rutasConParametro = [
    ['POST', /^\/api\/silobolsas\/([^/]+)\/lecturas$/, async (req, [id]) => {
      exigirSilobolsas();
      await contenedor.silobolsas.obtener(id);
      const { lecturas } = await leerJson(req);
      if (!Array.isArray(lecturas) || !lecturas.length) throw new ErrorHttp(400, 'lecturas tiene que ser una lista con al menos una lectura');
      for (const l of lecturas) {
        if (!l?.timestamp || Number.isNaN(Date.parse(l.timestamp))) throw new ErrorHttp(400, 'cada lectura necesita timestamp ISO');
        for (const campo of ['humedad', 'temperatura', 'co2']) if (!Number.isFinite(Number(l[campo]))) throw new ErrorHttp(400, `cada lectura necesita ${campo} numérico`);
      }
      contenedor.lecturasIot.agregar(id, lecturas.map((l) => ({ timestamp: l.timestamp, humedad: Number(l.humedad), temperatura: Number(l.temperatura), co2: Number(l.co2) })));
      return [201, { silobolsaId: id, agregadas: lecturas.length }];
    }],
    ['GET', /^\/api\/silobolsas\/([^/]+)\/riesgo$/, async (_req, [id]) => {
      if (!contenedor.evaluarSilobolsa) throw new ErrorHttp(501, 'evaluación de silobolsas no configurada');
      return [200, await contenedor.evaluarSilobolsa(id)];
    }],
    ['POST', /^\/api\/silobolsas\/([^/]+)\/venta$/, async (req, [id]) => {
      if (!contenedor.decidirVenta) throw new ErrorHttp(501, 'venta de silobolsas no configurada');
      const { hoy, destino, tasaAnual = 0.08, acopios } = await leerJson(req);
      exigirFecha(hoy, 'hoy');
      if (!destino?.terminal || !(Number(destino.distanciaKm) > 0)) throw new ErrorHttp(400, 'destino necesita terminal y distanciaKm');
      return [200, await contenedor.decidirVenta({ silobolsaId: id, hoy, destino, tasaAnual, ...(acopios ? { acopios } : {}) })];
    }],
  ];

  return async function manejar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, encabezados);
        return res.end();
      }
      const camino = url.pathname.replace(/\/$/, '') || '/';
      if (camino === '/api/account') return manejarCuenta(req, res, 'account');
      if (camino === '/api/fields') return manejarCuenta(req, res, 'fields');
      if (camino === '/api/offering') return manejarCuenta(req, res, 'offering');
      const ruta = rutas[`${req.method} ${camino}`];
      if (ruta) {
        const [estado, cuerpo] = await ruta(req, url);
        return responder(res, estado, cuerpo, encabezados);
      }
      for (const [metodo, patron, fn] of rutasConParametro) {
        const m = camino.match(patron);
        if (!m) continue;
        if (metodo !== req.method) throw new ErrorHttp(405, 'método no permitido');
        const [estado, cuerpo] = await fn(req, m.slice(1).map(decodeURIComponent), url);
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
