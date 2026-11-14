// Módulo Barcos (independiente). API pública.
//
// No depende de Venta, Cadetes ni de precios. Entrega:
//   - disponibilidad diaria de barcos (P(barco), barcos en puerto, capacidad, calado)
//   - señal por día para otros módulos (espera si llego ese día, índice de demanda, factor de precio)
//   - avisos propios (bajante, poca disponibilidad, perder barco, baja confianza)
export { PUERTOS, PARAMS_DEFAULT, BARCOS_SEMANA_BASE, ESTACIONALIDAD } from './datos.js';
export { parsearLineupCSV, simularLineup, validarBarco } from './lineup.js';
export {
  factorCalado,
  predecirDisponibilidad,
  esperaEsperada,
  riesgoPerderBarco,
  senalPorDia,
  avisosBarcos,
  ordenar,
} from './prediccion.js';

export { calcularIndicesMercado, demandaDiariaBarcos, PARAMS_INDICES, SOJA_POR_T_HARINA } from './indices.js';
export { parsearLineupNABSA, nabsaALineup, toneladasProgramadas } from './fuentes/nabsa.js';
export { parsearBuquesBCR, parsearCamionesBCR } from './fuentes/bcr.js';

import { predecirDisponibilidad, senalPorDia, avisosBarcos } from './prediccion.js';

// Punto de entrada del módulo: todo lo que los demás necesitan saber de los barcos.
export function analizarBarcos({ lineup = [], puerto, cultivo, hoy, horizonteDias = 60, nivelParanaM = null, params = {} }) {
  const disponibilidad = predecirDisponibilidad({ lineup, puerto, cultivo, hoy, horizonteDias, nivelParanaM, params });
  return {
    puerto,
    cultivo,
    hoy: disponibilidad.hoy,
    calado: disponibilidad.calado,
    disponibilidad,
    senal: senalPorDia(disponibilidad, params),
    avisos: avisosBarcos({ disponibilidad, params }),
  };
}
