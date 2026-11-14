// Único lugar que conecta casos de uso con adaptadores.

import { crearCompararDestinos } from '../application/usecases/compararDestinos.js';
import { crearDecidirVenta } from '../application/usecases/decidirVenta.js';
import { crearDecidirVentaCosecha } from '../application/usecases/decidirVentaCosecha.js';
import { crearEvaluarSilobolsa } from '../application/usecases/evaluarSilobolsa.js';
import { crearPlanificarCosecha } from '../application/usecases/planificarCosecha.js';
import { crearTarifasJsonAdapter } from '../infrastructure/tarifas/tarifasJsonAdapter.js';
import { crearBarcosSimuladosAdapter } from '../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearBarcosManualAdapter } from '../infrastructure/barcos/barcosManualAdapter.js';
import { crearBarcosNabsaAdapter } from '../infrastructure/barcos/nabsaAdapter.js';
import { crearNivelRioManualAdapter } from '../infrastructure/rio/nivelRioManualAdapter.js';

// `barcos` puede ser un adaptador ya armado (BarcosPort) o un modo: 'simulado' | 'manual' | 'nabsa'.
function adaptadorDeBarcos(barcos, { rutaLineup, mercado, simulado }) {
  if (barcos && typeof barcos === 'object') return barcos;
  if (barcos === 'nabsa') return crearBarcosNabsaAdapter({ rutaTexto: rutaLineup, mercado });
  if (barcos === 'manual') return crearBarcosManualAdapter({ rutaCsv: rutaLineup, mercado });
  return simulado;
}

/**
 * @param {object} [opciones]
 * @param {object} [opciones.tarifas]      TarifasPort (por defecto data/tarifas.json)
 * @param {object} [opciones.silobolsas]   SilobolsasPort
 * @param {object} [opciones.lecturasIot]  LecturasIotPort
 * @param {object} [opciones.precios]      PreciosPort
 * @param {object|'simulado'|'manual'|'nabsa'} [opciones.barcos] BarcosPort o modo
 * @param {string} [opciones.rutaLineup]   CSV (manual) o texto extraído del PDF (nabsa)
 * @param {object} [opciones.mercado]      datos BCR de camiones / buques a la carga
 * @param {number|null} [opciones.nivelParanaM]
 */
export function crearContenedor({
  tarifas = crearTarifasJsonAdapter(), silobolsas, lecturasIot, precios, barcos,
  rutaLineup = null, mercado = null, nivelParanaM = null,
} = {}) {
  const barcosSimulado = crearBarcosSimuladosAdapter({ mercado });
  const adaptadorBarcos = adaptadorDeBarcos(barcos, { rutaLineup, mercado, simulado: barcosSimulado });

  const compararDestinos = crearCompararDestinos({ tarifas });
  const planificarCosecha = crearPlanificarCosecha({ tarifas, compararDestinos });
  const contenedor = { tarifas, compararDestinos, planificarCosecha };

  // Venta durante la cosecha según los barcos (puerto si cumple los índices, acopio o silobolsa).
  contenedor.decidirVentaCosecha = crearDecidirVentaCosecha({
    barcos: adaptadorBarcos,
    nivelRio: crearNivelRioManualAdapter(nivelParanaM),
    respaldoBarcos: adaptadorBarcos === barcosSimulado ? null : barcosSimulado,
    precios,
  });

  // Venta de una silobolsa eligiendo barco: necesita los puertos de silobolsas, IoT, precios y barcos.
  if (silobolsas && lecturasIot) {
    contenedor.evaluarSilobolsa = crearEvaluarSilobolsa({ silobolsas, lecturasIot, tarifas });
  }
  if (contenedor.evaluarSilobolsa && precios && barcos) {
    contenedor.decidirVenta = crearDecidirVenta({ evaluarSilobolsa: contenedor.evaluarSilobolsa, precios, barcos: adaptadorBarcos, tarifas });
  }
  return contenedor;
}
