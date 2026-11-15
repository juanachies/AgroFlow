// Condiciones de cosecha por cultivo (dominio puro): viento, humedad del grano y su humedad de equilibrio.
//
// Fuentes y estado de cada dato:
//  - humedadBaseRecibo: base de recibo de las normas de comercialización (Cámara Arbitral de Cereales
//    de la BCR). Es oficial; verificar la vigencia de la norma de cada grano antes de usarla en un contrato.
//  - humedadMaximaSilobolsa: humedad máxima de bajo riesgo para embolsar (data/tarifas.json, INTA).
//  - cosechaOptima / viento / isoterma: referencias técnicas generales. No hay una norma oficial de
//    "viento de cosecha": son supuestos editables para calificar días, no mediciones del lote.

export const MERMA_POR_PUNTO_HUMEDAD_PCT = 1.2; // merma por secado, % del peso por cada punto de humedad que se saca
export const SECADO_USD_T_POR_PUNTO = 0.8; // tarifa de secado supuesta, US$/t por punto

// Ráfagas (km/h) que se evalúan en la climatología histórica: cubren todos los umbrales de abajo.
export const UMBRALES_RAFAGA_KMH = [30, 35, 40, 45, 50, 55];

export const CONDICIONES_COSECHA = {
  soja: {
    humedadBaseRecibo: 13.5,
    humedadMaximaSilobolsa: 14,
    cosechaOptima: { minPct: 13, maxPct: 15 },
    viento: { regularKmh: 30, maloKmh: 45 },
    nota: 'La vaina madura se abre y desgrana: con grano por debajo de 12 % o ráfagas fuertes crecen las pérdidas.',
    isoterma: [[30, 7.5], [50, 9.5], [60, 11], [70, 13], [80, 16], [90, 20]],
  },
  maiz: {
    humedadBaseRecibo: 14.5,
    humedadMaximaSilobolsa: 14,
    cosechaOptima: { minPct: 15, maxPct: 22 },
    viento: { regularKmh: 40, maloKmh: 55 },
    nota: 'La planta seca se quiebra y vuelca con viento fuerte; se cosecha más húmedo y se seca.',
    isoterma: [[30, 8], [50, 10.5], [60, 12.5], [70, 14.5], [80, 17], [90, 21]],
  },
  trigo: {
    humedadBaseRecibo: 14,
    humedadMaximaSilobolsa: 14,
    cosechaOptima: { minPct: 12, maxPct: 15 },
    viento: { regularKmh: 35, maloKmh: 50 },
    nota: 'Con viento las espigas maduras desgranan y el cultivo vuelca.',
    isoterma: [[30, 8.5], [50, 11], [60, 12.5], [70, 14.5], [80, 17.5], [90, 22]],
  },
  girasol: {
    humedadBaseRecibo: 11,
    humedadMaximaSilobolsa: 11,
    cosechaOptima: { minPct: 9, maxPct: 12 },
    viento: { regularKmh: 35, maloKmh: 50 },
    nota: 'Los capítulos pesados se quiebran y pierden aquenios con viento fuerte.',
    isoterma: [[30, 4], [50, 5.5], [60, 6.5], [70, 8], [80, 10], [90, 14]],
  },
  sorgo: {
    humedadBaseRecibo: 14,
    humedadMaximaSilobolsa: 14,
    cosechaOptima: { minPct: 14, maxPct: 18 },
    viento: { regularKmh: 40, maloKmh: 55 },
    nota: 'La panoja y el tallo resisten más, pero con ráfagas fuertes hay vuelco y desgrane.',
    isoterma: [[30, 8.5], [50, 10.5], [60, 12.5], [70, 14], [80, 17], [90, 21]],
  },
};

export const condicionesDe = (cultivo) => CONDICIONES_COSECHA[cultivo] ?? null;

function interpolar(puntos, x) {
  if (x <= puntos[0][0]) return puntos[0][1];
  const siguiente = puntos.findIndex(([rh]) => rh >= x);
  if (siguiente === -1) return puntos.at(-1)[1];
  const [x0, y0] = puntos[siguiente - 1];
  const [x1, y1] = puntos[siguiente];
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/** Humedad a la que tiende el grano en equilibrio con el aire (isoterma aproximada a ~25 °C). */
export function humedadDeEquilibrio(cultivo, humedadRelativaPct) {
  const condiciones = condicionesDe(cultivo);
  if (!condiciones || !Number.isFinite(humedadRelativaPct)) return null;
  return interpolar(condiciones.isoterma, humedadRelativaPct);
}

const SUMA_POR_LLUVIA_PUNTOS = 1.5; // el grano se rehumedece el día que llueve fuerte
const LLUVIA_REHUMEDECE_MM = 5;

export function estimarHumedadGrano({ cultivo, humedadRelativaPct, lluviaMm = 0 }) {
  const equilibrio = humedadDeEquilibrio(cultivo, humedadRelativaPct);
  if (equilibrio == null) return null;
  const rehumedecido = Number.isFinite(lluviaMm) && lluviaMm >= LLUVIA_REHUMEDECE_MM ? SUMA_POR_LLUVIA_PUNTOS : 0;
  return Math.round((equilibrio + rehumedecido) * 10) / 10;
}

export function calificarViento(cultivo, rafagaKmh) {
  const condiciones = condicionesDe(cultivo);
  if (!condiciones || !Number.isFinite(rafagaKmh)) return 'desconocido';
  if (rafagaKmh >= condiciones.viento.maloKmh) return 'malo';
  if (rafagaKmh >= condiciones.viento.regularKmh) return 'regular';
  return 'bueno';
}

export function calificarHumedadGrano(cultivo, humedadPct) {
  const condiciones = condicionesDe(cultivo);
  if (!condiciones || !Number.isFinite(humedadPct)) return 'desconocido';
  const { minPct, maxPct } = condiciones.cosechaOptima;
  if (humedadPct > maxPct + 2) return 'malo';
  if (humedadPct > maxPct || humedadPct < minPct) return 'regular';
  return 'bueno';
}

/** Merma y costo de secar el grano hasta la humedad objetivo. */
export function costoDeSecado({ humedadPct, objetivoPct }) {
  const puntos = Number.isFinite(humedadPct) && Number.isFinite(objetivoPct) ? Math.max(0, humedadPct - objetivoPct) : 0;
  return { puntos: Math.round(puntos * 10) / 10, mermaPct: puntos * MERMA_POR_PUNTO_HUMEDAD_PCT, usdPorTonelada: puntos * SECADO_USD_T_POR_PUNTO };
}

// Riesgo de la silobolsa según la humedad con la que se embolsa (data/tarifas.json: merma por mes por nivel).
export const MERMA_SILOBOLSA_MENSUAL_PCT = { bajo: 0.1, medio: 0.5, alto: 2 };

export function riesgoSilobolsaPorHumedad(cultivo, humedadPct) {
  const condiciones = condicionesDe(cultivo);
  if (!condiciones || !Number.isFinite(humedadPct)) return { nivel: 'sin-dato', mermaMensualPct: MERMA_SILOBOLSA_MENSUAL_PCT.medio };
  const exceso = humedadPct - condiciones.humedadMaximaSilobolsa;
  const nivel = exceso <= 0 ? 'bajo' : exceso <= 2 ? 'medio' : 'alto';
  return { nivel, exceso: Math.max(0, Math.round(exceso * 10) / 10), mermaMensualPct: MERMA_SILOBOLSA_MENSUAL_PCT[nivel] };
}
