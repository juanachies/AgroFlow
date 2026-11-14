import { tarifaFleteUsdPorT } from '../flete/costoFlete.js';
import { exigirPositivo } from '../shared/errores.js';
import { sumarDias } from '../shared/fechas.js';
import { curvaDesdePrecios, precioEsperado } from './precios.js';
import { SUPUESTOS_VENTA } from './supuestos.js';

const MS_POR_DIA = 86400000;
const DIAS_POR_MES = 30;
const DIAS_POR_ANIO = 365;

function diasEntre(desdeIso, hastaIso) {
  return Math.round((Date.parse(`${hastaIso}T00:00:00Z`) - Date.parse(`${desdeIso}T00:00:00Z`)) / MS_POR_DIA);
}

const fechaMayor = (a, b) => (a > b ? a : b);

// Precio esperado en la fecha de entrega con la curva spot + futuros: interpola entre posiciones y
// hace converger la base (spot − futuro cercano) a 0 al vencimiento (ver precios.js).
function precioPara(fechaIso, precio, hoy) {
  const valor = precioEsperado(curvaDesdePrecios(hoy, precio), fechaIso).precioUSDt;
  exigirPositivo('precio', valor);
  return valor;
}

function diasDeViaje(km, tarifas) {
  const { horas_utiles_por_dia: horas, velocidad_media_camion_kmh: velocidad } = tarifas.parametros_generales;
  return Math.max(1, Math.ceil(km / velocidad / horas));
}

function diasDeExtraccion(tons, tarifas) {
  const porDia = tarifas.extractora.t_por_hora * tarifas.parametros_generales.horas_utiles_por_dia;
  return Math.max(1, Math.ceil(tons / porDia));
}

function camionMasBarato(tarifas) {
  return [...tarifas.camiones].sort((a, b) => a.precio_relativo - b.precio_relativo)[0];
}

function primeraCarga(hoy, tarifas) {
  const { camion, extractora = 0 } = tarifas.reserva.anticipo_dias;
  return sumarDias(hoy, Math.max(camion, extractora));
}

/**
 * Fracción del peso que se pierde en `dias`: el ritmo de merma sube con el nivel de riesgo
 * a medida que las lecturas proyectan que el grano pasa de bajo a medio y de medio a alto.
 */
function mermaAcumulada(dias, riesgo, tarifas) {
  const ritmo = (nivel) => tarifas.silobolsa.merma_pct_por_mes[nivel] / DIAS_POR_MES / 100;
  const hastaAlto = riesgo.nivel === 'alto' ? 0 : (riesgo.diasHastaCritico ?? Infinity);
  const hastaMedio = riesgo.nivel === 'bajo' ? Math.min(riesgo.diasHastaMedio ?? Infinity, hastaAlto) : 0;
  const bajo = Math.min(dias, hastaMedio);
  const medio = Math.min(dias, hastaAlto) - bajo;
  const alto = dias - Math.min(dias, hastaAlto);
  return Math.min(1, ritmo('bajo') * bajo + ritmo('medio') * medio + ritmo('alto') * alto);
}

function descartado(identidad, motivo) {
  return { ...identidad, factible: false, motivo };
}

/**
 * Costea una salida del silobolsa (barco o acopio): cuándo se extrae y se carga, cuánto grano
 * llega después de la merma y todo lo que cuesta, desde la extracción hasta la entrega.
 */
function costear({ identidad, fechaCarga, km, precioUsdPorT, adicionalUsdPorT = 0 }, contexto) {
  const { tonsBrutas, riesgo, hoy, tasaAnual, tarifas, diasViaje, fechaLimite } = contexto;
  const diasExtraccion = diasDeExtraccion(tonsBrutas, tarifas);
  const ultimaExtraccion = sumarDias(fechaCarga, diasExtraccion - 1);
  if (fechaLimite && ultimaExtraccion > fechaLimite) {
    return descartado(identidad, `el grano llega a riesgo alto antes (${fechaLimite})`);
  }
  const diasEspera = diasEntre(hoy, ultimaExtraccion);
  const merma = mermaAcumulada(diasEspera, riesgo, tarifas);
  const tonsNetas = tonsBrutas * (1 - merma);
  const camion = camionMasBarato(tarifas);
  const ingresoUsd = tonsNetas * precioUsdPorT;
  const extraccionUsd = tonsNetas * tarifas.silobolsa.costo_usd_por_t_extraccion;
  const fleteUsd = tonsNetas * tarifaFleteUsdPorT(km, tarifas) * camion.precio_relativo;
  const adicionalUsd = tonsNetas * adicionalUsdPorT;
  const financieroUsd = (ingresoUsd * tasaAnual * diasEspera) / DIAS_POR_ANIO;
  return {
    ...identidad,
    factible: true,
    fechaCarga,
    fechaEntrega: sumarDias(ultimaExtraccion, diasViaje),
    diasEspera,
    extractora: { desde: fechaCarga, hasta: ultimaExtraccion, dias: diasExtraccion },
    tonsNetas,
    mermaUsd: (tonsBrutas - tonsNetas) * precioUsdPorT,
    camiones: { tipo: camion.id, cantidad: Math.ceil(tonsNetas / camion.capacidad_t) },
    precioUsdPorT,
    ingresoUsd,
    extraccionUsd,
    fleteUsd,
    adicionalUsd,
    financieroUsd,
    netoUsd: ingresoUsd - extraccionUsd - fleteUsd - adicionalUsd - financieroUsd,
  };
}

function evaluarBarco(barco, contexto) {
  const { tonsBrutas, precio, destino, hoy, tarifas, diasViaje } = contexto;
  const identidad = { tipo: 'puerto', barcoId: barco.id };
  const diasExtraccion = diasDeExtraccion(tonsBrutas, tarifas);
  const fechaCarga = fechaMayor(primeraCarga(hoy, tarifas), sumarDias(barco.arribo, -(diasViaje + diasExtraccion - 1)));
  const fechaEntrega = sumarDias(fechaCarga, diasExtraccion - 1 + diasViaje);
  if (fechaEntrega > barco.cierreCarga) return descartado(identidad, 'llegaría después del cierre de carga');

  const evaluado = costear(
    { identidad, fechaCarga, km: destino.distanciaKm, precioUsdPorT: precioPara(fechaEntrega, precio, hoy) },
    contexto,
  );
  if (evaluado.factible && evaluado.tonsNetas > barco.toneladasMax) {
    return descartado(identidad, 'no entra en la capacidad del barco');
  }
  return evaluado;
}

// Sin precio propio, el acopio paga el precio esperado del puerto menos su descuento y cobra
// tarifa y secado; con `precioUsdPorT` o `costoAdicionalUsdPorT` se usan esos valores.
function evaluarAcopio(acopio, contexto) {
  const { hoy, tarifas, precio } = contexto;
  const supuesto = SUPUESTOS_VENTA.acopio;
  const identidad = { tipo: 'acopio', acopio: acopio.nombre ?? 'acopio' };
  const fechaCarga = primeraCarga(hoy, tarifas);
  const fechaEntrega = sumarDias(fechaCarga, diasDeViaje(acopio.distanciaKm, tarifas));
  const precioUsdPorT = acopio.precioUsdPorT
    ?? precioPara(fechaEntrega, precio, hoy) - (acopio.descuentoUsdPorT ?? supuesto.descuentoPrecioUSDt);
  exigirPositivo(`precio de ${identidad.acopio}`, precioUsdPorT);
  return costear(
    {
      identidad,
      fechaCarga,
      km: acopio.distanciaKm,
      precioUsdPorT,
      adicionalUsdPorT: acopio.costoAdicionalUsdPorT ?? acopio.tarifaUsdPorT ?? supuesto.tarifaUSDt + supuesto.secadoUSDt,
    },
    contexto,
  );
}

function validarAcopios(acopios) {
  for (const acopio of acopios) {
    exigirPositivo(`distanciaKm de ${acopio.nombre}`, acopio.distanciaKm);
    if (acopio.precioUsdPorT !== undefined) exigirPositivo(`precioUsdPorT de ${acopio.nombre}`, acopio.precioUsdPorT);
  }
}

/**
 * Elige dónde y cuándo sacar el grano del silobolsa: un barco o un acopio.
 * Cada opción descuenta merma proyectada, extracción, flete, costo del acopio y costo financiero.
 * Con riesgo alto toma la opción que se pueda cargar primero; si no, la de mayor neto.
 * Si ninguna cumple la fecha límite de seguridad, devuelve `sin_barco_factible`.
 */
export function decidirVenta(
  { silobolsa, riesgo, precio, barcos, acopios = [], destino, hoy, tasaAnual },
  tarifas,
) {
  exigirPositivo('kg', silobolsa.kg);
  exigirPositivo('distanciaKm', destino.distanciaKm);
  validarAcopios(acopios);
  if (!Number.isFinite(tasaAnual) || tasaAnual < 0) throw new RangeError('tasaAnual debe ser un número mayor o igual que 0');
  const fechaLimite = riesgo.diasHastaCritico === null ? null : sumarDias(hoy, riesgo.diasHastaCritico);
  const contexto = {
    tonsBrutas: silobolsa.kg / 1000,
    riesgo,
    precio,
    destino,
    hoy,
    tasaAnual,
    tarifas,
    diasViaje: diasDeViaje(destino.distanciaKm, tarifas),
    fechaLimite,
  };
  const evaluados = [
    ...barcos.map((barco) => evaluarBarco(barco, contexto)),
    ...acopios.map((acopio) => evaluarAcopio(acopio, contexto)),
  ];
  const factibles = evaluados.filter((evaluado) => evaluado.factible);
  if (factibles.length === 0) {
    return { decision: 'sin_barco_factible', riesgo: riesgo.nivel, fechaLimite, evaluados };
  }
  const urgente = riesgo.nivel === 'alto';
  const porNeto = (a, b) => b.netoUsd - a.netoUsd;
  const porFecha = (a, b) => a.fechaCarga.localeCompare(b.fechaCarga) || porNeto(a, b);
  const elegido = [...factibles].sort(urgente ? porFecha : porNeto)[0];
  const decision = elegido.tipo === 'acopio' ? 'vender_acopio' : 'embarcar';
  return { decision, riesgo: riesgo.nivel, fechaLimite, elegido, evaluados };
}
