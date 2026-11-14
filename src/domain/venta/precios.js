// Precios spot y futuros (dominio puro).
//
// Spot (disponible) Rosario: pizarra de la Cámara Arbitral de Cereales de Rosario (ARS/t) ÷ tipo de
// cambio, o el disponible en USD/t si se carga directo.
// Futuros: posiciones mensuales de A3 Mercados (ex Matba-Rofex), USD/t, entrega Rosario.
//
//   base(hoy)            = spot − futuro de la posición más cercana
//   precioEsperado(t)    = F(t) + base(t)
//     F(t)  = interpolación lineal de la curva de futuros en la fecha t (plana fuera de los extremos)
//     base(t) converge linealmente a 0 al vencimiento de la posición cercana (los futuros son
//     entrega Rosario: al vencer, futuro y disponible tienden a coincidir).
//   carry(t)             = precioEsperado(t) − spot   (lo que paga el mercado por esperar)
//
// curvaDeVenta(): para 0..N meses, precio esperado menos los costos de guardar (silobolsa fijo,
// merma mensual, interés). El mes con mayor neto es el óptimo; si es 0, conviene vender ya.

import { iso, sumarDias, diasEntre, redondear } from '../shared/util.js';

const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };

// 'MAY27', 'MAY 2027', '2027-05' -> último día del mes de vencimiento ('2027-05-31').
export function vencimientoDePosicion(posicion) {
  const s = String(posicion).trim().toUpperCase();
  let anio;
  let mes;
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) [anio, mes] = [Number(m[1]), Number(m[2])];
  else if ((m = s.match(/^([A-Z]{3})\s*(\d{2}|\d{4})$/)) && MESES[m[1]]) {
    mes = MESES[m[1]];
    anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  } else throw new Error(`Posición de futuro inválida: "${posicion}" (usar MAY27 o 2027-05)`);
  const primeroSiguiente = iso(`${mes === 12 ? anio + 1 : anio}-${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}-01`);
  return sumarDias(primeroSiguiente, -1);
}

export function spotDesdePizarra({ pizarraARSt, tipoCambio }) {
  if (!(pizarraARSt > 0) || !(tipoCambio > 0)) throw new Error('Para convertir la pizarra hacen falta pizarraARSt y tipoCambio positivos');
  return redondear(pizarraARSt / tipoCambio, 2);
}

/**
 * @param {{ hoy:string, spot:{disponibleUSDt?:number, pizarraARSt?:number, tipoCambio?:number, fuente?:string},
 *           futuros:{posicion:string, precioUSDt:number}[], fuente?:string }} entrada
 */
export function construirCurva({ hoy, spot, futuros = [], fuente = null }) {
  if (!hoy) throw new Error('construirCurva necesita `hoy`');
  const spotUSDt = spot?.disponibleUSDt ?? spotDesdePizarra(spot ?? {});
  const puntos = futuros
    .map((f) => ({ posicion: f.posicion, vencimiento: vencimientoDePosicion(f.posicion), precioUSDt: Number(f.precioUSDt) }))
    .filter((f) => f.precioUSDt > 0 && f.vencimiento >= iso(hoy))
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
    .map((f) => ({ ...f, dias: diasEntre(hoy, f.vencimiento) }));
  const cercano = puntos[0] ?? null;
  return {
    hoy: iso(hoy),
    spotUSDt: redondear(spotUSDt, 2),
    puntos,
    cercano,
    baseUSDt: cercano ? redondear(spotUSDt - cercano.precioUSDt, 2) : 0,
    fuente: fuente ?? spot?.fuente ?? null,
  };
}

// Futuro interpolado en una fecha (plano antes del primero y después del último vencimiento).
export function futuroEn(curva, fecha) {
  const p = curva.puntos;
  if (!p.length) return curva.spotUSDt;
  const d = diasEntre(curva.hoy, fecha);
  if (d <= p[0].dias) return p[0].precioUSDt;
  if (d >= p.at(-1).dias) return p.at(-1).precioUSDt;
  const i = p.findIndex((x) => x.dias >= d);
  const a = p[i - 1];
  const b = p[i];
  return a.precioUSDt + ((b.precioUSDt - a.precioUSDt) * (d - a.dias)) / (b.dias - a.dias);
}

export function precioEsperado(curva, fecha) {
  const d = Math.max(0, diasEntre(curva.hoy, fecha));
  if (!curva.puntos.length) return { fecha: iso(fecha), precioUSDt: curva.spotUSDt, futuroUSDt: null, baseUSDt: 0 };
  const futuro = futuroEn(curva, fecha);
  const diasCercano = Math.max(1, curva.cercano.dias);
  const base = curva.baseUSDt * Math.max(0, 1 - d / diasCercano);
  return {
    fecha: iso(fecha),
    precioUSDt: redondear(futuro + base, 2),
    futuroUSDt: redondear(futuro, 2),
    baseUSDt: redondear(base, 2) || 0, // evita -0
  };
}

/**
 * Vender ahora o esperar N meses guardando (por defecto en silobolsa).
 * @param {{ curva:object, desde?:string, meses?:number,
 *           costos?:{ fijoUSDt?:number, mermaMensual?:number, tasaMensual?:number } }} entrada
 *   fijoUSDt: bolsa + embolsado + extracción (se paga una vez si se guarda);
 *   mermaMensual: fracción por mes (del monitoreo IoT); tasaMensual: costo financiero de no cobrar.
 */
export function curvaDeVenta({ curva, desde = curva.hoy, meses = 6, costos = {} }) {
  const { fijoUSDt = 6.5, mermaMensual = 0.005, tasaMensual = 0.01 } = costos;
  const filas = [];
  for (let m = 0; m <= meses; m++) {
    const fecha = sumarDias(desde, 30 * m);
    const pe = m === 0 ? { precioUSDt: curva.spotUSDt, futuroUSDt: null, baseUSDt: curva.baseUSDt } : precioEsperado(curva, fecha);
    const merma = mermaMensual * m;
    const costoUSDt = m === 0 ? 0 : fijoUSDt + curva.spotUSDt * tasaMensual * m;
    const netoUSDt = pe.precioUSDt * (1 - merma) - costoUSDt;
    filas.push({
      meses: m,
      fecha,
      precioEsperadoUSDt: pe.precioUSDt,
      carryUSDt: redondear(pe.precioUSDt - curva.spotUSDt, 2),
      mermaPct: redondear(merma * 100, 2),
      costoGuardarUSDt: redondear(costoUSDt, 2),
      netoUSDt: redondear(netoUSDt, 2),
    });
  }
  const mejor = filas.reduce((a, f) => (f.netoUSDt > a.netoUSDt ? f : a));
  // Precio mínimo que tendría que tener el grano en `m` meses para empatar con vender hoy.
  for (const f of filas) {
    f.precioEquilibrioUSDt = f.meses === 0 ? curva.spotUSDt : redondear((curva.spotUSDt + f.costoGuardarUSDt) / (1 - f.mermaPct / 100), 2);
  }
  return {
    filas,
    mejor,
    venderYa: mejor.meses === 0,
    gananciaEsperarUSDt: redondear(mejor.netoUSDt - filas[0].netoUSDt, 2),
  };
}

/**
 * Curva desde el formato de PreciosPort: { spot: USD/t, futuros: [{ mes: 'AAAA-MM', precio: USD/t }] }.
 */
export function curvaDesdePrecios(hoy, { spot, futuros = [], fuente = null } = {}) {
  if (!(spot > 0)) throw new RangeError('precio spot debe ser un número mayor que 0');
  return construirCurva({
    hoy,
    spot: { disponibleUSDt: spot },
    futuros: futuros.map((f) => ({ posicion: f.mes, precioUSDt: f.precio })),
    fuente,
  });
}
