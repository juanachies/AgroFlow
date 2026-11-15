// Decisión completa de la campaña: cuándo cosechar, cuándo y adónde transportar y cómo almacenar,
// más un almanaque día por día (dominio puro). Parte de la simulación del plan (destino, pedidos,
// saturación del puerto) y la ajusta con el clima para elegir los mejores días de cosecha.

import { sumarDias, diasEntre } from '../shared/util.js';

export const MARGEN_BUSQUEDA_DIAS = 10;
const MARGEN_ALMANAQUE_DIAS = 7;
const PENALIZACION = { malo: 3, regular: 1, desconocido: 1, bueno: 0 };

const mismoDia = (a, b) => a === b;
const enRango = (fecha, desde, hasta) => Boolean(desde && hasta) && fecha >= desde && fecha <= hasta;
const menor = (valores) => valores.reduce((a, b) => (a < b ? a : b));
const mayor = (valores) => valores.reduce((a, b) => (a > b ? a : b));

function penalizacionDelTramo(diasPorFecha, desde, duracion) {
  let total = 0;
  for (let i = 0; i < duracion; i += 1) total += PENALIZACION[diasPorFecha.get(sumarDias(desde, i))?.apto ?? 'desconocido'];
  return total;
}

function elegirInicioDeCosecha({ diasPorFecha, inicioPlan, duracion, hoy }) {
  let mejor = null;
  for (let corrimiento = -MARGEN_BUSQUEDA_DIAS; corrimiento <= MARGEN_BUSQUEDA_DIAS; corrimiento += 1) {
    const inicio = sumarDias(inicioPlan, corrimiento);
    if (hoy && inicio < hoy) continue;
    const penalizacion = penalizacionDelTramo(diasPorFecha, inicio, duracion);
    const candidato = { inicio, corrimiento, penalizacion };
    const gana = !mejor
      || penalizacion < mejor.penalizacion
      || (penalizacion === mejor.penalizacion && Math.abs(corrimiento) < Math.abs(mejor.corrimiento));
    if (gana) mejor = candidato;
  }
  return mejor ?? { inicio: inicioPlan, corrimiento: 0, penalizacion: 0 };
}

// Estrategia rápida: el primer día, hasta MARGEN_RAPIDO_DIAS antes del plan, desde el que casi no llueve fuerte.
export const MARGEN_RAPIDO_DIAS = 10;
export const MAX_DIAS_MALOS_RAPIDO = 1;

function elegirInicioRapido({ diasPorFecha, inicioPlan, duracion, hoy }) {
  let mejor = null;
  for (let corrimiento = -MARGEN_RAPIDO_DIAS; corrimiento <= 0; corrimiento += 1) {
    const inicio = sumarDias(inicioPlan, corrimiento);
    if (hoy && inicio < hoy) continue;
    let malos = 0;
    for (let i = 0; i < duracion; i += 1) malos += diasPorFecha.get(sumarDias(inicio, i))?.apto === 'malo' ? 1 : 0;
    if (malos <= MAX_DIAS_MALOS_RAPIDO) return inicio;
    if (!mejor || malos < mejor.malos) mejor = { inicio, malos };
  }
  return mejor?.inicio ?? inicioPlan;
}

function contarCalidad(diasPorFecha, desde, hasta) {
  const cuenta = { bueno: 0, regular: 0, malo: 0, desconocido: 0 };
  const fuentes = new Set();
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const dia = diasPorFecha.get(fecha);
    cuenta[dia?.apto ?? 'desconocido'] += 1;
    fuentes.add(dia?.fuente ?? 'sin-dato');
  }
  const fuente = fuentes.size === 1 ? [...fuentes][0] : 'mixta';
  return { ...cuenta, fuente };
}

function describirAlmacenaje({ rec, pedidos, simulacion, cosecha, transporte, toneladas, corrimiento }) {
  const silobolsas = pedidos.filter((p) => p.recurso === 'silobolsa');
  if (rec.tipo === 'silobolsa') {
    return {
      modalidad: 'silobolsa',
      destino: rec.destino,
      toneladas,
      silobolsas: silobolsas.reduce((suma, p) => suma + p.cantidad, 0) || null,
      desde: cosecha.inicio,
      hasta: cosecha.fin,
      pedirAntesDel: silobolsas.length ? sumarDias(menor(silobolsas.map((p) => p.pedir_antes_del)), corrimiento) : null,
      detalle: 'Embolsar en el campo durante la cosecha y vender cuando el riesgo y el precio lo permitan.',
    };
  }
  if (rec.tipo === 'acopio') {
    return {
      modalidad: 'acopio', destino: rec.destino, toneladas, desde: transporte?.desde ?? cosecha.inicio, hasta: transporte?.hasta ?? cosecha.fin, pedirAntesDel: null,
      detalle: 'Entregar la cosecha en el acopio; no hace falta almacenaje propio.',
    };
  }
  const espera = simulacion.ventana?.desplazamientoDias ?? 0;
  return {
    modalidad: 'directo al puerto', destino: rec.destino, toneladas, desde: cosecha.inicio, hasta: transporte?.hasta ?? cosecha.fin, pedirAntesDel: null,
    esperaEnCampoDias: espera,
    detalle: espera > 0
      ? `El grano espera ${espera} días en el campo (tolva o silobolsa temporal) hasta la ventana sin cola del puerto.`
      : 'Se despacha al puerto durante la cosecha, sin almacenaje intermedio.',
  };
}

function armarAlmanaque({ desde, hasta, diasPorFecha, cosecha, transporte, pedirAntesDel, saturacionPorFecha }) {
  const almanaque = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const clima = diasPorFecha.get(fecha);
    almanaque.push({
      fecha,
      clima: clima
        ? { apto: clima.apto, fuente: clima.fuente, lluviaMm: clima.lluviaMm, probFuerte: clima.probFuerte }
        : { apto: 'desconocido', fuente: 'sin-dato', lluviaMm: null, probFuerte: null },
      cosecha: enRango(fecha, cosecha.inicio, cosecha.fin),
      transporte: enRango(fecha, transporte?.desde, transporte?.hasta),
      pedir: mismoDia(fecha, pedirAntesDel),
      saturacion: saturacionPorFecha.get(fecha) ?? null,
    });
  }
  return almanaque;
}

/**
 * @param {{ simulacion: object, dias: object[], hoy?: string }} entrada
 *   simulacion: salida de simularPlan(); dias: salida de combinarPronostico()
 */
export function decidirOperacion({ simulacion, dias = [], hoy = null }) {
  const rec = simulacion?.plan?.recomendado;
  if (!rec) throw new TypeError('decidirOperacion necesita la salida de simularPlan()');

  const pedidos = rec.pedidos ?? [];
  const deCosecha = pedidos.filter((p) => p.servicio === 'cosecha');
  const inicioPlan = deCosecha.length ? menor(deCosecha.map((p) => p.usar_desde)) : simulacion.entrada?.fechaInicioCosecha;
  if (!inicioPlan) throw new RangeError('no hay fecha de inicio de cosecha para decidir');
  const finPlan = deCosecha.length ? mayor(deCosecha.map((p) => p.usar_hasta)) : sumarDias(inicioPlan, (simulacion.plan.dias_efectivos ?? 1) - 1);
  const duracion = diasEntre(inicioPlan, finPlan) + 1;
  const diasPorFecha = new Map(dias.map((dia) => [dia.fecha, dia]));

  const eleccion = elegirInicioDeCosecha({ diasPorFecha, inicioPlan, duracion, hoy });
  const inicio = eleccion.inicio;
  const fin = sumarDias(inicio, duracion - 1);
  const calidad = contarCalidad(diasPorFecha, inicio, fin);
  const cosecha = {
    inicio, fin, dias: duracion,
    corrimientoDias: eleccion.corrimiento,
    inicioMasRapido: elegirInicioRapido({ diasPorFecha, inicioPlan, duracion, hoy }),
    diasBuenos: calidad.bueno, diasRegulares: calidad.regular, diasMalos: calidad.malo, diasSinDato: calidad.desconocido,
    fuenteClima: calidad.fuente,
    recursos: deCosecha.map((p) => ({ recurso: p.recurso, cantidad: p.cantidad, pedirAntesDel: sumarDias(p.pedir_antes_del, eleccion.corrimiento) })),
  };

  const camiones = pedidos.filter((p) => p.recurso === 'camión');
  const saturacionPorFecha = new Map((simulacion.saturacion?.dias ?? []).map((d) => [d.fecha, d.estado]));
  let transporte = null;
  if (camiones.length) {
    const desde = sumarDias(menor(camiones.map((p) => p.usar_desde)), eleccion.corrimiento);
    const hasta = sumarDias(mayor(camiones.map((p) => p.usar_hasta)), eleccion.corrimiento);
    const diasSaturados = [];
    for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
      if (saturacionPorFecha.get(fecha) === 'saturado') diasSaturados.push(fecha);
    }
    transporte = {
      desde, hasta, destino: rec.destino, tipoDestino: rec.tipo,
      camiones: camiones.reduce((suma, p) => suma + p.cantidad, 0),
      pedirAntesDel: sumarDias(menor(camiones.map((p) => p.pedir_antes_del)), eleccion.corrimiento),
      diasSaturados,
      distanciaKm: simulacion.distancias?.find((d) => d.destino === rec.destino)?.km
        ?? simulacion.entrada?.destinos?.find((d) => (d.nombre ?? d.terminal) === rec.destino)?.distanciaKm
        ?? null,
    };
  }

  const toneladas = simulacion.plan.toneladas;
  const almacenaje = describirAlmacenaje({ rec, pedidos, simulacion, cosecha, transporte, toneladas, corrimiento: eleccion.corrimiento });

  const fechasDePedido = [
    ...cosecha.recursos.map((r) => r.pedirAntesDel),
    transporte?.pedirAntesDel,
    almacenaje.pedirAntesDel,
  ].filter(Boolean);
  const pedirAntesDel = fechasDePedido.length ? menor(fechasDePedido) : null;

  const diasClave = [
    pedirAntesDel && { fecha: pedirAntesDel, tipo: 'pedir', titulo: 'Confirmar reservas', detalle: 'Último día para reservar cosechadoras, camiones y silobolsas.' },
    { fecha: cosecha.inicio, tipo: 'inicio-cosecha', titulo: 'Empieza la cosecha', detalle: `${cosecha.dias} días de cosecha` },
    { fecha: cosecha.fin, tipo: 'fin-cosecha', titulo: 'Termina la cosecha', detalle: null },
    transporte && { fecha: transporte.desde, tipo: 'inicio-transporte', titulo: 'Empieza el transporte', detalle: `${transporte.camiones} camiones a ${transporte.destino}` },
    transporte && { fecha: transporte.hasta, tipo: 'fin-transporte', titulo: 'Termina el transporte', detalle: null },
  ].filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const extremos = [cosecha.inicio, transporte?.desde, pedirAntesDel].filter(Boolean);
  const almanaque = armarAlmanaque({
    desde: sumarDias(menor(extremos), -MARGEN_ALMANAQUE_DIAS),
    hasta: sumarDias(mayor([cosecha.fin, transporte?.hasta ?? cosecha.fin]), MARGEN_ALMANAQUE_DIAS),
    diasPorFecha, cosecha, transporte, pedirAntesDel, saturacionPorFecha,
  });

  const alertas = [];
  if (pedirAntesDel && hoy && pedirAntesDel < hoy) {
    alertas.push({ nivel: 'critico', mensaje: `El plazo para reservar (${pedirAntesDel}) ya pasó: confirmá hoy las reservas.` });
  }
  if (cosecha.diasMalos > 0) {
    alertas.push({ nivel: 'alerta', mensaje: `${cosecha.diasMalos} día(s) del rango de cosecha tienen lluvia fuerte esperable (5 mm o más o alta probabilidad histórica). Conviene tener margen.` });
  }
  if (eleccion.corrimiento !== 0) {
    const sentido = eleccion.corrimiento > 0 ? 'atrasó' : 'adelantó';
    alertas.push({ nivel: 'info', mensaje: `Se ${sentido} el inicio de cosecha ${Math.abs(eleccion.corrimiento)} día(s) respecto del plan para evitar lluvia.` });
  }
  if (transporte?.diasSaturados.length) {
    alertas.push({ nivel: 'alerta', mensaje: `${transporte.diasSaturados.length} día(s) de transporte caen con el puerto saturado: revisá la ventana de despacho.` });
  }
  if (['climatologia', 'mixta'].includes(cosecha.fuenteClima)) {
    alertas.push({ nivel: 'info', mensaje: 'Fuera de los 16 días de pronóstico, el clima se estima con la frecuencia histórica de lluvia de esa fecha: es una probabilidad, no un pronóstico.' });
  }
  if (cosecha.fuenteClima === 'sin-dato') {
    alertas.push({ nivel: 'info', mensaje: 'No hay datos de clima: las fechas salen del plan sin ajustar por lluvia.' });
  }

  return {
    cosecha, transporte, almacenaje, diasClave, almanaque, alertas,
    resumen: armarResumen({ cosecha, transporte, almacenaje }),
  };
}

function armarResumen({ cosecha, transporte, almacenaje }) {
  const partes = [`Cosechá del ${cosecha.inicio} al ${cosecha.fin} (${cosecha.dias} días)`];
  if (transporte) partes.push(`transportá del ${transporte.desde} al ${transporte.hasta} a ${transporte.destino} con ${transporte.camiones} camiones`);
  partes.push(almacenaje.modalidad === 'silobolsa' ? `almacená en silobolsa (${almacenaje.silobolsas ?? '?'} bolsas)` : `almacenaje: ${almacenaje.modalidad}`);
  return `${partes.join(', ')}.`;
}
