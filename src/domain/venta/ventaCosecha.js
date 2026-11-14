// Venta durante la cosecha: ¿vender a puerto, a acopio o mandar a silobolsa? ¿Hasta dónde rinde vender?
// (La venta de una silobolsa ya embolsada, eligiendo barco, está en decisionVenta.js.)
//
// Consume la SEÑAL del módulo Barcos y, si se cargan, los datos de mercado publicados
// (line-up NABSA / BCR y camiones BCR / MAGyP). Para cada fecha de despacho posible:
//   vender_puerto(d) = t × precio_hoy × factorPrecio(llegada) − flete − t × espera(llegada) × costo_espera
//                      − t × días_en_campo × costo_guardar_corto
//   vender_acopio(d) = t × (precio_hoy − descuento) − flete_corto − t × (tarifa + secado)
//                      − t × días_en_campo × costo_guardar_corto
//   silobolsa        = t × (1 − merma) × precio_futuro − bolsa/embolsado/extracción − flete − interés
//
// Vender A PUERTO requiere además CUMPLIR LOS ÍNDICES (criterios.js): demanda/oferta, espera,
// saturación, demanda de barcos, nivel del Paraná. Si no cumple, el puerto queda descartado.
//
// "Hasta dónde rinde" vender: ventana de venta, espera máxima tolerable en puerto, precio
// disponible mínimo en puerto y precio futuro de equilibrio de la silobolsa.

import { PRECIOS_DEFAULT, supuestosVenta } from './supuestos.js';
import { evaluarIndicesPuerto } from './criterios.js';
import { calcularIndicesMercado } from '../barcos/indicesMercado.js';
import { diasViaje } from '../maquinaria/logistica.js';
import { iso, sumarDias, diasEntre, redondear } from '../shared/util.js';

export function decidirVentaCosecha({
  barcos, cultivo, toneladas, fechaGranoListo, distanciaPuertoKm, distanciaAcopioKm = null,
  precios = {}, supuestos = {}, logistica = {},
  mercado = {}, nivelParanaM = null, umbrales = {},
}) {
  if (!barcos?.senal) throw new Error('decidirVentaCosecha necesita la salida de analizarBarcos()');
  cultivo = cultivo ?? barcos.cultivo;
  const s = supuestosVenta(supuestos);
  const pr = { ...PRECIOS_DEFAULT[cultivo], ...precios };
  if (!pr.puertoHoyUSDt) throw new Error(`Faltan precios para ${cultivo}`);
  const t = toneladas;
  const listo = iso(fechaGranoListo);
  const hoy = barcos.hoy;
  const viaje = diasViaje(distanciaPuertoKm, logistica);
  const senalPorFecha = new Map(barcos.senal.map((x) => [x.fecha, x]));

  // --- Silobolsa (no depende de la fecha de despacho) ---
  const sb = s.silobolsa;
  const merma = sb.mermaMensual * sb.mesesGuardado;
  const silobolsa = resumen('silobolsa', t * (1 - merma) * pr.futuroUSDt, {
    bolsaEmbolsadoExtraccion: t * (sb.bolsaUSDt + sb.embolsadoUSDt + sb.extraccionUSDt),
    flete: t * distanciaPuertoKm * s.fleteUSDtKm,
    financiero: t * pr.puertoHoyUSDt * sb.tasaMensual * sb.mesesGuardado,
  }, t, { mesesGuardado: sb.mesesGuardado, mermaPct: redondear(merma * 100, 2), precioUSDt: pr.futuroUSDt, venderEl: sumarDias(listo, sb.mesesGuardado * 30) });

  // --- Curva por fecha de despacho: puerto y acopio ---
  const inicio = diasEntre(hoy, listo) > 0 ? listo : hoy;
  const curva = [];
  for (let k = 0; ; k++) {
    const despacho = sumarDias(inicio, k);
    const llegada = sumarDias(despacho, viaje);
    const sp = senalPorFecha.get(llegada);
    if (!sp) break; // fuera del horizonte de barcos
    const diasCampo = Math.max(0, diasEntre(listo, despacho));
    const guardarCorto = t * diasCampo * s.costoGuardarCortoUSDtDia;
    const precioPuerto = pr.puertoHoyUSDt * sp.factorPrecio;
    const puerto = resumen('puerto', t * precioPuerto, {
      flete: t * distanciaPuertoKm * s.fleteUSDtKm,
      espera: t * sp.esperaDias * s.costoEsperaUSDtDia,
      guardarEnCampo: guardarCorto,
    }, t, { precioUSDt: redondear(precioPuerto, 2), esperaDias: sp.esperaDias, indiceDemanda: sp.indiceDemanda, probBarco: sp.probBarcoEnTolerancia, fuente: sp.fuente });
    let acopio = null;
    if (distanciaAcopioKm != null) {
      const precioAcopio = pr.puertoHoyUSDt - s.acopio.descuentoPrecioUSDt;
      acopio = resumen('acopio', t * precioAcopio, {
        flete: t * distanciaAcopioKm * s.fleteUSDtKm,
        servicios: t * (s.acopio.tarifaUSDt + s.acopio.secadoUSDt),
        guardarEnCampo: guardarCorto,
      }, t, { precioUSDt: precioAcopio });
    }
    curva.push({ despacho, llegada, diasEnCampo: diasCampo, confiable: sp.confiable, puerto, acopio });
  }
  if (curva.length === 0) {
    return { decision: null, canal: null, motivo: 'fuera-de-horizonte', silobolsa, curva, avisos: [aviso('fuera-de-horizonte', 'info', hoy, `El grano está listo el ${listo}, fuera del horizonte de barcos. Se reestima más cerca de la fecha.`)] };
  }
  const base = curva.filter((c) => c.confiable).length ? curva.filter((c) => c.confiable) : curva;
  const mejorPuerto = base.reduce((a, c) => (c.puerto.margenUSD > a.puerto.margenUSD ? c : a));

  // --- Índices a cumplir para vender a puerto (en la mejor fecha de llegada al puerto) ---
  const indices = calcularIndicesMercado({
    cultivo, puerto: barcos.puerto, programadas: mercado.programadas, camiones: mercado.camiones,
    nivelParanaM, senalLlegada: senalPorFecha.get(mejorPuerto.llegada),
  });
  const indicesPuerto = evaluarIndicesPuerto(indices, umbrales);
  const puertoHabilitado = indicesPuerto.cumple;

  // --- Mejor canal por día con el puerto habilitado o no ---
  for (const c of curva) {
    const opciones = [puertoHabilitado ? c.puerto : null, c.acopio].filter(Boolean);
    const mejorCanal = opciones.length ? opciones.reduce((a, o) => (o.margenUSD > a.margenUSD ? o : a)) : null;
    c.canal = mejorCanal?.canal ?? null;
    c.margenVenderUSD = mejorCanal?.margenUSD ?? null;
    c.rinde = mejorCanal ? mejorCanal.margenUSD >= silobolsa.margenUSD : false;
  }
  const conCanal = base.filter((c) => c.canal);
  const mejor = conCanal.length ? conCanal.reduce((a, c) => (c.margenVenderUSD > a.margenVenderUSD ? c : a)) : null;
  const vender = mejor ? mejor.margenVenderUSD >= silobolsa.margenUSD : false;

  // --- Hasta dónde rinde ---
  const costoEspera = mejorPuerto.puerto.costos.espera;
  const esperaMaxDias = Math.max(0, (mejorPuerto.puerto.margenUSD + costoEspera - silobolsa.margenUSD) / (t * s.costoEsperaUSDtDia));
  const costosSilo = Object.values(silobolsa.costos).reduce((a, b) => a + b, 0);
  const referenciaVenta = mejor ?? mejorPuerto;
  const margenReferencia = mejor ? mejor.margenVenderUSD : mejorPuerto.puerto.margenUSD;
  const factorMejorPuerto = mejorPuerto.puerto.detalle.precioUSDt / pr.puertoHoyUSDt;
  const costosMejorPuerto = Object.values(mejorPuerto.puerto.costos).reduce((a, b) => a + b, 0);
  const hastaDondeRinde = {
    ventanaVenta: ventanaVenta(curva),
    esperaMaxDias: redondear(esperaMaxDias, 1),
    precioFuturoEquilibrioUSDt: redondear((margenReferencia + costosSilo) / (t * (1 - merma)), 2),
    precioPuertoMinimoUSDt: redondear((silobolsa.margenUSD + costosMejorPuerto) / (t * factorMejorPuerto), 2),
  };

  const resultado = {
    decision: vender ? 'vender' : 'silobolsa',
    canal: vender ? mejor.canal : null,
    indicesPuerto,
    puertoHabilitado,
    mejorPuerto: { despacho: mejorPuerto.despacho, llegada: mejorPuerto.llegada, margenUSD: mejorPuerto.puerto.margenUSD, margenUSDt: mejorPuerto.puerto.margenUSDt, detalle: mejorPuerto.puerto },
    mejorVenta: mejor ? {
      despacho: mejor.despacho, llegada: mejor.llegada, canal: mejor.canal,
      margenUSD: mejor.margenVenderUSD, margenUSDt: redondear(mejor.margenVenderUSD / t, 2), detalle: mejor[mejor.canal],
    } : null,
    silobolsa,
    diferenciaUSD: Math.round(Math.abs(margenReferencia - silobolsa.margenUSD)),
    hastaDondeRinde,
    curva,
  };
  resultado.avisos = avisosVenta(resultado, { hoy, inicio: curva[0], s, referenciaVenta });
  return resultado;
}

// Primer tramo continuo de despachos en los que vender rinde más que la silobolsa.
function ventanaVenta(curva) {
  const i = curva.findIndex((c) => c.rinde);
  if (i < 0) return null;
  let j = i;
  while (j + 1 < curva.length && curva[j + 1].rinde) j++;
  return { desde: curva[i].despacho, hasta: curva[j].despacho, abiertaAlFinal: j === curva.length - 1 };
}

function resumen(canal, ingreso, costos, t, detalle) {
  const total = Object.values(costos).reduce((a, b) => a + b, 0);
  const margen = ingreso - total;
  return {
    canal,
    ingresoUSD: Math.round(ingreso),
    costos: Object.fromEntries(Object.entries(costos).map(([k, v]) => [k, Math.round(v)])),
    margenUSD: Math.round(margen),
    margenUSDt: redondear(margen / t, 2),
    detalle,
  };
}

function aviso(tipo, nivel, fecha, mensaje, datos = {}) {
  return { modulo: 'venta', tipo, nivel, fecha, mensaje, datos };
}

const NOMBRE = { puerto: 'al puerto', acopio: 'al acopio' };
const usd = (n) => `US$ ${Math.round(n).toLocaleString('es-AR')}`;

function avisosVenta(r, { hoy, inicio, s }) {
  const avisos = [];
  const h = r.hastaDondeRinde;
  const ip = r.indicesPuerto;

  // Índices del puerto: siempre se informa el semáforo y qué falla.
  const fallas = ip.checks.filter((c) => c.estado === 'rojo').map((c) => `${c.nombre}: ${c.valor} ${c.unidad} (${c.umbral})`);
  if (!ip.cumple) {
    const masMargen = r.mejorPuerto.margenUSD > (r.mejorVenta?.margenUSD ?? -Infinity) && r.mejorPuerto.margenUSD > r.silobolsa.margenUSD;
    avisos.push(aviso('indices-puerto', 'alerta', hoy,
      `El puerto NO cumple los índices para vender${masMargen ? ' (aunque en el papel da más margen)' : ''}. ${fallas.length ? 'Falla: ' + fallas.join('; ') + '.' : 'Faltan datos para evaluarlo.'}`,
      ip));
  } else {
    avisos.push(aviso('indices-puerto', 'info', hoy,
      `El puerto cumple los índices (semáforo ${ip.semaforo}, ${ip.evaluados} índices evaluados${fallas.length ? `; en rojo: ${fallas.join('; ')}` : ''}).`,
      ip));
  }

  if (r.decision === 'vender') {
    const v = r.mejorVenta;
    const hasta = h.ventanaVenta && !h.ventanaVenta.abiertaAlFinal ? ` Vender rinde despachando hasta el ${h.ventanaVenta.hasta}; después conviene silobolsa.` : '';
    avisos.push(aviso('decision-venta', 'info', hoy,
      `Vendé ${NOMBRE[v.canal]} despachando el ${v.despacho}: margen ${usd(v.margenUSD)} (US$ ${v.margenUSDt}/t), ${usd(r.diferenciaUSD)} más que guardar en silobolsa ${r.silobolsa.detalle.mesesGuardado} meses.${hasta} Guardar convendría solo con un futuro mayor a US$ ${h.precioFuturoEquilibrioUSDt}/t.`,
      { canal: v.canal, despacho: v.despacho, ...h }));
    if (h.ventanaVenta && !h.ventanaVenta.abiertaAlFinal && diasEntre(hoy, h.ventanaVenta.hasta) <= s.avisoCierreVentanaDias) {
      avisos.push(aviso('cierre-ventana', 'alerta', h.ventanaVenta.hasta,
        `La ventana de venta se cierra el ${h.ventanaVenta.hasta}: después la silobolsa rinde más.`, h.ventanaVenta));
    }
    if (v.canal === 'puerto' && inicio.puerto.detalle.esperaDias > s.umbralEsperaDias && v.despacho !== inicio.despacho) {
      avisos.push(aviso('cola', 'alerta', inicio.llegada,
        `Si despachás al puerto apenas cosechás (${inicio.despacho}) el grano espera ~${inicio.puerto.detalle.esperaDias} días (${usd(inicio.puerto.costos.espera)}). Conviene despachar el ${v.despacho}.`,
        { inmediato: inicio.despacho, mejor: v.despacho }));
    }
  } else {
    const alt = r.mejorVenta ? ` (mejor venta posible: ${NOMBRE[r.mejorVenta.canal]} el ${r.mejorVenta.despacho})` : '';
    avisos.push(aviso('decision-venta', 'info', hoy,
      `Mandá a silobolsa: guardar ${r.silobolsa.detalle.mesesGuardado} meses deja ${usd(r.diferenciaUSD)} más que vender ahora${alt}. Vender a puerto convendría si cumple los índices y el disponible supera US$ ${h.precioPuertoMinimoUSDt}/t con una espera de ${h.esperaMaxDias} días o menos.`,
      h));
  }
  return avisos;
}
