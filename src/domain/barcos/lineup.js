// Barco del line-up: formato del dominio y validación.
//
//   { buque, puerto, cultivo, toneladas, eta: 'YYYY-MM-DD', estado }
// estado: 'anunciado' (todavía no llegó), 'fondeado' o 'cargando' (ya está en el puerto).
//
// Los adaptadores (infrastructure/barcos) traducen cada fuente a este formato.

import { PUERTOS, ESTACIONALIDAD, PARAMS_DEFAULT } from './datos.js';
import { iso } from '../shared/util.js';

export const ESTADOS_BARCO = new Set(['anunciado', 'fondeado', 'cargando']);

export function validarBarco(b, i = 0) {
  const err = (m) => new Error(`Barco #${i + 1} (${b?.buque ?? 'sin nombre'}): ${m}`);
  if (!b || typeof b !== 'object') throw err('registro vacío');
  if (!PUERTOS[b.puerto]) throw err(`puerto desconocido "${b.puerto}" (válidos: ${Object.keys(PUERTOS).join(', ')})`);
  if (!ESTACIONALIDAD[b.cultivo]) throw err(`cultivo desconocido "${b.cultivo}"`);
  const estado = b.estado || 'anunciado';
  if (!ESTADOS_BARCO.has(estado)) throw err(`estado inválido "${b.estado}"`);
  const toneladas = Number(b.toneladas) || PARAMS_DEFAULT.cargaBarcoBaseT;
  return { buque: String(b.buque || `Buque ${i + 1}`), puerto: b.puerto, cultivo: b.cultivo, toneladas, eta: iso(b.eta), estado };
}
