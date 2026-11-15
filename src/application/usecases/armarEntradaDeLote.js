import { calcularVentanaCosecha } from '../../domain/cosecha/ventanaCosecha.js';
import { PUERTOS } from '../../domain/barcos/index.js';
import { acopioMasCercano } from '../../domain/destino/zona.js';
import { distanciaKm } from '../../domain/marketplace/index.js';
import { PRECIOS_DEFAULT, SUPUESTOS_VENTA } from '../../domain/venta/index.js';

// Rinde de referencia (qq/ha) cuando el productor no informa el suyo. Supuesto editable: el dato oficial
// de rindes por departamento (data.gob.ar) necesita provincia y departamento, que el lote no trae.
export const RINDE_REFERENCIA_QQ_HA = { soja: 35, maiz: 90, trigo: 40, girasol: 25, sorgo: 60 };
const DIAS_DISPONIBLES_COSECHA = 15;

const hoyIso = (ahora) => ahora().toISOString().slice(0, 10);

const TERMINAL_DEL_PUERTO = { 'gran-rosario': 'Puerto Gran Rosario', 'bahia-blanca': 'Bahía Blanca', quequen: 'Quequén' };

function puertoMasCercano(lote) {
  const [clave] = Object.entries(PUERTOS)
    .map(([id, puerto]) => [id, distanciaKm(lote, puerto)])
    .reduce((a, b) => (b[1] < a[1] ? b : a));
  return { terminal: TERMINAL_DEL_PUERTO[clave], clave };
}

async function precioDeReferencia({ precios, cultivo }) {
  if (precios) {
    try {
      const { spot, fuente } = await precios.precios(cultivo);
      if (spot > 0) return { spotUSDt: spot, fuente: fuente ?? precios.origen ?? 'PreciosPort' };
    } catch { /* cae a los precios por defecto */ }
  }
  const respaldo = PRECIOS_DEFAULT[cultivo]?.puertoHoyUSDt;
  if (!respaldo) throw new RangeError(`todavía no hay precios de referencia para ${cultivo}`);
  return { spotUSDt: respaldo, fuente: 'precio de referencia por defecto (sin pizarra cargada)' };
}

/**
 * Arma solo, a partir del lote, todo lo que el simulador necesitaba pedir a mano: fecha de cosecha, rinde,
 * precios del día, puerto y acopio más cercanos y servicios a evaluar.
 */
export function crearArmarEntradaDeLote({ precios = null, ahora = () => new Date() } = {}) {
  return async function armarEntradaDeLote({ id, lat, lon, ha, cultivo, fechaSiembra, cycleDays = null, qqHa = null }) {
    if (!cultivo || !fechaSiembra) throw new RangeError('el lote necesita cultivo y fecha de siembra');
    const lote = { lat: Number(lat), lon: Number(lon) };
    const { optimo } = calcularVentanaCosecha({ fechaSiembra, cultivo, duracionDias: cycleDays == null ? undefined : Number(cycleDays) });
    const { spotUSDt, fuente: fuentePrecios } = await precioDeReferencia({ precios, cultivo });
    const acopio = acopioMasCercano(lote);
    const puerto = puertoMasCercano(lote);
    const rinde = Number(qqHa) > 0 ? Number(qqHa) : RINDE_REFERENCIA_QQ_HA[cultivo];
    if (!rinde) throw new RangeError(`todavía no hay un rinde de referencia para ${cultivo}`);

    const entrada = {
      lote: { id: id ?? 'lote', lat: lote.lat, lon: lote.lon },
      hoy: hoyIso(ahora),
      ha: Number(ha),
      qqHa: rinde,
      cultivo,
      fechaSiembra,
      fechaInicioCosecha: optimo,
      diasDisponibles: DIAS_DISPONIBLES_COSECHA,
      urgencia: 'media',
      servicios: ['transporte', 'almacenaje'],
      destinos: [
        { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: spotUSDt },
        {
          nombre: acopio.nombre, tipo: 'acopio', lat: acopio.lat, lon: acopio.lon, distanciaKm: acopio.distanciaKm,
          precioUsdPorT: spotUSDt - SUPUESTOS_VENTA.acopio.descuentoPrecioUSDt, costoAdicionalUsdPorT: SUPUESTOS_VENTA.acopio.tarifaUSDt,
        },
        { nombre: puerto.terminal, tipo: 'puerto', terminal: puerto.terminal, precioUsdPorT: spotUSDt },
      ],
    };
    return {
      entrada,
      automatico: {
        rinde: { qqHa: rinde, origen: Number(qqHa) > 0 ? 'informado por el productor' : 'referencia por cultivo (supuesto)' },
        precios: { spotUSDt, fuente: fuentePrecios },
        acopio: { nombre: acopio.nombre, distanciaKm: acopio.distanciaKm, tarifaRecepcionUSDt: SUPUESTOS_VENTA.acopio.tarifaUSDt, descuentoPrecioUSDt: SUPUESTOS_VENTA.acopio.descuentoPrecioUSDt },
        puerto: { nombre: puerto.terminal },
        fechaInicioCosecha: optimo,
      },
    };
  };
}
