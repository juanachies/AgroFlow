// Dominio Barcos: cola de buques y disponibilidad de barcos en el puerto (función pura).
//
// Es independiente: no conoce precios, costos, destinos ni cadetes. Produce una SEÑAL
// por día que consumen otros módulos (Venta, Cadetes, IA).
//
// Método (determinista y auditable):
//  1. Arribos esperados por día =
//       masa de probabilidad del line-up (ETA declarada + demora histórica ~ Normal)
//     + tasa estacional del puerto × fracción de barcos aún no nominados.
//     La fracción no nominada crece de 0 (hoy) a 1 (fin del horizonte del line-up).
//  2. Barcos en puerto el día d = arribos de los últimos `diasEstadiaBarco` días.
//  3. P(hay barco el día d) = 1 − exp(−barcos en puerto)  (Poisson).
//  4. Índice de demanda = barcos en puerto ÷ barcos normales del mes.
//     Factor de precio = 1 + sensibilidad × clamp(índice − 1, −1, 1).
//  5. Espera esperada si el grano llega el día d = Σ_k Π_{j<k} (1 − p_j)
//     (aproxima los días como independientes).
//  6. El nivel del Paraná baja el calado y con eso la carga por barco.

import { PUERTOS, BARCOS_SEMANA_BASE, ESTACIONALIDAD, PARAMS_DEFAULT, demoraEtaDe, conParams } from './datos.js';
import { factorCalado } from './calado.js';
import { iso, sumarDias, diasEntre, mesDe, normalCDF, masaNormalDia, redondear } from '../shared/util.js';
import { validarBarco } from './lineup.js';

// Pronóstico diario de disponibilidad de barcos para un puerto y cultivo.
export function predecirDisponibilidad({ lineup = [], puerto, cultivo, hoy, horizonteDias = 60, nivelParanaM = null, params = {} }) {
  const p = conParams(params);
  if (!PUERTOS[puerto]) throw new Error(`Puerto desconocido: ${puerto}`);
  if (!ESTACIONALIDAD[cultivo]) throw new Error(`Cultivo desconocido: ${cultivo}`);
  if (!hoy) throw new Error('Falta la fecha `hoy`');
  hoy = iso(hoy);

  const E = p.diasEstadiaBarco;
  const H = horizonteDias;
  const offset = E; // índice 0 del arreglo = día −E
  const arribosLineup = new Array(H + E + 1).fill(0);
  const arribosLineupT = new Array(H + E + 1).fill(0); // toneladas declaradas de esos barcos
  const arribosEstac = new Array(H + E + 1).fill(0);
  const normalEstac = new Array(H + E + 1).fill(0); // tasa estacional completa, para el índice

  const barcos = lineup.map(validarBarco).filter((b) => b.puerto === puerto && b.cultivo === cultivo);
  const hayLineup = lineup.some((b) => b.puerto === puerto);
  const demora = demoraEtaDe(puerto, p);

  for (const b of barcos) {
    const eta = diasEntre(hoy, b.eta);
    if (b.estado !== 'anunciado') {
      // Ya está en puerto: llegada conocida (si la ETA quedó en el futuro, se toma hoy).
      const d = Math.max(-E, Math.min(0, eta));
      arribosLineup[d + offset] += 1;
      arribosLineupT[d + offset] += b.toneladas;
      continue;
    }
    // Anunciado: arribo = ETA + demora ~ Normal, condicionado a que todavía no llegó.
    // La masa más allá del horizonte no se cuenta.
    const media = eta + demora.media;
    const escala = 1 / Math.max(1e-9, 1 - normalCDF(-0.5, media, demora.desvio));
    for (let d = 0; d <= H; d++) {
      const m = masaNormalDia(d, media, demora.desvio) * escala;
      arribosLineup[d + offset] += m;
      arribosLineupT[d + offset] += m * b.toneladas;
    }
  }

  const base = BARCOS_SEMANA_BASE[puerto]?.[cultivo] ?? 0;
  for (let d = -E; d <= H; d++) {
    const tasa = (base / 7) * ESTACIONALIDAD[cultivo][mesDe(sumarDias(hoy, d))];
    normalEstac[d + offset] = tasa;
    if (d < 0) continue; // el pasado lo cubre el line-up
    const noNominada = hayLineup ? Math.min(1, d / p.horizonteLineupDias) : 1;
    arribosEstac[d + offset] = tasa * noNominada;
  }

  const calado = factorCalado(puerto, nivelParanaM, p);
  const dias = [];
  for (let d = 0; d <= H; d++) {
    let presentes = 0;
    let presentesLineup = 0;
    let capacidadT = 0;
    let normal = 0;
    for (let k = d - E + 1; k <= d; k++) {
      presentes += arribosLineup[k + offset] + arribosEstac[k + offset];
      presentesLineup += arribosLineup[k + offset];
      // Barcos del line-up: sus toneladas declaradas. No nominados: carga típica con el calado actual.
      capacidadT += arribosLineupT[k + offset] + arribosEstac[k + offset] * calado.cargaPorBarcoT;
      normal += normalEstac[k + offset];
    }
    const fraccionLineup = presentes > 0 ? presentesLineup / presentes : 0;
    const indiceDemanda = normal > 0 ? presentes / normal : 0;
    dias.push({
      fecha: sumarDias(hoy, d),
      arribosEsperados: redondear(arribosLineup[d + offset] + arribosEstac[d + offset], 3),
      barcosEnPuerto: redondear(presentes, 3),
      probHayBarco: redondear(1 - Math.exp(-presentes), 4),
      capacidadT: Math.round(capacidadT),
      // >1 más barcos que lo habitual (el disponible tiende a pagar mejor),
      // <1 menos barcos (se castiga el disponible y hay más espera).
      indiceDemanda: redondear(indiceDemanda, 3),
      factorPrecio: redondear(1 + p.sensibilidadPrecioDemanda * Math.max(-1, Math.min(1, indiceDemanda - 1)), 4),
      fuente: fraccionLineup > 0.8 ? 'line-up' : fraccionLineup < 0.2 ? 'estacional' : 'mixta',
    });
  }

  return { puerto, cultivo, hoy, horizonteDias: H, calado, hayLineup, barcosConsiderados: barcos.length, dias };
}

// Espera esperada (días) desde que el grano llega al puerto hasta que hay barco.
export function esperaEsperada(disponibilidad, fechaLlegada, toleranciaDias = PARAMS_DEFAULT.toleranciaDias) {
  const i = diasEntre(disponibilidad.hoy, fechaLlegada);
  const dias = disponibilidad.dias;
  if (i < 0 || i >= dias.length) return null;
  let supervivencia = 1; // P(todavía no hubo barco)
  let espera = 0;
  let mediana = null;
  let probEnTolerancia = null;
  for (let k = i; k < dias.length; k++) {
    supervivencia *= 1 - dias[k].probHayBarco;
    if (mediana === null && supervivencia <= 0.5) mediana = k - i;
    if (k - i === toleranciaDias) probEnTolerancia = 1 - supervivencia;
    if (k + 1 < dias.length) espera += supervivencia;
  }
  if (probEnTolerancia === null) probEnTolerancia = 1 - supervivencia;
  return {
    fechaLlegada: iso(fechaLlegada),
    esperaDias: redondear(espera, 2),
    medianaDias: mediana,
    probBarcoEnTolerancia: redondear(probEnTolerancia, 4),
    toleranciaDias,
    truncada: supervivencia > 0.01, // el horizonte no alcanza para cerrar la espera
    fuente: dias[i].fuente,
  };
}

// Riesgo de perder un barco puntual (p. ej. el que tiene el comprador) y de llegar antes.
export function riesgoPerderBarco({ barco, fechaLlegadaGrano, params = {} }) {
  const p = conParams(params);
  const b = validarBarco(barco);
  const demora = b.estado === 'anunciado' ? demoraEtaDe(b.puerto, p) : { media: 0, desvio: 0.5 };
  const llegadaBarco = diasEntre(fechaLlegadaGrano, b.eta) + demora.media; // relativo a la llegada del grano
  const finVentana = llegadaBarco + p.diasEstadiaBarco;
  const desvio = Math.hypot(demora.desvio, p.desvioLlegadaGranoDias);
  return {
    buque: b.buque,
    llegadaBarcoEstimada: sumarDias(fechaLlegadaGrano, llegadaBarco),
    finVentanaEstimada: sumarDias(fechaLlegadaGrano, finVentana),
    // (fin ventana − llegada grano) ~ Normal(finVentana, desvio): se pierde si es < 0.
    probPerderBarco: redondear(normalCDF(0, finVentana, desvio), 4),
    // (llegada barco − llegada grano) > 0: el grano llega primero y espera.
    probEsperarBarco: redondear(1 - normalCDF(0, llegadaBarco, desvio), 4),
  };
}

// Señal por día para los demás módulos: qué pasa si el grano llega al puerto ese día.
export function senalPorDia(disponibilidad, params = {}) {
  const p = conParams(params);
  return disponibilidad.dias.map((d) => {
    const e = esperaEsperada(disponibilidad, d.fecha, p.toleranciaDias);
    return {
      fecha: d.fecha,
      probHayBarco: d.probHayBarco,
      indiceDemanda: d.indiceDemanda,
      factorPrecio: d.factorPrecio,
      capacidadT: d.capacidadT,
      esperaDias: e.esperaDias,
      probBarcoEnTolerancia: e.probBarcoEnTolerancia,
      confiable: !e.truncada,
      fuente: d.fuente,
    };
  });
}

// Avisos propios de los barcos para una fecha de llegada al puerto (opcional).
export function avisosBarcos({ disponibilidad, fechaLlegada = null, barcoContratado = null, params = {} }) {
  const p = conParams(params);
  const avisos = [];
  const agregar = (tipo, nivel, fecha, mensaje, datos = {}) => avisos.push({ modulo: 'barcos', tipo, nivel, fecha, mensaje, datos });
  const { calado, hoy } = disponibilidad;
  const nombrePuerto = PUERTOS[disponibilidad.puerto].nombre;

  if (calado.factor < p.umbralFactorCalado) {
    agregar('bajante', 'alerta', hoy,
      `Bajante del Paraná: calado ${calado.caladoPies} pies, cada barco carga ~${Math.round((1 - calado.factor) * 100)}% menos. Menos capacidad de embarque y presión sobre el precio en ${nombrePuerto}.`,
      calado);
  }
  if (!fechaLlegada) return ordenar(avisos);

  const e = esperaEsperada(disponibilidad, fechaLlegada, p.toleranciaDias);
  if (!e) {
    agregar('fuera-de-horizonte', 'info', hoy,
      `La llegada al puerto (${iso(fechaLlegada)}) está fuera del horizonte de pronóstico (${disponibilidad.horizonteDias} días). Se reestima más cerca de la fecha.`);
    return ordenar(avisos);
  }
  if (e.probBarcoEnTolerancia < p.umbralProbBarco) {
    agregar('poca-disponibilidad', 'alerta', e.fechaLlegada,
      `Probabilidad de tener barco dentro de los ${p.toleranciaDias} días de llegar (${e.fechaLlegada}): ${Math.round(e.probBarcoEnTolerancia * 100)}%. Espera estimada ${e.esperaDias} días.`,
      e);
  }
  if (e.fuente === 'estacional') {
    agregar('baja-confianza', 'info', e.fechaLlegada,
      'La fecha de llegada está más allá del line-up publicado: el pronóstico usa solo estacionalidad. Revisar cuando se publique el line-up.');
  }
  if (barcoContratado) {
    const r = riesgoPerderBarco({ barco: barcoContratado, fechaLlegadaGrano: e.fechaLlegada, params: p });
    if (r.probPerderBarco > p.umbralRiesgoPerderBarco) {
      agregar('perder-barco', 'critico', e.fechaLlegada,
        `Riesgo ${Math.round(r.probPerderBarco * 100)}% de llegar después de que el ${r.buque} termine de cargar (fin estimado ${r.finVentanaEstimada}). Adelantar el despacho.`, r);
    }
  }
  return ordenar(avisos);
}

const PESO = { critico: 0, alerta: 1, info: 2 };
export function ordenar(avisos) {
  return avisos.sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.fecha.localeCompare(b.fecha));
}
