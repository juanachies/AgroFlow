// Efecto del nivel del Paraná sobre el calado y la carga por barco.
// Cada metro de bajante bajo la referencia resta ~3,3 pies; cada pie son ~1.800 t menos por barco.

import { PUERTOS, conParams } from './datos.js';
import { redondear } from '../shared/util.js';

export function factorCalado(puerto, nivelParanaM, params = {}) {
  const p = conParams(params);
  const info = PUERTOS[puerto];
  if (!info) throw new Error(`Puerto desconocido: ${puerto}`);
  let caladoPies = info.caladoBasePies;
  if (info.dependeParana && nivelParanaM != null && Number.isFinite(Number(nivelParanaM))) {
    const bajante = Math.max(0, info.nivelReferenciaM - Number(nivelParanaM));
    caladoPies = info.caladoBasePies - bajante * p.piesPorMetroBajante;
  }
  const perdida = Math.max(0, info.caladoBasePies - caladoPies) * p.toneladasPorPie;
  const cargaPorBarcoT = Math.max(p.cargaBarcoBaseT * 0.5, p.cargaBarcoBaseT - perdida);
  return {
    caladoPies: redondear(caladoPies, 1),
    cargaPorBarcoT: Math.round(cargaPorBarcoT),
    factor: redondear(cargaPorBarcoT / p.cargaBarcoBaseT, 3),
  };
}
