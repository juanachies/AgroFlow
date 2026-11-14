import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const RUTA_TARIFAS = fileURLToPath(new URL('../../../data/tarifas.json', import.meta.url));

/** @returns {import('../../application/ports/TarifasPort.js').TarifasPort} */
export function crearTarifasJsonAdapter({ ruta = RUTA_TARIFAS } = {}) {
  return {
    async vigentes() {
      return JSON.parse(await readFile(ruta, 'utf8'));
    },
  };
}
