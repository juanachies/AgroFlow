import { crearCompararDestinos } from '../application/usecases/compararDestinos.js';
import { crearPlanificarCosecha } from '../application/usecases/planificarCosecha.js';
import { crearTarifasJsonAdapter } from '../infrastructure/tarifas/tarifasJsonAdapter.js';

export function crearContenedor({ tarifas = crearTarifasJsonAdapter() } = {}) {
  const compararDestinos = crearCompararDestinos({ tarifas });
  const planificarCosecha = crearPlanificarCosecha({ tarifas, compararDestinos });
  return { tarifas, compararDestinos, planificarCosecha };
}
