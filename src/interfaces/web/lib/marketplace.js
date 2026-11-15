export const claveRango = (oferta) => `${oferta.disponibleDesde}|${oferta.disponibleHasta}`;

// Devuelve la clave del rango de fechas más repetido; null si no hay ofertas.
export function rangoMasComun(ofertas) {
  const conteo = new Map();
  for (const oferta of ofertas) {
    const clave = claveRango(oferta);
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  let comun = null;
  let maximo = 0;
  for (const [clave, cantidad] of conteo) {
    if (cantidad > maximo) {
      maximo = cantidad;
      comun = clave;
    }
  }
  return comun;
}
