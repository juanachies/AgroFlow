import { elegirDestino, evaluarDestino } from '../../domain/destino/comparadorDestinos.js';
import { validarEntrada } from '../../domain/destino/servicios.js';

/**
 * Evalúa cada destino candidato (o solo la cosecha si no hay ninguno) y elige el mejor.
 * @param {{ tarifas: import('../ports/TarifasPort.js').TarifasPort }} puertos
 */
export function crearCompararDestinos({ tarifas }) {
  return async function compararDestinos(entrada) {
    validarEntrada(entrada);
    const vigentes = await tarifas.vigentes();
    const candidatos = entrada.destinos?.length > 0 ? entrada.destinos : [null];
    const evaluados = candidatos.map((destino) => evaluarDestino(entrada, destino, vigentes));
    return { evaluados, ...elegirDestino(evaluados) };
  };
}
