export function decidirVenta({
  toneladas = 0,
  precioHoy = 0,
  precioFuturo = 0,
  fleteHoy = 0,
  fleteFuturo = 0,
  costoGuardar = 0,
  interes = 0,
  merma = 0,
} = {}) {
  const venderAhora = toneladas * (precioHoy - fleteHoy);
  const esperar = toneladas * (precioFuturo - fleteFuturo) - costoGuardar - interes - merma;
  const decision = venderAhora >= esperar ? 'VENDER_AHORA' : 'ESPERAR';

  return {
    decision,
    venderAhora: Number(venderAhora.toFixed(2)),
    esperar: Number(esperar.toFixed(2)),
    spread: Number((esperar - venderAhora).toFixed(2)),
  };
}

export default decidirVenta;
