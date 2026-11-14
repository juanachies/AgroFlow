// Datos de referencia del módulo Barcos.
// TODO lo que está acá es un SUPUESTO EDITABLE: no hay una fuente abierta y fiable
// de arribos de barcos ni de cola de puerto (ver PROYECTO.md, "Sin fuente abierta").
// El módulo Barcos no conoce precios ni costos: solo predice barcos y emite una señal.

export const PUERTOS = {
  'gran-rosario': {
    nombre: 'Gran Rosario (Up-River)',
    lat: -32.95,
    lon: -60.64,
    dependeParana: true,
    caladoBasePies: 34, // calado habitual de salida del Up-River con río normal
    nivelReferenciaM: 3.5, // altura del hidrómetro de Rosario considerada "normal"
  },
  'bahia-blanca': {
    nombre: 'Bahía Blanca',
    lat: -38.79,
    lon: -62.27,
    dependeParana: false,
    caladoBasePies: 45,
    nivelReferenciaM: null,
  },
  quequen: {
    nombre: 'Quequén',
    lat: -38.57,
    lon: -58.71,
    dependeParana: false,
    caladoBasePies: 40,
    nivelReferenciaM: null,
  },
};

// Barcos graneleros por semana en un mes "promedio" (factor estacional = 1), por puerto y cultivo.
export const BARCOS_SEMANA_BASE = {
  'gran-rosario': { soja: 9, maiz: 11, trigo: 4 },
  'bahia-blanca': { soja: 1.5, maiz: 3, trigo: 4 },
  quequen: { soja: 1.5, maiz: 2, trigo: 3 },
};

// Factor estacional por mes (índice 0 = enero). Gruesa (soja y maíz): pico abril a julio.
// Fina (trigo): pico diciembre a febrero.
export const ESTACIONALIDAD = {
  soja: [0.5, 0.5, 0.7, 1.3, 1.6, 1.5, 1.3, 1.0, 0.8, 0.6, 0.5, 0.5],
  maiz: [0.7, 0.6, 0.8, 1.2, 1.4, 1.4, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7],
  trigo: [1.5, 1.4, 1.0, 0.6, 0.5, 0.4, 0.4, 0.4, 0.5, 0.7, 1.1, 1.6],
};

export const PARAMS_DEFAULT = {
  // Hasta cuántos días hacia adelante el line-up publicado se considera completo.
  // Más allá, los barcos todavía no están nominados y se usa la tasa estacional.
  horizonteLineupDias: 21,
  // Diferencia entre ETA declarada y arribo real, en días (media y desvío) por puerto.
  demoraEta: {
    'gran-rosario': { media: 1.5, desvio: 2.5 },
    'bahia-blanca': { media: 1.0, desvio: 2.0 },
    quequen: { media: 1.0, desvio: 2.0 },
  },
  // Días que un barco está disponible para recibir grano (fondeo + carga).
  diasEstadiaBarco: 5,
  // Carga típica de un granelero con calado base y toneladas que pierde por cada pie menos.
  cargaBarcoBaseT: 45000,
  toneladasPorPie: 1800,
  // Cada metro que baja el Paraná bajo la referencia resta estos pies de calado.
  piesPorMetroBajante: 3.3,
  // Señal de precio: cuánto se mueve el disponible por cada 100% de desvío de la demanda
  // de barcos respecto de lo normal del mes (0,03 = ±3%). Tope ±1 en el desvío.
  sensibilidadPrecioDemanda: 0.03,
  // Incertidumbre de la llegada del grano al puerto (lluvia, cola en ruta), en días.
  desvioLlegadaGranoDias: 1.5,
  // Umbrales de los avisos de barcos.
  toleranciaDias: 3,
  umbralProbBarco: 0.8,
  umbralRiesgoPerderBarco: 0.2,
  umbralFactorCalado: 0.9,
};

export function demoraEtaDe(puerto, params = PARAMS_DEFAULT) {
  return params.demoraEta?.[puerto] ?? { media: 1.5, desvio: 2.5 };
}

export function conParams(params) {
  return { ...PARAMS_DEFAULT, ...params, demoraEta: { ...PARAMS_DEFAULT.demoraEta, ...params?.demoraEta } };
}
