import { crearCompararDestinos } from '../application/usecases/compararDestinos.js';
import { crearDecidirVenta } from '../application/usecases/decidirVenta.js';
import { crearEvaluarSilobolsa } from '../application/usecases/evaluarSilobolsa.js';
import { crearPlanificarCosecha } from '../application/usecases/planificarCosecha.js';
import { crearTarifasJsonAdapter } from '../infrastructure/tarifas/tarifasJsonAdapter.js';

export function crearContenedor({ tarifas = crearTarifasJsonAdapter(), silobolsas, lecturasIot, precios, barcos } = {}) {
  const compararDestinos = crearCompararDestinos({ tarifas });
  const planificarCosecha = crearPlanificarCosecha({ tarifas, compararDestinos });
  const contenedor = { tarifas, compararDestinos, planificarCosecha };
  if (silobolsas && lecturasIot) {
    contenedor.evaluarSilobolsa = crearEvaluarSilobolsa({ silobolsas, lecturasIot, tarifas });
  }
  if (contenedor.evaluarSilobolsa && precios && barcos) {
    contenedor.decidirVenta = crearDecidirVenta({ evaluarSilobolsa: contenedor.evaluarSilobolsa, precios, barcos, tarifas });
  }
  return contenedor;
}
