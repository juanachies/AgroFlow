export function calcularMargenNeto({
  toneladas = 0,
  precioVenta = 0,
  flete = 0,
  almacenamiento = 0,
  secado = 0,
  merma = 0,
  costoFinanciero = 0,
  costoDemora = 0,
} = {}) {
  const ingresosBrutos = toneladas * precioVenta;
  const costos = flete + almacenamiento + secado + merma + costoFinanciero + costoDemora;
  const margenNeto = ingresosBrutos - costos;

  return {
    toneladas,
    ingresoBruto: Number(ingresosBrutos.toFixed(2)),
    costoTotal: Number(costos.toFixed(2)),
    margenNeto: Number(margenNeto.toFixed(2)),
  };
}

export default calcularMargenNeto;
