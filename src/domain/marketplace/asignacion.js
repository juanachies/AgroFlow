// Marketplace de cadetes: asignar el plan de pedido a ofertas y crear reservas (dominio puro).
//
// Entrada: las líneas del plan de pedido (armarPedidos: servicio, recurso, tipo, cantidad, usar_desde,
// usar_hasta, pedir_antes_del, costo_usd, viajes_por_dia?) y las ofertas publicadas.
// Para cada línea busca ofertas del mismo recurso que:
//   - estén disponibles todo el rango de uso;
//   - lleguen al lote (distancia a la base ≤ radio del proveedor);
//   - tengan unidades libres todos esos días (descontando reservas ya tomadas).
// Orden de preferencia: mismo tipo, menor precio relativo, más cerca, mejor calificación.
// Puede repartir una línea entre varios proveedores. Lo que no se cubre queda como faltante.

import { distanciaKm, validarOferta, RECURSOS } from './ofertas.js';
import { sumarDias, diasEntre, redondear } from '../shared/util.js';

function solapa(a, b) {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

// Unidades libres de una oferta en todo el rango (mínimo diario).
export function unidadesLibres(oferta, reservas, desde, hasta) {
  let minimo = oferta.unidades;
  const dias = diasEntre(desde, hasta);
  for (let d = 0; d <= dias; d++) {
    const dia = sumarDias(desde, d);
    const ocupadas = reservas
      .filter((r) => r.ofertaId === oferta.id && r.desde <= dia && r.hasta >= dia)
      .reduce((a, r) => a + r.unidades, 0);
    minimo = Math.min(minimo, oferta.unidades - ocupadas);
  }
  return Math.max(0, minimo);
}

export function asignarLinea(linea, { ofertas, reservas = [], lote }) {
  const rango = { desde: linea.usar_desde, hasta: linea.usar_hasta };
  const candidatas = ofertas
    .filter((o) => o.recurso === linea.recurso && o.disponibleDesde <= rango.desde && o.disponibleHasta >= rango.hasta)
    .map((o) => ({ oferta: o, distancia: lote ? distanciaKm(lote, o.base) : 0 }))
    .filter(({ oferta, distancia }) => distancia <= oferta.radioKm)
    .map((c) => ({ ...c, libres: unidadesLibres(c.oferta, reservas, rango.desde, rango.hasta) }))
    .filter((c) => c.libres > 0)
    .sort((a, b) =>
      Number(b.oferta.tipo === linea.tipo) - Number(a.oferta.tipo === linea.tipo)
      || a.oferta.precioRelativo - b.oferta.precioRelativo
      || a.distancia - b.distancia
      || (b.oferta.calificacion ?? 0) - (a.oferta.calificacion ?? 0));

  let faltan = linea.cantidad;
  const asignaciones = [];
  for (const c of candidatas) {
    if (faltan <= 0) break;
    const unidades = Math.min(c.libres, faltan);
    faltan -= unidades;
    asignaciones.push({
      ofertaId: c.oferta.id,
      proveedor: c.oferta.proveedor,
      recurso: linea.recurso,
      tipo: c.oferta.tipo ?? linea.tipo,
      unidades,
      desde: rango.desde,
      hasta: rango.hasta,
      distanciaKm: redondear(c.distancia, 1),
      precioRelativo: c.oferta.precioRelativo,
      // Costo estimado: parte proporcional del costo del plan, ajustada por el precio del proveedor.
      costoUsd: Math.round((linea.costo_usd ?? 0) * (unidades / linea.cantidad) * c.oferta.precioRelativo),
    });
  }
  return { linea, asignaciones, faltan, cubierta: faltan === 0, candidatas: candidatas.length };
}

/**
 * Asigna todas las líneas del plan. Las asignaciones de una línea cuentan como ocupadas para las
 * siguientes, así un mismo proveedor no se reserva dos veces los mismos días.
 * Las líneas sin recurso del marketplace (p. ej. la bolsa de silo, que es un insumo) se omiten.
 */
export function asignarPlan({ pedidos, ofertas, reservas = [], lote }) {
  const validas = ofertas.map(validarOferta);
  const ocupadas = [...reservas];
  const lineas = [];
  for (const linea of pedidos) {
    if (!RECURSOS.includes(linea.recurso)) continue;
    const r = asignarLinea(linea, { ofertas: validas, reservas: ocupadas, lote });
    lineas.push(r);
    for (const a of r.asignaciones) ocupadas.push({ ofertaId: a.ofertaId, unidades: a.unidades, desde: a.desde, hasta: a.hasta });
  }
  const pedidas = lineas.reduce((a, l) => a + l.linea.cantidad, 0);
  const cubiertas = lineas.reduce((a, l) => a + (l.linea.cantidad - l.faltan), 0);
  const faltantes = lineas.filter((l) => !l.cubierta).map((l) => ({
    recurso: l.linea.recurso,
    faltan: l.faltan,
    desde: l.linea.usar_desde,
    hasta: l.linea.usar_hasta,
    sugerencia: l.candidatas === 0
      ? 'no hay proveedores con ese recurso y fechas en la zona: ampliar el radio o mover la fecha de cosecha'
      : 'los proveedores de la zona no alcanzan: pedir antes, mover la fecha o aceptar otro tipo de equipo',
  }));
  return {
    lineas,
    coberturaPct: pedidas ? redondear((100 * cubiertas) / pedidas, 1) : 100,
    completa: faltantes.length === 0,
    faltantes,
    costoUsd: lineas.reduce((a, l) => a + l.asignaciones.reduce((b, x) => b + x.costoUsd, 0), 0),
  };
}

/**
 * Convierte una asignación en reservas. Las de transporte llevan el destino del grano y la
 * capacidad del camión: con ellas se pronostica cuántos camiones llegan a cada puerto cada día.
 * @param {{ asignacion:object, loteId:string, destino:{ tipo:'puerto'|'acopio'|'silobolsa', puerto?:string, nombre?:string },
 *           capacidadCamionT?:Object<string,number> }} entrada
 */
export function crearReservas({ asignacion, loteId, destino, capacidadCamionT = {} }) {
  const reservas = [];
  let n = 0;
  for (const { linea, asignaciones } of asignacion.lineas) {
    for (const a of asignaciones) {
      n++;
      const esCamion = a.recurso === 'camión';
      reservas.push({
        id: `${loteId}-${String(n).padStart(2, '0')}`,
        loteId,
        ofertaId: a.ofertaId,
        proveedor: a.proveedor,
        recurso: a.recurso,
        tipo: a.tipo,
        unidades: a.unidades,
        desde: a.desde,
        hasta: a.hasta,
        costoUsd: a.costoUsd,
        ...(esCamion ? {
          destinoTipo: destino?.tipo ?? null,
          puerto: destino?.tipo === 'puerto' ? destino.puerto ?? null : null,
          destino: destino?.nombre ?? null,
          viajesPorDia: linea.viajes_por_dia ?? 1,
          capacidadT: capacidadCamionT[a.tipo] ?? 30,
        } : {}),
      });
    }
  }
  return reservas;
}

// Reservas que se superponen con un rango (para consultar ocupación).
export function reservasEnRango(reservas, desde, hasta) {
  return reservas.filter((r) => solapa(r, { desde, hasta }));
}
