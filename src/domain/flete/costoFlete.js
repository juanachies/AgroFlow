export function costoFlete({ toneladas = 0, distanciaKm = 0, tarifaPorTonKm = 0.094 } = {}) {
  return Number((toneladas * distanciaKm * tarifaPorTonKm).toFixed(2));
}

export default costoFlete;
