import { readFileSync } from 'node:fs';
import { RUTA_TARIFAS } from '../../src/infrastructure/tarifas/tarifasJsonAdapter.js';

export const tarifas = JSON.parse(readFileSync(RUTA_TARIFAS, 'utf8'));

/** Adaptador simulado del puerto de tarifas: no toca el disco ni la red. */
export const tarifasSimuladas = { vigentes: async () => tarifas };
