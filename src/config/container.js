// Único lugar que conecta casos de uso con adaptadores.
// Por ahora arma decidirVenta (barcos + venta + cadetes); el resto de los casos de uso se suma acá.

import { crearDecidirVenta } from '../application/usecases/decidirVenta.js';
import { crearBarcosSimuladosAdapter } from '../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearBarcosManualAdapter } from '../infrastructure/barcos/barcosManualAdapter.js';
import { crearBarcosNabsaAdapter } from '../infrastructure/barcos/nabsaAdapter.js';
import { crearNivelRioManualAdapter } from '../infrastructure/rio/nivelRioManualAdapter.js';

/**
 * @param {Object} opciones
 * @param {'simulado'|'manual'|'nabsa'} [opciones.barcos='simulado']
 * @param {string} [opciones.rutaLineup]   CSV (manual) o texto extraído del PDF (nabsa)
 * @param {Object} [opciones.mercado]      datos BCR de camiones / buques a la carga
 * @param {number|null} [opciones.nivelParanaM]
 */
export function crearContenedor({ barcos = 'simulado', rutaLineup = null, mercado = null, nivelParanaM = null } = {}) {
  const simulado = crearBarcosSimuladosAdapter({ mercado });
  const adaptadorBarcos = barcos === 'nabsa'
    ? crearBarcosNabsaAdapter({ rutaTexto: rutaLineup, mercado })
    : barcos === 'manual'
      ? crearBarcosManualAdapter({ rutaCsv: rutaLineup, mercado })
      : simulado;
  return {
    decidirVenta: crearDecidirVenta({
      barcos: adaptadorBarcos,
      nivelRio: crearNivelRioManualAdapter(nivelParanaM),
      respaldoBarcos: adaptadorBarcos === simulado ? null : simulado,
    }),
  };
}
