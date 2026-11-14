import { compararDestinos } from '../../domain/destino/comparadorDestinos.js';

export function compararDestinosUseCase(destinos = []) {
  return compararDestinos(destinos);
}

export default compararDestinosUseCase;
