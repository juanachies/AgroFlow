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

function camionMasBarato(tarifas) {
  return [...tarifas.camiones].sort((a, b) => a.precio_relativo - b.precio_relativo)[0];
}

function evaluarBarco(barco, contexto) {
  const { tonsBrutas, riesgo, precio, km, hoy, tasaAnual, tarifas, diasViaje, fechaLimite } = contexto;
  const mermaPorDia = tarifas.silobolsa.merma_pct_por_mes[riesgo.nivel] / DIAS_POR_MES / 100;
  const primeraEntrega = sumarDias(hoy, tarifas.reserva.anticipo_dias.camion + diasViaje);
  const fechaEntrega = barco.arribo > primeraEntrega ? barco.arribo : primeraEntrega;
  const fechaCarga = sumarDias(fechaEntrega, -diasViaje);
  const descartado = (motivo) => ({ barcoId: barco.id, factible: false, motivo });

  if (fechaEntrega > barco.cierreCarga) return descartado('llegaría después del cierre de carga');
  if (fechaLimite && fechaCarga > fechaLimite) return descartado(`el grano llega a riesgo alto antes (${fechaLimite})`);

  const diasEspera = diasEntre(hoy, fechaCarga);
  const tonsNetas = tonsBrutas * (1 - mermaPorDia * diasEspera);
  if (tonsNetas > barco.toneladasMax) return descartado('no entra en la capacidad del barco');

  const camion = camionMasBarato(tarifas);
  const precioUsdPorT = precioPara(fechaEntrega, precio, hoy);
  const ingresoUsd = tonsNetas * precioUsdPorT;
  const fleteUsd = tonsNetas * tarifaFleteUsdPorT(km, tarifas) * camion.precio_relativo;
  const financieroUsd = (ingresoUsd * tasaAnual * diasEspera) / DIAS_POR_ANIO;
  return {
    barcoId: barco.id,
    factible: true,
    fechaCarga,
    fechaEntrega,
    diasEspera,
    tonsNetas,
    camiones: { tipo: camion.id, cantidad: Math.ceil(tonsNetas / camion.capacidad_t) },
    precioUsdPorT,
    ingresoUsd,
    fleteUsd,
    financieroUsd,
    netoUsd: ingresoUsd - fleteUsd - financieroUsd,
  };
}

// Venta en acopio cuando no hay barco a tiempo: se carga apenas hay camiones (hoy + anticipo) y
// tiene que llegar antes de la fecha límite de riesgo. El acopio paga el precio esperado del puerto
// menos su descuento, cobra tarifa y secado, y el flete es a su distancia.
function evaluarAcopio(acopio, contexto) {
  const { tonsBrutas, riesgo, precio, hoy, tasaAnual, tarifas, fechaLimite } = contexto;
  const nombre = acopio.nombre ?? 'acopio';
  exigirPositivo(`distanciaKm de ${nombre}`, acopio.distanciaKm);
  const viaje = diasDeViaje(acopio.distanciaKm, tarifas);
  const fechaCarga = sumarDias(hoy, tarifas.reserva.anticipo_dias.camion);
  const fechaEntrega = sumarDias(fechaCarga, viaje);
  if (fechaLimite && fechaCarga > fechaLimite) return { acopio: nombre, factible: false, motivo: `el grano llega a riesgo alto antes (${fechaLimite})` };

  const mermaPorDia = tarifas.silobolsa.merma_pct_por_mes[riesgo.nivel] / DIAS_POR_MES / 100;
  const diasEspera = diasEntre(hoy, fechaCarga);
  const tonsNetas = tonsBrutas * (1 - mermaPorDia * diasEspera);
  const supuesto = SUPUESTOS_VENTA.acopio;
  const precioUsdPorT = acopio.precioUsdPorT ?? precioPara(fechaEntrega, precio, hoy) - (acopio.descuentoUsdPorT ?? supuesto.descuentoPrecioUSDt);
  exigirPositivo(`precio de ${nombre}`, precioUsdPorT);
  const camion = camionMasBarato(tarifas);
  const ingresoUsd = tonsNetas * precioUsdPorT;
  const fleteUsd = tonsNetas * tarifaFleteUsdPorT(acopio.distanciaKm, tarifas) * camion.precio_relativo;
  const serviciosUsd = tonsNetas * (acopio.tarifaUsdPorT ?? supuesto.tarifaUSDt + supuesto.secadoUSDt);
  const financieroUsd = (ingresoUsd * tasaAnual * diasEspera) / DIAS_POR_ANIO;
  return {
    acopio: nombre,
    factible: true,
    fechaCarga,
    fechaEntrega,
    diasEspera,
    tonsNetas,
    camiones: { tipo: camion.id, cantidad: Math.ceil(tonsNetas / camion.capacidad_t) },
    precioUsdPorT,
    ingresoUsd,
    fleteUsd,
    serviciosUsd,
    financieroUsd,
    netoUsd: ingresoUsd - fleteUsd - serviciosUsd - financieroUsd,
  };
}

/**
 * Elige en qué barco embarcar y cuándo cargar los fletes.
 * Con riesgo alto toma el primer barco que se pueda cargar; si no, el de mayor neto.
 * Si ninguno cumple la fecha límite de seguridad y hay `acopios` cargados, vende en el acopio de mayor
 * neto que llegue a tiempo (`vender_acopio`); si tampoco, devuelve `sin_barco_factible`.
 */
export function decidirVenta({ silobolsa, riesgo, precio, barcos, destino, hoy, tasaAnual, acopios = [] }, tarifas) {
  exigirPositivo('kg', silobolsa.kg);
  exigirPositivo('distanciaKm', destino.distanciaKm);
  if (!Number.isFinite(tasaAnual) || tasaAnual < 0) throw new RangeError('tasaAnual debe ser un número mayor o igual que 0');
  const fechaLimite = riesgo.diasHastaCritico === null ? null : sumarDias(hoy, riesgo.diasHastaCritico);
  const contexto = {
    tonsBrutas: silobolsa.kg / 1000,
    riesgo,
    precio,
    km: destino.distanciaKm,
    hoy,
    tasaAnual,
    tarifas,
    diasViaje: diasDeViaje(destino.distanciaKm, tarifas),
    fechaLimite,
  };
  const evaluados = barcos.map((barco) => evaluarBarco(barco, contexto));
  const factibles = evaluados.filter((evaluado) => evaluado.factible);
  if (factibles.length === 0) {
    const acopiosEvaluados = acopios.map((acopio) => evaluarAcopio(acopio, contexto));
    const enAcopio = acopiosEvaluados.filter((a) => a.factible).sort((a, b) => b.netoUsd - a.netoUsd);
    if (enAcopio.length > 0) {
      return { decision: 'vender_acopio', motivo: 'no hay barco a tiempo', riesgo: riesgo.nivel, fechaLimite, elegido: enAcopio[0], evaluados, acopiosEvaluados };
    }
    return { decision: 'sin_barco_factible', riesgo: riesgo.nivel, fechaLimite, evaluados, ...(acopios.length ? { acopiosEvaluados } : {}) };
  }
  const urgente = riesgo.nivel === 'alto';
  const porNeto = (a, b) => b.netoUsd - a.netoUsd;
  const porFecha = (a, b) => a.fechaCarga.localeCompare(b.fechaCarga) || porNeto(a, b);
  const elegido = [...factibles].sort(urgente ? porFecha : porNeto)[0];
  return { decision: 'embarcar', riesgo: riesgo.nivel, fechaLimite, elegido, evaluados };
}
