// Caso de uso central del producto: "planificá la cosecha y el despacho para no quedar en la cola".
//
//   1. Plan de cosecha (planificarCosecha): adónde mandar el grano por margen neto y qué contratar.
//   2. Saturación del puerto: si hay un destino puerto, pronóstico día por día con la demanda de los
//      barcos y los camiones reservados en el marketplace (dato propio). Si los días de despacho caen
//      en saturación, sugiere la ventana de entrega más cercana que la evita.
//   3. Marketplace de cadetes: asigna cada línea del plan (cosechadoras, tolvas, camiones,
//      embolsadoras) a proveedores de la zona con disponibilidad. Los camiones se piden para la
//      ventana de entrega sugerida.
// No reserva nada: devuelve una propuesta. Para reservar, confirmarReservas().

import { puertoDeTerminal, ordenar } from '../../domain/barcos/index.js';
import { mejorVentanaDeEntrega } from '../../domain/saturacion/index.js';
import { crearConsultarSaturacion } from './consultarSaturacion.js';
import { asignarPlan, crearReservas } from '../../domain/marketplace/index.js';
import { sumarDias, diasEntre } from '../../domain/shared/util.js';

function aviso(tipo, nivel, fecha, mensaje, datos = {}) {
  return { modulo: 'plan', tipo, nivel, fecha, mensaje, datos };
}

/**
 * @param {{ planificarCosecha: Function,
 *           marketplace: import('../ports/MarketplacePort.js').MarketplacePort,
 *           barcos?: import('../ports/BarcosPort.js').BarcosPort,
 *           nivelRio?: import('../ports/NivelRioPort.js').NivelRioPort }} dependencias
 */
export function crearSimularPlan({ planificarCosecha, marketplace, barcos = null, nivelRio = null }) {
  const consultarSaturacion = barcos ? crearConsultarSaturacion({ barcos, marketplace, nivelRio }) : null;
  return async function simularPlan(entrada) {
    const hoy = entrada.hoy ?? entrada.fechaInicioCosecha ?? entrada.fechaSiembra;
    const plan = await planificarCosecha(entrada);
    const rec = plan.recomendado;
    let pedidos = rec.pedidos;
    const avisos = [];

    // --- 2. Saturación del puerto ---
    const destinoPuerto = (entrada.destinos ?? []).find((d) => d.tipo === 'puerto');
    let saturacion = null;
    let ventana = null;
    let puerto = null;
    if (barcos && destinoPuerto) {
      puerto = puertoDeTerminal(destinoPuerto.terminal ?? destinoPuerto.nombre ?? 'gran-rosario');
      saturacion = await consultarSaturacion({ puerto, cultivo: entrada.cultivo, hoy, nivelParanaM: entrada.nivelParanaM ?? null, camionesPublicadosDia: entrada.camionesPublicadosDia ?? null, params: entrada.paramsSaturacion });

      const camion = pedidos.find((p) => p.recurso === 'camión');
      if (rec.tipo === 'puerto' && camion) {
        const duracion = diasEntre(camion.usar_desde, camion.usar_hasta) + 1;
        ventana = mejorVentanaDeEntrega({ pronostico: saturacion, desde: camion.usar_desde, duracion, margenDias: entrada.margenDiasDespacho ?? 10, noAntesDe: camion.usar_desde });
        if (ventana?.diasSaturadosOriginal > 0) {
          if (ventana.desplazamientoDias !== 0) {
            const d = ventana.desplazamientoDias;
            pedidos = pedidos.map((p) => (p.recurso === 'camión'
              ? { ...p, usar_desde: ventana.inicio, usar_hasta: ventana.fin, pedir_antes_del: sumarDias(p.pedir_antes_del, d) }
              : p));
            avisos.push(aviso('ventana-despacho', 'alerta', hoy,
              `El puerto se satura ${ventana.diasSaturadosOriginal} de los días previstos para despachar. Despachá entre el ${ventana.inicio} y el ${ventana.fin} (${d} días después de cosechar): el grano espera en el campo (tolva o silobolsa temporal) y se evita la cola.`,
              ventana));
          } else {
            avisos.push(aviso('puerto-saturado', 'alerta', hoy,
              `El puerto se satura ${ventana.diasSaturadosOriginal} días del despacho y no hay una ventana mejor en ±${entrada.margenDiasDespacho ?? 10} días: conviene evaluar acopio o silobolsa.`, ventana));
          }
        } else if (ventana) {
          avisos.push(aviso('ventana-despacho', 'info', hoy, `El puerto no se satura en los días de despacho (${camion.usar_desde} a ${camion.usar_hasta}).`, ventana));
        }
      }
    }

    // --- 3. Marketplace de cadetes ---
    const desde = pedidos.reduce((a, p) => (p.usar_desde < a ? p.usar_desde : a), pedidos[0].usar_desde);
    const hasta = pedidos.reduce((a, p) => (p.usar_hasta > a ? p.usar_hasta : a), pedidos[0].usar_hasta);
    const [ofertas, reservas] = await Promise.all([marketplace.ofertas({ desde, hasta }), marketplace.reservas({ desde, hasta })]);
    const asignacion = asignarPlan({ pedidos, ofertas, reservas, lote: entrada.lote });
    const primerPlazo = pedidos.reduce((a, p) => (p.pedir_antes_del < a ? p.pedir_antes_del : a), pedidos[0].pedir_antes_del);
    const vencidos = pedidos.filter((p) => p.pedir_antes_del < hoy).map((p) => p.recurso);
    if (vencidos.length) {
      avisos.push(aviso('plazo-pedido', 'critico', hoy, `Ya pasó el anticipo recomendado para ${[...new Set(vencidos)].join(', ')}: confirmá hoy las reservas.`, { vencidos }));
    }
    if (asignacion.completa) {
      avisos.push(aviso('marketplace', 'info', hoy, `Hay proveedores para todo el plan (${asignacion.lineas.reduce((a, l) => a + l.asignaciones.length, 0)} reservas, US$ ${asignacion.costoUsd.toLocaleString('es-AR')}).${vencidos.length ? '' : ` Confirmá antes del ${primerPlazo}.`}`, { costoUsd: asignacion.costoUsd, primerPlazo }));
    } else {
      for (const f of asignacion.faltantes) {
        avisos.push(aviso('faltante', 'critico', f.desde, `Faltan ${f.faltan} ${f.recurso}(s) del ${f.desde} al ${f.hasta}: ${f.sugerencia}.`, f));
      }
    }

    return {
      lote: entrada.lote ?? null,
      plan: { ...plan, recomendado: { ...rec, pedidos } },
      saturacion,
      ventana,
      puerto,
      asignacion,
      avisos: ordenar(avisos),
    };
  };
}

/**
 * Confirma la propuesta: crea las reservas en el marketplace. Las de camiones a puerto pasan a
 * contar en el pronóstico de saturación de todos los productores.
 * @param {{ marketplace: import('../ports/MarketplacePort.js').MarketplacePort,
 *           tarifas: import('../ports/TarifasPort.js').TarifasPort }} dependencias
 */
export function crearConfirmarReservas({ marketplace, tarifas }) {
  return async function confirmarReservas({ simulacion, loteId }) {
    if (!simulacion?.asignacion) throw new RangeError('confirmarReservas necesita la salida de simularPlan()');
    const vigentes = await tarifas.vigentes();
    const capacidadCamionT = Object.fromEntries((vigentes.camiones ?? []).map((c) => [c.id, c.capacidad_t]));
    const rec = simulacion.plan.recomendado;
    const reservas = crearReservas({
      asignacion: simulacion.asignacion,
      loteId: loteId ?? simulacion.lote?.id ?? 'lote',
      destino: { tipo: rec.tipo, puerto: rec.tipo === 'puerto' ? simulacion.puerto : null, nombre: rec.destino },
      capacidadCamionT,
    });
    return marketplace.reservar(reservas);
  };
}
