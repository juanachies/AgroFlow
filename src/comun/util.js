// Utilidades de fechas (siempre UTC, formato YYYY-MM-DD) y de probabilidad.

const MS_DIA = 86_400_000;

export function aFecha(fecha) {
  if (fecha instanceof Date) return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(a, m - 1, d));
}

export function iso(fecha) {
  return aFecha(fecha).toISOString().slice(0, 10);
}

export function sumarDias(fecha, dias) {
  return iso(new Date(aFecha(fecha).getTime() + Math.round(dias) * MS_DIA));
}

export function diasEntre(desde, hasta) {
  return Math.round((aFecha(hasta) - aFecha(desde)) / MS_DIA);
}

export function mesDe(fecha) {
  return aFecha(fecha).getUTCMonth();
}

// Función de distribución normal estándar (aproximación de Abramowitz-Stegun 7.1.26).
export function normalCDF(x, media = 0, desvio = 1) {
  if (desvio <= 0) return x >= media ? 1 : 0;
  const z = (x - media) / (desvio * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + Math.sign(z) * y);
}

// Probabilidad de que una variable normal caiga en el día entero `d` (intervalo [d-0.5, d+0.5)).
export function masaNormalDia(d, media, desvio) {
  return normalCDF(d + 0.5, media, desvio) - normalCDF(d - 0.5, media, desvio);
}

// Generador pseudoaleatorio con semilla (mulberry32), para simulaciones reproducibles.
export function rng(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function redondear(x, decimales = 2) {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}
