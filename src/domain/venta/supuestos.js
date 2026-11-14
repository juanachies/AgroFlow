// Supuestos del módulo Venta, en USD. Todos editables por el usuario.

export const SUPUESTOS_VENTA = {
  fleteUSDtKm: 0.094, // referencia CATAC, verificar fecha
  // Costo de esperar en puerto (camión parado, estadía, almacenaje en terminal), USD/t/día.
  costoEsperaUSDtDia: 1.2,
  // Costo de tener el grano en el campo esperando el despacho (tolva, bolsa corta), USD/t/día.
  costoGuardarCortoUSDtDia: 0.15,
  // Espera en puerto a partir de la cual se avisa que conviene postergar el despacho.
  umbralEsperaDias: 2,
  // Días antes del cierre de la ventana de venta en los que se avisa.
  avisoCierreVentanaDias: 7,
  acopio: {
    descuentoPrecioUSDt: 8, // el acopio paga menos que el puerto
    tarifaUSDt: 6, // recepción, paritaria y manipuleo
    secadoUSDt: 0,
  },
  silobolsa: {
    bolsaUSDt: 2.5,
    embolsadoUSDt: 2,
    extraccionUSDt: 2,
    mesesGuardado: 3,
    mermaMensual: 0.005, // ver módulo de monitoreo: depende de la humedad
    tasaMensual: 0.01, // costo financiero de no cobrar
  },
};

// Precios de referencia en puerto, USD/t. Supuestos editables (pizarra BCR o Matba-Rofex).
// futuroUSDt = precio esperado al vender después de guardar `mesesGuardado` meses.
export const PRECIOS_DEFAULT = {
  soja: { puertoHoyUSDt: 300, futuroUSDt: 310 },
  maiz: { puertoHoyUSDt: 180, futuroUSDt: 186 },
  trigo: { puertoHoyUSDt: 210, futuroUSDt: 216 },
};

export function supuestosVenta(extra = {}) {
  return {
    ...SUPUESTOS_VENTA,
    ...extra,
    acopio: { ...SUPUESTOS_VENTA.acopio, ...extra.acopio },
    silobolsa: { ...SUPUESTOS_VENTA.silobolsa, ...extra.silobolsa },
  };
}
